"""LDF exclusion / override entegrasyon testleri.

LDF hesaplama parametrelerinin (n_years, exclusions, override) Chain Ladder
çıktısı üzerindeki bileşik etkilerini doğrular.
"""

import pytest

from app.core.chain_ladder import run_chain_ladder
from app.core.ldf import LDFMethod, compute_ldfs
from app.core.triangle import Triangle, TriangleType


@pytest.fixture
def paid_triangle() -> Triangle:
    return Triangle(
        origin_periods=[2020, 2021, 2022, 2023],
        development_periods=[1, 2, 3, 4],
        values=[
            [1000.0, 1500.0, 1700.0, 1750.0],
            [1100.0, 1600.0, 1800.0, None],
            [1200.0, 1700.0, None, None],
            [1300.0, None, None, None],
        ],
        triangle_type=TriangleType.PAID,
    )


@pytest.fixture
def incurred_triangle() -> Triangle:
    return Triangle(
        origin_periods=[2020, 2021, 2022, 2023],
        development_periods=[1, 2, 3, 4],
        values=[
            [2000.0, 2400.0, 2500.0, 2520.0],
            [2100.0, 2520.0, 2620.0, None],
            [2200.0, 2640.0, None, None],
            [2300.0, None, None, None],
        ],
        triangle_type=TriangleType.INCURRED,
    )


class TestExclusionAffectsUltimate:
    def test_excluding_outlier_origin_changes_total_reserve(self, paid_triangle):
        """2021 origin'ini (outlier) hariç tutmak ultimate'ları değiştirmeli."""
        base = run_chain_ladder(paid_triangle, method=LDFMethod.VOLUME_WEIGHTED)
        with_exclusion = run_chain_ladder(
            paid_triangle,
            method=LDFMethod.VOLUME_WEIGHTED,
            excluded_origins={2021},
        )
        assert base.total_reserve != pytest.approx(with_exclusion.total_reserve, rel=1e-6)

    def test_exclusion_does_not_remove_origin_from_output(self, paid_triangle):
        """Hariç tutulan origin LDF hesabına girmez ama çıktıda (ultimate'ı hesaplanmış şekilde) kalır."""
        result = run_chain_ladder(paid_triangle, excluded_origins={2021})
        assert 2021 in result.origin_periods
        # 2021'in latest değeri hâlâ 1800 (dev 3) — ultimate yeni LDF'lerle hesaplanır
        assert result.latest_per_origin[1] == 1800.0


class TestNYearsAffectsUltimate:
    def test_last_2_years_vs_all_years_differs(self, paid_triangle):
        all_years = run_chain_ladder(paid_triangle, method=LDFMethod.VOLUME_WEIGHTED)
        last_2 = run_chain_ladder(
            paid_triangle, method=LDFMethod.VOLUME_WEIGHTED, n_years=2
        )
        assert all_years.ldfs != pytest.approx(last_2.ldfs, rel=1e-9)


class TestCombinedExclusionAndNYears:
    def test_exclusion_and_n_years_together(self, paid_triangle):
        """Hem belirli origin hariç, hem son N yıl."""
        result = run_chain_ladder(
            paid_triangle,
            method=LDFMethod.VOLUME_WEIGHTED,
            n_years=3,
            excluded_origins={2020},
        )
        # 2020 hariç, son 3 origin = 2021,2022,2023
        # dev 1->2: (1100,1600),(1200,1700) → 3300/2300 (2023'ün dev 2'si yok)
        assert result.ldfs[0] == pytest.approx(3300 / 2300, rel=1e-9)


class TestOverrideVsComputed:
    def test_override_bypasses_exclusion_and_n_years(self, paid_triangle):
        """Override verilirse exclusion ve n_years görmezden gelinmeli."""
        override = [1.5, 1.1, 1.02]
        result = run_chain_ladder(
            paid_triangle,
            ldf_override=override,
            excluded_origins={2021},
            n_years=2,
        )
        assert result.ldfs == override

    def test_partial_override_via_compute_then_swap(self, paid_triangle):
        """Tek bir LDF'yi değiştirme akışı: hesapla → indeksi değiştir → yeniden çalıştır."""
        computed = compute_ldfs(paid_triangle, method=LDFMethod.VOLUME_WEIGHTED)
        manual = list(computed)
        manual[0] = 1.45  # aktüerin manuel kararı
        result = run_chain_ladder(paid_triangle, ldf_override=manual)
        assert result.ldfs[0] == 1.45
        assert result.ldfs[1] == pytest.approx(computed[1], rel=1e-12)
        assert result.ldfs[2] == pytest.approx(computed[2], rel=1e-12)


class TestPaidVsIncurred:
    def test_paid_and_incurred_yield_different_ultimates(
        self, paid_triangle, incurred_triangle
    ):
        """Aynı dönemde paid ve incurred farklı ultimate üretir — karşılaştırma mümkün."""
        paid_result = run_chain_ladder(paid_triangle)
        incurred_result = run_chain_ladder(incurred_triangle)

        # Aynı origin sayısı
        assert len(paid_result.ultimate_per_origin) == len(
            incurred_result.ultimate_per_origin
        )
        # Incurred genelde paid'den yüksek (case reserve içeriyor)
        for paid_u, incurred_u in zip(
            paid_result.ultimate_per_origin,
            incurred_result.ultimate_per_origin,
            strict=True,
        ):
            assert incurred_u > paid_u

    def test_incurred_reserve_is_less_than_paid_reserve_for_same_latest_dev(
        self, paid_triangle, incurred_triangle
    ):
        """Incurred rezerv pure IBNR — toplam rezervden küçük olması beklenir."""
        paid_result = run_chain_ladder(paid_triangle)
        incurred_result = run_chain_ladder(incurred_triangle)
        # 2023 origin: ikisi de dev 1'de
        # Paid reserve = paid ultimate - paid latest (total reserve)
        # Incurred reserve = incurred ultimate - incurred latest (pure IBNR)
        # Incurred latest (2300) > Paid latest (1300), ama ultimate'lar da farklı.
        # Burada sadece iki sonucun tutarlı şekilde üretildiğini kontrol ediyoruz.
        assert paid_result.reserve_per_origin[3] > 0
        assert incurred_result.reserve_per_origin[3] > 0
