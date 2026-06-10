"""build_triangles adet (count) üçgeni türetme testleri.

Kümülatif ihbar adedi = hücreye kadar görülen distinct dosya_no sayısı.
"""

import pytest

from app.data.triangle_builder import build_triangles


def _rec(brans, hasar, gelisim, odeme, muallak, dosya_no):
    return {
        "brans": brans,
        "hasar_tarihi": hasar,
        "gelisim_tarihi": gelisim,
        "odeme": odeme,
        "muallak": muallak,
        "dosya_no": dosya_no,
    }


class TestCountTriangle:
    def test_cumulative_reported_counts(self):
        records = [
            # 2020 kaza: dosya A age0'da ihbar (2020), age1'de (2021) ek ödeme
            _rec("Kasko", "2020", "2020", 100, 0, "A"),
            _rec("Kasko", "2020", "2021", 50, 0, "A"),
            # 2020 kaza: dosya B age1'de (2021) ihbar
            _rec("Kasko", "2020", "2021", 200, 0, "B"),
            # 2021 kaza: dosya C age0'da (2021) ihbar
            _rec("Kasko", "2021", "2021", 80, 0, "C"),
        ]
        paid, incurred, count, _fd = build_triangles(
            records, "Kasko", "yearly", "yearly"
        )

        assert count is not None
        assert count.origin_periods == ["2020", "2021"]
        # 2020: age0 → {A}=1, age1 → {A,B}=2
        assert count.values[0][0] == pytest.approx(1)
        assert count.values[0][1] == pytest.approx(2)
        # 2021: age0 → {C}=1, age1 → alt köşegen (None)
        assert count.values[1][0] == pytest.approx(1)
        assert count.values[1][1] is None

        # Tutar üçgeni adetle aynı fill pattern'e sahip (Frekans-Şiddet için şart)
        assert paid.values[0][0] == pytest.approx(100)
        assert paid.values[0][1] == pytest.approx(350)  # 100 + 50 + 200

    def test_count_triangle_aligns_with_amount_axes(self):
        records = [
            _rec("X", "2020", "2020", 100, 0, "A"),
            _rec("X", "2021", "2021", 100, 0, "B"),
        ]
        paid, _inc, count, _fd = build_triangles(records, "X", "yearly", "yearly")
        assert count is not None
        assert count.origin_periods == paid.origin_periods
        assert count.development_periods == paid.development_periods

    def test_no_dosya_no_yields_none_count(self):
        records = [
            _rec("X", "2020", "2020", 100, 0, ""),
            _rec("X", "2021", "2021", 100, 0, ""),
        ]
        _paid, _inc, count, _fd = build_triangles(records, "X", "yearly", "yearly")
        assert count is None

    def test_same_file_multiple_payments_counted_once(self):
        """Aynı dosya birden çok ödeme yapsa da 1 hasar olarak sayılır."""
        records = [
            _rec("X", "2020", "2020", 100, 0, "A"),
            _rec("X", "2020", "2020", 50, 0, "A"),  # aynı dosya, aynı hücre
            _rec("X", "2020", "2021", 30, 0, "A"),  # aynı dosya, sonraki hücre
        ]
        _paid, _inc, count, _fd = build_triangles(records, "X", "yearly", "yearly")
        assert count is not None
        assert count.values[0][0] == pytest.approx(1)
        assert count.values[0][1] == pytest.approx(1)  # hâlâ tek dosya
