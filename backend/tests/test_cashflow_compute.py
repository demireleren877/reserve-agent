"""Nakit Akışı (cashflow) hesaplama çekirdeği testleri.

app/cashflow/compute.py — 0-tabanlı çeyreklik dev period, kümülatif üçgen,
hacim ağırlıklı DF, CDF cascade, global pattern ve origin bazlı quarterly/
monthly pattern dağılımı.
"""

from datetime import date

import pytest

from app.cashflow.compute import (
    CashflowRecord,
    build_patterns,
    build_triangle,
    calc_cdf_pattern,
    calc_dev_factors,
    compute_cashflow,
    dev_period,
    excluded_periods,
    triangle_to_cashflow_records,
    _build_full_cdf,
    _parse_origin,
    _quarter_end,
)


class TestDevPeriod:
    def test_same_quarter_is_zero(self):
        assert dev_period(2024, date(2024, 2, 15)) == 0  # Q1

    def test_quarter_offset(self):
        assert dev_period(2024, date(2024, 7, 1)) == 2  # Q3 → period 2
        assert dev_period(2024, date(2025, 1, 1)) == 4  # +1 yıl Q1

    def test_negative_clamped_to_zero(self):
        assert dev_period(2024, date(2023, 1, 1)) == 0


class TestExcludedPeriods:
    def test_q3_report(self):
        # 2024 kaza, rapor 2024 Q3 → 0,1,2 geçmişte → 3 dışlanır
        assert excluded_periods(2024, date(2024, 9, 30)) == 3

    def test_older_origin_more_excluded(self):
        assert excluded_periods(2023, date(2024, 3, 31)) == 5  # 4 + Q1(0) +1


class TestBuildTriangle:
    def test_cumulative_from_incremental(self):
        records = [
            CashflowRecord(2024, date(2024, 3, 31), 100),
            CashflowRecord(2024, date(2024, 6, 30), 50),
            CashflowRecord(2024, date(2024, 9, 30), 30),
        ]
        cum, inc = build_triangle(records)
        assert inc[2024][0] == 100
        assert cum[2024][0] == 100
        assert cum[2024][1] == 150
        assert cum[2024][2] == 180

    def test_same_period_aggregates(self):
        records = [
            CashflowRecord(2024, date(2024, 1, 1), 100),
            CashflowRecord(2024, date(2024, 2, 1), 40),  # aynı Q1
        ]
        cum, inc = build_triangle(records)
        assert inc[2024][0] == 140


class TestDevFactorsAndCDF:
    def test_volume_weighted_factor(self):
        records = [
            CashflowRecord(2023, date(2023, 3, 31), 100),
            CashflowRecord(2023, date(2023, 6, 30), 50),  # cum 150
            CashflowRecord(2024, date(2024, 3, 31), 200),
            CashflowRecord(2024, date(2024, 6, 30), 100),  # cum 300
        ]
        cum, _ = build_triangle(records)
        factors = calc_dev_factors(cum)
        # period 0→1: (150+300)/(100+200) = 450/300 = 1.5
        assert factors[0] == (0, pytest.approx(1.5))

    def test_full_cdf_backward_product(self):
        factors = [(0, 1.5), (1, 1.2)]
        cdf = _build_full_cdf(factors)
        assert cdf[2] == pytest.approx(1.0)  # seed
        assert cdf[1] == pytest.approx(1.2)
        assert cdf[0] == pytest.approx(1.5 * 1.2)


class TestCdfPattern:
    def test_normalizes_to_one(self):
        cdf = {0: 2.0, 1: 1.5, 2: 1.2, 3: 1.0}
        pat = calc_cdf_pattern(cdf, date(2024, 3, 31))  # Q1 → start_p=1
        assert sum(pat.values()) == pytest.approx(1.0)

    def test_zero_sigma_uniform(self):
        cdf = {p: 1.0 for p in range(60)}  # hiç gelişim yok
        pat = calc_cdf_pattern(cdf, date(2024, 3, 31))
        vals = list(pat.values())
        assert vals[0] == pytest.approx(vals[-1])  # uniform


