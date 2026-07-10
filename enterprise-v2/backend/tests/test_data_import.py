"""/data/import — stok (muallak) vs akış (ödeme) davranışı.

Muallak stoktur: bir dosya birden çok gelişim döneminde görünürse yalnızca SON
dönemdeki muallak alınır (toplanmaz). Ödeme akıştır: dönemler boyunca toplanır.
"""

from __future__ import annotations

import base64

_MAPPING = {
    "dosya_no": "Dosya No", "brans": "Brans",
    "hasar_tarihi": "Hasar Tarihi", "gelisim_tarihi": "Gelisim Tarihi",
    "odeme": "Odeme", "muallak": "Muallak",
}


def _b64(s: str) -> str:
    return base64.b64encode(s.encode()).decode()


async def test_muallak_is_stock_odeme_is_flow(client, user_headers):
    c, _cur = client
    csv = (
        "Dosya No;Brans;Hasar Tarihi;Gelisim Tarihi;Odeme;Muallak\n"
        "A;Yangin;01.01.2022;31.03.2022;100;900\n"
        "A;Yangin;01.01.2022;30.06.2022;150;700\n"
        "A;Yangin;01.01.2022;30.09.2022;200;400\n"
    )
    resp = await c.post("/v1/data/import", headers=user_headers,
                        json={"file_b64": _b64(csv), "filename": "h.csv", "column_mapping": _MAPPING})
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_odeme"] == 450.0     # 100+150+200 (akış)
    assert data["total_muallak"] == 400.0    # yalnızca son dönem (stok), 2000 DEĞİL
    assert data["total_incurred"] == 850.0   # 450 + 400


async def test_multiple_files_last_diagonal_each(client, user_headers):
    c, _cur = client
    csv = (
        "Dosya No;Brans;Hasar Tarihi;Gelisim Tarihi;Odeme;Muallak\n"
        "A;Yangin;01.01.2022;30.06.2022;100;300\n"
        "A;Yangin;01.01.2022;31.12.2022;50;200\n"   # A son muallak = 200
        "B;Yangin;01.01.2022;31.12.2022;300;200\n"  # B son muallak = 200
    )
    resp = await c.post("/v1/data/import", headers=user_headers,
                        json={"file_b64": _b64(csv), "filename": "h.csv", "column_mapping": _MAPPING})
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_odeme"] == 450.0      # 100+50+300
    assert data["total_muallak"] == 400.0     # 200 (A) + 200 (B)
    assert data["total_incurred"] == 850.0
