"""Agent tool testleri.

Agent tool'ları: LLM'in çağırabileceği, hesaplama çekirdeği üzerinde
güvenli özetler döndüren fonksiyonlar.

Veri gizliliği ilkesi: LLM üçgen ham verisini GÖRMEZ; tool sonucu
sadece agrega (LDF, ultimate, total reserve, özet istatistik) olur.
"""

import pytest

from app.agent.tools import (
    TOOL_SCHEMAS,
    dispatch_tool,
    get_tool_schema,
)
from app.core.triangle import Triangle, TriangleType


@pytest.fixture
def triangle() -> Triangle:
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


class TestToolSchemas:
    def test_schemas_list_is_non_empty(self):
        assert len(TOOL_SCHEMAS) >= 2

    def test_each_schema_has_openai_tool_shape(self):
        for schema in TOOL_SCHEMAS:
            assert schema["type"] == "function"
            fn = schema["function"]
            assert "name" in fn
            assert "description" in fn
            assert "parameters" in fn
            assert fn["parameters"]["type"] == "object"

    def test_required_tools_are_defined(self):
        names = {s["function"]["name"] for s in TOOL_SCHEMAS}
        assert "describe_triangle" in names
        assert "run_chain_ladder" in names

    def test_get_tool_schema_by_name(self):
        schema = get_tool_schema("run_chain_ladder")
        assert schema["function"]["name"] == "run_chain_ladder"

    def test_get_unknown_tool_raises(self):
        with pytest.raises(KeyError):
            get_tool_schema("unknown_tool")


class TestDescribeTriangle:
    def test_describe_returns_basic_shape_info(self, triangle):
        out = dispatch_tool("describe_triangle", {}, triangle=triangle)
        assert out["n_origins"] == 4
        assert out["n_developments"] == 4
        assert out["triangle_type"] == "paid"
        assert out["origin_periods"] == ["2020", "2021", "2022", "2023"]
        # latest diagonal summarize amount
        assert out["latest_diagonal"] == [1750.0, 1800.0, 1700.0, 1300.0]
        assert out["total_latest"] == pytest.approx(6550.0, rel=1e-9)


class TestRunChainLadderTool:
    def test_run_with_default_method(self, triangle):
        out = dispatch_tool("run_chain_ladder", {}, triangle=triangle)
        assert out["method"] == "volume_weighted"
        assert len(out["ldfs"]) == 3
        assert out["ldfs"][0] == pytest.approx(4800 / 3300, rel=1e-9)

    def test_run_with_exclusion(self, triangle):
        out = dispatch_tool(
            "run_chain_ladder",
            {"excluded_origins": [2021]},
            triangle=triangle,
        )
        assert out["ldfs"][0] == pytest.approx(3200 / 2200, rel=1e-9)

    def test_run_with_ldf_override(self, triangle):
        out = dispatch_tool(
            "run_chain_ladder",
            {"ldf_override": [1.5, 1.1, 1.02]},
            triangle=triangle,
        )
        assert out["ldfs"] == [1.5, 1.1, 1.02]

    def test_run_with_simple_average(self, triangle):
        out = dispatch_tool(
            "run_chain_ladder",
            {"method": "simple_average"},
            triangle=triangle,
        )
        expected = (1500 / 1000 + 1600 / 1100 + 1700 / 1200) / 3
        assert out["ldfs"][0] == pytest.approx(expected, rel=1e-9)

    def test_run_output_has_totals(self, triangle):
        out = dispatch_tool("run_chain_ladder", {}, triangle=triangle)
        assert "total_ultimate" in out
        assert "total_reserve" in out
        assert "total_latest" in out
        assert "ultimate_per_origin" in out
        assert "reserve_per_origin" in out


class TestDispatchErrorHandling:
    def test_unknown_tool_name_raises(self, triangle):
        with pytest.raises(KeyError):
            dispatch_tool("nonexistent", {}, triangle=triangle)

    def test_invalid_args_return_error_result(self, triangle):
        """LLM yanlış argüman verirse exception yerine error dict dönmeli
        (LLM'in kendini düzeltmesi için)."""
        out = dispatch_tool(
            "run_chain_ladder",
            {"ldf_override": [1.5]},  # wrong length
            triangle=triangle,
        )
        assert "error" in out


class TestPrivacyGuarantee:
    def test_output_does_not_contain_raw_triangle_matrix(self, triangle):
        """Tool çıktısında ham üçgen values matrisi bulunmamalı."""
        out_describe = dispatch_tool("describe_triangle", {}, triangle=triangle)
        out_run = dispatch_tool("run_chain_ladder", {}, triangle=triangle)

        # describe_triangle özet bilgi verir, latest diagonal dahil ama
        # ham kümülatif matris içermez
        assert "values" not in out_describe
        assert "values" not in out_run


