"""Durum bloğunun KAPSAMI.

Blok her turda sistem promptuna giriyor ve model çoğu "toplam" sorusunu
araç çağırmadan buradan cevaplıyor. Dolayısıyla bloğun yanlış okunabilir
olması, doğrudan kullanıcıya yanlış sayı gitmesi demek.

Regresyon: branşlar düz liste halindeydi ve Haiku "Toplam IBNR ne kadar?"
sorusuna DÖRT satırı toplayarak cevap verdi — 2026Q1 ve 2026Q2 ardışık
değerlemeler olduğu için bu aynı rezervi iki kez saymak.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.agent.loop import _STATE_BLOCK_BOUNDARY
from app.agent.modules.reserve import _reserve_context

STATE = {
    "active": {"period_id": "p2", "period_label": "2026Q2",
               "branch_id": "p2-fire", "branch_name": "FIRE", "frequency": "quarterly"},
    "periods": [
        {"id": "p2", "label": "2026Q2", "branches": [
            {"id": "p2-fire", "name": "FIRE", "frequency": "quarterly",
             "is_active": True, "has_triangle": True, "totals": {"ibnr": -100.0}},
            {"id": "p2-eng", "name": "ENG", "frequency": "quarterly",
             "has_triangle": True, "totals": {"ibnr": -20.0}},
        ]},
        {"id": "p1", "label": "2026Q1", "branches": [
            {"id": "p1-fire", "name": "FIRE", "frequency": "quarterly",
             "has_triangle": True, "totals": {"ibnr": -70.0}},
            {"id": "p1-eng", "name": "ENG", "frequency": "quarterly",
             "has_triangle": True, "totals": {"ibnr": 5.0}},
        ]},
    ],
}


def test_branches_are_grouped_under_their_period():
    out = _reserve_context(STATE)
    assert "2026Q2" in out and "2026Q1" in out
    q2 = out.index("2026Q2")
    q1 = out.index("2026Q1")
    # p2-fire ve p2-eng, 2026Q1 başlığından ÖNCE gelmeli
    assert q2 < out.index("p2-eng") < q1, out


def test_each_period_carries_its_own_subtotal():
    """Model satırları kendi toplamasın diye alt toplam HAZIR verilir."""
    out = _reserve_context(STATE)
    assert "-120" in out, out   # 2026Q2: -100 + -20
    assert "-65" in out, out    # 2026Q1: -70 + 5


def test_active_period_is_marked():
    assert "[AKTİF DÖNEM]" in _reserve_context(STATE)


def test_no_cross_period_total_is_printed():
    """Dört branşın toplamı (-185) blokta GÖRÜNMEMELİ — anlamsız bir sayı."""
    assert "-185" not in _reserve_context(STATE)


def test_counts_fall_back_to_the_listing():
    """totals_all_branches boşsa sayım listeden türetilir.

    Eskiden '0 branş' yazarken altında dört branş listeliyordu; model
    'bu projede branş yok' diyebiliyordu.
    """
    out = _reserve_context(STATE)
    assert "4 branş" in out, out
    assert "0 branş" not in out


def test_active_period_total_is_used_when_supplied():
    state = dict(STATE, totals_all_branches={"branch_count": 4,
                                             "branch_with_data_count": 4,
                                             "active_period_ibnr": -120.0})
    assert "aktif dönem toplam IBNR" in _reserve_context(state)


def test_boundary_forbids_summing_periods():
    assert "TOPLAMA" in _STATE_BLOCK_BOUNDARY
    assert "AKTİF DÖNEMİ" in _STATE_BLOCK_BOUNDARY



def test_below_paid_stays_out_of_the_block():
    """Uyarı blokta değil, get_analysis_state'te.

    Blokta tutarla yazıldığında Qwen 3.5 9B toplam farkı "Selected Ultimate"
    diye sundu (SEM01, SEM02, T3). Tutarsız yazıldığında bile T1 6'da 5'ten
    6'da 2'ye düştü (uyarılı/uyarısız A/B, 6'şar koşu).
    """
    state = dict(STATE, method="volume_weighted", window="all",
                 ultimate_below_paid=[{"origin": "2025", "ultimate": 54.0, "paid": 202.0, "gap": -148.0}])
    assert "UYARI" not in _reserve_context(state)


def test_get_analysis_state_reports_ultimate_below_paid():
    from app.agent.tools import dispatch_tool
    from app.core.triangle import Triangle, TriangleType
    tri = Triangle(origin_periods=["2024", "2025"], development_periods=[0, 1],
                   values=[[100.0, 150.0], [120.0, None]], triangle_type=TriangleType.INCURRED)
    rows = [{"origin": "2025", "ultimate": 54.0, "paid": 202.0, "gap": -148.0}]
    ss = {"active": {"branch_id": "b1", "branch_name": "FIRE", "period_label": "2026Q2"},
          "ultimate_below_paid": rows}
    out = dispatch_tool("get_analysis_state", {}, triangle=tri, session_state=ss)
    ubp = out["ultimate_below_paid"]
    assert ubp["origins"] == [{"origin": "2025", "selected_ultimate": 54.0, "paid_to_date": 202.0}]
    assert "IBNR DEĞİLDİR" in ubp["note"]
    assert "gap" not in str(ubp)  # model farkı IBNR sanıyordu


def test_list_project_is_a_summary_whatever_the_snapshot_carries():
    """list_project izin listesiyle döner: bridge'e yeni ağır alan eklense de sızmaz."""
    import json
    from app.agent.tools import dispatch_tool
    heavy = {"per_origin": [{"origin": str(y), "ibnr": 1.0} for y in range(2000, 2026)],
             "curve_state": {"rows": list(range(500))},
             "ultimate_below_paid": [{"origin": "2025", "gap": -1.0}] * 18,
             "some_future_field": "x" * 5000}
    ss = {"active": STATE["active"], "periods": [
        dict(p, branches=[dict(b, **heavy) for b in p["branches"]]) for p in STATE["periods"]]}
    out = dispatch_tool("list_project", {}, session_state=ss)
    b = out["periods"][0]["branches"][0]
    for k in heavy:
        assert k not in b, k
    assert b["ultimate_below_paid_count"] == 18
    assert b["totals"]["ibnr"] == -100.0
    assert len(json.dumps(out)) < 3000
