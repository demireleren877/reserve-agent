"""Hesaplama endpoint testleri — Oracle gerektirmez, sadece JWT auth."""

from __future__ import annotations

import base64
import json
import pytest


# ─── Örnek üçgen (3x3 kümülatif paid) ────────────────────────────────────────

SAMPLE_TRIANGLE = {
    "triangle_type": "paid",
    "origin_granularity": "yearly",
    "development_granularity": "yearly",
    "cumulative": True,
    "origin_periods": ["2021", "2022", "2023"],
    "development_periods": [1, 2, 3],
    "values": [
        [1000.0, 1500.0, 1800.0],
        [1200.0, 1700.0, None],
        [1100.0, None, None],
    ],
}


# ─── /v1/compute ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_compute_chain_ladder(client, user_headers):
    c, _ = client
    res = await c.post(
        "/v1/compute",
        json={
            "triangle": SAMPLE_TRIANGLE,
            "method": "volume_weighted",
            "n_years": None,
            "excluded_origins": [],
            "ldf_override": None,
        },
        headers=user_headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert "ldfs" in data
    assert "cdfs" in data
    assert data["n_origins"] == 3
    assert data["total_reserve"] > 0


@pytest.mark.asyncio
async def test_compute_requires_auth(client):
    c, _ = client
    res = await c.post("/v1/compute", json={"triangle": SAMPLE_TRIANGLE, "method": "volume_weighted"})
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_compute_invalid_triangle(client, user_headers):
    c, _ = client
    bad_triangle = {**SAMPLE_TRIANGLE, "values": [[None, None], [None]]}  # boyut uyumsuz
    res = await c.post(
        "/v1/compute",
        json={"triangle": bad_triangle, "method": "volume_weighted"},
        headers=user_headers,
    )
    assert res.status_code in (400, 422)


# ─── /v1/cashflow/from-triangle ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_cashflow_from_triangle(client, user_headers):
    c, _ = client
    res = await c.post(
        "/v1/cashflow/from-triangle",
        json={
            "origin_periods": ["2021", "2022", "2023"],
            "development_periods": ["1", "2", "3"],
            "values": [
                [1000.0, 1500.0, 1800.0],
                [1200.0, 1700.0, None],
                [1100.0, None, None],
            ],
            "origin_granularity": "yearly",
            "development_granularity": "yearly",
            "n_years": 5,
        },
        headers=user_headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert "monthly_pattern" in data
    assert "dev_factors" in data
    assert len(data["origin_years"]) == 3


@pytest.mark.asyncio
async def test_cashflow_from_triangle_requires_auth(client):
    c, _ = client
    res = await c.post("/v1/cashflow/from-triangle", json={})
    assert res.status_code == 401


# ─── /v1/cashflow/compute ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_cashflow_compute_empty_records(client, user_headers):
    c, _ = client
    res = await c.post("/v1/cashflow/compute", json={"records": []}, headers=user_headers)
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_cashflow_compute_with_records(client, user_headers):
    c, _ = client
    records = [
        {"origin_year": 2021, "dev_date": "2021-12-31", "paid": 1000},
        {"origin_year": 2021, "dev_date": "2022-12-31", "paid": 1500},
        {"origin_year": 2022, "dev_date": "2022-12-31", "paid": 1200},
        {"origin_year": 2022, "dev_date": "2023-12-31", "paid": 1700},
    ]
    res = await c.post("/v1/cashflow/compute", json={"records": records}, headers=user_headers)
    assert res.status_code == 200
    data = res.json()
    assert "dev_factors" in data
    assert "monthly_pattern" in data


# ─── /v1/agent/chat (placeholder) ────────────────────────────────────────────

@pytest.mark.asyncio
async def test_agent_chat_placeholder(client, user_headers):
    c, _ = client
    res = await c.post(
        "/v1/chat",
        json={"messages": [{"role": "user", "content": "merhaba"}]},
        headers=user_headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert "message" in data
    assert "etkin değil" in data["message"]


# ─── /health ──────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_health(client):
    c, _ = client
    res = await c.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"
