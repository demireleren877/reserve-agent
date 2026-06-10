"""Çok-modüllü agent mimarisi testleri.

Tek genel agent; reserve / cashflow / discount / data modüllerinin her birine
erişir. Kritik invariant'lar:

* Her tool, onu SAHİPLENEN modüle yönlenir (tool_to_module, "ilk gelen kazanır").
* Her modül KENDİ session_state'ini alır (reserve incurred, cashflow paid, ...).
  Bir modülün tool'u başka modülün state'ini ASLA okumaz.
* Frontend bridge'leri snapshot'ı `{"session_state": {...}}` ile sarmalar;
  backend `payload.get("session_state")` ile okur. Sarmasız snapshot = None state.
* navigate_to data/navigasyon modülüne aittir (reserve'e değil).

Bu testler hem dispatch katmanını (dispatch_tool) hem de loop yönlendirmesini
(run_agent_turn) doğrular.
"""

from unittest.mock import MagicMock

import pytest

from app.agent.client import AgentClient, ToolCall
from app.agent.loop import run_agent_turn
from app.agent.modules import REGISTRY
from app.agent.modules.cashflow import cashflow_module
from app.agent.modules.data import data_module
from app.agent.modules.discount import discount_module
from app.agent.modules.reserve import reserve_module


def _mock_client(*tool_calls_then_final: ToolCall) -> AgentClient:
    """İlk turda verilen tool'ları çağırır, ikinci turda düz metinle biter."""
    mock = MagicMock(spec=AgentClient)
    mock.chat.side_effect = [
        {"content": None, "tool_calls": list(tool_calls_then_final)},
        {"content": "done", "tool_calls": []},
    ]
    return mock


def _call_one(modules_payload: dict, name: str, args: dict | None = None) -> dict:
    """Tek tool çağrısı yap, tool_invocation kaydını döndür."""
    client = _mock_client(ToolCall(id="t1", name=name, arguments=args or {}))
    result = run_agent_turn(
        client=client,
        messages=[{"role": "user", "content": "x"}],
        modules_payload=modules_payload,
    )
    assert result.tool_invocations, f"{name} hiç çağrılmadı"
    return result.tool_invocations[0]


# ─── Fixtures: gerçek frontend bridge çıktısına uygun snapshot'lar ──────────────


@pytest.fixture
def reserve_payload() -> dict:
    # Reserve bridge: {triangle, session_state}
    return {
        "triangle": None,
        "session_state": {
            "active": {"branch_name": "Test", "period_label": "2026Q1"},
            "periods": [
                {
                    "id": "p1",
                    "label": "2026Q1",
                    "branches": [
                        {
                            "id": "b1",
                            "name": "Test",
                            "frequency": "yearly",
                            "is_active": True,
                            # incurred üçgeninden LDF (cashflow'dan FARKLI olmalı)
                            "selected_ldfs": [2.4855, 1.30, 1.10],
                            "per_origin": [
                                {"origin": "2024", "latest": 100.0, "cdf": 2.0,
                                 "ibnr": 100.0, "premium": 0, "selected_ultimate": 200.0},
                            ],
                        }
                    ],
                }
            ],
            "totals_all_branches": {"branch_count": 1},
            "selected_ldfs": [2.4855, 1.30, 1.10],
        },
    }


@pytest.fixture
def cashflow_payload() -> dict:
    # Cashflow bridge: {session_state}, paid üçgeninden farklı LDF
    return {
        "session_state": {
            "active_branch_id": "b1",
            "periods": [
                {
                    "id": "p1",
                    "label": "2026Q1",
                    "branches": [
                        {
                            "id": "b1",
                            "name": "Test",
                            "is_active": True,
                            "has_paid_triangle": True,
                            "n_origins": 3,
                            "ldf_window": "all",
                            # PAID üçgeninden LDF (reserve'den FARKLI)
                            "selected_ldfs": [2.7333, 1.6109, 1.20],
                            "effective_cdfs": [5.2, 1.9, 1.2],
                            "per_dev": [],
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
                            "has_pattern": True,
                            "pattern_origin_count": 1,
                        }
                    ],
                }
            ],
            "totals": {"branch_count": 1, "branches_with_pattern": 1},
        }
    }


@pytest.fixture
def discount_payload() -> dict:
    # Discount bridge: {session_state: {branches, ...}}
    return {
        "session_state": {
            "active_branch_id": "b1",
            "branches": [
                {
                    "branch_id": "b1",
                    "branch_name": "Test",
                    "is_active": True,
                    "has_cashflow_pattern": True,
                    "per_origin": [
                        {"origin": "2023", "unpaid": 1_000_000, "avg_month": 18.0},
                        {"origin": "2024", "unpaid": 2_000_000, "avg_month": 30.0},
                    ],
                    "quick_discount_at_30pct": {"discount_pct": 12.3},
                }
            ],
            "note": "iskonto",
        }
    }


