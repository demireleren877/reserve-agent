"""Agent tool'larının hata/uç dalları.

test_agent_tools.py mutlu yolları test eder; bu dosya her tool'un validasyon
hataları, eksik state, branch_id yolları ve uç durumlarını kapsar — agent'ın
hangi argümanla çağırırsa çağırsın kontrollü (crash'siz) yanıt aldığının
garantisi.
"""

import pytest

from app.agent.tools import (
    _evaluate_lr_formula,
    _norm_origin,
    dispatch_tool,
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
            [1200.0, 2400.0, None, None],  # step 0'da aykırı (LDF 2.0)
            [1300.0, None, None, None],
        ],
        triangle_type=TriangleType.PAID,
    )


@pytest.fixture
def session_state() -> dict:
    """Aktif branşlı minimal rezerv session_state."""
    return {
        "active": {"branch_name": "Test", "period_label": "2026Q1"},
        "periods": [
            {
                "id": "p1",
                "label": "2026Q1",
                "branches": [
                    {
                        "id": "b1",
                        "name": "Test",
                        "is_active": True,
                        "per_origin": [
                            {"origin": "2022", "latest": 500.0, "cdf": 1.0,
                             "premium": 1000.0, "cl_ultimate": 700.0,
                             "premium_annual": 1000.0, "selected_ultimate": 700.0,
                             "ibnr": 200.0, "basis": "cl"},
                            {"origin": "2024", "latest": 400.0, "cdf": 2.0,
                             "premium": 500.0, "correction": 2.0,
                             "cl_ultimate": 900.0, "selected_ultimate": 800.0,
                             "ibnr": 400.0, "basis": "bf",
                             "selected_lr": 0.7, "selected_lr_input": "vw(2022)"},
                        ],
                    }
                ],
            }
        ],
        "per_origin": [
            {"origin": "2022", "latest": 500.0, "cdf": 1.0, "premium": 1000.0,
             "cl_ultimate": 700.0, "premium_annual": 1000.0,
             "selected_ultimate": 700.0, "ibnr": 200.0, "basis": "cl"},
            {"origin": "2024", "latest": 400.0, "cdf": 2.0, "premium": 500.0,
             "correction": 2.0, "cl_ultimate": 900.0,
             "selected_ultimate": 800.0, "ibnr": 400.0, "basis": "bf"},
        ],
        "excluded_cells": [{"origin": "2021", "step": 0}],
        "window": "all",
    }


# ─── Navigasyon / proje okuma ────────────────────────────────────────────────────


class TestListProject:
    def test_empty_session_state(self):
        out = dispatch_tool("list_project", {})
        assert out == {"periods": [], "active": None, "totals_all_branches": {}}

    def test_strips_verbose_fields(self, session_state):
        out = dispatch_tool("list_project", {}, session_state=session_state)
        b = out["periods"][0]["branches"][0]
        assert "per_origin" not in b
        assert "formula_context" not in b
        assert b["id"] == "b1"


class TestSelectBranch:
    def test_missing_branch_id_errors(self):
        out = dispatch_tool("select_branch", {})
        assert "error" in out

    def test_with_period_id(self):
        out = dispatch_tool("select_branch", {"branch_id": "b1", "period_id": "p1"})
        assert out["_action"]["payload"] == {"branch_id": "b1", "period_id": "p1"}


class TestGetBranchState:
    def test_no_session_state(self):
        assert "error" in dispatch_tool("get_branch_state", {"branch_id": "b1"})

    def test_missing_branch_id(self, session_state):
        out = dispatch_tool("get_branch_state", {}, session_state=session_state)
        assert "error" in out

    def test_unknown_branch(self, session_state):
        out = dispatch_tool(
            "get_branch_state", {"branch_id": "yok"}, session_state=session_state
        )
        assert "bulunamadı" in out["error"]

    def test_found(self, session_state):
        out = dispatch_tool(
            "get_branch_state", {"branch_id": "b1"}, session_state=session_state
        )
        assert out["period_label"] == "2026Q1"
        assert out["branch"]["name"] == "Test"


class TestGetAnalysisState:
    def test_no_session_state(self):
        assert "error" in dispatch_tool("get_analysis_state", {})

    def test_no_active_no_triangle(self):
        out = dispatch_tool(
            "get_analysis_state", {}, session_state={"active": None}
        )
        assert "Aktif branş yok" in out["error"]

    def test_with_triangle_includes_granularity(self, triangle, session_state):
        out = dispatch_tool(
            "get_analysis_state", {}, triangle=triangle, session_state=session_state
        )
        assert out["triangle_type"] == "paid"
        assert out["excluded_cells_count"] == 1


# ─── Rezerv yazma tool'ları: validasyon dalları ─────────────────────────────────


