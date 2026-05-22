"""Kullanıcı yönetimi endpoint testleri."""

from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_list_users_admin(client, admin_headers):
    c, cur = client
    cur.fetchall.return_value = [
        (1, "ErenD", "admin", 1),
        (2, "testuser", "user", 1),
    ]
    res = await c.get("/v1/admin/users", headers=admin_headers)
    assert res.status_code == 200
    users = res.json()
    assert len(users) == 2
    assert users[0]["username"] == "ErenD"
    assert users[0]["role"] == "admin"
    assert users[1]["is_active"] is True


@pytest.mark.asyncio
async def test_list_users_forbidden_for_non_admin(client, user_headers):
    c, _ = client
    res = await c.get("/v1/admin/users", headers=user_headers)
    assert res.status_code == 403  # geçerli token ama role=user → admin_required


@pytest.mark.asyncio
async def test_list_users_requires_auth(client):
    c, _ = client
    res = await c.get("/v1/admin/users")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_create_user_success(client, admin_headers):
    c, cur = client
    cur.fetchone.return_value = None  # username müsait
    cur._var_val.getvalue.return_value = [99]  # yeni id

    res = await c.post(
        "/v1/admin/users",
        json={"username": "yenikullanici", "password": "Sifre123!", "role": "user"},
        headers=admin_headers,
    )
    assert res.status_code == 201
    data = res.json()
    assert data["username"] == "yenikullanici"
    assert data["role"] == "user"
    assert data["id"] == 99
    assert data["is_active"] is True


@pytest.mark.asyncio
async def test_create_user_duplicate(client, admin_headers):
    c, cur = client
    cur.fetchone.return_value = (1,)  # username zaten var

    res = await c.post(
        "/v1/admin/users",
        json={"username": "var", "password": "sifre", "role": "user"},
        headers=admin_headers,
    )
    assert res.status_code == 409
    assert res.json()["detail"] == "username_exists"


@pytest.mark.asyncio
async def test_update_user_password(client, admin_headers):
    c, cur = client
    import bcrypt
    old_hash = bcrypt.hashpw(b"eski", bcrypt.gensalt()).decode()
    cur.fetchone.return_value = (5, "kullanici", old_hash, "user", 1)

    res = await c.patch(
        "/v1/admin/users/5",
        json={"password": "YeniSifre456!"},
        headers=admin_headers,
    )
    assert res.status_code == 200
    assert res.json()["id"] == 5


@pytest.mark.asyncio
async def test_update_user_not_found(client, admin_headers):
    c, cur = client
    cur.fetchone.return_value = None

    res = await c.patch(
        "/v1/admin/users/999",
        json={"role": "admin"},
        headers=admin_headers,
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_deactivate_user(client, admin_headers):
    c, cur = client
    import bcrypt
    pw_hash = bcrypt.hashpw(b"sifre", bcrypt.gensalt()).decode()
    cur.fetchone.return_value = (7, "kullanici", pw_hash, "user", 1)

    res = await c.patch(
        "/v1/admin/users/7",
        json={"is_active": False},
        headers=admin_headers,
    )
    assert res.status_code == 200
    assert res.json()["is_active"] is False


@pytest.mark.asyncio
async def test_delete_user(client, admin_headers):
    c, _ = client
    res = await c.delete("/v1/admin/users/5", headers=admin_headers)
    assert res.status_code == 204


@pytest.mark.asyncio
async def test_cannot_delete_self(client, admin_headers):
    c, _ = client
    # admin_token'daki sub=1
    res = await c.delete("/v1/admin/users/1", headers=admin_headers)
    assert res.status_code == 400
    assert res.json()["detail"] == "cannot_delete_self"
