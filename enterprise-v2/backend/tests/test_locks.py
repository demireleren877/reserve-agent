"""Model kilidi — özellikle eş zamanlı acquire yarışı (kayıp önleme kritik)."""

from __future__ import annotations

from datetime import datetime, timezone

import oracledb
import pytest


def _db_error(code: int) -> oracledb.DatabaseError:
    class _Arg:
        pass
    a = _Arg()
    a.code = code
    return oracledb.DatabaseError(a)


@pytest.mark.asyncio
async def test_acquire_free_lock_succeeds(client, user_headers):
    c, cur = client
    cur.fetchone.return_value = None  # kimse kilitli değil → INSERT
    res = await c.post("/v1/locks/acquire", json={"lock_key": "branch:p/b"}, headers=user_headers)
    assert res.status_code == 200
    assert res.json()["is_mine"] is True


@pytest.mark.asyncio
async def test_acquire_held_by_other_returns_423(client, user_headers):
    c, cur = client
    now = datetime.now(timezone.utc)
    # İlk SELECT: başka kullanıcı (id=999) kilitli
    cur.fetchone.side_effect = [(999,), (999, "Başka", now, now)]
    res = await c.post("/v1/locks/acquire", json={"lock_key": "branch:p/b"}, headers=user_headers)
    assert res.status_code == 423
    assert res.json()["detail"]["locked_by_name"] == "Başka"


@pytest.mark.asyncio
async def test_acquire_race_insert_conflict_returns_423(client, user_headers):
    """Yarış: SELECT boş görünür ama INSERT tam o an başkasınca yapılmış (ORA-00001)
    → sahibi tekrar okunur → 423. Böylece iki kişi aynı branşı asla açık alamaz."""
    c, cur = client
    now = datetime.now(timezone.utc)

    async def exec_side(sql, *a, **k):
        if sql.strip().upper().startswith("INSERT"):
            raise _db_error(1)  # ORA-00001 unique violation
        return None

    cur.execute.side_effect = exec_side
    cur.fetchone.side_effect = [
        None,                          # ilk SELECT: kimse yok (yarış öncesi)
        (999, "Rakip", now, now),      # INSERT patlayınca re-SELECT: rakip sahip
    ]

    res = await c.post("/v1/locks/acquire", json={"lock_key": "branch:p/b"}, headers=user_headers)
    assert res.status_code == 423
    assert res.json()["detail"]["locked_by_name"] == "Rakip"


@pytest.mark.asyncio
async def test_acquire_requires_auth(client):
    c, _cur = client
    res = await c.post("/v1/locks/acquire", json={"lock_key": "branch:p/b"})
    assert res.status_code in (401, 403)