class TestWriteValidation:
    def test_set_window_invalid(self, triangle, session_state):
        out = dispatch_tool(
            "set_window", {"window": "9"},
            triangle=triangle, session_state=session_state,
        )
        assert "Geçersiz window" in out["error"]

    def test_set_premium_invalid_value(self, triangle, session_state):
        out = dispatch_tool(
            "set_premium", {"origin": "2022", "value": "abc"},
            triangle=triangle, session_state=session_state,
        )
        assert "Geçersiz value" in out["error"]

    def test_set_premiums_skips_invalid_items(self, triangle, session_state):
        out = dispatch_tool(
            "set_premiums",
            {"items": [
                {"origin": "2022", "value": 100},
                {"origin": "2023", "value": "x"},  # atlanır
                {"origin": "", "value": 50},       # atlanır
            ]},
            triangle=triangle, session_state=session_state,
        )
        assert out["count"] == 1
        assert out["applied"][0]["origin"] == "2022"

    def test_set_basis_invalid(self, triangle, session_state):
        out = dispatch_tool(
            "set_basis", {"origin": "2022", "basis": "xx"},
            triangle=triangle, session_state=session_state,
        )
        assert "Geçersiz basis" in out["error"]

    def test_set_basis_bulk_filters(self, triangle, session_state):
        out = dispatch_tool(
            "set_basis_bulk",
            {"items": [{"origin": "2022", "basis": "bf"},
                       {"origin": "2023", "basis": "zz"}]},
            triangle=triangle, session_state=session_state,
        )
        assert out["count"] == 1

    def test_set_correction_invalid_value(self, triangle, session_state):
        out = dispatch_tool(
            "set_correction", {"origin": "2022", "value": "dört"},
            triangle=triangle, session_state=session_state,
        )
        assert "Geçersiz value" in out["error"]

    def test_set_correction_null_means_no_correction(self, triangle, session_state):
        out = dispatch_tool(
            "set_correction", {"origin": "2022", "value": None},
            triangle=triangle, session_state=session_state,
        )
        assert out["value"] is None
        assert out["_action"]["payload"]["value"] is None

    def test_set_corrections_bulk(self, triangle, session_state):
        out = dispatch_tool(
            "set_corrections",
            {"items": [{"origin": "2024", "value": 4},
                       {"origin": "2023", "value": "x"}]},
            triangle=triangle, session_state=session_state,
        )
        assert out["count"] == 1

    def test_set_selected_loss_ratios_bulk(self, triangle, session_state):
        out = dispatch_tool(
            "set_selected_loss_ratios",
            {"items": [{"origin": "2024", "formula": "0.7"},
                       {"origin": "", "formula": "0.8"}]},
            triangle=triangle, session_state=session_state,
        )
        assert out["count"] == 1

    def test_set_cdf_user_value_invalid(self, triangle, session_state):
        out = dispatch_tool(
            "set_cdf_user_value", {"dev_period": "3", "value": "bir"},
            triangle=triangle, session_state=session_state,
        )
        assert "Geçersiz value" in out["error"]

    def test_set_cdf_choice_invalid(self, triangle, session_state):
        out = dispatch_tool(
            "set_cdf_choice", {"dev_period": "3", "choice": "manual"},
            triangle=triangle, session_state=session_state,
        )
        assert "Geçersiz choice" in out["error"]

    def test_set_cdf_choices_filters(self, triangle, session_state):
        out = dispatch_tool(
            "set_cdf_choices",
            {"items": [{"dev_period": "3", "choice": "user"},
                       {"dev_period": "4", "choice": "zzz"}]},
            triangle=triangle, session_state=session_state,
        )
        assert out["count"] == 1

    def test_reset_curve_emits_action(self, triangle, session_state):
        out = dispatch_tool(
            "reset_curve", {}, triangle=triangle, session_state=session_state
        )
        assert out["cleared"] is True
        assert out["_action"]["type"] == "reset_curve"

    def test_clear_exclusions_emits_action(self, triangle, session_state):
        out = dispatch_tool(
            "clear_exclusions", {}, triangle=triangle, session_state=session_state
        )
        assert out["_action"]["type"] == "clear_exclusions"


# ─── exclude/include hücre validasyonu ──────────────────────────────────────────


