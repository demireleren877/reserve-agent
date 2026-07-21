"""/v1/connections — çok bağlantılı yönetim (Oracle mock'lanır)."""

from __future__ import annotations

from typing import AsyncGenerator

import oracledb
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from unittest.mock import AsyncMock

from app import db, desktop_config
from app.main import app


@pytest_asyncio.fixture
async def client(monkeypatch, tmp_path) -> AsyncGenerator[AsyncClient, None]:
    monkeypatch.delenv("ORACLE_DSN", raising=False)
    monkeypatch.setenv("RESERVE_AGENT_CONFIG_DIR", str(tmp_path))
    monkeypatch.setattr(desktop_config, "_keyring", lambda: None)
    monkeypatch.setattr(db, "_pool", None)
    monkeypatch.setattr(db, "configure_pool", AsyncMock())
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


def _body(name="A", host="192.168.1.10", **extra):
    return {"name": name, "host": host, "port": 1521, "service_name": "ORCLPDB1",
            "user": "actuarius", "password": "s3cret", **extra}


async def test_list_empty(client):
    r = await client.get("/v1/connections")
    assert r.status_code == 200
    assert r.json() == {"connections": [], "selected_id": None, "ready": False, "env_mode": False}


async def test_create_first_selects_and_bootstraps(client, monkeypatch):
    import app.bootstrap as bmod
    boot = []
    # bootstrap_database artık connections.create içinde lazy import edilir;
    # doğru patch hedefi kaynak modül (app.bootstrap).
    monkeypatch.setattr(bmod, "bootstrap_database",
                        lambda *a, **k: boot.append(a) or {"admin_created": True})
    r = await client.post("/v1/connections", json=_body(admin_username="ErenD", admin_password="pw"))
    assert r.status_code == 200
    j = r.json()
    assert j["ok"] is True and j["selected"] is True
    assert boot, "admin verildiğinde bootstrap çağrılmalı"
    # listede görünür + seçili
    lst = (await client.get("/v1/connections")).json()
    assert len(lst["connections"]) == 1
    assert lst["selected_id"] == j["id"]
    assert lst["connections"][0]["name"] == "A"


async def test_create_without_admin_just_tests(client, monkeypatch):
    called = []
    monkeypatch.setattr(oracledb, "connect",
                        lambda **k: called.append(k) or type("C", (), {"close": lambda self: None})())
    r = await client.post("/v1/connections", json=_body(name="NoAdmin"))
    assert r.status_code == 200
    assert called, "admin yoksa yalnızca bağlantı test edilir"


async def test_create_bad_connection_400(client, monkeypatch):
    def boom(**k):
        raise oracledb.DatabaseError("reddedildi")
    monkeypatch.setattr(oracledb, "connect", boom)
    r = await client.post("/v1/connections", json=_body(name="Bad"))
    assert r.status_code == 400


async def test_test_endpoint(client, monkeypatch):
    monkeypatch.setattr(oracledb, "connect",
                        lambda **k: type("C", (), {"close": lambda self: None})())
    r = await client.post("/v1/connections/test", json={
        "host": "h", "port": 1521, "service_name": "S", "user": "u", "password": "p"})
    assert r.status_code == 200 and r.json() == {"ok": True}


async def test_update_and_select_and_delete(client, monkeypatch):
    monkeypatch.setattr(oracledb, "connect",
                        lambda **k: type("C", (), {"close": lambda self: None})())
    a = (await client.post("/v1/connections", json=_body(name="A", host="10.0.0.1"))).json()["id"]
    b = (await client.post("/v1/connections", json=_body(name="B", host="10.0.0.2"))).json()["id"]

    # güncelle
    r = await client.put(f"/v1/connections/{a}", json=_body(name="A2", host="10.0.0.9"))
    assert r.status_code == 200
    # seç
    r = await client.post(f"/v1/connections/{b}/select")
    assert r.status_code == 200
    assert (await client.get("/v1/connections")).json()["selected_id"] == b
    # sil
    r = await client.delete(f"/v1/connections/{b}")
    assert r.status_code == 200
    lst = (await client.get("/v1/connections")).json()
    assert lst["selected_id"] == a  # silinince diğerine geçer
    assert [c["name"] for c in lst["connections"]] == ["A2"]


async def test_select_unknown_404(client):
    r = await client.post("/v1/connections/yok/select")
    assert r.status_code == 404


async def test_env_mode_blocks_management(client, monkeypatch):
    monkeypatch.setenv("ORACLE_DSN", "10.0.0.5:1521/PDB")
    r = await client.post("/v1/connections", json=_body())
    assert r.status_code == 403
    lst = (await client.get("/v1/connections")).json()
    assert lst["env_mode"] is True and len(lst["connections"]) == 1
