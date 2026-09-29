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
