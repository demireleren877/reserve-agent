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
    assert has_number("yaklaşık 183,2 milyon", -183221236.47)   # işaret duyarsız
    assert not has_number("IBNR 5 milyon", -183221236.47)


def test_zero_target():
    assert has_number("IBNR sıfır (0)", 0.0)
    assert not has_number("IBNR 1.500", 0.0)


def test_evaluate_flags_missing_tool():
    ok, problems = evaluate({"expect_tools": ["get_branch_state"]}, "cevap", ["get_analysis_state"])
    assert not ok and "get_branch_state" in problems[0]


def test_evaluate_flags_forbidden_text():
    ok, problems = evaluate({"forbid_text": ["kasko"]}, "Kasko branşı 5 TL", [])
    assert not ok


def test_evaluate_flags_empty_answer():
    ok, problems = evaluate({}, "   ", [])
    assert not ok and "boş" in problems[0]


def test_evaluate_passes_clean_case():
    ok, problems = evaluate(
        {"expect_tools": ["get_analysis_state"], "expect_numbers": [-183221236.47],
         "expect_text": ["ibnr"], "forbid_text": ["kasko"]},
        "Toplam IBNR -183.221.236 TL", ["get_analysis_state"],
    )
    assert ok and not problems
