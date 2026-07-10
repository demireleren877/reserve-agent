"""Roll-forward: mevcut üçgen + güncel dönem ARTIMSAL dosya verisi → yeni diagonal.

Elle hesaplanmış senaryo ile doğrulanır:
  yeni paid diagonal  = önceki paid son-diagonal + Σ artımsal ödeme (origin bazlı)
  yeni incurred diag. = yeni paid + güncel muallak (dosya bazlı son bakiye)
  yeni kaza dönemi     = otomatik yeni satır (age 0)
"""

import pytest

from app.data.triangle_builder import roll_forward
from app.core.triangle import Granularity, Triangle, TriangleType


def _tri(origins, devs, values, ttype):
    return Triangle(
        origin_periods=origins,
        development_periods=devs,
        values=values,
        triangle_type=ttype,
        origin_granularity=Granularity.YEARLY,
        development_granularity=Granularity.YEARLY,
    )


@pytest.fixture
def prior():
    # 2023Q4 değerlemesi (yıllık): 3 kaza yılı, 3 gelişim yaşı
    origins = ["2021", "2022", "2023"]
    devs = [0, 1, 2]
    paid = _tri(origins, devs, [
        [1000.0, 1500.0, 1700.0],   # 2021 tam gelişmiş (son age 2)
        [1100.0, 1600.0, None],     # 2022 son age 1
        [1200.0, None, None],       # 2023 son age 0
    ], TriangleType.PAID)
    incurred = _tri(origins, devs, [
        [1400.0, 1650.0, 1750.0],
        [1550.0, 1720.0, None],
        [1680.0, None, None],
    ], TriangleType.INCURRED)
    return paid, incurred


def _rec(dosya, kaza, gelisim, odeme, muallak, brans="Yangın"):
    return {"dosya_no": dosya, "brans": brans, "hasar_tarihi": kaza,
            "gelisim_tarihi": gelisim, "odeme": odeme, "muallak": muallak}