class TestExcludeCells:
    def test_out_of_range_step_marked_invalid(self, triangle, session_state):
        out = dispatch_tool(
            "exclude_cells",
            {"cells": [{"origin": "2020", "step": 99}]},
            triangle=triangle, session_state=session_state,
        )
        assert out["invalid"][0]["reason"] == "out_of_range"
        assert "error" in out  # hiçbir hücre eşleşmedi

    def test_unknown_origin_marked_invalid(self, triangle, session_state):
        out = dispatch_tool(
            "exclude_cells",
            {"cells": [{"origin": "1999", "step": 0}]},
            triangle=triangle, session_state=session_state,
        )
        assert out["invalid"][0]["reason"] == "out_of_range"

    def test_no_ldf_data_cell_marked_invalid(self, triangle, session_state):
        # 2023 origin'inde step 1 → values[3][1] None: LDF hesaplanamaz
        out = dispatch_tool(
            "exclude_cells",
            {"cells": [{"origin": "2023", "step": 1}]},
            triangle=triangle, session_state=session_state,
        )
        assert out["invalid"][0]["reason"] == "no_ldf_data"

    def test_mixed_valid_invalid(self, triangle, session_state):
        out = dispatch_tool(
            "exclude_cells",
            {"cells": [{"origin": "2020", "step": 0},
                       {"origin": "2020", "step": 99}]},
            triangle=triangle, session_state=session_state,
        )
        assert out["count"] == 1
        assert len(out["invalid"]) == 1
        assert out["_action"]["type"] == "exclude_cells"

    def test_include_cells_action_type(self, triangle, session_state):
        out = dispatch_tool(
            "include_cells",
            {"cells": [{"origin": "2020", "step": 0}]},
            triangle=triangle, session_state=session_state,
        )
        assert out["_action"]["type"] == "include_cells"

    def test_non_integer_step_invalid(self, triangle, session_state):
        out = dispatch_tool(
            "exclude_cells",
            {"cells": [{"origin": "2020", "step": "abc"}]},
            triangle=triangle, session_state=session_state,
        )
        assert out["invalid"][0]["reason"] == "out_of_range"


class TestExcludeOutliers:
    def test_finds_outlier_with_median_baseline(self, triangle, session_state):
        session_state["excluded_cells"] = []  # tüm LDF'ler hesaba girsin
        out = dispatch_tool(
            "exclude_outliers", {"threshold_pct": 10},
            triangle=triangle, session_state=session_state,
        )
        # step 0 LDF'leri: 1.5, 1.4545, 2.0 → medyan 1.5; 2022 (2.0) aykırı
        origins = {m["origin"] for m in out["matched"]}
        assert "2022" in origins
        assert out["_action"]["type"] == "exclude_cells"

    def test_mean_baseline_and_high_direction(self, triangle, session_state):
        out = dispatch_tool(
            "exclude_outliers",
            {"threshold_pct": 10, "direction": "high", "baseline": "mean"},
            triangle=triangle, session_state=session_state,
        )
        assert all(m["deviation_pct"] > 0 for m in out["matched"])

    def test_low_direction(self, triangle, session_state):
        out = dispatch_tool(
            "exclude_outliers",
            {"threshold_pct": 5, "direction": "low", "baseline": "mean"},
            triangle=triangle, session_state=session_state,
        )
        assert all(m["deviation_pct"] < 0 for m in out["matched"])

    def test_already_excluded_cells_skipped(self, triangle, session_state):
        # 2022|0'ı önceden elenmiş yap → tekrar aday olmamalı
        session_state["excluded_cells"] = [{"origin": "2022", "step": 0}]
        out = dispatch_tool(
            "exclude_outliers", {"threshold_pct": 10},
            triangle=triangle, session_state=session_state,
        )
        assert not any(
            m["origin"] == "2022" and m["step"] == 0 for m in out["matched"]
        )


# ─── simulate_bf / simulate_bf_formula dalları ──────────────────────────────────


class TestSimulateBf:
    def test_no_session_state(self):
        out = dispatch_tool("simulate_bf", {"origin": "2024", "loss_ratio": 0.7})
        assert "error" in out

    def test_invalid_loss_ratio(self, session_state):
        out = dispatch_tool(
            "simulate_bf", {"origin": "2024", "loss_ratio": "yüzde"},
            session_state=session_state,
        )
        assert "Geçersiz loss_ratio" in out["error"]

    def test_unknown_origin_lists_available(self, session_state):
        out = dispatch_tool(
            "simulate_bf", {"origin": "2019", "loss_ratio": 0.7},
            session_state=session_state,
        )
        assert "Origin bulunamadı" in out["error"]
        assert "2024" in out["error"]

    def test_unknown_branch_id(self, session_state):
        out = dispatch_tool(
            "simulate_bf",
            {"origin": "2024", "loss_ratio": 0.7, "branch_id": "yok"},
            session_state=session_state,
        )
        assert "branch_id bulunamadı" in out["error"]

    def test_branch_id_uses_that_branch(self, session_state):
        out = dispatch_tool(
            "simulate_bf",
            {"origin": "2024", "loss_ratio": 0.7, "branch_id": "b1"},
            session_state=session_state,
        )
        assert "error" not in out
        assert out["origin"] == "2024"

    def test_correction_aware_bf(self, session_state):
        """2024: latest=400, cdf=2 → %50 gelişmemiş; premium=500, k=2 →
        premium_annual=1000. bf_ult_annual = 400 + 0.7×1000×0.5 = 750;
        bf_ult = 750/2 = 375."""
        out = dispatch_tool(
            "simulate_bf", {"origin": "2024", "loss_ratio": 0.7},
            session_state=session_state,
        )
        assert out["inputs"]["premium_annual"] == pytest.approx(1000.0)
        assert out["scenario_bf"]["bf_ultimate"] == pytest.approx(375.0)
        assert out["scenario_bf"]["bf_ibnr"] == pytest.approx(-25.0)

    def test_float_origin_normalized(self, session_state):
        """Excel'den '2024.0' gelirse normalize edilip eşleşmeli."""
        out = dispatch_tool(
            "simulate_bf", {"origin": "2024.0", "loss_ratio": 0.7},
            session_state=session_state,
        )
        assert "error" not in out