@pytest.fixture
def data_payload() -> dict:
    # Data bridge: {session_state: {periods, ...}}
    return {
        "session_state": {
            "active_period_id": "p1",
            "periods": [{"period_id": "p1", "label": "2026Q1", "datasets": []}],
            "note": "veri",
        }
    }


@pytest.fixture
def all_modules(reserve_payload, cashflow_payload, discount_payload, data_payload) -> dict:
    # Frontend'deki bridge mount sırası: reserve, cashflow, discount, data
    return {
        "reserve": reserve_payload,
        "cashflow": cashflow_payload,
        "discount": discount_payload,
        "data": data_payload,
    }


# ─── Tool ownership (tool_to_module) ────────────────────────────────────────────


class TestToolOwnership:
    def test_module_tool_sets_are_disjoint_except_navigate(self):
        """navigate_to dışında hiçbir tool iki modülde birden olmamalı —
        yoksa 'ilk gelen kazanır' kuralı yanlış session_state'e yönlendirir."""
        seen: dict[str, list[str]] = {}
        for mod in (reserve_module, cashflow_module, discount_module, data_module):
            for s in mod.tool_schemas:
                seen.setdefault(s["function"]["name"], []).append(mod.name)
        collisions = {n: mods for n, mods in seen.items() if len(mods) > 1}
        assert collisions == {}, f"Beklenmeyen tool çakışması: {collisions}"

    def test_navigate_to_owned_by_data_not_reserve(self):
        reserve_names = {s["function"]["name"] for s in reserve_module.tool_schemas}
        data_names = {s["function"]["name"] for s in data_module.tool_schemas}
        assert "navigate_to" not in reserve_names
        assert "navigate_to" in data_names

    def test_cashflow_tools_not_in_reserve(self):
        reserve_names = {s["function"]["name"] for s in reserve_module.tool_schemas}
        for name in ("get_cashflow_ldf_state", "get_cashflow_pattern_state",
                     "set_cashflow_window"):
            assert name not in reserve_names

    def test_navigate_to_routes_to_data_module(self, all_modules):
        inv = _call_one(all_modules, "navigate_to", {"module": "cashflow"})
        assert inv["module"] == "data"
        assert inv["output"]["module"] == "cashflow"


# ─── Per-module session_state izolasyonu ────────────────────────────────────────


class TestSessionStateIsolation:
    def test_cashflow_ldf_reads_paid_not_incurred(self, all_modules):
        """get_cashflow_ldf_state cashflow (paid) state'ini okumalı; reserve'in
        incurred LDF'lerini DEĞİL. Bu, ana hata sınıfının regresyon testi."""
        inv = _call_one(all_modules, "get_cashflow_ldf_state", {})
        assert inv["module"] == "cashflow"
        # paid LDF[0] = 2.7333, incurred LDF[0] = 2.4855
        assert inv["output"]["selected_ldfs"][0] == pytest.approx(2.7333)
        assert inv["output"]["selected_ldfs"][0] != pytest.approx(2.4855)

    def test_reserve_analysis_reads_incurred(self, all_modules):
        inv = _call_one(all_modules, "get_analysis_state", {})
        assert inv["module"] == "reserve"
        assert inv["output"]["selected_ldfs"][0] == pytest.approx(2.4855)

    def test_discount_tool_gets_discount_state(self, all_modules):
        """Regresyon: discount snapshot session_state ile sarmalı; sarmasızsa
        tool 'Session state yok' döndürürdü."""
        inv = _call_one(all_modules, "get_discount_state", {})
        assert inv["module"] == "discount"
        assert "error" not in inv["output"]
        assert inv["output"]["branches"][0]["branch_id"] == "b1"

    def test_data_tool_gets_periods(self, all_modules):
        """Regresyon: data snapshot session_state ile sarmalı."""
        inv = _call_one(all_modules, "list_data_periods", {})
        assert inv["module"] == "data"
        assert "error" not in inv["output"]
        assert inv["output"]["periods"][0]["period_id"] == "p1"


# ─── compute_discount ───────────────────────────────────────────────────────────


