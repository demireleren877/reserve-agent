"""Database pool schema-upgrade behavior."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from app import db, desktop_config
from app.desktop_config import Connection


@pytest.fixture(autouse=True)
def reset_db_state(monkeypatch):
    monkeypatch.setattr(db, "_pool", object())
    monkeypatch.setattr(db, "_schema_ready", False)


async def test_get_pool_upgrades_existing_database_once(monkeypatch):
    conn = Connection("10.0.0.5", 1521, "ORCL", "actuarius", "secret")
    monkeypatch.setattr(desktop_config, "get_selected_connection", lambda: conn)
    calls: list[tuple[object, ...]] = []

    import app.bootstrap as bootstrap

    monkeypatch.setattr(
        bootstrap,
        "bootstrap_database",
        lambda *args: calls.append(args),
    )

    first = await db.get_pool()
    second = await db.get_pool()

    assert first is second
    assert calls == [("10.0.0.5:1521/ORCL", "actuarius", "secret")]
    assert db._schema_ready is True


async def test_configuring_another_connection_resets_schema_upgrade(monkeypatch):
    previous_pool = AsyncMock()
    monkeypatch.setattr(db, "_pool", previous_pool)
    monkeypatch.setattr(db, "_schema_ready", True)
    next_pool = object()
    monkeypatch.setattr(db, "_create_pool", lambda _conn: next_pool)
    conn = Connection("10.0.0.6", 1521, "ORCL", "actuarius", "secret")

    await db.configure_pool(conn)

    previous_pool.close.assert_awaited_once()
    assert db._pool is next_pool
    assert db._schema_ready is False