class TestSimulateBfFormula:
    def test_no_session_state(self):
        assert "error" in dispatch_tool("simulate_bf_formula", {"formula": "0.7"})

    def test_empty_formula(self, session_state):
        out = dispatch_tool(
            "simulate_bf_formula", {"formula": "  "}, session_state=session_state
        )
        assert "formula zorunlu" in out["error"]

    def test_missing_origin_and_origins(self, session_state):
        out = dispatch_tool(
            "simulate_bf_formula", {"formula": "0.7"}, session_state=session_state
        )
        assert "origin veya origins" in out["error"]

    def test_invalid_formula_returns_error(self, session_state):
        out = dispatch_tool(
            "simulate_bf_formula",
            {"formula": "vw(1999:2000)", "origin": "2024"},
            session_state=session_state,
        )
        assert "Origin bulunamadı" in out["error"]

    def test_unknown_branch_id(self, session_state):
        out = dispatch_tool(
            "simulate_bf_formula",
            {"formula": "0.7", "origin": "2024", "branch_id": "yok"},
            session_state=session_state,
        )
        assert "branch_id bulunamadı" in out["error"]

    def test_branch_id_found_uses_branch_per_origin(self, session_state):
        out = dispatch_tool(
            "simulate_bf_formula",
            {"formula": "0.7", "origin": "2024", "branch_id": "b1"},
            session_state=session_state,
        )
        assert "error" not in out
        assert out["baseline"]["current_lr_input"] == "vw(2022)"

    def test_multi_origin_totals_and_errors(self, session_state):
        out = dispatch_tool(
            "simulate_bf_formula",
            {"formula": "0.7", "origins": ["2024", "1999"]},
            session_state=session_state,
        )
        assert len(out["origins"]) == 1
        assert out["errors"] and "1999" in out["errors"][0]
        assert out["total_delta_ibnr"] == pytest.approx(
            out["origins"][0]["delta_vs_current"]["ibnr"]
        )

    def test_formula_context_takes_precedence(self, session_state):
        """formula_context'teki cl_ult/exposure per_origin'den önceliklidir."""
        session_state["formula_context"] = {
            "cl_ult": {"2022": 1400.0},
            "exposure": {"2022": 1000.0},
            "pattern": {},
        }
        out = dispatch_tool(
            "simulate_bf_formula",
            {"formula": "vw(2022)", "origin": "2024"},
            session_state=session_state,
        )
        assert out["evaluated_lr"] == pytest.approx(1.4)  # 700/1000 değil


# ─── ILR / dosya özeti ──────────────────────────────────────────────────────────


class TestIlrTriangle:
    def test_rows_use_premium_and_correction(self, triangle, session_state):
        out = dispatch_tool(
            "get_ilr_triangle", {}, triangle=triangle, session_state=session_state
        )
        rows = {r["origin"]: r for r in out["rows"]}
        # 2022: prim 500, k=2 → adj 1000; 1200/1000 = %120
        assert rows["2022"]["adj_premium"] == pytest.approx(1000.0)
        assert rows["2022"]["ilr_pct"][0] == pytest.approx(120.0)
        # Prim girilmemiş origin (2020) → tüm hücreler null
        assert all(v is None for v in rows["2020"]["ilr_pct"])

    def test_none_cells_stay_null(self, triangle, session_state):
        out = dispatch_tool(
            "get_ilr_triangle", {}, triangle=triangle, session_state=session_state
        )
        rows = {r["origin"]: r for r in out["rows"]}
        assert rows["2022"]["ilr_pct"][3] is None  # üçgen hücresi boş


class TestFileSummary:
    def test_no_session_state(self):
        assert "error" in dispatch_tool("get_file_summary", {})

    def test_no_file_data(self, session_state):
        out = dispatch_tool("get_file_summary", {}, session_state=session_state)
        assert "DOSYA_NO" in out["error"]

    def test_passthrough_when_present(self, session_state):
        session_state["file_data_summary"] = {"n_files": 12}
        out = dispatch_tool("get_file_summary", {}, session_state=session_state)
        assert out == {"n_files": 12}


# ─── Cashflow okuma/yazma dalları ───────────────────────────────────────────────