class TestComputeDiscount:
    def test_flat_rate_discounts_each_origin_at_avg_month(self, all_modules):
        inv = _call_one(all_modules, "compute_discount",
                        {"rate_mode": "flat", "flat_rate": 0.30})
        out = inv["output"]
        assert inv["module"] == "discount"
        assert out["totals"]["unpaid_liability"] == 3_000_000
        # 2023: 1M / 1.3^1.5 ; 2024: 2M / 1.3^2.5
        expected = 1_000_000 / (1.3 ** 1.5) + 2_000_000 / (1.3 ** 2.5)
        assert out["totals"]["discounted_unpaid"] == pytest.approx(round(expected), abs=2)

    def test_curve_mode_uses_node_rates(self, all_modules):
        inv = _call_one(all_modules, "compute_discount", {
            "rate_mode": "curve",
            "curve_nodes": [{"month": 0, "rate": 0.20}, {"month": 24, "rate": 0.40}],
        })
        out = inv["output"]
        assert "error" not in out
        # 2024 avg_month=30 → 24'ten büyük → %40 oran kullanılır
        row_2024 = next(r for r in out["by_origin"] if r["origin"] == "2024")
        assert row_2024["discount_factor"] == pytest.approx(1 / (1.4 ** (30 / 12)), abs=1e-3)

    def test_missing_pattern_errors(self, discount_payload):
        discount_payload["session_state"]["branches"][0]["has_cashflow_pattern"] = False
        modules = {"discount": discount_payload}
        inv = _call_one(modules, "compute_discount", {"rate_mode": "flat", "flat_rate": 0.3})
        assert "error" in inv["output"]


# ─── Yönlendirme hataları ───────────────────────────────────────────────────────


class TestRoutingErrors:
    def test_tool_not_owned_by_active_modules_errors(self, data_payload):
        """Sadece data modülü aktifken bir reserve tool'u çağrılırsa, hiçbir
        aktif modül sahiplenmediği için hata dönmeli (LLM kendini düzeltsin)."""
        inv = _call_one({"data": data_payload}, "get_analysis_state", {})
        assert inv["module"] is None
        assert "bulunamadı" in inv["output"]["error"].lower()

    def test_all_registry_modules_present(self):
        assert set(REGISTRY) == {"reserve", "cashflow", "discount", "data"}


class TestFrequencySeverityRouting:
    """simulate_frequency_severity reserve modülüne ait; count_triangle payload'dan
    loop ctx'i üzerinden tool'a ulaşmalı."""

    def _reserve_with_counts(self) -> dict:
        return {
            "reserve": {
                "triangle": {
                    "origin_periods": ["2020", "2021"],
                    "development_periods": [0, 1],
                    "values": [[1000.0, 1800.0], [1320.0, None]],
                    "triangle_type": "incurred",
                },
                "count_triangle": {
                    "origin_periods": ["2020", "2021"],
                    "development_periods": [0, 1],
                    "values": [[10.0, 15.0], [12.0, None]],
                    "triangle_type": "paid",
                },
                "session_state": {"active": {"branch_name": "T"}, "periods": []},
            }
        }

    def test_owned_by_reserve(self):
        names = {s["function"]["name"] for s in reserve_module.tool_schemas}
        assert "simulate_frequency_severity" in names

    def test_count_triangle_reaches_tool(self):
        inv = _call_one(self._reserve_with_counts(), "simulate_frequency_severity", {})
        assert inv["module"] == "reserve"
        assert "error" not in inv["output"]
        assert len(inv["output"]["rows"]) == 2

    def test_missing_count_triangle_graceful_error(self):
        payload = self._reserve_with_counts()
        del payload["reserve"]["count_triangle"]
        inv = _call_one(payload, "simulate_frequency_severity", {})
        assert "error" in inv["output"]
        assert "Adet üçgeni" in inv["output"]["error"]

# ─── Tam kapsama: her tool bir modüle ait + dispatch edilebilir ──────────────────


