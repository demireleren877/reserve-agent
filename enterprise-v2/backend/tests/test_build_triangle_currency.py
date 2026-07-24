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


def _last_nonnull(row):
    idx = -1
    for i, v in enumerate(row):
        if v is not None:
            idx = i
    return idx


def test_file_data_is_incurred_and_reconciles_with_diagonal():
    # file_data dosya bazında INCURRED (kümülatif ödeme + o hücredeki muallak)
    # olmalı; her origin için son diyagonaldeki Σ file_data == incurred diyagonal.
    # (Files sekmesi ile model üçgeni mutabakatı — regresyon.)
    _paid, incurred, _c, fd = build_triangles(
        records=[
            _rec("A", "2022", "2022", 100, 400),
            _rec("A", "2022", "2023", 150, 200),   # A: kümülatif ödeme 250 + muallak 200
            _rec("B", "2022", "2022", 50, 50),     # B: 2023'te kaydı yok → muallak katkısı 0
            _rec("C", "2023", "2023", 300, 700),   # C: 300 + 700
        ],
        brans="Yangın", origin_granularity="yearly", development_granularity="yearly",
    )
    assert fd is not None
    # Dosya bazında incurred
    assert fd["2022"]["2023"]["A"] == pytest.approx(450.0)   # 250 + 200
    assert fd["2022"]["2023"]["B"] == pytest.approx(50.0)    # 50 + 0 (kayıt yok)
    assert fd["2023"]["2023"]["C"] == pytest.approx(1000.0)  # 300 + 700

    # Son diyagonal mutabakatı: Σ file_data == incurred
    for i, o in enumerate(incurred.origin_periods):
        inc_diag = incurred.values[i][_last_nonnull(incurred.values[i])]
        last_dev = list(fd[o].keys())[-1]
        fd_sum = sum(fd[o][last_dev].values())
        assert fd_sum == pytest.approx(inc_diag)
