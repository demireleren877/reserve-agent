"""/v1/setup — masaüstü ilk kurulum akışı (Oracle bağlantısı mock'lanır)."""

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
    monkeypatch.setattr(db, "_pool", None)          # havuz yok → gerçek Oracle'a gidilmez
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


async def test_status_first_run(client):
    r = await client.get("/v1/setup/status")
    assert r.status_code == 200
    body = r.json()
    assert body == {"env_mode": False, "configured": False, "ready": False}


async def test_test_connection_failure(client, monkeypatch):
    def boom(*a, **k):
        raise oracledb.DatabaseError("baglanti reddedildi")

    monkeypatch.setattr(oracledb, "connect", boom)
    r = await client.post("/v1/setup/test", json={
        "host": "1.2.3.4", "port": 1521, "service_name": "X", "user": "u", "password": "p",
    })
    assert r.status_code == 400
    assert "Oracle" in r.json()["detail"]


async def test_test_connection_success(client, monkeypatch):
    class FakeConn:
        def close(self): pass

    monkeypatch.setattr(oracledb, "connect", lambda *a, **k: FakeConn())
    r = await client.post("/v1/setup/test", json={
        "host": "1.2.3.4", "port": 1521, "service_name": "X", "user": "u", "password": "p",
    })
    assert r.status_code == 200
    assert r.json() == {"ok": True}


async def test_save_flow_configures_and_persists(client, monkeypatch):
    import app.routers.setup as setup_mod

    monkeypatch.setattr(setup_mod, "bootstrap_database",
                        lambda *a, **k: {"admin_created": True})
    configure = AsyncMock()
    monkeypatch.setattr(db, "configure_pool", configure)

    r = await client.post("/v1/setup/save", json={
        "host": "192.168.1.10", "port": 1521, "service_name": "ORCLPDB1",
        "user": "actuarius", "password": "s3cret",
        "admin_username": "ErenD", "admin_password": "admin123",
    })
    assert r.status_code == 200
    assert r.json()["ok"] is True
    assert r.json()["admin_created"] is True
    configure.assert_awaited_once()

    # Bağlantı kalıcı hale geldi
    assert desktop_config.is_desktop_configured() is True
    loaded = desktop_config.load_connection()
    assert loaded is not None and loaded.dsn == "192.168.1.10:1521/ORCLPDB1"

    # Artık status configured döner
    r2 = await client.get("/v1/setup/status")
    assert r2.json()["configured"] is True


async def test_save_rejects_reconfig_without_admin(client, monkeypatch):
    """Zaten kuruluyken admin token olmadan yeniden yapılandırma engellenir."""
    import app.routers.setup as setup_mod
    monkeypatch.setattr(setup_mod, "bootstrap_database", lambda *a, **k: {"admin_created": False})
    monkeypatch.setattr(db, "configure_pool", AsyncMock())

    first = await client.post("/v1/setup/save", json={
        "host": "h", "port": 1521, "service_name": "S", "user": "u", "password": "p",
        "admin_username": "A", "admin_password": "B",
    })
    assert first.status_code == 200

    second = await client.post("/v1/setup/save", json={
        "host": "h2", "port": 1521, "service_name": "S", "user": "u", "password": "p",
    })
    assert second.status_code == 401  # admin_required