@pytest.fixture
def cashflow_state() -> dict:
    return {
        "active_branch_id": "b1",
        "periods": [
            {
                "id": "p1",
                "label": "2026Q1",
                "branches": [
                    {
                        "id": "b1", "name": "Test", "is_active": True,
                        "has_paid_triangle": True, "n_origins": 2,
                        "ldf_window": "all",
                        "selected_ldfs": [1.5], "effective_cdfs": [1.5],
                        "per_dev": [],
                        "quarterly_pattern": {
                            "2024": [{"period": 1, "weight": 0.7},
                                     {"period": 2, "weight": 0.3}],
                        },
                        "monthly_pattern": {
                            "2024": [{"month": 1, "weight": 0.5},
                                     {"month": 4, "weight": 0.5}],
                        },
                        "has_pattern": True, "pattern_origin_count": 1,
                    },
                    {"id": "b2", "name": "Diğer", "is_active": False,
                     "has_paid_triangle": False},
                ],
            }
        ],
        "totals": {"branch_count": 2},
    }


class TestCashflowReads:
    def test_state_without_session(self):
        out = dispatch_tool("get_cashflow_state", {})
        assert out["branches"] == []

    def test_state_summarizes_branches(self, cashflow_state):
        out = dispatch_tool("get_cashflow_state", {}, session_state=cashflow_state)
        assert out["active_branch_id"] == "b1"
        assert len(out["branches"]) == 2
        assert out["branches"][0]["has_paid_triangle"] is True

    def test_ldf_state_no_session(self):
        assert "error" in dispatch_tool("get_cashflow_ldf_state", {})

    def test_ldf_state_no_active_no_branch_id(self, cashflow_state):
        for p in cashflow_state["periods"]:
            for b in p["branches"]:
                b["is_active"] = False
        out = dispatch_tool(
            "get_cashflow_ldf_state", {}, session_state=cashflow_state
        )
        assert "Aktif branş yok" in out["error"]

    def test_ldf_state_explicit_branch(self, cashflow_state):
        out = dispatch_tool(
            "get_cashflow_ldf_state", {"branch_id": "b2"},
            session_state=cashflow_state,
        )
        assert out["branch_id"] == "b2"

    def test_pattern_no_session(self):
        assert "error" in dispatch_tool("get_cashflow_pattern_state", {})

    def test_pattern_unknown_branch(self, cashflow_state):
        out = dispatch_tool(
            "get_cashflow_pattern_state", {"branch_id": "yok"},
            session_state=cashflow_state,
        )
        assert "bulunamadı" in out["error"]

    def test_pattern_monthly_origin_detail(self, cashflow_state):
        out = dispatch_tool(
            "get_cashflow_pattern_state",
            {"origin": "2024", "mode": "monthly"},
            session_state=cashflow_state,
        )
        assert out["mode"] == "monthly"
        assert out["last_period"] == 4
        assert out["weight_sum"] == pytest.approx(1.0)

    def test_pattern_unknown_origin_lists_available(self, cashflow_state):
        out = dispatch_tool(
            "get_cashflow_pattern_state", {"origin": "2019"},
            session_state=cashflow_state,
        )
        assert "2024" in str(out["error"])

    def test_pattern_summary_falls_back_to_monthly(self, cashflow_state):
        cashflow_state["periods"][0]["branches"][0]["quarterly_pattern"] = {}
        out = dispatch_tool(
            "get_cashflow_pattern_state", {}, session_state=cashflow_state
        )
        assert out["mode"] == "monthly"
        assert out["origins"][0]["origin"] == "2024"


class TestCashflowWrites:
    def test_exclude_cells_empty_errors(self, cashflow_state):
        out = dispatch_tool(
            "exclude_cashflow_cells", {"cells": []}, session_state=cashflow_state
        )
        assert "error" in out

    def test_exclude_cells_with_branch_id(self, cashflow_state):
        out = dispatch_tool(
            "exclude_cashflow_cells",
            {"cells": [{"origin": "2024", "step": 0}], "branch_id": "b2"},
            session_state=cashflow_state,
        )
        assert out["_action"]["payload"]["branch_id"] == "b2"
        assert out["_action"]["module"] == "cashflow"

    def test_clear_exclusions_with_branch_id(self, cashflow_state):
        out = dispatch_tool(
            "clear_cashflow_exclusions", {"branch_id": "b1"},
            session_state=cashflow_state,
        )
        assert out["cleared"] is True
        assert out["_action"]["payload"]["branch_id"] == "b1"

    def test_cdf_user_value_invalid(self, cashflow_state):
        out = dispatch_tool(
            "set_cashflow_cdf_user_value",
            {"dev_period": "3", "value": "bir"},
            session_state=cashflow_state,
        )
        assert "Geçersiz value" in out["error"]

    def test_cdf_user_value_with_branch(self, cashflow_state):
        out = dispatch_tool(
            "set_cashflow_cdf_user_value",
            {"dev_period": "3", "value": 1.05, "branch_id": "b1"},
            session_state=cashflow_state,
        )
        assert out["_action"]["payload"]["value"] == pytest.approx(1.05)

    def test_window_invalid(self, cashflow_state):
        out = dispatch_tool(
            "set_cashflow_window", {"window": "6"}, session_state=cashflow_state
        )
        assert "Geçersiz window" in out["error"]

    def test_window_with_branch(self, cashflow_state):
        out = dispatch_tool(
            "set_cashflow_window", {"window": "7", "branch_id": "b2"},
            session_state=cashflow_state,
        )
        assert out["_action"]["payload"] == {"window": "7", "branch_id": "b2"}

    def test_cdf_model_invalid(self, cashflow_state):
        out = dispatch_tool(
            "set_cashflow_cdf_model", {"dev_period": "3", "model": 9},
            session_state=cashflow_state,
        )
        assert "Geçersiz model" in out["error"]

    def test_cdf_model_bulk_filters(self, cashflow_state):
        out = dispatch_tool(
            "set_cashflow_cdf_model_bulk",
            {"items": [{"dev_period": "3", "model": 2},
                       {"dev_period": "4", "model": 9}],
             "branch_id": "b1"},
            session_state=cashflow_state,
        )
        assert out["count"] == 1
        assert out["_action"]["payload"]["branch_id"] == "b1"

    def test_reset_curve_with_branch(self, cashflow_state):
        out = dispatch_tool(
            "reset_cashflow_curve", {"branch_id": "b1"},
            session_state=cashflow_state,
        )
        assert out["cleared"] is True
        assert out["_action"]["module"] == "cashflow"


