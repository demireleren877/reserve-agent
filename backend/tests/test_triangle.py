"""Triangle domain modeli testleri.

Üçgen, aktüeryal rezerv hesabının temel veri yapısıdır:
- origin_periods: kaza/hasar yılı (satırlar), ör. [2020, 2021, 2022, 2023]
- development_periods: gelişim dönemi (sütunlar), ör. [1, 2, 3, 4]
- values: kümülatif değer matrisi; alt-sağ köşegen boş (None/NaN) olmalı.
"""

import math

import pytest

from app.core.triangle import Triangle, TriangleType


def _sample_cumulative_values() -> list[list[float | None]]:
    """4x4 klasik kümülatif paid üçgen (dolu kısım + alt-sağ köşegen None)."""
    return [
        [1000.0, 1500.0, 1700.0, 1750.0],
        [1100.0, 1600.0, 1800.0, None],
        [1200.0, 1700.0, None, None],
        [1300.0, None, None, None],
    ]


class TestTriangleConstruction:
    def test_valid_triangle_can_be_constructed(self):
        tri = Triangle(
            origin_periods=[2020, 2021, 2022, 2023],
            development_periods=[1, 2, 3, 4],
            values=_sample_cumulative_values(),
            triangle_type=TriangleType.PAID,
        )
        assert tri.n_origins == 4
        assert tri.n_developments == 4
        assert tri.triangle_type == TriangleType.PAID

    def test_triangle_type_defaults_to_paid(self):
        tri = Triangle(
            origin_periods=[2020, 2021],
            development_periods=[1, 2],
            values=[[100.0, 150.0], [110.0, None]],
        )
        assert tri.triangle_type == TriangleType.PAID

    def test_mismatched_row_count_raises(self):
        with pytest.raises(ValueError, match="origin_periods"):
            Triangle(
                origin_periods=[2020, 2021, 2022],
                development_periods=[1, 2],
                values=[[100.0, 150.0], [110.0, None]],
            )

    def test_mismatched_column_count_raises(self):
        with pytest.raises(ValueError, match="development_periods"):
            Triangle(
                origin_periods=[2020, 2021],
                development_periods=[1, 2, 3],
                values=[[100.0, 150.0], [110.0, None]],
            )

    def test_empty_origin_periods_raises(self):
        with pytest.raises(ValueError, match="boş"):
            Triangle(
                origin_periods=[],
                development_periods=[],
                values=[],
            )

    def test_duplicate_origin_periods_raises(self):
        with pytest.raises(ValueError, match="tekrar"):
            Triangle(
                origin_periods=[2020, 2020],
                development_periods=[1, 2],
                values=[[100.0, 150.0], [110.0, None]],
            )

    def test_non_triangular_shape_raises(self):
        """Sol-üst üçgen dışında None olması üçgen değil."""
        with pytest.raises(ValueError, match="(?i)üçgen"):
            Triangle(
                origin_periods=[2020, 2021],
                development_periods=[1, 2],
                values=[[100.0, None], [110.0, 150.0]],
            )


class TestTriangleQueries:
    def test_latest_diagonal_returns_most_recent_per_origin(self):
        tri = Triangle(
            origin_periods=[2020, 2021, 2022, 2023],
            development_periods=[1, 2, 3, 4],
            values=_sample_cumulative_values(),
        )
        # En güncel değerler köşegen üzerinde: 1750, 1800, 1700, 1300
        assert tri.latest_diagonal() == [1750.0, 1800.0, 1700.0, 1300.0]

    def test_column_returns_non_none_values_for_dev_period(self):
        tri = Triangle(
            origin_periods=[2020, 2021, 2022, 2023],
            development_periods=[1, 2, 3, 4],
            values=_sample_cumulative_values(),
        )
        assert tri.column(1) == [1000.0, 1100.0, 1200.0, 1300.0]
        assert tri.column(2) == [1500.0, 1600.0, 1700.0]
        assert tri.column(3) == [1700.0, 1800.0]
        assert tri.column(4) == [1750.0]

    def test_column_unknown_dev_period_raises(self):
        tri = Triangle(
            origin_periods=[2020, 2021],
            development_periods=[1, 2],
            values=[[100.0, 150.0], [110.0, None]],
        )
        with pytest.raises(KeyError):
            tri.column(3)

    def test_nan_values_treated_as_missing(self):
        """NaN değeri de None gibi eksik sayılmalı (parser'dan NaN gelebilir)."""
        tri = Triangle(
            origin_periods=[2020, 2021],
            development_periods=[1, 2],
            values=[[100.0, 150.0], [110.0, math.nan]],
        )
        assert tri.column(2) == [150.0]
        assert tri.latest_diagonal() == [150.0, 110.0]
