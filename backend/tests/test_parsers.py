"""Parser birim testleri — test edilmeyen kapsam:

* excel_parser: uzun (tidy) format, premium parser, _parse_period varyantları,
  artımsal→kümülatif dönüşüm, dosya_no yakalama, çeyreklik granülarite.
* data/parser: tarih formatları (yyyyqq, Excel serial, yıl, saatli), Türkçe
  ondalık, Excel yolu, satır hatası.
* data/prim_parser: dönem normalizasyonu, float parse, Excel yolu.
"""

import base64
from datetime import date
from io import BytesIO

import pytest
from openpyxl import Workbook

from app.core.excel_parser import (
    ParseError,
    ParseOptions,
    _parse_period,
    parse_premiums_from_excel,
    parse_triangle_from_excel,
)
from app.core.triangle import Granularity, TriangleType
from app.data.parser import (
    _parse_date,
    _parse_float,
    inspect_file,
    parse_with_mapping,
)
from app.data.prim_parser import (
    _normalize_donem,
    _parse_float as _prim_float,
    inspect_prim_file,
    parse_prim_with_mapping,
)


def _xlsx(rows: list[list]) -> bytes:
    wb = Workbook()
    ws = wb.active
    for r in rows:
        ws.append(r)
    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


# ─── excel_parser: uzun format ──────────────────────────────────────────────────


class TestLongFormat:
    def test_cumulative_long_format(self):
        content = _xlsx([
            ["ACCIDENT_YEAR", "DEVELOPMENT_DATE", "PAID"],
            [2020, 2020, 1000],
            [2020, 2021, 1500],
            [2021, 2021, 1100],
        ])
        tri, file_data = parse_triangle_from_excel(content)
        assert tri.origin_periods == ["2020", "2021"]
        assert tri.development_periods == [0, 1]
        assert tri.values[0] == [1000.0, 1500.0]
        assert tri.values[1][0] == 1100.0
        assert file_data is None

    def test_incremental_running_sum(self):
        content = _xlsx([
            ["ACCIDENT_YEAR", "DEVELOPMENT_DATE", "PAID"],
            [2020, 2020, 1000],
            [2020, 2021, 500],   # artımsal
            [2021, 2021, 1100],
        ])
        tri, _ = parse_triangle_from_excel(
            content, ParseOptions(cumulative=False)
        )
        assert tri.values[0] == [1000.0, 1500.0]  # running sum

    def test_cumulative_gap_carried_forward(self):
        content = _xlsx([
            ["ACCIDENT_YEAR", "DEVELOPMENT_DATE", "PAID"],
            [2020, 2020, 1000],
            [2020, 2022, 1800],  # 2021 boş → carry-forward
            [2021, 2021, 700],
            [2021, 2022, 1100],
            [2022, 2022, 900],
        ])
        tri, _ = parse_triangle_from_excel(content)
        assert tri.values[0] == [1000.0, 1000.0, 1800.0]

    def test_dosya_no_collected_as_file_data(self):
        content = _xlsx([
            ["ACCIDENT_YEAR", "DEVELOPMENT_DATE", "PAID", "DOSYA_NO"],
            [2020, 2020, 600, "D1"],
            [2020, 2020, 400, "D2"],
            [2020, 2021, 500, "D1"],
            [2021, 2021, 1100, "D3"],
        ])
        tri, file_data = parse_triangle_from_excel(content)
        assert file_data is not None
        assert file_data["2020"]["2020"] == {"D1": 600.0, "D2": 400.0}
        # Aynı hücrede aynı dosya toplanır
        assert tri.values[0][0] == 1000.0

    def test_quarterly_granularity(self):
        content = _xlsx([
            ["ACCIDENT_QUARTER", "DEVELOPMENT_QUARTER", "PAID"],
            ["2020Q1", "2020Q1", 100],
            ["2020Q1", "2020Q2", 180],
            ["2020Q2", "2020Q2", 120],
        ])
        tri, _ = parse_triangle_from_excel(
            content,
            ParseOptions(
                origin_granularity=Granularity.QUARTERLY,
                development_granularity=Granularity.QUARTERLY,
            ),
        )
        assert tri.origin_periods == ["2020Q1", "2020Q2"]
        assert tri.values[0] == [100.0, 180.0]

    def test_dev_before_origin_raises(self):
        content = _xlsx([
            ["ACCIDENT_YEAR", "DEVELOPMENT_DATE", "PAID"],
            [2021, 2020, 1000],
        ])
        with pytest.raises(ParseError, match="önce olamaz"):
            parse_triangle_from_excel(content)

    def test_unparseable_origin_raises(self):
        content = _xlsx([
            ["ACCIDENT_YEAR", "DEVELOPMENT_DATE", "PAID"],
            ["yıl-değil", 2020, 1000],
        ])
        with pytest.raises(ParseError, match="Origin değeri çözümlenemedi"):
            parse_triangle_from_excel(content)

    def test_turkish_aliases(self):
        content = _xlsx([
            ["KAZA_YILI", "GELISIM", "TUTAR"],
            [2020, 2020, 1000],
            [2020, 2021, 1500],
            [2021, 2021, 800],
        ])
        tri, _ = parse_triangle_from_excel(content)
        assert tri.values[0][1] == 1500.0