class TestBuildPatterns:
    def test_weights_sum_to_one_per_origin(self):
        gp = {1: 0.5, 2: 0.3, 3: 0.2}
        q, m = build_patterns([2024], date(2024, 3, 31), gp)
        assert sum(r["weight"] for r in q[2024]) == pytest.approx(1.0)
        assert sum(r["weight"] for r in m[2024]) == pytest.approx(1.0)

    def test_quarterly_has_60_monthly_180(self):
        gp = {1: 0.5, 2: 0.3, 3: 0.2}
        q, m = build_patterns([2024], date(2024, 3, 31), gp)
        assert len(q[2024]) == 60
        assert len(m[2024]) == 180

    def test_monthly_splits_quarter_into_three(self):
        gp = {1: 1.0}  # tüm ağırlık 1. gelecek çeyrekte
        _, m = build_patterns([2024], date(2024, 3, 31), gp)
        # İlk çeyrek (ay 1-3) toplam 1.0, her ay 1/3
        first_three = [r["weight"] for r in m[2024][:3]]
        assert first_three == pytest.approx([1 / 3, 1 / 3, 1 / 3])

    def test_older_origin_uses_offset_slice(self):
        # 2023 kaza, rapor 2024Q1 → dev_offset=4, global_pattern[5..] kullanılır
        gp = {5: 0.6, 6: 0.4}
        q, _ = build_patterns([2023], date(2024, 3, 31), gp)
        weights = [r["weight"] for r in q[2023] if r["weight"] > 0]
        assert weights == pytest.approx([0.6, 0.4])

    def test_fully_developed_origin_all_weight_q1(self):
        # FLAGLANAN DAVRANIŞ: tüm period geçmişteyse Q1=%100 (runoff göz ardı edilir)
        gp = {1: 0.5, 2: 0.5}
        # 2000 kaza, rapor 2024 → num_future <= 0
        q, m = build_patterns([2000], date(2024, 3, 31), gp)
        assert q[2000][0] == {"period": 1, "weight": 1.0}
        assert all(r["weight"] == 0.0 for r in q[2000][1:])

    def test_zero_sum_weights_dumps_to_first(self):
        # global_pattern dilimi tamamen 0 → tüm ağırlık ilk gelecek döneme
        gp = {99: 1.0}  # alakasız period
        q, _ = build_patterns([2024], date(2024, 3, 31), gp)
        assert q[2024][0]["weight"] == pytest.approx(1.0)


class TestTriangleToRecords:
    def test_incremental_extraction_yearly(self):
        records = triangle_to_cashflow_records(
            ["2023"], ["0", "1", "2"], [[100.0, 150.0, 180.0]], "yearly", "yearly"
        )
        paids = [r.paid for r in records]
        assert paids == [100.0, 50.0, 30.0]
        assert records[0].dev_date == date(2023, 12, 31)
        assert records[1].dev_date == date(2024, 12, 31)

    def test_stops_at_none(self):
        records = triangle_to_cashflow_records(
            ["2023"], ["0", "1", "2"], [[100.0, 150.0, None]], "yearly", "yearly"
        )
        assert len(records) == 2

    def test_zero_increment_skipped(self):
        records = triangle_to_cashflow_records(
            ["2023"], ["0", "1"], [[100.0, 100.0]], "yearly", "yearly"
        )
        assert len(records) == 1  # ikinci artımsal 0 → atlanır


class TestParseOriginAndQuarterEnd:
    def test_parse_yearly(self):
        assert _parse_origin("2024") == (2024, 2024 * 4)

    def test_parse_quarterly(self):
        assert _parse_origin("2024Q3") == (2024, 2024 * 4 + 2)

    def test_quarter_end_dates(self):
        assert _quarter_end(2024 * 4 + 0) == date(2024, 3, 31)
        assert _quarter_end(2024 * 4 + 3) == date(2024, 12, 31)


class TestComputeCashflowEndToEnd:
    def test_full_pipeline(self):
        records = [
            CashflowRecord(2023, date(2023, 3, 31), 100),
            CashflowRecord(2023, date(2023, 6, 30), 50),
            CashflowRecord(2023, date(2023, 9, 30), 30),
            CashflowRecord(2024, date(2024, 3, 31), 200),
            CashflowRecord(2024, date(2024, 6, 30), 100),
        ]
        res = compute_cashflow(records, report_date=date(2024, 6, 30))
        assert res.origin_years == [2023, 2024]
        assert res.report_date == date(2024, 6, 30)
        # Her origin için ultimate >= latest
        for row in res.per_origin:
            assert row.ultimate >= row.latest
            assert row.ibnr == pytest.approx(row.ultimate - row.latest)

    def test_empty_records_raises(self):
        with pytest.raises(ValueError):
            compute_cashflow([])