# Parametre zorunlu tool'lar için minimal geçerli argümanlar. Burada olmayanlar
# parametresiz çağrılır.
_MINIMAL_ARGS: dict[str, dict] = {
    "select_branch": {"branch_id": "b1"},
    "get_branch_state": {"branch_id": "b1"},
    "exclude_cells": {"cells": [{"origin": "2024", "step": 0}]},
    "include_cells": {"cells": [{"origin": "2024", "step": 0}]},
    "exclude_outliers": {"threshold_pct": 10},
    "set_window": {"window": "5"},
    "set_selected_loss_ratio": {"origin": "2024", "formula": "0.7"},
    "set_selected_loss_ratios": {"items": [{"origin": "2024", "formula": "0.7"}]},
    "set_premium": {"origin": "2024", "value": 100.0},
    "set_premiums": {"items": [{"origin": "2024", "value": 100.0}]},
    "set_basis": {"origin": "2024", "basis": "bf"},
    "set_basis_bulk": {"items": [{"origin": "2024", "basis": "bf"}]},
    "set_correction": {"origin": "2024", "value": 4},
    "set_corrections": {"items": [{"origin": "2024", "value": 4}]},
    "set_cdf_user_value": {"dev_period": "1", "value": 1.0},
    "set_cdf_choice": {"dev_period": "1", "choice": "user"},
    "set_cdf_choices": {"items": [{"dev_period": "1", "choice": "user"}]},
    "simulate_bf": {"origin": "2024", "loss_ratio": 0.7},
    "simulate_bf_formula": {"formula": "0.7", "origin": "2024"},
    "exclude_cashflow_cells": {"cells": [{"origin": "2024", "step": 0}]},
    "set_cashflow_cdf_user_value": {"dev_period": "1", "value": 1.05},
    "set_cashflow_window": {"window": "5"},
    "set_cashflow_cdf_model": {"dev_period": "1", "model": 2},
    "set_cashflow_cdf_model_bulk": {"items": [{"dev_period": "1", "model": 2}]},
    "compute_discount": {"rate_mode": "flat", "flat_rate": 0.3},
    "navigate_to": {"module": "home"},
}

_ROUTING_ERROR_MARKERS = (
    "Tool bulunamadı",
    "Tool dispatch hatası",
    "Tool çalıştırma hatası",
)


class TestToolCoverage:
    def test_every_schema_owned_by_exactly_one_module(self):
        """TOOL_SCHEMAS'taki her tool tam olarak bir modüle ait olmalı —
        sahipsiz tool 'aktif modüllerden hiçbiri sahiplenmiyor' hatası üretir."""
        from app.agent.tools import TOOL_SCHEMAS

        all_names = {s["function"]["name"] for s in TOOL_SCHEMAS}
        owned: set[str] = set()
        for mod in (reserve_module, cashflow_module, discount_module, data_module):
            owned |= {s["function"]["name"] for s in mod.tool_schemas}
        assert owned == all_names, (
            f"Sahipsiz tool'lar: {all_names - owned}; "
            f"şemasız modül tool'ları: {owned - all_names}"
        )

    def test_every_tool_dispatches_without_routing_error(self, all_modules):
        """Her şema adı, tüm modüller aktifken minimal argümanla çağrılınca
        bir routing/dispatch hatasına düşmemeli. Kontrollü iş hataları
        (örn. 'aktif branş gerektirir') serbesttir."""
        from app.agent.tools import TOOL_SCHEMAS

        for s in TOOL_SCHEMAS:
            name = s["function"]["name"]
            inv = _call_one(all_modules, name, _MINIMAL_ARGS.get(name, {}))
            out = inv["output"]
            assert isinstance(out, dict), f"{name}: dict bekleniyordu"
            err = str(out.get("error", ""))
            for marker in _ROUTING_ERROR_MARKERS:
                assert marker not in err, f"{name}: {err}"


class TestDispatchRobustness:
    def test_tool_exception_returns_error_instead_of_crash(self, all_modules, monkeypatch):
        """Tool içi beklenmedik exception turu öldürmemeli — modele hata olarak
        dönmeli (aksi halde API 502 verir)."""

        def boom(name, args, ctx):
            raise RuntimeError("patladı")

        monkeypatch.setattr(reserve_module, "dispatch", boom)
        inv = _call_one(all_modules, "get_analysis_state", {})
        assert "Tool çalıştırma hatası" in inv["output"]["error"]
        assert "patladı" in inv["output"]["error"]


class TestActiveBranchWriteGuard:
    def test_write_without_active_branch_errors(self, reserve_payload):
        """Aktif branş yokken yazma tool'u 'başarılı' dönmemeli — frontend
        action'ı sessizce düşürür, agent yanlış 'yaptım' der."""
        reserve_payload["session_state"]["active"] = None
        inv = _call_one({"reserve": reserve_payload}, "set_window", {"window": "5"})
        assert "Aktif branş yok" in inv["output"]["error"]

    def test_write_with_active_branch_emits_action(self, all_modules):
        client = _mock_client(
            ToolCall(id="t1", name="set_window", arguments={"window": "5"})
        )
        result = run_agent_turn(
            client=client,
            messages=[{"role": "user", "content": "x"}],
            modules_payload=all_modules,
        )
        assert result.actions and result.actions[0]["type"] == "set_window"
        assert result.actions[0]["module"] == "reserve"
