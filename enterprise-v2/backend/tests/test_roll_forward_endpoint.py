"""/v1/data/roll-forward endpoint — artımsal roll-forward (auth'lu)."""

from __future__ import annotations

_PRIOR_PAID = {
    "origin_periods": ["2021", "2022", "2023"],
    "development_periods": [0, 1, 2],
    "values": [[1000, 1500, 1700], [1100, 1600, None], [1200, None, None]],
    "triangle_type": "paid", "origin_granularity": "yearly", "development_granularity": "yearly",
}
_PRIOR_INC = {
    "origin_periods": ["2021", "2022", "2023"],
    "development_periods": [0, 1, 2],
    "values": [[1400, 1650, 1750], [1550, 1720, None], [1680, None, None]],
    "triangle_type": "incurred", "origin_granularity": "yearly", "development_granularity": "yearly",
}


def _rec(d, k, g, o, m):
    return {"dosya_no": d, "brans": "Yangın", "hasar_tarihi": k, "gelisim_tarihi": g, "odeme": o, "muallak": m}


async def test_roll_forward_appends_diagonal(client, user_headers):
    c, _cur = client
    resp = await c.post("/v1/data/roll-forward", headers=user_headers, json={
        "prior_paid": _PRIOR_PAID, "prior_incurred": _PRIOR_INC,
        "records": [_rec("B", "2022", "2024", 120, 90), _rec("C", "2023", "2024", 260, 350),
                    _rec("D", "2024", "2024", 900, 600)],
        "brans": "Yangın",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["paid_triangle"]["origin_periods"] == ["2021", "2022", "2023", "2024"]
    assert data["paid_triangle"]["values"][2][1] == 1460      # 2023 age1 = 1200+260
    assert data["incurred_triangle"]["values"][3][0] == 1500  # 2024 incurred age0 = 900+600
    assert data["new_diagonal_files"]["2024"] == {"D": 900.0}


async def test_roll_forward_missing_brans_400(client, user_headers):
    c, _cur = client
    resp = await c.post("/v1/data/roll-forward", headers=user_headers, json={
        "prior_paid": _PRIOR_PAID, "records": [_rec("X", "2023", "2024", 1, 0)], "brans": "Kasko",
    })
    assert resp.status_code == 400
