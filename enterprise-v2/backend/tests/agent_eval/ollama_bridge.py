#!/usr/bin/env python3
"""Ollama /api/chat ve /api/generate uçlarını OpenRouter üzerinden sunar.

Kurumsal gateway'in Ollama biçimini, GERÇEK bir modelle (varsayılan Qwen 3.5 9B,
DeepInfra bf16) sınamak için. İki uç da istemcinin gönderdiğini aynen alır:
  /api/generate → {system, prompt}  → tek mesajlık sohbet, ARAÇSIZ (gateway gibi)
  /api/chat     → {messages, tools} → OpenAI biçimine çevrilip yerel araçlarla

    OPENROUTER_API_KEY=... python tests/agent_eval/ollama_bridge.py --port 8777
    python tests/agent_eval/run_eval.py --api-format ollama_generate \\
        --base-url http://127.0.0.1:8777/api/generate --model qwen3.5:9b
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import httpx

OR_URL = "https://openrouter.ai/api/v1/chat/completions"
EXTRA = {"reasoning": {"enabled": False}, "provider": {"order": ["DeepInfra"], "allow_fallbacks": False}}


def _or(model: str, messages: list, tools: list | None, temperature: float) -> dict:
    body = {"model": model, "messages": messages, "temperature": temperature, **EXTRA}
    if tools:
        body["tools"] = tools
    for _ in range(6):
        r = httpx.post(OR_URL, json=body, timeout=180,
                       headers={"Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}"})
        if r.status_code in (429, 500, 502, 503, 520):
            import time
            time.sleep(5)
            continue
        r.raise_for_status()
        return (r.json().get("choices") or [{}])[0].get("message") or {}
    r.raise_for_status()
    return {}


def _to_openai(messages: list) -> list:
    """Ollama mesajları → OpenAI: araç çağrılarına kimlik ver, tool cevaplarını eşle."""
    out, pending = [], []
    for m in messages:
        role = m.get("role")
        if role == "assistant" and m.get("tool_calls"):
            calls = []
            for c in m["tool_calls"]:
                cid = f"call_{uuid.uuid4().hex[:8]}"
                pending.append(cid)
                fn = c.get("function") or {}
                calls.append({"id": cid, "type": "function", "function": {
                    "name": fn.get("name"), "arguments": json.dumps(fn.get("arguments") or {}, ensure_ascii=False)}})
            out.append({"role": "assistant", "content": m.get("content") or None, "tool_calls": calls})
        elif role == "tool":
            out.append({"role": "tool", "tool_call_id": pending.pop(0) if pending else "call_x",
                        "content": m.get("content") or ""})
        else:
            out.append({"role": role, "content": m.get("content") or ""})
    return out


class H(BaseHTTPRequestHandler):
    model = "qwen/qwen3.5-9b"
    # --oauth: kurumsal gateway'in tam taklidi. /oauth/token Basic auth + JSON
    # {"grant_type":"client_credentials"} ister; /api/* Bearer token ister.
    oauth: tuple[str, str] | None = None
    tokens: set[str] = set()

    def log_message(self, *a):
        pass

    def do_POST(self):  # noqa: N802
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
        if self.oauth is not None:
            import base64
            if self.path.endswith("/oauth/token"):
                want = "Basic " + base64.b64encode(f"{self.oauth[0]}:{self.oauth[1]}".encode()).decode()
                if self.headers.get("Authorization") != want or body.get("grant_type") != "client_credentials":
                    return self._reply(401, {"error": "invalid_client"})
                tok = uuid.uuid4().hex
                H.tokens.add(tok)
                return self._reply(200, {"access_token": tok, "token_type": "Bearer", "expires_in": 3600})
            auth = self.headers.get("Authorization", "")
            if not auth.startswith("Bearer ") or auth[7:] not in H.tokens:
                return self._reply(401, {"error": "invalid token"})
        temp = float((body.get("options") or {}).get("temperature", 0.2))
        try:
            if self.path.endswith("/api/generate"):
                msgs = ([{"role": "system", "content": body["system"]}] if body.get("system") else []) + \
                       [{"role": "user", "content": body.get("prompt") or ""}]
                out = {"response": _or(self.model, msgs, None, temp).get("content") or "", "done": True}
            else:
                msg = _or(self.model, _to_openai(body.get("messages") or []), body.get("tools"), temp)
                calls = [{"function": {"name": (c.get("function") or {}).get("name"),
                                       "arguments": json.loads((c.get("function") or {}).get("arguments") or "{}")}}
                         for c in msg.get("tool_calls") or []]
                out = {"message": {"role": "assistant", "content": msg.get("content") or "", "tool_calls": calls},
                       "done": True}
            code = 200
        except Exception as e:  # noqa: BLE001
            out, code = {"error": str(e)[:300]}, 502
        self._reply(code, out)

    def _reply(self, code: int, out: dict) -> None:
        data = json.dumps(out).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8777)
    ap.add_argument("--oauth", metavar="CLIENT_ID:SECRET",
                    help="gateway gibi OAuth2 client credentials iste")
    a = ap.parse_args()
    if a.oauth:
        H.oauth = tuple(a.oauth.split(":", 1))  # type: ignore[assignment]
    print(f"ollama bridge :{a.port} → OpenRouter {H.model}", file=sys.stderr, flush=True)
    ThreadingHTTPServer(("127.0.0.1", a.port), H).serve_forever()
