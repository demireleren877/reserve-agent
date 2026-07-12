"""Test fixture'ları — Oracle mock + FastAPI test client."""

from __future__ import annotations

import os
os.environ.setdefault("ORACLE_USER", "test")
os.environ.setdefault("ORACLE_PASSWORD", "test")
os.environ.setdefault("ORACLE_DSN", "localhost:1521/TEST")
os.environ.setdefault("JWT_SECRET", "test-secret-key")

from typing import AsyncGenerator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.auth import create_token


# ─── Oracle pool mock ─────────────────────────────────────────────────────────

class MockCursor:
    """Oracle cursor mock — sync context manager, async execute/fetch."""

    def __init__(self):
        self.execute = AsyncMock()
        self.fetchone = AsyncMock(return_value=None)
        self.fetchall = AsyncMock(return_value=[])
        self.rowcount = 1  # koşullu UPDATE varsayılan: 1 satır etkilendi
        self._var_val = MagicMock()
        self._var_val.getvalue = MagicMock(return_value=[1])

    def var(self, *args, **kwargs):
        return self._var_val

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


class MockConn:
    def __init__(self, cursor: MockCursor):
        self._cursor = cursor
        self.commit = AsyncMock()
        self.rollback = AsyncMock()

    def cursor(self):
        return self._cursor

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False


class MockPool:
    def __init__(self, conn: MockConn):
        self._conn = conn

    def acquire(self):
        return self._conn


@pytest.fixture
def db():
    """(pool, conn, cur) — testler cur.fetchone.return_value ile davranış ayarlar."""
    cur = MockCursor()
    conn = MockConn(cur)
    pool = MockPool(conn)
    return pool, conn, cur


# ─── HTTP client ──────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def client(db) -> AsyncGenerator[tuple[AsyncClient, MockCursor], None]:
    pool, conn, cur = db
    with patch("app.db._pool", pool):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as c:
            yield c, cur


# ─── Geçerli token'lar ────────────────────────────────────────────────────────

@pytest.fixture
def admin_token() -> str:
    return create_token(user_id=1, username="ErenD", role="admin")


@pytest.fixture
def user_token() -> str:
    return create_token(user_id=2, username="testuser", role="user")


@pytest.fixture
def admin_headers(admin_token) -> dict:
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture
def user_headers(user_token) -> dict:
    return {"Authorization": f"Bearer {user_token}"}
