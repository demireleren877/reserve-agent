"""compute_discount ile İskonto ekranı aynı rakamı söylemeli.

Regresyon: bridge iskonto branşlarına hiç `per_origin` göndermiyordu ve araç
her çağrıda "iskonto edilecek ödeme satırı yok" diyordu — ajanın özel oran /
IFRS 17 eğrisi hesabı hiç çalışmadı. Eval yalnız aracın ÇAĞRILDIĞINA baktığı
için bu görünmedi.

Aynı satırlar frontend testinde (discount-parity.test.ts) arayüz motoruna
verilir ve AYNI sabitler beklenir. Sabitler formülden bağımsız hesaplandı.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.agent.tools import dispatch_tool

PER_ORIGIN = [
    {"origin": "2022", "unpaid": -50_000, "months": [[12, 1.0]]},
    {"origin": "2023", "unpaid": 1_000_000, "months": [[6, 0.5], [18, 0.3], [30, 0.2]]},
    {"origin": "2024", "unpaid": 2_500_000, "months": [[3, 0.4], [15, 0.4], [40, 0.2]]},
    {"origin": "2025", "unpaid": 400_000, "months": []},  # desensiz → BEL'e 0
]


def _state(per_origin):
    return {"branches": [{
        "branch_id": "b1", "branch_name": "FIRE", "is_active": True,
        "has_cashflow_pattern": True, "per_origin": per_origin,
    }], "active_branch_id": "b1"}


def _bel(**args):
    r = dispatch_tool("compute_discount", {"standard": "ifrs4", **args}, session_state=_state(PER_ORIGIN))
    assert "error" not in r, r
    return r["totals"]


def test_flat_30_matches_screen():
    t = _bel(rate_mode="flat", flat_rate=0.30)
    assert t["unpaid_liability"] == 3_850_000
    assert t["discounted_unpaid"] == round(2_571_693.617067)


def test_default_curve_matches_screen():
    assert _bel(rate_mode="curve")["discounted_unpaid"] == round(2_630_228.273401)


def test_legacy_rows_without_months_still_work():
    """Eski bridge sürümü (avg_month) gönderirse araç yine hesap yapar."""
    r = dispatch_tool("compute_discount", {"standard": "ifrs4", "rate_mode": "flat", "flat_rate": 0.30},
                      session_state=_state([{"origin": "2023", "unpaid": 1_000_000, "avg_month": 12}]))
    assert r["totals"]["discounted_unpaid"] == round(1_000_000 / 1.3)
