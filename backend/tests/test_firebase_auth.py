"""firebase_auth testleri — gerçek RSA anahtar çifti ile imzalanmış JWT'ler;
JWKS HTTP çağrısı mock'lanır."""

import time

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

import app.firebase_auth as fa

_PROJECT = "test-project"
_KID = "test-kid"


@pytest.fixture(scope="module")
def keypair():
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    jwk = jwt.algorithms.RSAAlgorithm.to_jwk(
        private_key.public_key(), as_dict=True
    )
    jwk["kid"] = _KID
    return private_key, jwk


@pytest.fixture
def auth_env(keypair, monkeypatch):
    """Project id + JWKS cache'ini test anahtarıyla doldur."""
    _, jwk = keypair
    monkeypatch.setattr(fa, "_FIREBASE_PROJECT_ID", _PROJECT)
    monkeypatch.setattr(
        fa, "_jwks_cache", {"keys": {_KID: jwk}, "expires_at": time.time() + 3600}
    )
    return keypair[0]


def _token(private_key, *, kid=_KID, exp_delta=3600, aud=_PROJECT,
           iss=None, sub="user-1", email="u@example.com", extra=None):
    now = int(time.time())
    payload = {
        "aud": aud,
        "iss": iss or f"https://securetoken.google.com/{_PROJECT}",
        "iat": now - 10,
        "exp": now + exp_delta,
        "email": email,
    }
    if sub is not None:
        payload["sub"] = sub
    if extra:
        payload.update(extra)
    return jwt.encode(payload, private_key, algorithm="RS256",
                      headers={"kid": kid})


def _creds(token: str) -> HTTPAuthorizationCredentials:
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


class TestVerifyFirebaseToken:
    def test_valid_token_returns_uid_email(self, auth_env):
        out = fa.verify_firebase_token(_creds(_token(auth_env)))
        assert out == {"uid": "user-1", "email": "u@example.com"}

    def test_user_id_fallback_when_no_sub(self, auth_env):
        tok = _token(auth_env, sub=None, extra={"user_id": "u2"})
        assert fa.verify_firebase_token(_creds(tok))["uid"] == "u2"

    def test_missing_uid_401(self, auth_env):
        tok = _token(auth_env, sub=None)
        with pytest.raises(HTTPException) as e:
            fa.verify_firebase_token(_creds(tok))
        assert e.value.status_code == 401
        assert "uid" in e.value.detail

    def test_expired_token_401(self, auth_env):
        tok = _token(auth_env, exp_delta=-100)
        with pytest.raises(HTTPException) as e:
            fa.verify_firebase_token(_creds(tok))
        assert e.value.status_code == 401
        assert "expired" in e.value.detail.lower()

    def test_wrong_audience_401(self, auth_env):
        tok = _token(auth_env, aud="baska-proje")
        with pytest.raises(HTTPException) as e:
            fa.verify_firebase_token(_creds(tok))
        assert e.value.status_code == 401

    def test_wrong_issuer_401(self, auth_env):
        tok = _token(auth_env, iss="https://kotu.example.com")
        with pytest.raises(HTTPException) as e:
            fa.verify_firebase_token(_creds(tok))
        assert e.value.status_code == 401

    def test_unknown_kid_refreshes_then_401(self, auth_env, monkeypatch):
        calls = {"n": 0}

        def fake_load():
            calls["n"] += 1
            return fa._jwks_cache["keys"]

        monkeypatch.setattr(fa, "_load_jwks", fake_load)
        tok = _token(auth_env, kid="bilinmeyen-kid")
        with pytest.raises(HTTPException) as e:
            fa.verify_firebase_token(_creds(tok))
        assert e.value.status_code == 401
        assert "Unknown token key" in e.value.detail
        assert calls["n"] == 2  # bir kez + cache sıfırlanıp retry

    def test_garbage_token_401(self, auth_env):
        with pytest.raises(HTTPException) as e:
            fa.verify_firebase_token(_creds("bozuk.jwt.token"))
        assert e.value.status_code == 401

    def test_missing_project_id_500(self, monkeypatch):
        monkeypatch.setattr(fa, "_FIREBASE_PROJECT_ID", "")
        with pytest.raises(HTTPException) as e:
            fa.verify_firebase_token(_creds("herhangi"))
        assert e.value.status_code == 500


class TestLoadJwks:
    def test_fetches_and_caches_with_ttl(self, monkeypatch):
        monkeypatch.setattr(
            fa, "_jwks_cache", {"keys": {}, "expires_at": 0}
        )

        class FakeResp:
            headers = {"cache-control": "public, max-age=1234"}

            def raise_for_status(self):
                pass

            def json(self):
                return {"keys": [{"kid": "k1", "kty": "RSA"}]}

        calls = {"n": 0}

        def fake_get(url, timeout):
            calls["n"] += 1
            return FakeResp()

        monkeypatch.setattr(fa.httpx, "get", fake_get)
        keys = fa._load_jwks()
        assert "k1" in keys
        assert fa._jwks_cache["expires_at"] > time.time() + 1000
        # İkinci çağrı cache'ten gelmeli
        fa._load_jwks()
        assert calls["n"] == 1

    def test_default_ttl_when_no_cache_control(self, monkeypatch):
        monkeypatch.setattr(fa, "_jwks_cache", {"keys": {}, "expires_at": 0})

        class FakeResp:
            headers = {}

            def raise_for_status(self):
                pass

            def json(self):
                return {"keys": []}

        monkeypatch.setattr(fa.httpx, "get", lambda url, timeout: FakeResp())
        fa._load_jwks()
        # default 3600s civarı
        assert fa._jwks_cache["expires_at"] == pytest.approx(
            time.time() + 3600, abs=10
        )
