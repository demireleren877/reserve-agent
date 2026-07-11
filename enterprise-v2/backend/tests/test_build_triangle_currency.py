"""build_triangles — muallak stok + currency (aynı tarih toplama) davranışı."""

from __future__ import annotations

import pytest

from app.data.triangle_builder import build_triangles


def _rec(d, k, g, o, m):
    return {"dosya_no": d, "brans": "Yangın", "hasar_tarihi": k, "gelisim_tarihi": g,
            "odeme": o, "muallak": m}


def test_same_date_currency_split_sums_muallak():
    # D1 aynı origin+gelişim tarihinde iki para birimi satırı → topla
    paid, incurred, _count, _fd = build_triangles(
        records=[
            _rec("D1", "2022", "2022", 100, 300),   # TRY
            _rec("D1", "2022", "2022", 50, 200),    # USD (aynı dosya, aynı tarih)
        ],
        brans="Yangın", origin_granularity="yearly", development_granularity="yearly",
    )
    assert paid.values[0][0] == pytest.approx(150.0)          # 100+50 (akış)
    assert incurred.values[0][0] == pytest.approx(650.0)      # 150 + (300+200)


def test_different_date_takes_last_stock():
    # D1 iki farklı gelişim döneminde → muallak stok: SON dönem (100), toplama YOK
    paid, incurred, _c, _fd = build_triangles(
        records=[
            _rec("D1", "2022", "2022", 100, 300),   # age0: muallak 300
            _rec("D1", "2022", "2023", 40, 100),    # age1: güncel bakiye 100
        ],
        brans="Yangın", origin_granularity="yearly", development_granularity="yearly",
    )
    # age1 kümülatif paid = 140; muallak son dönem = 100 → incurred 240 (400 DEĞİL)
    assert paid.values[0][1] == pytest.approx(140.0)
    assert incurred.values[0][1] == pytest.approx(240.0)


def test_currency_split_across_files():
    # İki farklı dosya + her biri currency ikizli → her dosya kendi içinde toplanır
    paid, incurred, _c, _fd = build_triangles(
        records=[
            _rec("A", "2022", "2022", 10, 100),
            _rec("A", "2022", "2022", 10, 100),   # A currency ikizi
            _rec("B", "2022", "2022", 20, 50),
        ],
        brans="Yangın", origin_granularity="yearly", development_granularity="yearly",
    )
    assert paid.values[0][0] == pytest.approx(40.0)           # 10+10+20
    assert incurred.values[0][0] == pytest.approx(40.0 + 250.0)  # A:200 + B:50