@pytest.fixture
def cashflow_state() -> dict:
    """Aktif branşta hem quarterly hem monthly pattern içeren cashflow state."""
    return {
        "active_branch_id": "b1",
        "periods": [
            {
                "id": "p1",
                "branches": [
                    {
                        "id": "b1",
                        "name": "Test",
                        "is_active": True,
                        "has_paid_triangle": True,
                        "n_origins": 2,
                        "ldf_window": "all",
                        "selected_ldfs": [2.7333, 1.6109],
                        "effective_cdfs": [4.4, 1.6],
                        "per_dev": [],
                        "has_pattern": True,
                        "pattern_origin_count": 1,
                        "quarterly_pattern": {
                            "2024": [
                                {"period": 1, "weight": 0.6},
                                {"period": 2, "weight": 0.3},
                                {"period": 3, "weight": 0.1},
                            ]
                        },
                        "monthly_pattern": {
                            "2024": [
                                {"month": 1, "weight": 0.2},
                                {"month": 2, "weight": 0.2},
                                {"month": 3, "weight": 0.2},
                                {"month": 6, "weight": 0.4},
                            ]
                        },
                    }
                ],
            }
        ],
    }


class TestCashflowLdfState:
    def test_active_branch_paid_ldfs(self, cashflow_state):
        out = dispatch_tool("get_cashflow_ldf_state", {}, session_state=cashflow_state)
        assert out["branch_id"] == "b1"
        assert out["selected_ldfs"][0] == pytest.approx(2.7333)

    def test_unknown_branch_id_errors(self, cashflow_state):
        out = dispatch_tool(
            "get_cashflow_ldf_state", {"branch_id": "nope"}, session_state=cashflow_state
        )
        assert "error" in out


class TestCashflowPatternState:
    def test_defaults_to_quarterly_summary(self, cashflow_state):
        """mode verilmezse quarterly özet dönmeli (CF Pattern sekmesi)."""
        out = dispatch_tool(
            "get_cashflow_pattern_state", {}, session_state=cashflow_state
        )
        assert out["mode"] == "quarterly"
        row = out["origins"][0]
        assert row["origin"] == "2024"
        assert row["periods_count"] == 3
        assert row["peak_period"] == 1  # en yüksek ağırlık 1. çeyrekte

    def test_quarterly_origin_detail(self, cashflow_state):
        out = dispatch_tool(
            "get_cashflow_pattern_state",
            {"origin": "2024", "mode": "quarterly"},
            session_state=cashflow_state,
        )
        assert out["mode"] == "quarterly"
        assert out["periods_count"] == 3
        assert out["weight_sum"] == pytest.approx(1.0)
        assert out["weights"][0] == {"period": 1, "weight": 0.6}

    def test_monthly_mode_distinct_from_quarterly(self, cashflow_state):
        """monthly mode 180 aylık dağılımı döner — quarterly'den farklı veri."""
        out = dispatch_tool(
            "get_cashflow_pattern_state",
            {"origin": "2024", "mode": "monthly"},
            session_state=cashflow_state,
        )
        assert out["mode"] == "monthly"
        assert out["periods_count"] == 4
        assert out["last_period"] == 6  # son ödeme ayı
        assert out["weights"][-1] == {"month": 6, "weight": 0.4}

    def test_unknown_origin_lists_available(self, cashflow_state):
        out = dispatch_tool(
            "get_cashflow_pattern_state",
            {"origin": "1999"},
            session_state=cashflow_state,
        )
        assert "error" in out
        assert "2024" in str(out["error"])


