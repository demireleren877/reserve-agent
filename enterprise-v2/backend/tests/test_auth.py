"""Auth endpoint ve JWT fonksiyon testleri."""

from __future__ import annotations

import pytest
import bcrypt

from app.auth import (
    create_token,
    verify_password,
    hash_password,
    _decode,
)


# ─── Birim testler (DB yok) ───────────────────────────────────────────────────

def test_hash_and_verify():
    pw = "qwertyadmin123."
    hashed = hash_password(pw)
    assert verify_password(pw, hashed)
    assert not verify_password("yanlis_sifre", hashed)


def test_create_and_decode_token():
    token = create_token(user_id=42, username="ErenD", role="admin")
    payload = _decode(token)
    assert payload["sub"] == "42"
    assert payload["username"] == "ErenD"
    assert payload["role"] == "admin"


def test_invalid_token_raises():
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc:
        _decode("bu.gecersiz.bir.token")
    assert exc.value.status_code == 401


# ─── /v1/auth/login endpoint testleri ────────────────────────────────────────

@pytest.mark.asyncio
async def test_login_success(client):
    c, cur = client
    pw_hash = bcrypt.hashpw(b"qwertyadmin123.", bcrypt.gensalt()).decode()
    cur.fetchone.return_value = (1, "ErenD", pw_hash, "admin", 1)

    res = await c.post("/v1/auth/login", json={"username": "ErenD", "password": "qwertyadmin123."})
    assert res.status_code == 200
    data = res.json()
    assert "token" in data
    assert data["username"] == "ErenD"
    assert data["role"] == "admin"


@pytest.mark.asyncio
async def test_login_wrong_password(client):
    c, cur = client
    pw_hash = bcrypt.hashpw(b"dogru_sifre", bcrypt.gensalt()).decode()
    cur.fetchone.return_value = (1, "ErenD", pw_hash, "admin", 1)

    res = await c.post("/v1/auth/login", json={"username": "ErenD", "password": "yanlis_sifre"})
    assert res.status_code == 401
    assert res.json()["detail"] == "invalid_credentials"


@pytest.mark.asyncio
async def test_login_user_not_found(client):
    c, cur = client
    cur.fetchone.return_value = None

    res = await c.post("/v1/auth/login", json={"username": "yok", "password": "sifre"})
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_login_disabled_user(client):
    c, cur = client
    pw_hash = bcrypt.hashpw(b"sifre", bcrypt.gensalt()).decode()
    cur.fetchone.return_value = (1, "pasif", pw_hash, "user", 0)  # is_active=0

    res = await c.post("/v1/auth/login", json={"username": "pasif", "password": "sifre"})
    assert res.status_code == 403
    assert res.json()["detail"] == "user_disabled"


@pytest.mark.asyncio
async def test_me_endpoint(client, admin_headers):
    c, _ = client
    res = await c.get("/v1/auth/me", headers=admin_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["username"] == "ErenD"
    assert data["role"] == "admin"


@pytest.mark.asyncio
async def test_me_requires_auth(client):
    c, _ = client
    res = await c.get("/v1/auth/me")
    assert res.status_code == 401
