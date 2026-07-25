"""Agent tool-call testleri — ult/IBNR/BF sayılarının DOĞRULUĞU.

Bu testler, agent'ın rapor ettiği ultimate/IBNR/BF değerlerinin kullanıcının
UI'de gördüğü YAPILANDIRILMIŞ modelle tutarlı olduğunu kanıtlar. Özellikle:

  * run_chain_ladder PARAMETRESİZ çağrıldığında ham vanilla CL DEĞİL, kullanıcının
    yapılandırdığı modeli (CDF override / curve / cascade / hücre-eleme dahil)
    döndürmeli — aksi halde "ultimate full yanlış" olur (regresyon testi).
  * run_chain_ladder alternatif parametrelerle çağrılınca senaryo (ham) hesabı yapar.
  * simulate_bf, frontend BF formülüyle birebir aynı sonucu verir.
  * get_analysis_state snapshot'ı aynen (pass-through) döndürür.

pytest KURULU DEĞİLSE de çalışır:
    python3 tests/test_agent_tools.py
"""

from __future__ import annotations

import math
import os
import sys

# pytest'siz doğrudan çalıştırılabilmek için backend/ kökünü path'e ekle.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.agent.tools import dispatch_tool
from app.core.triangle import Triangle, TriangleType


# ── Sabit senaryo ────────────────────────────────────────────────────────────
# Kümülatif paid üçgen (3 origin × 3 dev):
#   2021: 100 → 150 → 165   (tam gelişmiş, latest 165 @dev2)
#   2022: 120 → 180 → -     (latest 180 @dev1)
#   2023: 130 → -   → -     (latest 130 @dev0)
#
# HAM volume-weighted LDF: dev0→1 = 330/220 = 1.5 ; dev1→2 = 165/150 = 1.1
# HAM CDF: dev0 = 1.65, dev1 = 1.1, dev2 = 1.0
# HAM CL:  2021=165, 2022=198 (rez 18), 2023=214.5 (rez 84.5) → toplam ult 577.5
def _triangle() -> Triangle:
    return Triangle(
        origin_periods=["2021", "2022", "2023"],
        development_periods=[0, 1, 2],
        values=[
            [100.0, 150.0, 165.0],
            [120.0, 180.0, None],
            [130.0, None, None],
        ],
        triangle_type=TriangleType.PAID,
    )


# YAPILANDIRILMIŞ model: kullanıcı dev0 CDF'ini 1.65 → 2.0 override etmiş.
#   2023 cl = 130 × 2.0 = 260 (ham 214.5 DEĞİL)  → toplam ult 623, IBNR 148
def _session_state() -> dict:
    per_origin = [
        {"origin": "2021", "latest": 165.0, "cdf": 1.0, "cl_ultimate": 165.0,
         "premium": 200.0, "premium_annual": 200.0, "correction": 1.0,
         "selected_ultimate": 165.0, "ibnr": 0.0, "basis": "cl"},
        {"origin": "2022", "latest": 180.0, "cdf": 1.1, "cl_ultimate": 198.0,
         "premium": 220.0, "premium_annual": 220.0, "correction": 1.0,
         "selected_ultimate": 198.0, "ibnr": 18.0, "basis": "cl"},
        {"origin": "2023", "latest": 130.0, "cdf": 2.0, "cl_ultimate": 260.0,
         "premium": 200.0, "premium_annual": 200.0, "correction": 1.0,
         "selected_ultimate": 260.0, "ibnr": 130.0, "basis": "cl"},
    ]
    return {
        "per_origin": per_origin,
        "total_ultimate": 623.0,
        "total_selected_ultimate": 623.0,
        "total_ibnr": 148.0,
        "total_selected_ibnr": 148.0,
        "total_latest": 475.0,
        "effective_cdfs": [2.0, 1.1, 1.0],
    }


def _close(a: float, b: float, tol: float = 1e-6) -> bool:
    return math.isclose(float(a), float(b), rel_tol=0, abs_tol=tol)


