"""Kurumsal ağ: HTTPS kendi kök sertifikasıyla yeniden imzalanıyor.

Kullanıcı ekranı: "[SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed:
self-signed certificate in certificate chain". Burada aynı durumu kurarız:
kendi kök sertifikasıyla imzalanmış yerel bir HTTPS sunucusu (zincirde kök de
var — proxy'lerin yaptığı gibi).
"""

from __future__ import annotations

import datetime as dt
import ipaddress
import json
import os
import ssl
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import NameOID

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.agent import client as client_mod
from app.agent.client import AgentClient


def _cert(subject: str, issuer_key, issuer_name, key, *, ca: bool, san: bool):
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, subject)])
    now = dt.datetime.now(dt.timezone.utc)
    b = (x509.CertificateBuilder()
         .subject_name(name).issuer_name(issuer_name or name)
         .public_key(key.public_key()).serial_number(x509.random_serial_number())
         .not_valid_before(now - dt.timedelta(minutes=5)).not_valid_after(now + dt.timedelta(days=1))
         .add_extension(x509.BasicConstraints(ca=ca, path_length=None), critical=True))
    if san:
        b = b.add_extension(x509.SubjectAlternativeName(
            [x509.DNSName("localhost"), x509.IPAddress(ipaddress.ip_address("127.0.0.1"))]), critical=False)
    return b.sign(issuer_key, hashes.SHA256())


@pytest.fixture(scope="module")
def corporate_endpoint(tmp_path_factory):
    d = tmp_path_factory.mktemp("tls")
    ca_key = ec.generate_private_key(ec.SECP256R1())
    ca = _cert("Corp Proxy Root CA", ca_key, None, ca_key, ca=True, san=False)
    srv_key = ec.generate_private_key(ec.SECP256R1())
    srv = _cert("localhost", ca_key, ca.subject, srv_key, ca=False, san=True)
    pem = lambda c: c.public_bytes(serialization.Encoding.PEM)
    (d / "ca.pem").write_bytes(pem(ca))
    (d / "chain.pem").write_bytes(pem(srv) + pem(ca))  # zincirde kök de var
    (d / "key.pem").write_bytes(srv_key.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))

    class H(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def do_POST(self):  # noqa: N802
            self.rfile.read(int(self.headers.get("Content-Length") or 0))
            body = json.dumps({"choices": [{"message": {"content": "merhaba"}}]}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    httpd = HTTPServer(("127.0.0.1", 0), H)
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.load_cert_chain(d / "chain.pem", d / "key.pem")
    httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    yield f"https://127.0.0.1:{httpd.server_address[1]}/v1", str(d / "ca.pem")
    httpd.shutdown()


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch):
    for k in ("AGENT_CA_BUNDLE", "SSL_CERT_FILE", "REQUESTS_CA_BUNDLE"):
        monkeypatch.delenv(k, raising=False)
    client_mod.tls_verify.cache_clear()
    yield
    client_mod.tls_verify.cache_clear()


def _chat(url, **kw):
    return AgentClient(base_url=url, model="m", api_key="k", timeout=10, **kw).chat(
        messages=[{"role": "user", "content": "selam"}], tools=[])


def test_untrusted_corporate_root_reproduces_the_error(corporate_endpoint):
    url, _ = corporate_endpoint
    with pytest.raises(Exception) as ei:
        _chat(url)
    # OS deposunda mesaj yerelleştirilmiş ("… güvenilir değil"); türe bakılır.
    assert client_mod.is_cert_verify_error(ei.value), repr(ei.value)


def test_skip_tls_toggle_gets_through(corporate_endpoint):
    url, _ = corporate_endpoint
    assert _chat(url, verify_tls=False)["content"] == "merhaba"


def test_it_supplied_root_ca_gets_through_with_verification_on(corporate_endpoint, monkeypatch):
    url, ca = corporate_endpoint
    monkeypatch.setenv("AGENT_CA_BUNDLE", ca)
    client_mod.tls_verify.cache_clear()
    assert _chat(url)["content"] == "merhaba"


def test_default_uses_the_os_trust_store():
    """Windows deposu / macOS Keychain — IT'nin dağıttığı kök otomatik geçerli."""
    import truststore
    assert isinstance(client_mod.tls_verify(), truststore.SSLContext)


def _router_client():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from app.auth import get_current_user
    from app.routers import agent as agent_router

    app = FastAPI()
    app.include_router(agent_router.router)
    app.dependency_overrides[get_current_user] = lambda: {"username": "t", "role": "admin"}
    return TestClient(app)


def _post(url, **cfg):
    return _router_client().post("/v1/agent/chat", json={
        "messages": [{"role": "user", "content": "selam"}],
        "config": {"base_url": url, "api_key": "k", "model": "m", **cfg},
    })


def test_router_explains_what_to_do_instead_of_raw_openssl(corporate_endpoint):
    url, _ = corporate_endpoint
    r = _post(url)
    assert r.status_code == 502
    detail = r.json()["detail"]
    assert "Skip TLS certificate verification" in detail and "AGENT_CA_BUNDLE" in detail


def test_router_honours_the_settings_toggle(corporate_endpoint):
    url, _ = corporate_endpoint
    r = _post(url, skip_tls_verify=True)
    assert r.status_code == 200, r.text
    assert r.json()["assistant_message"] == "merhaba"
