"""Paylaşımlı veri dönemleri ve dataset testleri."""

from __future__ import annotations

import json
import pytest


@pytest.mark.asyncio
async def test_list_periods_empty(client, user_headers):
    c, cur = client
    cur.fetchall.return_value = []

    res = await c.get("/v1/data/periods", headers=user_headers)
    assert res.status_code == 200
    assert res.json() == []


@pytest.mark.asyncio
async def test_list_periods_with_data(client, user_headers):
    c, cur = client

    call_count = 0
    async def side_effect():
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return [("period-1", "2024 Q4", "2024-10-01")]
        return [("ds-1", "hasar", json.dumps({"record_count": 100}))]

    cur.fetchall.side_effect = side_effect

    res = await c.get("/v1/data/periods", headers=user_headers)
    assert res.status_code == 200
    periods = res.json()
    assert len(periods) == 1
    assert periods[0]["id"] == "period-1"
    assert periods[0]["label"] == "2024 Q4"
    assert "ds-1" in periods[0]["datasetMetas"]


@pytest.mark.asyncio
async def test_upsert_period_new(client, user_headers):
    c, cur = client
    cur.fetchone.return_value = None

    res = await c.post(
        "/v1/data/periods",
        json={"period_id": "p-new", "label": "Yeni Dönem", "created_at": "2025-01-01T00:00:00Z"},
        headers=user_headers,
    )
    assert res.status_code == 200
    assert res.json()["ok"] is True


@pytest.mark.asyncio
async def test_upsert_period_update(client, user_headers):
    c, cur = client
    cur.fetchone.return_value = ("p-existing",)

    res = await c.post(
        "/v1/data/periods",
        json={"period_id": "p-existing", "label": "Güncellenmiş", "created_at": "2025-01-01T00:00:00Z"},
        headers=user_headers,
    )
    assert res.status_code == 200


@pytest.mark.asyncio
async def test_delete_period(client, user_headers):
    c, _ = client
    res = await c.delete("/v1/data/periods/p-1", headers=user_headers)
    assert res.status_code == 200
    assert res.json()["ok"] is True


@pytest.mark.asyncio
async def test_get_dataset_not_found(client, user_headers):
    c, cur = client
    cur.fetchone.return_value = None

    res = await c.get("/v1/data/periods/p-1/datasets/ds-999", headers=user_headers)
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_get_dataset_success(client, user_headers):
    c, cur = client
    meta = {"record_count": 500}
    records = [{"dosya_no": "001", "brans": "Kasko"}]
    cur.fetchone.return_value = ("hasar", json.dumps(meta), json.dumps(records))

    res = await c.get("/v1/data/periods/p-1/datasets/ds-1", headers=user_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["typeId"] == "hasar"
    assert data["meta"]["record_count"] == 500
    assert len(data["records"]) == 1


@pytest.mark.asyncio
async def test_put_dataset_new(client, user_headers):
    c, cur = client
    cur.fetchone.return_value = None

    res = await c.put(
        "/v1/data/periods/p-1/datasets/ds-new",
        json={"typeId": "prim", "meta": {"total": 100}, "records": []},
        headers=user_headers,
    )
    assert res.status_code == 200
    assert res.json()["ok"] is True


@pytest.mark.asyncio
async def test_put_dataset_update(client, user_headers):
    c, cur = client
    cur.fetchone.return_value = ("ds-existing",)

    res = await c.put(
        "/v1/data/periods/p-1/datasets/ds-existing",
        json={"typeId": "hasar", "meta": {}, "records": []},
        headers=user_headers,
    )
    assert res.status_code == 200


@pytest.mark.asyncio
async def test_delete_dataset(client, user_headers):
    c, _ = client
    res = await c.delete("/v1/data/periods/p-1/datasets/ds-1", headers=user_headers)
    assert res.status_code == 200


@pytest.mark.asyncio
async def test_data_endpoints_require_auth(client):
    c, _ = client
    for method, path in [
        ("GET", "/v1/data/periods"),
        ("POST", "/v1/data/periods"),
        ("GET", "/v1/data/periods/p/datasets/d"),
    ]:
        res = await c.request(method, path)
        assert res.status_code == 401, f"{method} {path} should require auth"
