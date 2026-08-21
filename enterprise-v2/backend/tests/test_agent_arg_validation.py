"""Tool argüman doğrulaması — sessiz model bozulmasına karşı regresyon.

NEDEN: LLM 45+ araç arasında argüman adını karıştırır ("premium" yerine
"value", "dev_period" yerine "step"). Doğrulama yokken eksik argüman tool
içinde bir varsayılana düşüyordu ve tool BAŞARILI görünen bir _action
üretiyordu:

    set_premium(origin="2024")        → value 0.0   → prim sıfırlanır, BF çöker
    set_cdf_user_value(dev_period=…)  → value 1.0   → kuyruk kesilir
    set_selected_loss_ratio(origin=…) → formula ""  → BF oranı silinir
    set_window()                      → "all"       → pencere sıfırlanır

Agent "yaptım" diyor, kullanıcının modeli sessizce bozuluyor. Bu testler
eksik/yanlış argümanın MUTLAKA hata döndürmesini ve hiçbir _action
üretmemesini sabitler.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest

from app.agent.tools import TOOL_SCHEMAS, dispatch_tool
from app.core.triangle import Triangle, TriangleType


def _triangle() -> Triangle:
    return Triangle(
        origin_periods=["2021", "2022", "2023"],
        development_periods=[0, 1, 2],
        values=[[100.0, 150.0, 165.0], [120.0, 180.0, None], [130.0, None, None]],
        triangle_type=TriangleType.PAID,
    )


def _session_state() -> dict:
    return {
        "active": {"period_id": "p1", "branch_id": "b1", "branch_name": "Test"},
        "per_origin": [
            {"origin": "2023", "latest": 130.0, "cdf": 1.65, "cl_ultimate": 214.5,
             "premium": 200.0, "premium_annual": 200.0, "correction": 1.0,
             "selected_ultimate": 214.5, "ibnr": 84.5, "basis": "cl"},
        ],
    }


def _call(name: str, args: dict) -> dict:
    return dispatch_tool(name, args, triangle=_triangle(), session_state=_session_state())


# Eksik argüman → sessiz varsayılan yerine hata. (araç, eksik bırakılan argüman)
MISSING_CASES = [
    ("set_premium", {"origin": "2023"}, "value"),
    ("set_correction", {"origin": "2023"}, "value"),
    ("set_selected_loss_ratio", {"origin": "2023"}, "formula"),
    ("set_cdf_user_value", {"dev_period": "1"}, "value"),
    ("set_cdf_choice", {"dev_period": "1"}, "choice"),
    ("set_basis", {"origin": "2023"}, "basis"),
    ("set_window", {}, "window"),
    ("navigate_to", {}, "module"),
    ("simulate_bf", {"origin": "2023"}, "loss_ratio"),
]


@pytest.mark.parametrize("name,args,missing", MISSING_CASES)
def test_missing_required_arg_errors(name, args, missing):
    out = _call(name, args)
    assert "error" in out, f"{name}: eksik '{missing}' sessizce kabul edildi → {out}"
    assert missing in out["error"]
    assert "_action" not in out, f"{name}: hata dönerken yine de _action üretti"


@pytest.mark.parametrize("name,args,missing", MISSING_CASES)
def test_missing_required_arg_message_is_actionable(name, args, missing):
    """Mesaj modelin kendini düzeltmesine yetecek bilgiyi taşımalı."""
    err = _call(name, args)["error"]
    assert name in err                      # hangi araç
    assert "Beklenen" in err or "Geçerli" in err  # ne bekleniyordu


def test_wrong_arg_name_does_not_write():
    """'value' yerine 'premium' gönderilirse prim 0'a düşmemeli."""
    out = _call("set_premium", {"origin": "2023", "premium": 300.0})
    assert "error" in out and "_action" not in out


def test_enum_violation_lists_valid_values():
    out = _call("set_window", {"window": "9"})
    assert "error" in out
    assert "4" in out["error"] and "all" in out["error"]


def test_type_violation_rejected():
    out = _call("set_premium", {"origin": "2023", "value": "çok"})
    assert "error" in out and "_action" not in out


def test_bool_is_not_a_number():
    out = _call("set_premium", {"origin": "2023", "value": True})
    assert "error" in out


def test_nullable_param_accepts_none():
    """set_correction(value=None) meşru: 'düzeltme yok' demek."""
    out = _call("set_correction", {"origin": "2023", "value": None})
    assert "error" not in out
    assert out["_action"]["payload"]["value"] is None


def test_valid_calls_still_pass_through():
    out = _call("set_premium", {"origin": "2023", "value": 300.0})
    assert out["_action"]["payload"]["value"] == 300.0


def test_every_tool_rejects_empty_args_or_needs_none():
    """Zorunlu argümanı olan HİÇBİR araç boş çağrıyı sessizce kabul etmemeli."""
    offenders = []
    for schema in TOOL_SCHEMAS:
        fn = schema["function"]
        if not (fn["parameters"].get("required") or []):
            continue
        out = _call(fn["name"], {})
        if "error" not in out:
            offenders.append(fn["name"])
    assert not offenders, f"boş çağrıyı kabul eden araçlar: {offenders}"