class TestPremiumParser:
    def test_basic_premiums(self):
        content = _xlsx([["ORIGIN", "PREMIUM"], [2020, 5000], [2021, 6000]])
        out = parse_premiums_from_excel(content)
        assert out == {"2020": 5000.0, "2021": 6000.0}

    def test_same_origin_summed(self):
        content = _xlsx([["ORIGIN", "PRIM"], [2020, 3000], [2020, 2000]])
        out = parse_premiums_from_excel(content)
        assert out == {"2020": 5000.0}

    def test_quarterly_origins(self):
        content = _xlsx([["KAZA", "PRIM"], ["2020Q1", 1000], ["2020-2", 1500]])
        out = parse_premiums_from_excel(
            content, origin_granularity=Granularity.QUARTERLY
        )
        assert out == {"2020Q1": 1000.0, "2020Q2": 1500.0}

    def test_missing_header_raises(self):
        content = _xlsx([["A", "B"], [1, 2]])
        with pytest.raises(ParseError, match="Başlık bulunamadı"):
            parse_premiums_from_excel(content)

    def test_no_records_raises(self):
        content = _xlsx([["ORIGIN", "PREMIUM"], [None, None]])
        with pytest.raises(ParseError, match="Hiç prim kaydı"):
            parse_premiums_from_excel(content)

    def test_corrupt_bytes_raises(self):
        with pytest.raises(ParseError, match="okunamadı"):
            parse_premiums_from_excel(b"bu excel degil")


class TestParsePeriod:
    def test_date_yearly(self):
        assert _parse_period(date(2023, 7, 15), Granularity.YEARLY) == ("2023", 8092)

    def test_date_quarterly(self):
        label, rank = _parse_period(date(2023, 7, 15), Granularity.QUARTERLY)
        assert label == "2023Q3"
        assert rank == 2023 * 4 + 2

    def test_int_yearly(self):
        assert _parse_period(2020, Granularity.YEARLY)[0] == "2020"

    def test_int_yyyyq_quarterly(self):
        # 20203 → "2020Q3" (QUARTER_RE sayısal form)
        label, _ = _parse_period(20203, Granularity.QUARTERLY)
        assert label == "2020Q3"

    def test_int_plain_year_quarterly_defaults_q1(self):
        assert _parse_period(2020, Granularity.QUARTERLY)[0] == "2020Q1"

    def test_string_variants_quarterly(self):
        for raw in ("2020Q2", "2020-2", "2020.2", "2020/2", "2020 Q2"):
            assert _parse_period(raw, Granularity.QUARTERLY)[0] == "2020Q2", raw

    def test_string_year_quarterly_defaults_q1(self):
        assert _parse_period("2020", Granularity.QUARTERLY)[0] == "2020Q1"

    def test_quarter_string_in_yearly_mode_keeps_year(self):
        assert _parse_period("2020Q3", Granularity.YEARLY)[0] == "2020"

    def test_invalid_raises(self):
        with pytest.raises(ValueError):
            _parse_period("abc", Granularity.YEARLY)
        with pytest.raises(ValueError):
            _parse_period("abc", Granularity.QUARTERLY)
        with pytest.raises(ValueError):
            _parse_period(123456789, Granularity.QUARTERLY)


# ─── data/parser: tarih + sayı formatları ───────────────────────────────────────


class TestClaimDateParsing:
    def test_common_formats(self):
        assert _parse_date("15.03.2023") == date(2023, 3, 15)
        assert _parse_date("2023-03-15") == date(2023, 3, 15)
        assert _parse_date("15/03/2023") == date(2023, 3, 15)
        assert _parse_date("20230315") == date(2023, 3, 15)

    def test_datetime_with_time(self):
        assert _parse_date("2023-03-15 14:30:00") == date(2023, 3, 15)
        assert _parse_date("15.03.2023 14:30") == date(2023, 3, 15)

    def test_quarter_formats(self):
        assert _parse_date("2020Q1") == date(2020, 1, 1)
        assert _parse_date("2020q4") == date(2020, 10, 1)
        assert _parse_date("202003") == date(2020, 7, 1)  # yyyyqq → Q3

    def test_plain_year(self):
        assert _parse_date("2021") == date(2021, 1, 1)

    def test_excel_serial(self):
        # 45000 → 2023-03-15
        assert _parse_date("45000") == date(2023, 3, 15)

    def test_empty_raises(self):
        with pytest.raises(ValueError, match="boş"):
            _parse_date("  ")

    def test_unknown_raises(self):
        with pytest.raises(ValueError, match="tanınamadı"):
            _parse_date("tarih-değil")


