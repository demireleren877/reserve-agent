"""LDF (Loss Development Factor) hesaplama testleri.

LDF, zincir merdiven metodunun temel girdisidir:
    LDF_{i→i+1} = dev_{i+1} kolonundaki değerlerin toplamı / dev_i kolonundaki değerlerin toplamı
(volume-weighted default metod)
"""

import math

import pytest

from app.core.ldf import LDFMethod, compute_ldfs
from app.core.triangle import Triangle


@pytest.fixture
def sample_triangle() -> Triangle:
    """4x4 kümülatif paid üçgen."""
    return Triangle(
        origin_periods=[2020, 2021, 2022, 2023],
        development_periods=[1, 2, 3, 4],
        values=[
            [1000.0, 1500.0, 1700.0, 1750.0],
            [1100.0, 1600.0, 1800.0, None],
            [1200.0, 1700.0, None, None],
            [1300.0, None, None, None],
        ],
    )


class TestVolumeWeighted:
    def test_volume_weighted_ldf_all_origins(self, sample_triangle):
        ldfs = compute_ldfs(sample_triangle, method=LDFMethod.VOLUME_WEIGHTED)
        # dev 1->2: (1500+1600+1700) / (1000+1100+1200) = 4800/3300
        # dev 2->3: (1700+1800) / (1500+1600) = 3500/3100
        # dev 3->4: 1750 / 1700
        assert ldfs[0] == pytest.approx(4800 / 3300, rel=1e-9)
        assert ldfs[1] == pytest.approx(3500 / 3100, rel=1e-9)
        assert ldfs[2] == pytest.approx(1750 / 1700, rel=1e-9)

    def test_ldf_count_equals_developments_minus_one(self, sample_triangle):
        ldfs = compute_ldfs(sample_triangle, method=LDFMethod.VOLUME_WEIGHTED)
        assert len(ldfs) == sample_triangle.n_developments - 1


class TestSimpleAverage:
    def test_simple_average_ldf(self, sample_triangle):
        ldfs = compute_ldfs(sample_triangle, method=LDFMethod.SIMPLE_AVERAGE)
        expected_step1 = (1500 / 1000 + 1600 / 1100 + 1700 / 1200) / 3
        expected_step2 = (1700 / 1500 + 1800 / 1600) / 2
        expected_step3 = 1750 / 1700
        assert ldfs[0] == pytest.approx(expected_step1, rel=1e-9)
        assert ldfs[1] == pytest.approx(expected_step2, rel=1e-9)
        assert ldfs[2] == pytest.approx(expected_step3, rel=1e-9)


class TestGeometricAverage:
    def test_geometric_average_ldf(self, sample_triangle):
        ldfs = compute_ldfs(sample_triangle, method=LDFMethod.GEOMETRIC_AVERAGE)
        expected_step1 = math.pow((1500 / 1000) * (1600 / 1100) * (1700 / 1200), 1 / 3)
        expected_step2 = math.pow((1700 / 1500) * (1800 / 1600), 1 / 2)
        expected_step3 = 1750 / 1700
        assert ldfs[0] == pytest.approx(expected_step1, rel=1e-9)
        assert ldfs[1] == pytest.approx(expected_step2, rel=1e-9)
        assert ldfs[2] == pytest.approx(expected_step3, rel=1e-9)


class TestNYearAverage:
    def test_last_n_years_volume_weighted(self, sample_triangle):
        """n_years=2: sadece en son 2 origin'i kullan."""
        ldfs = compute_ldfs(
            sample_triangle, method=LDFMethod.VOLUME_WEIGHTED, n_years=2
        )
        # dev 1->2 için en son 2 origin: 2022, 2023 (dev 2'de 2023 yok)
        # 2023 dev 2'de yok, o yüzden fiilen 2021 ve 2022 alınır
        # pairs: (1100,1600), (1200,1700) → (1600+1700)/(1100+1200) = 3300/2300
        assert ldfs[0] == pytest.approx(3300 / 2300, rel=1e-9)
        # dev 2->3: pairs (1500,1700),(1600,1800). Son 2 zaten hepsi.
        assert ldfs[1] == pytest.approx(3500 / 3100, rel=1e-9)

    def test_n_years_larger_than_available_uses_all(self, sample_triangle):
        ldfs_all = compute_ldfs(sample_triangle, method=LDFMethod.VOLUME_WEIGHTED)
        ldfs_big_n = compute_ldfs(
            sample_triangle, method=LDFMethod.VOLUME_WEIGHTED, n_years=100
        )
        assert ldfs_all == pytest.approx(ldfs_big_n, rel=1e-12)


class TestExclusions:
    def test_exclude_origin_removes_its_contribution(self, sample_triangle):
        """2021 origin'i (dev 1->2'deki (1100,1600) pair'ini) hariç tut."""
        ldfs = compute_ldfs(
            sample_triangle,
            method=LDFMethod.VOLUME_WEIGHTED,
            excluded_origins={2021},
        )
        # dev 1->2: (1500+1700)/(1000+1200) = 3200/2200
        # dev 2->3: sadece (1500,1700) kalır (2021 hariç) → 1700/1500
        # dev 3->4: (1700,1750) sadece, 2020 origin'i — etkilenmez → 1750/1700
        assert ldfs[0] == pytest.approx(3200 / 2200, rel=1e-9)
        assert ldfs[1] == pytest.approx(1700 / 1500, rel=1e-9)
        assert ldfs[2] == pytest.approx(1750 / 1700, rel=1e-9)


class TestEdgeCases:
    def test_empty_pair_step_yields_one_as_ldf(self):
        """Bir step'te hiç pair yoksa LDF=1.0 (no-op) dönmeli."""
        tri = Triangle(
            origin_periods=[2020, 2021],
            development_periods=[1, 2],
            values=[[100.0, 150.0], [110.0, None]],
        )
        # Sadece 2020 origin'ini hariç tutarsak dev 1->2'de pair kalmaz
        ldfs = compute_ldfs(
            tri, method=LDFMethod.VOLUME_WEIGHTED, excluded_origins={2020}
        )
        assert ldfs == [1.0]

    def test_zero_denominator_yields_one(self):
        """Bölen 0 ise 1.0 döndür (NaN yerine güvenli default)."""
        tri = Triangle(
            origin_periods=[2020, 2021],
            development_periods=[1, 2],
            values=[[0.0, 0.0], [110.0, None]],
        )
        ldfs = compute_ldfs(tri, method=LDFMethod.VOLUME_WEIGHTED)
        assert ldfs[0] == 1.0
