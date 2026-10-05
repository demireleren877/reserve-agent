"""Agent cevabını nesnel olarak doğrulayan yardımcılar.

Düzyazı kalitesini değil, KANITLANABİLİR olanı ölçeriz:
  * doğru aracı çağırdı mı, yasaklı aracı çağırdı mı
  * cevapta geçen sayı gerçek değerle tutuyor mu
  * uydurmaması gereken bir şeyi uydurdu mu
"""

from __future__ import annotations

import re

from app.agent.numbers import (  # noqa: E402,F401 — tek kaynak
    _MULT, _NEG_WORDS, _NUM, _PAREN_NEG, _SIGN, _to_float, has_number, numbers_in,
)

def _subsequence(needle: list[str], haystack: list[str]) -> bool:
    """needle, haystack içinde SIRAYI koruyarak geçiyor mu (araya başka araç girebilir)."""
    it = iter(haystack)
    return all(any(n == h for h in it) for n in needle)


def evaluate(case: dict, result: dict) -> tuple[bool, list[str]]:
    """(geçti_mi, kusur_listesi)

    result: {"answer": str, "tools": [ad], "actions": [tip], "stop": str}
    Çok turlu senaryolarda bunlar TÜM turların birleşimidir; son turun cevabı
    "answer" olarak gelir.
    """
    problems: list[str] = []
    answer = result.get("answer") or ""
    tools = result.get("tools") or []
    actions = result.get("actions") or []
    low = answer.lower()

    want = case.get("expect_tools")
    if want and not (set(want) & set(tools)):
        problems.append(f"beklenen araçlardan hiçbiri çağrılmadı: {want} (çağrılan: {tools or '—'})")

    for t in case.get("forbid_tools", []):
        if t in tools:
            problems.append(f"çağrılmaması gereken araç çağrıldı: {t}")

    seq = case.get("expect_tool_sequence")
    if seq and not _subsequence(seq, tools):
        problems.append(f"araç sırası tutmadı: beklenen {seq}, gerçekleşen {tools}")

    any_actions = case.get("expect_any_actions")
    if any_actions and not (set(any_actions) & set(actions)):
        problems.append(
            f"beklenen aksiyonlardan hiçbiri üretilmedi: {any_actions} (üretilen: {actions or '—'})"
        )

    any_numbers = case.get("expect_any_numbers")
    if any_numbers and not any(
        has_number(answer, t, case.get("tol", 0.02)) for t in any_numbers
    ):
        problems.append(
            "beklenen değerlerden hiçbiri cevapta yok: "
            + ", ".join(f"{t:,.0f}" for t in any_numbers)
        )

    for a in case.get("expect_actions", []):
        if a not in actions:
            problems.append(f"beklenen aksiyon üretilmedi: {a} (üretilen: {actions or '—'})")

    for a in case.get("forbid_actions", []):
        if a in actions:
            problems.append(f"üretilmemesi gereken aksiyon: {a}")

    # navigate_to yalnız sekmeyi değiştirir, veri yazmaz ("iskontoyu hesapla"
    # komutunda iskonto sekmesini açmak makul) — okuma-yalnız ölçütünü bozmaz.
    writes = [a for a in actions if a != "navigate_to"]
    if case.get("read_only") and writes:
        problems.append(f"okuma sorusu yazma aksiyonu üretti: {writes}")

    mx = case.get("max_tools")
    if mx is not None and len(tools) > mx:
        problems.append(f"gereğinden fazla araç çağrısı: {len(tools)} > {mx} ({tools})")

    stop = case.get("expect_stop")
    if stop and result.get("stop") != stop:
        problems.append(f"tur durumu {result.get('stop')!r}, beklenen {stop!r}")

    for target in case.get("expect_numbers", []):
        if not has_number(answer, target, case.get("tol", 0.02)):
            problems.append(f"beklenen değer cevapta yok: {target:,.0f}")

    for target in case.get("forbid_numbers", []):
        if has_number(answer, target, case.get("tol", 0.02)):
            problems.append(f"cevapta olmaması gereken değer var: {target:,.0f}")

    for group in case.get("expect_text", []):
        # Liste verilirse "herhangi biri" yeterli (eşanlamlı kabulü).
        opts = group if isinstance(group, (list, tuple)) else [group]
        if not any(str(o).lower() in low for o in opts):
            problems.append(f"beklenen ifade yok: {opts!r}")

    for s_ in case.get("forbid_text", []):
        if str(s_).lower() in low:
            problems.append(f"olmaması gereken ifade var: {s_!r}")

    if case.get("require_nonempty", True) and not answer.strip():
        problems.append("cevap boş")

    return (not problems), problems