# ── Testler ──────────────────────────────────────────────────────────────────
def test_run_chain_ladder_no_args_reflects_configured_model():
    """REGRESYON: parametresiz run_chain_ladder = yapılandırılmış model, ham CL DEĞİL."""
    res = dispatch_tool(
        "run_chain_ladder", {},
        triangle=_triangle(), session_state=_session_state(),
    )
    assert res.get("source") == "configured_model", res
    assert _close(res["total_ultimate"], 623.0), res["total_ultimate"]
    assert _close(res["total_reserve"], 148.0), res["total_reserve"]
    # 2023: yapılandırılmış 260 olmalı, ham 214.5 DEĞİL
    i = res["origin_periods"].index("2023")
    assert _close(res["ultimate_per_origin"][i], 260.0), res["ultimate_per_origin"]
    assert _close(res["reserve_per_origin"][i], 130.0)
    # Ham vanilla değerlerine ASLA düşmemeli (bug'ın kanıtı)
    assert not _close(res["total_ultimate"], 577.5)


def test_run_chain_ladder_scenario_recomputes_raw():
    """Alternatif parametre (ldf_override) verilince ham CL senaryosu hesaplanır."""
    res = dispatch_tool(
        "run_chain_ladder",
        {"ldf_override": [1.5, 1.1]},
        triangle=_triangle(), session_state=_session_state(),
    )
    assert res.get("source") == "scenario_recompute", res
    assert _close(res["total_ultimate"], 577.5), res["total_ultimate"]
    i = res["origin_periods"].index("2023")
    assert _close(res["ultimate_per_origin"][i], 214.5), res["ultimate_per_origin"]


def test_run_chain_ladder_method_arg_is_scenario():
    """method verilmesi de senaryo modudur (yapılandırmayı değiştirmez)."""
    res = dispatch_tool(
        "run_chain_ladder",
        {"method": "volume_weighted"},
        triangle=_triangle(), session_state=_session_state(),
    )
    assert res.get("source") == "scenario_recompute", res
    assert _close(res["total_ultimate"], 577.5)


def test_get_analysis_state_is_passthrough():
    """get_analysis_state snapshot'ı aynen döndürür (yapılandırılmış totaller)."""
    res = dispatch_tool(
        "get_analysis_state", {},
        triangle=_triangle(), session_state=_session_state(),
    )
    assert _close(res["total_cl_ultimate"], 623.0), res
    assert _close(res["total_selected_ultimate"], 623.0)
    assert _close(res["total_selected_ibnr"], 148.0)
    assert len(res["per_origin"]) == 3


def test_simulate_bf_matches_frontend_formula():
    """simulate_bf, frontend BF formülüyle birebir aynı:
        pct_dev = 1/cdf ; bf_ult = latest + LR × premium_annual × (1 - pct_dev)
    2023: latest 130, cdf 2.0, premium_annual 200, LR 0.8
        pct_dev = 0.5 ; bf_ult = 130 + 0.8×200×0.5 = 210 ; ibnr = 80
    """
    res = dispatch_tool(
        "simulate_bf",
        {"origin": "2023", "loss_ratio": 0.8},
        triangle=None, session_state=_session_state(),
    )
    assert _close(res["inputs"]["pct_developed"], 0.5), res
    assert _close(res["inputs"]["premium_annual"], 200.0)
    assert _close(res["scenario_bf"]["bf_ultimate"], 210.0), res
    assert _close(res["scenario_bf"]["bf_ibnr"], 80.0), res


def test_simulate_bf_correction_aware():
    """Correction (annualization) k varsa BF formülü k-aware kalır.
    latest 180, cdf 1.1 → pct_dev = 1/1.1 = 0.90909..., unreported = 0.0909...
    premium_annual 220, LR 0.7 → bf_ult_annual = 180 + 0.7×220×0.0909 = 194.0
    k=1 → bf_ult = 194.0
    """
    res = dispatch_tool(
        "simulate_bf",
        {"origin": "2022", "loss_ratio": 0.7},
        triangle=None, session_state=_session_state(),
    )
    expected = 180 + 0.7 * 220 * (1 - 1 / 1.1)
    assert _close(res["scenario_bf"]["bf_ultimate"], expected, tol=1e-6), res


# ── pytest'siz çalıştırıcı ────────────────────────────────────────────────────
if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for t in tests:
        try:
            t()
            print(f"  PASS  {t.__name__}")
        except AssertionError as e:
            failed += 1
            print(f"  FAIL  {t.__name__}: {e}")
        except Exception as e:  # noqa: BLE001
            failed += 1
            print(f"  ERROR {t.__name__}: {type(e).__name__}: {e}")
    total = len(tests)
    print(f"\n{total - failed}/{total} geçti" + ("" if not failed else f" — {failed} BAŞARISIZ"))
    raise SystemExit(1 if failed else 0)