class TestSimulateFrequencySeverity:
    def _tris(self):
        amount = Triangle(
            origin_periods=["2020", "2021", "2022"],
            development_periods=[0, 1, 2],
            values=[
                [1000.0, 1800.0, 2210.0],
                [1320.0, 2520.0, None],
                [1680.0, None, None],
            ],
            triangle_type=TriangleType.INCURRED,
        )
        count = Triangle(
            origin_periods=["2020", "2021", "2022"],
            development_periods=[0, 1, 2],
            values=[
                [10.0, 15.0, 17.0],
                [12.0, 18.0, None],
                [14.0, None, None],
            ],
            triangle_type=TriangleType.PAID,
        )
        return amount, count

    def test_returns_per_origin_breakdown(self):
        amount, count = self._tris()
        out = dispatch_tool(
            "simulate_frequency_severity", {}, triangle=amount, count_triangle=count
        )
        assert "error" not in out
        assert out["method"] == "volume_weighted"
        assert len(out["rows"]) == 3
        assert "ultimate_loss" in out["rows"][0]
        assert out["total_ibnr"] == pytest.approx(
            out["total_ultimate_loss"] - out["total_latest_amount"]
        )

    def test_missing_count_triangle_errors(self):
        amount, _ = self._tris()
        out = dispatch_tool(
            "simulate_frequency_severity", {}, triangle=amount, count_triangle=None
        )
        assert "error" in out
        assert "Adet üçgeni yok" in out["error"]

    def test_missing_active_branch_errors(self):
        out = dispatch_tool("simulate_frequency_severity", {}, triangle=None)
        assert "error" in out


# ─── LR formül değerlendirici ────────────────────────────────────────────────────


class TestEvaluateLrFormula:
    """Backend formül grameri frontend formula.ts ile aynı olmalı — tool
    açıklamaları sum_cl/sum_exp ve aritmetik vadediyor."""

    @pytest.fixture
    def per_origin(self) -> list[dict]:
        return [
            {"origin": "2020", "cl_ultimate": 700.0, "premium_annual": 1000.0},
            {"origin": "2021", "cl_ultimate": 800.0, "premium_annual": 1000.0},
            {"origin": "2022", "cl_ultimate": 900.0, "premium_annual": 1000.0},
        ]

    def _eval(self, formula: str, per_origin: list[dict]) -> float:
        from app.agent.tools import _evaluate_lr_formula

        return _evaluate_lr_formula(formula, per_origin)

    def test_plain_number_and_percent(self, per_origin):
        assert self._eval("0.75", per_origin) == pytest.approx(0.75)
        assert self._eval("75%", per_origin) == pytest.approx(0.75)
        assert self._eval("75", per_origin) == pytest.approx(0.75)

    def test_vw_range(self, per_origin):
        # (700+800+900) / 3000 = 0.8
        assert self._eval("vw(2020:2022)", per_origin) == pytest.approx(0.8)

    def test_avg_list(self, per_origin):
        # pattern: 0.7, 0.9 → ort 0.8
        assert self._eval("avg(2020, 2022)", per_origin) == pytest.approx(0.8)

    def test_arithmetic_scaling(self, per_origin):
        assert self._eval("avg(2020:2022) * 1.1", per_origin) == pytest.approx(0.88)
        assert self._eval("vw(2020:2022)*0.5 + 0.1", per_origin) == pytest.approx(0.5)

    def test_sum_cl_over_sum_exp(self, per_origin):
        got = self._eval("sum_cl(2020:2022) / sum_exp(2020:2022)", per_origin)
        assert got == pytest.approx(0.8)

    def test_pattern_single_origin(self, per_origin):
        assert self._eval("pattern(2021)", per_origin) == pytest.approx(0.8)

    def test_unknown_origin_raises(self, per_origin):
        with pytest.raises(ValueError, match="Origin bulunamadı"):
            self._eval("vw(2015:2016)", per_origin)

    def test_unrecognized_formula_raises(self, per_origin):
        with pytest.raises(ValueError, match="Formül tanınamadı"):
            self._eval("foo(2020)", per_origin)

    def test_division_by_zero_raises(self, per_origin):
        with pytest.raises(ValueError, match="Sıfıra bölme"):
            self._eval("avg(2020:2022) / 0", per_origin)

    def test_simulate_bf_formula_with_arithmetic(self):
        """Uçtan uca: simulate_bf_formula aritmetikli formülü kabul etmeli."""
        session_state = {
            "active": {"branch_name": "T"},
            "per_origin": [
                {"origin": "2022", "cl_ultimate": 700.0, "premium_annual": 1000.0,
                 "latest": 500.0, "cdf": 1.0, "premium": 1000.0,
                 "selected_ultimate": 700.0, "ibnr": 200.0},
                {"origin": "2024", "cl_ultimate": 900.0, "premium_annual": 1000.0,
                 "latest": 400.0, "cdf": 2.0, "premium": 1000.0,
                 "selected_ultimate": 800.0, "ibnr": 400.0},
            ],
        }
        out = dispatch_tool(
            "simulate_bf_formula",
            {"formula": "vw(2022) * 1.1", "origin": "2024"},
            session_state=session_state,
        )
        assert "error" not in out
        assert out["evaluated_lr"] == pytest.approx(0.77)