class TestRollForward:
    def test_new_diagonal_paid_adds_increments(self, prior):
        paid, _, _ = roll_forward(
            prior_paid=prior[0], prior_incurred=prior[1],
            records=[
                # 2024 değerlemesi (yeni dönem). Artımsal ödeme + dönem sonu muallak.
                _rec("A", "2021", "2024", 40, 0),    # 2021 → age 3 (yeni sütun)
                _rec("B", "2022", "2024", 120, 90),  # 2022 → age 2
                _rec("C", "2023", "2024", 260, 350), # 2023 → age 1
                _rec("D", "2024", "2024", 900, 600), # 2024 → yeni origin, age 0
            ],
            brans="Yangın", origin_granularity="yearly", development_granularity="yearly",
        )
        assert paid.origin_periods == ["2021", "2022", "2023", "2024"]
        assert paid.development_periods == [0, 1, 2, 3]  # bir yeni sütun
        # 2021: son paid 1700 + 40 = 1740 (age 3)
        assert paid.values[0][3] == pytest.approx(1740.0)
        # 2022: son paid 1600 + 120 = 1720 (age 2)
        assert paid.values[1][2] == pytest.approx(1720.0)
        # 2023: son paid 1200 + 260 = 1460 (age 1)
        assert paid.values[2][1] == pytest.approx(1460.0)
        # 2024: yeni origin, age 0 = 900
        assert paid.values[3][0] == pytest.approx(900.0)
        assert paid.values[3][1] is None
        # üst üçgen korunur
        assert paid.values[0][2] == pytest.approx(1700.0)

    def test_new_diagonal_incurred_is_paid_plus_outstanding(self, prior):
        _, incurred, _ = roll_forward(
            prior_paid=prior[0], prior_incurred=prior[1],
            records=[
                _rec("B", "2022", "2024", 120, 90),
                _rec("C", "2023", "2024", 260, 350),
                _rec("D", "2024", "2024", 900, 600),
            ],
            brans="Yangın", origin_granularity="yearly", development_granularity="yearly",
        )
        assert incurred is not None
        # 2022: new_paid = 1600+120 = 1720; + muallak 90 = 1810
        assert incurred.values[1][2] == pytest.approx(1810.0)
        # 2023: new_paid = 1200+260 = 1460; + muallak 350 = 1810
        assert incurred.values[2][1] == pytest.approx(1810.0)
        # 2024: new_paid 900 + muallak 600 = 1500
        assert incurred.values[3][0] == pytest.approx(1500.0)
        # üst üçgen incurred korunur
        assert incurred.values[0][1] == pytest.approx(1650.0)

    def test_outstanding_is_stock_latest_per_dosya(self, prior):
        # Aynı dosya iki kez (aynı dönem içi düzeltme) → muallak stok: son bakiye
        _, incurred, _ = roll_forward(
            prior_paid=prior[0], prior_incurred=prior[1],
            records=[
                _rec("B", "2022", "2024", 50, 200),
                _rec("B", "2022", "2024", 70, 90),   # aynı dosya, güncel bakiye 90
            ],
            brans="Yangın", origin_granularity="yearly", development_granularity="yearly",
        )
        # paid artışı toplanır: 50+70=120 → new_paid 1720; muallak son = 90 → 1810
        assert incurred.values[1][2] == pytest.approx(1810.0)

    def test_new_diagonal_files_returned(self, prior):
        _, _, files = roll_forward(
            prior_paid=prior[0], prior_incurred=prior[1],
            records=[_rec("A", "2021", "2024", 40, 0), _rec("D", "2024", "2024", 900, 600)],
            brans="Yangın", origin_granularity="yearly", development_granularity="yearly",
        )
        assert files["2021"] == {"A": 40.0}
        assert files["2024"] == {"D": 900.0}

    def test_paid_only_prior_produces_no_incurred(self, prior):
        paid, incurred, _ = roll_forward(
            prior_paid=prior[0], prior_incurred=None,
            records=[_rec("C", "2023", "2024", 260, 350)],
            brans="Yangın", origin_granularity="yearly", development_granularity="yearly",
        )
        assert incurred is None
        assert paid.values[2][1] == pytest.approx(1460.0)

    def test_brans_filter(self, prior):
        paid, _, _ = roll_forward(
            prior_paid=prior[0], prior_incurred=prior[1],
            records=[
                _rec("C", "2023", "2024", 260, 350, brans="Yangın"),
                _rec("X", "2023", "2024", 9999, 0, brans="Kasko"),  # filtrelenir
            ],
            brans="Yangın", origin_granularity="yearly", development_granularity="yearly",
        )
        assert paid.values[2][1] == pytest.approx(1460.0)  # sadece Yangın artışı

    def test_no_matching_records_errors(self, prior):
        with pytest.raises(ValueError, match="güncel kayıt bulunamadı"):
            roll_forward(prior_paid=prior[0], prior_incurred=prior[1],
                         records=[_rec("C", "2023", "2024", 1, 0, brans="Kasko")],
                         brans="Yangın", origin_granularity="yearly", development_granularity="yearly")

    def test_granularity_mismatch_errors(self, prior):
        with pytest.raises(ValueError, match="Granülarite"):
            roll_forward(prior_paid=prior[0], prior_incurred=prior[1],
                         records=[_rec("C", "2023", "2024Q1", 1, 0)],
                         brans="Yangın", origin_granularity="quarterly", development_granularity="quarterly")

    def test_inactive_origin_carries_forward(self, prior):
        # Sadece 2023 hareket etti; 2021 & 2022 hareketsiz. Değerleme yine de
        # bir yaş ilerler → 2021 age3'e taşınır (1700), incurred korunur (1750).
        paid, incurred, _ = roll_forward(
            prior_paid=prior[0], prior_incurred=prior[1],
            records=[_rec("C", "2023", "2024", 260, 350)],
            brans="Yangın", origin_granularity="yearly", development_granularity="yearly",
        )
        assert paid.development_periods == [0, 1, 2, 3]
        # 2021 hareketsiz: paid age3 = 1700 (taşındı), incurred age3 = 1750 (korundu)
        assert paid.values[0][3] == pytest.approx(1700.0)
        assert incurred.values[0][3] == pytest.approx(1750.0)  # muallak sıfırlanmadı
        # 2022 hareketsiz: paid age2 = 1600 (taşındı), incurred age2 = 1720 (korundu)
        assert paid.values[1][2] == pytest.approx(1600.0)
        assert incurred.values[1][2] == pytest.approx(1720.0)
        # 2023 aktif: paid age1 = 1460, incurred = 1460 + 350 = 1810
        assert paid.values[2][1] == pytest.approx(1460.0)
        assert incurred.values[2][1] == pytest.approx(1810.0)
