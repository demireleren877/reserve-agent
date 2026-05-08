"""Excel parser testleri.

Farklı Excel layout'larından üçgen çıkarma:
- Klasik üçgen (sol sütun origin, üst satır development period)
- Header offset (ilk satırlarda başlık/açıklama var)
- Boş hücre / None / NaN hepsi eksik olarak işlenmeli
"""

from io import BytesIO

import pytest
from openpyxl import Workbook

from app.core.excel_parser import ParseError, ParseOptions, parse_triangle_from_excel
from app.core.triangle import TriangleType


def _build_xlsx(rows: list[list]) -> bytes:
    """Basit: tek sheet, verilen satırları yaz, bayt olarak döndür."""
    wb = Workbook()
    ws = wb.active
    for row in rows:
        ws.append(row)
    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _parse(rows, **opts_kwargs):
    """Helper: build xlsx, parse, return Triangle (unwrap tuple)."""
    opts = ParseOptions(**opts_kwargs) if opts_kwargs else None
    tri, _ = parse_triangle_from_excel(_build_xlsx(rows), opts)
    return tri


class TestClassicTriangleLayout:
    def test_parses_basic_4x4_paid_triangle(self):
        rows = [
            ["Origin", 1, 2, 3, 4],
            [2020, 1000, 1500, 1700, 1750],
            [2021, 1100, 1600, 1800, None],
            [2022, 1200, 1700, None, None],
            [2023, 1300, None, None, None],
        ]
        tri = _parse(rows, triangle_type=TriangleType.PAID)

        assert tri.origin_periods == ["2020", "2021", "2022", "2023"]
        # Pivot headers [1,2,3,4] → normalized to [0,1,2,3]
        assert tri.development_periods == [0, 1, 2, 3]
        assert tri.values[0] == [1000.0, 1500.0, 1700.0, 1750.0]
        assert tri.values[3][0] == 1300.0
        assert tri.values[3][1] is None
        assert tri.triangle_type == TriangleType.PAID

    def test_default_triangle_type_is_paid(self):
        rows = [["Origin", 1, 2], [2020, 100, 150], [2021, 110, None]]
        tri = _parse(rows)
        assert tri.triangle_type == TriangleType.PAID

    def test_empty_cells_become_none(self):
        rows = [
            ["Origin", 1, 2],
            [2020, 100, 150],
            [2021, 110, ""],
        ]
        tri = _parse(rows)
        assert tri.values[1][1] is None


class TestHeaderDetection:
    def test_skips_metadata_rows_before_header(self):
        rows = [
            ["Şirket X - Kasko Paid Triangle", None, None, None, None],
            ["2026 Q1 Rapor", None, None, None, None],
            [],
            ["Origin", 1, 2, 3, 4],
            [2020, 1000, 1500, 1700, 1750],
            [2021, 1100, 1600, 1800, None],
            [2022, 1200, 1700, None, None],
            [2023, 1300, None, None, None],
        ]
        tri = _parse(rows)
        assert tri.origin_periods == ["2020", "2021", "2022", "2023"]
        assert tri.values[0][0] == 1000.0

    def test_header_row_with_turkish_origin_label(self):
        rows = [
            ["Kaza Yılı", 1, 2],
            [2022, 100, 150],
            [2023, 110, None],
        ]
        tri = _parse(rows)
        assert tri.origin_periods == ["2022", "2023"]


class TestTriangleTypeParameter:
    def test_incurred_type_propagates(self):
        rows = [["Origin", 1, 2], [2022, 2000, 2100], [2023, 2200, None]]
        tri = _parse(rows, triangle_type=TriangleType.INCURRED)
        assert tri.triangle_type == TriangleType.INCURRED


class TestErrorHandling:
    def test_empty_sheet_raises(self):
        with pytest.raises(ParseError):
            parse_triangle_from_excel(_build_xlsx([]))

    def test_only_metadata_no_data_raises(self):
        rows = [["Just a title"], [], [], ["Another comment"]]
        with pytest.raises(ParseError):
            parse_triangle_from_excel(_build_xlsx(rows))

    def test_non_numeric_dev_header_raises(self):
        rows = [
            ["Origin", "Q1", "Q2"],
            [2022, 100, 150],
        ]
        with pytest.raises(ParseError):
            parse_triangle_from_excel(_build_xlsx(rows))

    def test_corrupted_bytes_raises(self):
        with pytest.raises(ParseError):
            parse_triangle_from_excel(b"this is not an xlsx file")


class TestValuesAreFloats:
    def test_integer_cells_converted_to_float(self):
        rows = [["Origin", 1, 2], [2022, 100, 150], [2023, 110, None]]
        tri = _parse(rows)
        for row in tri.values:
            for v in row:
                assert v is None or isinstance(v, float)
