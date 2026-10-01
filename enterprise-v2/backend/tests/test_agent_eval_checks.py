"""Değerlendirme doğrulayıcısının kendi testleri.

checks.numbers_in tüm agent değerlendirmesini kapılıyor: yanlış ayrıştırırsa
doğru cevabı "yanlış" sayar (ya da tersi). Modeller ayraçları tutarsız
kullandığı için burada gerçek çıktılarda görülen biçimler sabitlenir.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest

from tests.agent_eval.checks import evaluate, has_number, numbers_in

FORMATS = [
    ("-183.221.236 TL", -183221236.0),          # TR binlik
    ("1,234,567.89 USD", 1234567.89),           # EN binlik + ondalık
    ("617,969,275.39", 617969275.39),
    ("-303,449,454,83 TL", -303449454.83),      # aynı ayraç: binlik VE ondalık
    ("-303.449.454,83", -303449454.83),
    ("12,5 milyon", 12_500_000.0),
    ("3 milyar", 3_000_000_000.0),
    ("%24,8", 24.8),
    ("0,207", 0.207),                           # oran — binlik DEĞİL
    ("0.148", 0.148),
    ("-0,032", -0.032),
    ("1.000.000", 1_000_000.0),
    ("1.234", 1234.0),
]


@pytest.mark.parametrize("text,expected", FORMATS)
def test_number_formats(text, expected):
    got = numbers_in(text)
    assert any(abs(g - expected) < 1e-6 for g in got), f"{text!r} → {got}"


def test_tolerance_matching():
    assert has_number("Toplam IBNR -183.221.236 TL", -183221236.47)
    # Eskiden işaret duyarsızdı ve bu satır geçiyordu; SEM01'de işaretsiz
    # yazılıp başka kavram gibi sunulan IBNR'ı geçirdi. İşaret ya da söz şart.
    assert not has_number("yaklaşık 183,2 milyon", -183221236.47)
    assert has_number("yaklaşık 183,2 milyon negatif", -183221236.47)
    assert not has_number("IBNR 5 milyon", -183221236.47)


def test_zero_target():
    assert has_number("IBNR sıfır (0)", 0.0)
    assert not has_number("IBNR 1.500", 0.0)


def test_evaluate_flags_missing_tool():
    ok, problems = evaluate({"expect_tools": ["get_branch_state"]}, {"answer": "cevap", "tools": ["get_analysis_state"], "actions": [], "stop": "final"})
    assert not ok and "get_branch_state" in problems[0]


def test_evaluate_flags_forbidden_text():
    ok, problems = evaluate({"forbid_text": ["kasko"]}, {"answer": "Kasko branşı 5 TL", "tools": [], "actions": [], "stop": "final"})
    assert not ok


def test_evaluate_flags_empty_answer():
    ok, problems = evaluate({}, {"answer": "   ", "tools": [], "actions": [], "stop": "final"})
    assert not ok and "boş" in problems[0]


def test_evaluate_passes_clean_case():
    ok, problems = evaluate(
        {"expect_tools": ["get_analysis_state"], "expect_numbers": [-183221236.47],
         "expect_text": ["ibnr"], "forbid_text": ["kasko"]},
        {"answer": "Toplam IBNR -183.221.236 TL", "tools": ["get_analysis_state"],
         "actions": [], "stop": "final"},
    )
    assert ok and not problems


def test_expect_any_actions_accepts_either():
    """Tekil/çoğul araç ikisi de meşru — 'herhangi biri' yeterli olmalı."""
    ok, _ = evaluate({"expect_any_actions": ["set_premium", "set_premiums"]},
                     {"answer": "ok", "tools": [], "actions": ["set_premiums"], "stop": "final"})
    assert ok
    ok, problems = evaluate({"expect_any_actions": ["set_premium", "set_premiums"]},
                            {"answer": "ok", "tools": [], "actions": ["set_basis"], "stop": "final"})
    assert not ok and "hiçbiri" in problems[0]


def test_expect_any_numbers_accepts_either():
    ok, _ = evaluate({"expect_any_numbers": [100.0, 250.0]},
                     {"answer": "sonuç 250", "tools": [], "actions": [], "stop": "final"})
    assert ok


def test_tool_sequence_requires_order():
    base = {"expect_tool_sequence": ["get_analysis_state", "simulate_bf"]}
    ok, _ = evaluate(base, {"answer": "x", "tools": ["get_analysis_state", "list_project",
                                                    "simulate_bf"], "actions": [], "stop": "final"})
    assert ok, "araya başka araç girmesi sırayı bozmamalı"
    ok, _ = evaluate(base, {"answer": "x", "tools": ["simulate_bf", "get_analysis_state"],
                            "actions": [], "stop": "final"})
    assert not ok, "ters sıra kabul edilmemeli"


def test_expect_text_accepts_synonym_group():
    """Liste verilince 'herhangi biri' yeterli — eşanlamlı kabulü."""
    ok, _ = evaluate({"expect_text": [["yıllık", "annual"]]},
                     {"answer": "annual bazda", "tools": [], "actions": [], "stop": "final"})
    assert ok


@pytest.mark.parametrize("text,expected", [
    ("toplam IBNR **−190.6 milyon** TL", -190_600_000),   # unicode eksi
    ("IBNR –7.355.063", -7_355_063),                      # uzun tire
    ("IBNR: (183.221.236)", -183_221_236),                # muhasebe parantezi
])
def test_negative_sign_variants(text, expected):
    assert numbers_in(text) == [expected]


def test_ranges_and_bracketed_years_stay_positive():
    assert numbers_in("2021-2023 arası") == [2021, 2023]
    assert numbers_in("origin (2025)") == [2025]


def test_negative_target_requires_the_sign_or_the_word():
    # SEM01 regresyonu: IBNR işaretsiz yazılıp "ultimate" diye sunuldu.
    assert not has_number("Selected Ultimate: 183.221.236 TL", -183_221_236)
    assert has_number("IBNR -183.221.236 TL", -183_221_236)
    assert has_number("IBNR −183,2 milyon", -183_221_236, tol=0.01)
    assert has_number("negatif IBNR 183,2 milyon", -183_221_236, tol=0.01)


def test_positive_target_rejects_a_negative_match():
    assert not has_number("ultimate -617.969.275", 617_969_275)