# ─── Discount dalları ───────────────────────────────────────────────────────────


@pytest.fixture
def discount_state() -> dict:
    return {
        "active_branch_id": "b1",
        "branches": [
            {
                "branch_id": "b1", "branch_name": "Test", "is_active": True,
                "has_cashflow_pattern": True,
                "per_origin": [
                    {"origin": "2023", "unpaid": 1_000_000, "avg_month": 12.0},
                    {"origin": "2024", "unpaid": 0, "avg_month": 6.0},  # atlanır
                ],
            },
            {"branch_id": "b2", "branch_name": "Pat-yok", "is_active": False,
             "has_cashflow_pattern": False, "per_origin": []},
        ],
    }


class TestDiscountBranches:
    def test_state_no_session(self):
        assert "error" in dispatch_tool("get_discount_state", {})

    def test_state_empty_branches(self):
        out = dispatch_tool("get_discount_state", {}, session_state={"branches": []})
        assert out["branches"] == []

    def test_state_with_branches(self, discount_state):
        out = dispatch_tool("get_discount_state", {}, session_state=discount_state)
        assert out["active_branch_id"] == "b1"

    def test_compute_invalid_rate_mode(self, discount_state):
        out = dispatch_tool(
            "compute_discount", {"rate_mode": "sabit"},
            session_state=discount_state,
        )
        assert "Geçersiz rate_mode" in out["error"]

    def test_compute_no_session(self):
        assert "error" in dispatch_tool("compute_discount", {"rate_mode": "flat"})

    def test_compute_unknown_branch(self, discount_state):
        out = dispatch_tool(
            "compute_discount", {"rate_mode": "flat", "branch_id": "yok"},
            session_state=discount_state,
        )
        assert "bulunamadı" in out["error"]

    def test_compute_no_active_branch(self, discount_state):
        for b in discount_state["branches"]:
            b["is_active"] = False
        out = dispatch_tool(
            "compute_discount", {"rate_mode": "flat"},
            session_state=discount_state,
        )
        assert "Aktif branş yok" in out["error"]

    def test_compute_missing_pattern(self, discount_state):
        out = dispatch_tool(
            "compute_discount", {"rate_mode": "flat", "branch_id": "b2"},
            session_state=discount_state,
        )
        assert "pattern" in out["error"]

    def test_compute_empty_per_origin(self, discount_state):
        discount_state["branches"][0]["per_origin"] = []
        out = dispatch_tool(
            "compute_discount", {"rate_mode": "flat"},
            session_state=discount_state,
        )
        assert "error" in out

    def test_compute_flat_default_rate_and_skips_zero_unpaid(self, discount_state):
        out = dispatch_tool(
            "compute_discount", {"rate_mode": "flat"},  # flat_rate default 0.30
            session_state=discount_state,
        )
        assert len(out["by_origin"]) == 1  # unpaid=0 satırı atlandı
        # 12 ay, %30 → faktör 1/1.3
        assert out["by_origin"][0]["discount_factor"] == pytest.approx(1 / 1.3, abs=1e-4)
        assert "%30.0" in out["rate_label"]

    def test_compute_curve_empty_nodes_falls_back_to_default(self, discount_state):
        """curve_nodes verilmezse varsayılan TL risk-free eğrisi kullanılır."""
        out = dispatch_tool(
            "compute_discount", {"rate_mode": "curve", "curve_nodes": []},
            session_state=discount_state,
        )
        assert "error" not in out
        # avg_month=12 → varsayılan eğride %28
        assert out["by_origin"][0]["discount_factor"] == pytest.approx(1 / 1.28, abs=1e-4)

    def test_compute_curve_picks_rate_by_month(self, discount_state):
        out = dispatch_tool(
            "compute_discount",
            {"rate_mode": "curve",
             "curve_nodes": [{"month": 0, "rate": 0.20},
                             {"month": 11, "rate": 0.50}]},
            session_state=discount_state,
        )
        # avg_month=12 ≥ 11 → %50 kullanılır
        assert out["by_origin"][0]["discount_factor"] == pytest.approx(1 / 1.5, abs=1e-4)


