"""Frekans-Şiddet (Frequency-Severity) çekirdek testleri.

Yöntem: adet üçgeni → CL → ult adet; şiddet (tutar/adet) → CL → ult şiddet;
ult hasar = ult adet × ult şiddet; IBNR = ult − latest.
"""

import math

import pytest

from app.core.frequency_severity import (
    build_severity_matrix,
    run_frequency_severity,
)
from app.core.ldf import LDFMethod
from app.core.triangle import Granularity, Triangle, TriangleType


def _tri(values, ttype=TriangleType.PAID):
    n_dev = len(values[0])
    return Triangle(
        origin_periods=[str(2020 + i) for i in range(len(values))],
        development_periods=list(range(n_dev)),
        values=values,
        triangle_type=ttype,
        origin_granularity=Granularity.YEARLY,
        development_granularity=Granularity.YEARLY,
    )


class TestSeverityMatrix:
    def test_basic_division(self):
        amount = [[1000.0, 1500.0], [1200.0, None]]
        count = [[10.0, 12.0], [8.0, None]]
        sev = build_severity_matrix(amount, count)
        assert sev[0][0] == pytest.approx(100.0)
        assert sev[0][1] == pytest.approx(125.0)
        assert sev[1][0] == pytest.approx(150.0)
        assert sev[1][1] is None

    def test_zero_count_is_none(self):
        """adet=0 hücre tanımsız (None) olmalı — 0/0 değil."""
        amount = [[0.0, 1500.0]]
        count = [[0.0, 12.0]]
        sev = build_severity_matrix(amount, count)
        assert sev[0][0] is None
        assert sev[0][1] == pytest.approx(125.0)


