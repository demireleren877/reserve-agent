"""Kurumsal LLM gateway: OAuth2 client credentials + Ollama biçimi.

Kullanıcının test ortamındaki çalışan script'inin taklidi:
  1. POST token_url, Basic auth (client id/secret), JSON {"grant_type":"client_credentials"}
     → {"access_token": ...}
  2. POST /api/generate (ya da /api/chat), Bearer token, {"model","prompt","think":false,"stream":false}
     → {"response": ...}
Sunucu kendi kök sertifikasıyla HTTPS (kurumsal ortamlardaki gibi; script verify=False).
"""

from __future__ import annotations

import base64
import json
import os
import ssl
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.agent import client as client_mod
from app.agent.client import AgentClient, OAuthClientCredentials, is_cert_verify_error
from tests.test_agent_tls import _cert

CID, SECRET = "actuarius", "s3cret"


class Gateway:
    def __init__(self):
        self.token_calls = 0
        self.valid: set[str] = set()
        self.requests: list[tuple[str, dict]] = []
        self.replies: dict[str, list[dict]] = {"/api/chat": [], "/api/generate": []}


@pytest.fixture()
def gateway(tmp_path):
    gw = Gateway()
    ca_key = ec.generate_private_key(ec.SECP256R1())
    ca = _cert("Corp Gateway Root", ca_key, None, ca_key, ca=True, san=False)
    key = ec.generate_private_key(ec.SECP256R1())
    srv = _cert("localhost", ca_key, ca.subject, key, ca=False, san=True)
    pem = lambda c: c.public_bytes(serialization.Encoding.PEM)
    (tmp_path / "chain.pem").write_bytes(pem(srv) + pem(ca))
    (tmp_path / "key.pem").write_bytes(key.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))

    class H(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def _send(self, code, obj):
            b = json.dumps(obj).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(b)))
            self.end_headers()
            self.wfile.write(b)

        def do_POST(self):  # noqa: N802
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
            if self.path == "/oauth/token":
                want = "Basic " + base64.b64encode(f"{CID}:{SECRET}".encode()).decode()
                if self.headers.get("Authorization") != want or body.get("grant_type") != "client_credentials":
                    return self._send(401, {"error": "invalid_client"})
                gw.token_calls += 1
                tok = f"tok-{gw.token_calls}"
                gw.valid.add(tok)
                return self._send(200, {"access_token": tok, "token_type": "Bearer", "expires_in": 3600})
            auth = self.headers.get("Authorization", "")
            if not auth.startswith("Bearer ") or auth[7:] not in gw.valid:
                return self._send(401, {"error": "invalid token"})
            gw.requests.append((self.path, body))
            return self._send(200, gw.replies[self.path].pop(0))

    httpd = HTTPServer(("127.0.0.1", 0), H)
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.load_cert_chain(tmp_path / "chain.pem", tmp_path / "key.pem")
    httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    gw.base = f"https://127.0.0.1:{httpd.server_address[1]}"
    client_mod._TOKEN_CACHE.clear()
    yield gw
    httpd.shutdown()


def _client(gw, fmt, *, secret=SECRET, verify_tls=False):
    path = "/api/chat" if fmt == "ollama_chat" else "/api/generate"
    return AgentClient(
        base_url=gw.base + path, model="qwen3.5:9b", api_format=fmt, verify_tls=verify_tls,
        oauth=OAuthClientCredentials(gw.base + "/oauth/token", CID, secret), timeout=10,
    )


TOOLS = [{"type": "function", "function": {"name": "set_window", "description": "volume",
          "parameters": {"type": "object", "properties": {"window": {"type": "string"}}, "required": ["window"]}}}]


def test_ollama_chat_tool_roundtrip(gateway):
    gateway.replies["/api/chat"] += [
        {"message": {"role": "assistant", "content": "", "tool_calls": [
            {"function": {"name": "set_window", "arguments": {"window": "5"}}}]}},
        {"message": {"role": "assistant", "content": "Volume 5 yapıldı."}},
    ]
    c = _client(gateway, "ollama_chat")
    r1 = c.chat([{"role": "user", "content": "volume 5"}], TOOLS)
    assert [(t.name, t.arguments) for t in r1["tool_calls"]] == [("set_window", {"window": "5"})]
    assert r1["tool_calls"][0].id  # Ollama kimlik vermiyor; döngü için üretilmeli

    # Döngünün geri gönderdiği OpenAI biçimli geçmiş: argümanlar JSON STRING.
    history = [
        {"role": "user", "content": "volume 5"},
        {"role": "assistant", "content": None, "tool_calls": [
            {"id": r1["tool_calls"][0].id, "type": "function",
             "function": {"name": "set_window", "arguments": "{\"window\": \"5\"}"}}]},
        {"role": "tool", "tool_call_id": r1["tool_calls"][0].id, "content": "{\"window\": \"5\"}"},
    ]
    r2 = c.chat(history, TOOLS)
    assert r2["content"] == "Volume 5 yapıldı."

    path, body = gateway.requests[1]
    assert path == "/api/chat"
    assert body["think"] is False and body["stream"] is False and body["model"] == "qwen3.5:9b"
    assert body["tools"] == TOOLS
    # Ollama argümanları NESNE bekliyor.
    assert body["messages"][1]["tool_calls"][0]["function"]["arguments"] == {"window": "5"}


