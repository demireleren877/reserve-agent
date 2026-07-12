"""Paylaşımlı team state testleri."""

from __future__ import annotations

import json
import pytest


@pytest.mark.asyncio
async def test_get_state_empty(client, user_headers):
    c, cur = client
    cur.fetchone.return_value = None

    res = await c.get("/v1/state", headers=user_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["project"] is None
    assert data["chat"] is None
    assert data["version"] == 0


@pytest.mark.asyncio
async def test_get_state_existing(client, user_headers):
    c, cur = client
    from datetime import datetime, timezone

    proj = {"periods": [], "activePeriodId": None}
    chat = [{"role": "user", "content": "merhaba"}]

    cur.fetchone.return_value = (
        json.dumps(proj),
        json.dumps(chat),
        3,
        datetime(2025, 1, 1, tzinfo=timezone.utc),
        "ErenD",
    )

    res = await c.get("/v1/state", headers=user_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["version"] == 3
    assert data["project"]["periods"] == []
    assert data["updated_by_name"] == "ErenD"


@pytest.mark.asyncio
async def test_put_state_new(client, user_headers):
    c, cur = client
    cur.fetchone.return_value = None

    proj = {"periods": [{"id": "p1", "label": "2024"}]}
    res = await c.put("/v1/state", json={"project": proj}, headers=user_headers)
    assert res.status_code == 200
    assert res.json()["version"] == 1


@pytest.mark.asyncio
async def test_put_state_update(client, user_headers):
    c, cur = client
    cur.fetchone.return_value = (2,)

    res = await c.put("/v1/state", json={"project": {"x": 1}}, headers=user_headers)
    assert res.status_code == 200
    assert res.json()["version"] == 3


@pytest.mark.asyncio
async def test_put_state_version_conflict(client, user_headers):
    c, cur = client
    cur.fetchone.return_value = (5,)

    res = await c.put(
        "/v1/state",
        json={"project": {}, "expectedVersion": 3},
        headers=user_headers,
    )
    assert res.status_code == 409
    assert res.json()["detail"] == "version_conflict"


@pytest.mark.asyncio
async def test_put_state_atomic_race_no_rows_updated(client, user_headers):
    """SELECT versiyonu eşleşse bile koşullu UPDATE 0 satır etkilerse (eş zamanlı
    yazım yarışı) → 409. Bu, hiçbir yazımın sessizce kaybolmamasını garantiler."""
    c, cur = client
    cur.fetchone.return_value = (3,)   # SELECT: versiyon 3 (beklenenle eşleşir)
    cur.rowcount = 0                   # UPDATE ... WHERE version=3 → 0 satır (başkası araya girdi)

    res = await c.put(
        "/v1/state",
        json={"project": {"x": 1}, "expectedVersion": 3},
        headers=user_headers,
    )
    assert res.status_code == 409
    assert res.json()["detail"] == "version_conflict"


@pytest.mark.asyncio
async def test_put_state_with_matching_version_succeeds(client, user_headers):
    c, cur = client
    cur.fetchone.return_value = (3,)
    cur.rowcount = 1  # koşullu UPDATE başarılı

    res = await c.put(
        "/v1/state",
        json={"project": {"x": 1}, "expectedVersion": 3},
        headers=user_headers,
    )
    assert res.status_code == 200
    assert res.json()["version"] == 4


@pytest.mark.asyncio
async def test_delete_state(client, user_headers):
    c, _ = client
    res = await c.delete("/v1/state", headers=user_headers)
    assert res.status_code == 204


@pytest.mark.asyncio
async def test_state_requires_auth(client):
    c, _ = client
    res = await c.get("/v1/state")
    assert res.status_code == 401