class TestClaimFloatParsing:
    def test_turkish_thousands_decimal(self):
        assert _parse_float("1.234,56") == pytest.approx(1234.56)

    def test_english_thousands(self):
        assert _parse_float("1,234.56") == pytest.approx(1234.56)

    def test_comma_decimal(self):
        assert _parse_float("12,5") == pytest.approx(12.5)

    def test_dash_and_empty_zero(self):
        assert _parse_float("-") == 0.0
        assert _parse_float("") == 0.0

    def test_nbsp_stripped(self):
        assert _parse_float("1\xa0000") == 1000.0


class TestClaimExcelPath:
    _MAPPING = {
        "dosya_no": "Dosya", "brans": "Brans", "hasar_tarihi": "Hasar",
        "gelisim_tarihi": "Gelisim", "odeme": "Odeme", "muallak": "Muallak",
    }

    def test_parse_excel_mapped(self):
        content = _xlsx([
            ["Dosya", "Brans", "Hasar", "Gelisim", "Odeme", "Muallak"],
            ["D1", "Yangin", "15.03.2023", "31.12.2023", "1.234,56", "0"],
        ])
        records = parse_with_mapping(content, "h.xlsx", self._MAPPING)
        assert len(records) == 1
        assert records[0].odeme == pytest.approx(1234.56)
        assert records[0].hasar_tarihi == date(2023, 3, 15)

    def test_excel_row_error_includes_row_number(self):
        content = _xlsx([
            ["Dosya", "Brans", "Hasar", "Gelisim", "Odeme", "Muallak"],
            ["D1", "Yangin", "kötü-tarih", "31.12.2023", "1", "0"],
        ])
        with pytest.raises(ValueError, match="Satır 2"):
            parse_with_mapping(content, "h.xlsx", self._MAPPING)

    def test_inspect_excel_preview(self):
        content = _xlsx([
            ["Dosya No", "Brans"],
            ["D1", "Yangin"],
        ])
        out = inspect_file(content, "h.xlsx")
        assert out["sheets"] == ["Sheet"]
        assert out["preview"]["Sheet"] == [["D1", "Yangin"]]
        assert out["suggested_mapping"]["Sheet"]["dosya_no"] == "Dosya No"

    def test_inspect_empty_csv(self):
        out = inspect_file(b"", "h.csv")
        assert out["sheets"] == [None]
        assert out["headers"][None] == []


# ─── prim_parser ────────────────────────────────────────────────────────────────


class TestNormalizeDonem:
    def test_year(self):
        assert _normalize_donem("2020") == "2020"

    def test_year_float_suffix(self):
        assert _normalize_donem("2020.0") == "2020"

    def test_quarter_lower(self):
        assert _normalize_donem("2020q3") == "2020Q3"

    def test_six_digit_quarter(self):
        assert _normalize_donem("202003") == "2020Q3"

    def test_six_digit_non_quarter_passthrough(self):
        assert _normalize_donem("202012") == "202012"

    def test_other_passthrough(self):
        assert _normalize_donem("serbest") == "serbest"


class TestPrimFloat:
    def test_turkish_format(self):
        assert _prim_float("1.500,75") == pytest.approx(1500.75)

    def test_invalid_returns_zero(self):
        assert _prim_float("sayı-değil") == 0.0

    def test_empty_returns_zero(self):
        assert _prim_float("") == 0.0


class TestPrimExcelPath:
    def test_parse_prim_excel(self):
        content = _xlsx([
            ["Brans", "Donem", "EP"],
            ["Yangin", 2022, 5000],
            ["Yangin", "2023Q1", "1.500,50"],
            ["", "2023", 100],  # boş brans atlanır
        ])
        records = parse_prim_with_mapping(
            content, "p.xlsx", {"brans": "Brans", "donem": "Donem", "ep": "EP"}
        )
        assert len(records) == 2
        assert records[0].donem == "2022"
        assert records[1].ep == pytest.approx(1500.50)

    def test_inspect_prim_excel_single_sheet(self):
        content = _xlsx([["Brans", "Donem", "EP"], ["Y", "2022", "1"]])
        out = inspect_prim_file(content, "p.xlsx")
        assert out["sheets"] == [None]
        assert out["suggested_mapping"]["null"] == {
            "brans": "Brans", "donem": "Donem", "ep": "EP"
        }

    def test_unknown_column_raises(self):
        content = _xlsx([["Brans", "Donem", "EP"], ["Y", "2022", "1"]])
        with pytest.raises(ValueError, match="Sütun bulunamadı"):
            parse_prim_with_mapping(
                content, "p.xlsx",
                {"brans": "Brans", "donem": "Donem", "ep": "Olmayan"},
            )

    def test_short_row_raises_with_line_number(self):
        csv = "Brans,Donem,EP\nYangin\n"
        with pytest.raises(ValueError, match="Satır 2"):
            parse_prim_with_mapping(
                csv.encode(), "p.csv",
                {"brans": "Brans", "donem": "Donem", "ep": "EP"},
            )