def test_token_is_cached_and_refreshed_when_the_gateway_drops_it(gateway):
    gateway.replies["/api/chat"] += [{"message": {"content": "a"}}] * 3
    c = _client(gateway, "ollama_chat")
    c.chat([{"role": "user", "content": "x"}], [])
    c.chat([{"role": "user", "content": "x"}], [])
    assert gateway.token_calls == 1, "her çağrıda yeni token alınmamalı"
    gateway.valid.clear()  # gateway token'ı erken düşürdü
    assert c.chat([{"role": "user", "content": "x"}], [])["content"] == "a"
    assert gateway.token_calls == 2


def test_generate_format_uses_a_json_envelope(gateway):
    gateway.replies["/api/generate"] += [{"response": '```json\n{"content": null, "tool_calls": '
                                          '[{"name": "set_window", "arguments": {"window": "4"}}]}\n```'}]
    r = _client(gateway, "ollama_generate").chat(
        [{"role": "system", "content": "Rezerv asistanı."}, {"role": "user", "content": "volume 4"}], TOOLS)
    assert [(t.name, t.arguments) for t in r["tool_calls"]] == [("set_window", {"window": "4"})]
    _, body = gateway.requests[0]
    assert body["think"] is False and body["stream"] is False
    assert body["system"] == "Rezerv asistanı."
    assert "set_window" in body["prompt"]  # araç kataloğu prompt'ta


def test_wrong_client_secret_says_which_step_failed(gateway):
    with pytest.raises(RuntimeError) as ei:
        _client(gateway, "ollama_chat", secret="yanlış").chat([{"role": "user", "content": "x"}], [])
    assert "OAuth token 401" in str(ei.value)


def test_tls_setting_covers_the_token_request_too(gateway):
    with pytest.raises(Exception) as ei:
        _client(gateway, "ollama_chat", verify_tls=True).chat([{"role": "user", "content": "x"}], [])
    assert is_cert_verify_error(ei.value)  # token isteği de doğrulanıyor
    gateway.replies["/api/chat"].append({"message": {"content": "ok"}})
    assert _client(gateway, "ollama_chat", verify_tls=False).chat([{"role": "user", "content": "x"}], [])["content"] == "ok"


def test_router_end_to_end(gateway):
    from tests.test_agent_tls import _router_client
    gateway.replies["/api/chat"].append({"message": {"content": "Merhaba!"}})
    r = _router_client().post("/v1/agent/chat", json={
        "messages": [{"role": "user", "content": "selam"}],
        "config": {"base_url": gateway.base + "/api/chat", "model": "qwen3.5:9b",
                   "api_format": "ollama_chat", "auth_type": "oauth_client_credentials",
                   "token_url": gateway.base + "/oauth/token", "client_id": CID,
                   "client_secret": SECRET, "skip_tls_verify": True},
    })
    assert r.status_code == 200, r.text
    assert r.json()["assistant_message"] == "Merhaba!"


def test_router_rejects_incomplete_oauth():
    from tests.test_agent_tls import _router_client
    r = _router_client().post("/v1/agent/chat", json={
        "messages": [{"role": "user", "content": "selam"}],
        "config": {"base_url": "https://x/api/chat", "model": "m", "api_format": "ollama_chat",
                   "auth_type": "oauth_client_credentials", "token_url": "https://x/t"},
    })
    assert r.status_code == 400 and "oauth_incomplete" in r.text


def test_router_passes_compact_context_and_active_tab(monkeypatch):
    """Ayarlar'daki kompakt bağlam ve açık sekme döngüye ulaşır."""
    from tests.test_agent_tls import _router_client
    import app.routers.agent as agent_router
    from app.agent.loop import AgentTurnResult
    seen = {}

    def fake_turn(client, messages, modules, **kw):
        seen.update(kw)
        return AgentTurnResult(assistant_message="ok")

    monkeypatch.setattr(agent_router, "run_agent_turn", fake_turn)
    r = _router_client().post("/v1/agent/chat", json={
        "messages": [{"role": "user", "content": "selam"}], "active_module": "cashflow",
        "config": {"base_url": "http://x/v1", "model": "m", "compact_context": True},
    })
    assert r.status_code == 200, r.text
    assert seen["compact"] is True and seen["active_module"] == "cashflow"