# ─── parse_records_from_bytes ───────────────────────────────────────────────────


class TestParseRecordsFromBytes:
    def _parse(self, content: bytes, filename: str):
        from app.cashflow.compute import parse_records_from_bytes

        return parse_records_from_bytes(content, filename)

    def test_csv_semicolon_delimiter(self):
        csv = (
            "origin_year;development_date;paid\n"
            "2023;31.12.2023;1000\n"
            "2023;31.12.2024;1500,5\n"
        )
        records = self._parse(csv.encode(), "data.csv")
        assert len(records) == 2
        assert records[0].origin_year == 2023
        assert records[0].dev_date == date(2023, 12, 31)
        assert records[1].paid == pytest.approx(1500.5)

    def test_csv_comma_delimiter(self):
        csv = "origin_year,development_date,paid\n2023,2023-12-31,1000\n"
        records = self._parse(csv.encode(), "data.csv")
        assert len(records) == 1

    def test_turkish_column_aliases(self):
        csv = "kaza_yili;dev_date;odenen\n2023;31.12.2023;750\n"
        records = self._parse(csv.encode(), "data.csv")
        assert records[0].paid == 750.0

    def test_missing_columns_raises(self):
        csv = "a;b\n1;2\n"
        with pytest.raises(ValueError, match="Zorunlu sütunlar"):
            self._parse(csv.encode(), "data.csv")

    def test_invalid_year_and_date_rows_skipped(self):
        csv = (
            "origin_year;development_date;paid\n"
            "abc;31.12.2023;100\n"      # yıl bozuk → atla
            "2023;tarih-değil;100\n"    # tarih bozuk → atla
            "2023;31.12.2023;100\n"
        )
        records = self._parse(csv.encode(), "data.csv")
        assert len(records) == 1

    def test_empty_paid_becomes_zero(self):
        csv = "origin_year;development_date;paid\n2023;31.12.2023;-\n"
        records = self._parse(csv.encode(), "data.csv")
        assert records[0].paid == 0.0

    def test_excel_input(self):
        from io import BytesIO

        from openpyxl import Workbook

        wb = Workbook()
        ws = wb.active
        ws.append(["ORIGIN_YEAR", "DEVELOPMENT_DATE", "PAID_TL"])
        ws.append([2023, date(2023, 12, 31), 1000])
        ws.append([2023.0, "2024-12-31", 1500])
        buf = BytesIO()
        wb.save(buf)
        records = self._parse(buf.getvalue(), "data.xlsx")
        assert len(records) == 2
        assert records[1].dev_date == date(2024, 12, 31)


class TestReportDateHelpers:
    def test_report_date_from_records(self):
        from app.cashflow.compute import CashflowRecord, report_date_from_records

        records = [
            CashflowRecord(2023, date(2023, 12, 31), 1.0),
            CashflowRecord(2023, date(2024, 6, 30), 1.0),
        ]
        assert report_date_from_records(records) == date(2024, 6, 30)

    def test_build_triangle_skips_beyond_max_periods(self):
        from app.cashflow.compute import MAX_PERIODS, CashflowRecord, build_triangle

        far_future = date(2023 + MAX_PERIODS, 1, 1)  # period >= MAX_PERIODS
        cum, inc = build_triangle([
            CashflowRecord(2023, date(2023, 3, 1), 100.0),
            CashflowRecord(2023, far_future, 999.0),
        ])
        assert 999.0 not in inc[2023].values()

    def test_triangle_to_records_quarterly_dev(self):
        from app.cashflow.compute import triangle_to_cashflow_records

        records = triangle_to_cashflow_records(
            ["2023Q1"], ["1", "2"], [[100.0, 150.0]],
            "quarterly", "quarterly",
        )
        assert [r.paid for r in records] == [100.0, 50.0]
        # Çeyrek sonu tarihleri: 2023Q1 → 31.03, sonraki çeyrek 30.06
        assert records[0].dev_date == date(2023, 3, 31)
        assert records[1].dev_date == date(2023, 6, 30)