class TestComputeDiscountStandards:
    """IFRS 4 / IFRS 17 standart katmanı."""

    def test_invalid_standard_errors(self, discount_state):
        out = dispatch_tool(
            "compute_discount", {"standard": "solvency2"},
            session_state=discount_state,
        )
        assert "Geçersiz standard" in out["error"]

    def test_ifrs4_default_is_flat_seddk(self, discount_state):
        """Parametresiz çağrı: ifrs4 + flat %30, RA alanları yok."""
        out = dispatch_tool("compute_discount", {}, session_state=discount_state)
        assert out["standard"] == "ifrs4"
        assert out["rate_mode"] == "flat"
        assert "%30.0" in out["rate_label"]
        assert "risk_adjustment" not in out["totals"]
        assert "lic" not in out["totals"]
        assert out["risk_adjustment_method"] == "none"

    def test_ifrs4_nominal_no_discount(self, discount_state):
        out = dispatch_tool(
            "compute_discount", {"standard": "ifrs4", "rate_mode": "none"},
            session_state=discount_state,
        )
        assert out["by_origin"][0]["discount_factor"] == 1.0
        assert out["totals"]["discount_amount"] == 0
        assert "Nominal" in out["rate_label"]

    def test_ifrs17_none_rate_mode_rejected(self, discount_state):
        out = dispatch_tool(
            "compute_discount", {"standard": "ifrs17", "rate_mode": "none"},
            session_state=discount_state,
        )
        assert "BEL iskontolu" in out["error"]

    def test_ifrs17_defaults_curve_ilp_and_ra(self, discount_state):
        """ifrs17 varsayılanı: risk-free eğri + 100bp + RA=BEL×%6 → LIC."""
        out = dispatch_tool(
            "compute_discount", {"standard": "ifrs17"},
            session_state=discount_state,
        )
        assert out["rate_mode"] == "curve"
        assert "100bp illikidite" in out["rate_label"]
        row = out["by_origin"][0]
        # avg_month=12 → eğri %28 + 100bp = %29
        assert row["discount_factor"] == pytest.approx(1 / 1.29, abs=1e-4)
        assert row["risk_adjustment"] == pytest.approx(
            row["discounted_unpaid"] * 0.06, abs=2
        )
        assert row["lic"] == pytest.approx(
            row["discounted_unpaid"] + row["risk_adjustment"], abs=2
        )
        assert out["totals"]["lic"] == pytest.approx(
            out["totals"]["discounted_unpaid"] + out["totals"]["risk_adjustment"],
            abs=2,
        )

    def test_ifrs17_custom_ra_pct(self, discount_state):
        out = dispatch_tool(
            "compute_discount",
            {"standard": "ifrs17", "risk_adjustment_pct": 0.10},
            session_state=discount_state,
        )
        row = out["by_origin"][0]
        assert row["risk_adjustment"] == pytest.approx(
            row["discounted_unpaid"] * 0.10, abs=2
        )

    def test_ifrs17_cost_of_capital_ra(self, discount_state):
        out = dispatch_tool(
            "compute_discount",
            {"standard": "ifrs17", "risk_adjustment_method": "cost_of_capital",
             "coc_rate": 0.06, "capital_ratio": 0.10},
            session_state=discount_state,
        )
        row = out["by_origin"][0]
        # RA = coc × capital × BEL × (avg_month/12) = 0.006 × BEL × 1
        assert row["risk_adjustment"] == pytest.approx(
            row["discounted_unpaid"] * 0.006, abs=2
        )
        assert "CoC" in out["risk_adjustment_label"]

    def test_ifrs17_ra_none_gives_lic_equal_bel(self, discount_state):
        out = dispatch_tool(
            "compute_discount",
            {"standard": "ifrs17", "risk_adjustment_method": "none"},
            session_state=discount_state,
        )
        assert out["totals"]["risk_adjustment"] == 0
        assert out["totals"]["lic"] == out["totals"]["discounted_unpaid"]

    def test_invalid_ra_method_errors(self, discount_state):
        out = dispatch_tool(
            "compute_discount",
            {"standard": "ifrs17", "risk_adjustment_method": "var99"},
            session_state=discount_state,
        )
        assert "Geçersiz risk_adjustment_method" in out["error"]

    def test_ifrs4_ignores_ra_params(self, discount_state):
        """IFRS 4'te RA parametreleri verilse bile uygulanmaz."""
        out = dispatch_tool(
            "compute_discount",
            {"standard": "ifrs4", "risk_adjustment_method": "pct_of_bel",
             "risk_adjustment_pct": 0.5},
            session_state=discount_state,
        )
        assert out["risk_adjustment_method"] == "none"
        assert "risk_adjustment" not in out["by_origin"][0]