class TestRunFrequencySeverity:
    def test_matches_hand_computation(self):
        # Adet üçgeni (kümülatif ihbar)
        count = _tri([
            [10.0, 15.0, 17.0],
            [12.0, 18.0, None],
            [14.0, None, None],
        ])
        # Tutar üçgeni (kümülatif ödeme)
        amount = _tri([
            [1000.0, 1800.0, 2210.0],
            [1320.0, 2520.0, None],
            [1680.0, None, None],
        ])
        res = run_frequency_severity(amount, count)

        # Adet LDF (volume-weighted)
        # step0: (15+18+? ) — son origin 14 tek başına dev0; dev0→dev1 çiftleri:
        #   origin0 10→15, origin1 12→18  => (15+18)/(10+12)=33/22=1.5
        assert res.count_ldfs[0] == pytest.approx(33 / 22)
        # step1: origin0 15→17 => 17/15
        assert res.count_ldfs[1] == pytest.approx(17 / 15)

        # Şiddet üçgeni
        # origin0: 100,120,130 ; origin1: 110,140 ; origin2: 120
        # sev LDF step0: (120+140)/(100+110)=260/210
        assert res.severity_ldfs[0] == pytest.approx(260 / 210)
        # sev LDF step1: 130/120
        assert res.severity_ldfs[1] == pytest.approx(130 / 120)

        # origin2 (2022): latest_count=14 @idx0 → ult = 14 × 1.5 × (17/15)
        r2 = next(r for r in res.rows if r.origin == "2022")
        exp_ult_count = 14 * (33 / 22) * (17 / 15)
        assert r2.ultimate_count == pytest.approx(exp_ult_count)
        # latest severity=120 @idx0 → ult = 120 × (260/210) × (130/120)
        exp_ult_sev = 120 * (260 / 210) * (130 / 120)
        assert r2.ultimate_severity == pytest.approx(exp_ult_sev)
        assert r2.ultimate_loss == pytest.approx(exp_ult_count * exp_ult_sev)
        assert r2.ibnr == pytest.approx(exp_ult_count * exp_ult_sev - 1680.0)

    def test_fully_developed_origin_has_zero_ibnr(self):
        """En olgun origin (tam köşegen) için CDF=1 → IBNR=0."""
        count = _tri([[10.0, 15.0], [12.0, None]])
        amount = _tri([[1000.0, 1800.0], [1320.0, None]])
        res = run_frequency_severity(amount, count)
        r0 = next(r for r in res.rows if r.origin == "2020")
        assert r0.count_cdf == pytest.approx(1.0)
        assert r0.ibnr == pytest.approx(0.0)

    def test_totals_consistent(self):
        count = _tri([
            [10.0, 15.0, 17.0],
            [12.0, 18.0, None],
            [14.0, None, None],
        ])
        amount = _tri([
            [1000.0, 1800.0, 2210.0],
            [1320.0, 2520.0, None],
            [1680.0, None, None],
        ])
        res = run_frequency_severity(amount, count)
        assert res.total_ultimate_loss == pytest.approx(
            sum(r.ultimate_loss for r in res.rows)
        )
        assert res.total_ibnr == pytest.approx(
            res.total_ultimate_loss - res.total_latest_amount
        )

    def test_excluded_origin_changes_ldf(self):
        count = _tri([
            [10.0, 15.0],
            [12.0, 30.0],
        ])
        amount = _tri([
            [1000.0, 1500.0],
            [1200.0, 3000.0],
        ])
        full = run_frequency_severity(amount, count)
        excl = run_frequency_severity(amount, count, excluded_origins={"2021"})
        # 2021 dışlanınca adet LDF[0] sadece origin0: 15/10=1.5
        assert excl.count_ldfs[0] == pytest.approx(1.5)
        assert full.count_ldfs[0] != pytest.approx(1.5)

    def test_n_years_window(self):
        count = _tri([
            [10.0, 15.0],
            [20.0, 28.0],
            [30.0, None],
        ])
        amount = _tri([
            [1000.0, 1500.0],
            [2000.0, 2800.0],
            [3000.0, None],
        ])
        # Son 1 origin (dev0→1 çiftleri arasından en yeni): origin1 20→28
        res = run_frequency_severity(amount, count, n_years=1)
        assert res.count_ldfs[0] == pytest.approx(28 / 20)

    def test_simple_average_method(self):
        count = _tri([
            [10.0, 15.0],
            [20.0, 24.0],
        ])
        amount = _tri([[1000.0, 1500.0], [2000.0, 2400.0]])
        res = run_frequency_severity(amount, count, method=LDFMethod.SIMPLE_AVERAGE)
        # simple avg of 15/10=1.5 and 24/20=1.2 → 1.35
        assert res.count_ldfs[0] == pytest.approx(1.35)

    def test_geometric_average_method(self):
        count = _tri([
            [10.0, 15.0],
            [20.0, 24.0],
        ])
        amount = _tri([[1000.0, 1500.0], [2000.0, 2400.0]])
        res = run_frequency_severity(amount, count, method=LDFMethod.GEOMETRIC_AVERAGE)
        assert res.count_ldfs[0] == pytest.approx(math.sqrt(1.5 * 1.2))

    def test_origin_with_no_claims_yet(self):
        """adet=0 olan en yeni origin → şiddet tanımsız, ult hasar 0, IBNR=−latest."""
        count = _tri([
            [10.0, 15.0],
            [0.0, None],
        ])
        amount = _tri([
            [1000.0, 1500.0],
            [0.0, None],
        ])
        res = run_frequency_severity(amount, count)
        r1 = next(r for r in res.rows if r.origin == "2021")
        assert r1.latest_severity is None
        assert r1.ultimate_loss == pytest.approx(0.0)
        assert r1.ibnr == pytest.approx(0.0)

    def test_mismatched_axes_raises(self):
        count = _tri([[10.0, 15.0]])
        amount = Triangle(
            origin_periods=["2020"],
            development_periods=[0, 1, 2],
            values=[[1000.0, 1500.0, 1700.0]],
            triangle_type=TriangleType.PAID,
        )
        with pytest.raises(ValueError, match="gelişim dönemleri uyuşmuyor"):
            run_frequency_severity(amount, count)
