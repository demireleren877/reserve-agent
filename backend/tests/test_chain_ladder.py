"""Zincir merdiven (Chain Ladder) hesaplama testleri.

Her origin için:
    ultimate = latest_value × prod(LDF_k ... LDF_{N-1})
    reserve  = ultimate - latest_value

Paid üçgen için reserve = toplam IBNR (case rezervi + saf IBNR).
Incurred üçgen için reserve = saf IBNR (case rezervi zaten incurred'e dahil).
"""

import pytest

from app.core.chain_ladder import ChainLadderResult, run_chain_ladder
from app.core.ldf import LDFMethod
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


class TestChainLadderBasic:
    def test_result_shape(self, paid_triangle):
        result = run_chain_ladder(paid_triangle, method=LDFMethod.VOLUME_WEIGHTED)
        assert isinstance(result, ChainLadderResult)
        assert len(result.ldfs) == 3
        assert len(result.cdfs) == 4  # her origin için ultimate'a kadar CDF
        assert len(result.ultimate_per_origin) == 4
        assert len(result.reserve_per_origin) == 4

    def test_fully_developed_origin_has_zero_reserve(self, paid_triangle):
        """2020 origin zaten dev 4'te — ultimate = latest, reserve = 0."""
        result = run_chain_ladder(paid_triangle, method=LDFMethod.VOLUME_WEIGHTED)
        assert result.ultimate_per_origin[0] == pytest.approx(1750.0, rel=1e-9)
        assert result.reserve_per_origin[0] == pytest.approx(0.0, abs=1e-9)

    def test_ultimate_for_intermediate_origins(self, paid_triangle):
        """LDF'ler: 4800/3300, 3500/3100, 1750/1700."""
        ldf1 = 4800 / 3300
        ldf2 = 3500 / 3100
        ldf3 = 1750 / 1700

        result = run_chain_ladder(paid_triangle, method=LDFMethod.VOLUME_WEIGHTED)

        # 2021: dev 3'te, sadece LDF_3->4 uygula
        assert result.ultimate_per_origin[1] == pytest.approx(1800 * ldf3, rel=1e-9)
        # 2022: dev 2'de, LDF_2->3 × LDF_3->4
        assert result.ultimate_per_origin[2] == pytest.approx(1700 * ldf2 * ldf3, rel=1e-9)
        # 2023: dev 1'de, LDF_1->2 × LDF_2->3 × LDF_3->4
        assert result.ultimate_per_origin[3] == pytest.approx(
            1300 * ldf1 * ldf2 * ldf3, rel=1e-9
        )

    def test_reserve_equals_ultimate_minus_latest(self, paid_triangle):
        result = run_chain_ladder(paid_triangle, method=LDFMethod.VOLUME_WEIGHTED)
        latest = paid_triangle.latest_diagonal()
        for i in range(len(latest)):
            assert result.reserve_per_origin[i] == pytest.approx(
                result.ultimate_per_origin[i] - latest[i], rel=1e-9
            )

    def test_totals_sum_correctly(self, paid_triangle):
        result = run_chain_ladder(paid_triangle, method=LDFMethod.VOLUME_WEIGHTED)
        assert result.total_ultimate == pytest.approx(sum(result.ultimate_per_origin), rel=1e-9)
        assert result.total_reserve == pytest.approx(sum(result.reserve_per_origin), rel=1e-9)

    def test_cdf_is_cumulative_product_of_remaining_ldfs(self, paid_triangle):
        """Her origin için CDF = o origin'in dev'inden ultimate'a kadar LDF'lerin çarpımı."""
        ldf1 = 4800 / 3300
        ldf2 = 3500 / 3100
        ldf3 = 1750 / 1700
        result = run_chain_ladder(paid_triangle, method=LDFMethod.VOLUME_WEIGHTED)
        # 2020: dev 4, hiç LDF uygulanmaz → 1.0
        assert result.cdfs[0] == pytest.approx(1.0, rel=1e-9)
        # 2021: dev 3 → ldf3
        assert result.cdfs[1] == pytest.approx(ldf3, rel=1e-9)
        # 2022: dev 2 → ldf2*ldf3
        assert result.cdfs[2] == pytest.approx(ldf2 * ldf3, rel=1e-9)
        # 2023: dev 1 → ldf1*ldf2*ldf3
        assert result.cdfs[3] == pytest.approx(ldf1 * ldf2 * ldf3, rel=1e-9)


class TestLDFOverride:
    def test_override_ldfs_are_used_instead_of_computed(self, paid_triangle):
        override = [1.5, 1.1, 1.02]
        result = run_chain_ladder(paid_triangle, ldf_override=override)
        assert result.ldfs == override
        # 2023 ultimate: 1300 × 1.5 × 1.1 × 1.02
        assert result.ultimate_per_origin[3] == pytest.approx(
            1300 * 1.5 * 1.1 * 1.02, rel=1e-9
        )

    def test_override_wrong_length_raises(self, paid_triangle):
        with pytest.raises(ValueError, match="LDF"):
            run_chain_ladder(paid_triangle, ldf_override=[1.5, 1.1])


class TestIncurredTriangle:
    def test_incurred_triangle_reserve_is_pure_ibnr(self):
        """Incurred üçgende reserve = ultimate - latest (pure IBNR)."""
        incurred = Triangle(
            origin_periods=[2022, 2023],
            development_periods=[1, 2],
            values=[[2000.0, 2100.0], [2200.0, None]],
            triangle_type=TriangleType.INCURRED,
        )
        result = run_chain_ladder(incurred)
        ldf = 2100 / 2000
        assert result.ultimate_per_origin[1] == pytest.approx(2200 * ldf, rel=1e-9)
        assert result.reserve_per_origin[1] == pytest.approx(
            2200 * ldf - 2200, rel=1e-9
        )


class TestSummary:
    def test_summary_contains_key_metrics(self, paid_triangle):
        result = run_chain_ladder(paid_triangle)
        summary = result.summary()
        assert "total_ultimate" in summary
        assert "total_reserve" in summary
        assert "total_latest" in summary
        assert "ldfs" in summary
        assert "method" in summary
        assert summary["n_origins"] == 4