# ─── Data + navigation dalları ──────────────────────────────────────────────────


class TestDataAndNavigation:
    def test_list_data_periods_no_session(self):
        assert "error" in dispatch_tool("list_data_periods", {})

    def test_list_data_periods_empty(self):
        out = dispatch_tool("list_data_periods", {}, session_state={"periods": []})
        assert out["periods"] == []

    def test_list_data_periods_full(self):
        ss = {"active_period_id": "p1",
              "periods": [{"period_id": "p1", "datasets": []}]}
        out = dispatch_tool("list_data_periods", {}, session_state=ss)
        assert out["active_period_id"] == "p1"

    def test_navigate_invalid_module(self):
        out = dispatch_tool("navigate_to", {"module": "yok"})
        assert "Geçersiz module" in out["error"]

    def test_navigate_valid(self):
        out = dispatch_tool("navigate_to", {"module": "discount"})
        assert out["_action"]["module"] == "navigation"


# ─── run_chain_ladder / frequency-severity hata dalları ─────────────────────────


class TestScenarioErrors:
    def test_chain_ladder_invalid_method(self, triangle):
        out = dispatch_tool(
            "run_chain_ladder", {"method": "uydurma"}, triangle=triangle
        )
        assert "Geçersiz method" in out["error"]

    def test_chain_ladder_bad_override_length(self, triangle):
        out = dispatch_tool(
            "run_chain_ladder", {"ldf_override": [1.1]}, triangle=triangle
        )
        assert "error" in out

    def test_freq_sev_invalid_method(self, triangle):
        out = dispatch_tool(
            "simulate_frequency_severity", {"method": "uydurma"},
            triangle=triangle,
            count_triangle=triangle,
        )
        assert "Geçersiz method" in out["error"]


# ─── _norm_origin / formül aritmetiği uçları ────────────────────────────────────


class TestNormOrigin:
    def test_float_string(self):
        assert _norm_origin("2022.0") == "2022"

    def test_plain(self):
        assert _norm_origin(" 2022 ") == "2022"

    def test_quarter_untouched(self):
        assert _norm_origin("2022Q1") == "2022Q1"

    def test_non_numeric_dot_zero_untouched(self):
        assert _norm_origin("abc.0") == "abc.0"


class TestFormulaArithmeticEdges:
    PER = [{"origin": "2020", "cl_ultimate": 800.0, "premium_annual": 1000.0}]

    def test_empty_formula_raises(self):
        with pytest.raises(ValueError, match="Boş formül"):
            _evaluate_lr_formula("", self.PER)

    def test_unbalanced_paren_raises(self):
        with pytest.raises(ValueError, match="Formül tanınamadı"):
            _evaluate_lr_formula("(avg(2020) + 0.1", self.PER)

    def test_trailing_garbage_raises(self):
        with pytest.raises(ValueError, match="Formül tanınamadı"):
            _evaluate_lr_formula("avg(2020) 0.1", self.PER)

    def test_unknown_character_raises(self):
        with pytest.raises(ValueError, match="Formül tanınamadı"):
            _evaluate_lr_formula("avg(2020) ^ 2", self.PER)

    def test_vw_zero_exposure_explains(self):
        per = [{"origin": "2020", "cl_ultimate": 800.0, "premium_annual": 0.0}]
        with pytest.raises(ValueError, match="Exposure sıfır"):
            _evaluate_lr_formula("vw(2020)", per)

    def test_nested_parens_arithmetic(self):
        got = _evaluate_lr_formula("(avg(2020) + 0.2) * 2", self.PER)
        assert got == pytest.approx(2.0)

    def test_unary_minus(self):
        assert _evaluate_lr_formula("-0.1 + avg(2020)", self.PER) == pytest.approx(0.7)

    def test_percent_inside_arithmetic(self):
        assert _evaluate_lr_formula("50% + 0.3", self.PER) == pytest.approx(0.8)

    def test_mixed_range_and_list(self):
        per = [
            {"origin": "2020", "cl_ultimate": 700.0, "premium_annual": 1000.0},
            {"origin": "2021", "cl_ultimate": 800.0, "premium_annual": 1000.0},
            {"origin": "2022", "cl_ultimate": 900.0, "premium_annual": 1000.0},
        ]
        # "2020:2021, 2022" karışık liste
        got = _evaluate_lr_formula("vw(2020:2021, 2022)", per)
        assert got == pytest.approx(0.8)
