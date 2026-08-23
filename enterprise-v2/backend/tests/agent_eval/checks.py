"""Agent cevabını nesnel olarak doğrulayan yardımcılar.

Düzyazı kalitesini değil, KANITLANABİLİR olanı ölçeriz:
  * doğru aracı çağırdı mı, yasaklı aracı çağırdı mı
  * cevapta geçen sayı gerçek değerle tutuyor mu
  * uydurmaması gereken bir şeyi uydurdu mu
"""

from __future__ import annotations

import re

_MULT = {
    "bin": 1e3, "milyon": 1e6, "milyar": 1e9,
    "mn": 1e6, "mio": 1e6, "m": 1e6, "k": 1e3, "b": 1e9,
}

_NUM = re.compile(
    r"(-?\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?|-?\d+(?:[.,]\d+)?)"
    r"\s*(bin|milyon|milyar|mn|mio|m|k|b)?\b",
    re.IGNORECASE,
)


def _to_float(raw: str) -> float | None:
    """Sayıyı biçiminden bağımsız oku.

    Modeller ayraçları tutarsız kullanıyor: "1.234.567,89" (TR),
    "1,234,567.89" (EN), hatta "303,449,454,83" (binlik ve ondalık için AYNI
    ayraç). Kural: iki ayraç da varsa SONUNCUSU ondalıktır; tek tür ayraç
    varsa son grup 3 hane değilse o ondalıktır.
    """
    s = raw.strip()
    has_dot, has_comma = "." in s, "," in s

    if has_dot and has_comma:
        dec = "." if s.rfind(".") > s.rfind(",") else ","
        thou = "," if dec == "." else "."
        s = s.replace(thou, "").replace(dec, ".")
    elif has_dot or has_comma:
        sep = "." if has_dot else ","
        head, _, tail = s.rpartition(sep)
        # Son grup 3 hane → binlik ayracı; değilse ondalık. Ama binlik gruplama
        # sıfırla başlamaz: "0,207" oran demektir, 207 değil.
        thousands = len(tail) == 3 and bool(head) and not head.lstrip("-").startswith("0")
        s = head.replace(sep, "") + ("" if thousands else ".") + tail

    try:
        return float(s)
    except ValueError:
        return None


def numbers_in(text: str) -> list[float]:
    """Metindeki tüm sayıları mutlak değere çevirir ('183,2 milyon' dahil)."""
    out: list[float] = []
    for raw, suffix in _NUM.findall(text or ""):
        val = _to_float(raw)
        if val is None:
            continue
        out.append(val * _MULT[suffix.lower()] if suffix else val)
    return out


def has_number(text: str, target: float, tol: float = 0.02) -> bool:
    """Hedef sayı metinde geçiyor mu (yüzde tolerans, işaret duyarsız)."""
    if target == 0:
        return any(abs(v) < 1 for v in numbers_in(text))
    t = abs(target)
    return any(abs(abs(v) - t) <= tol * t for v in numbers_in(text))


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

    if case.get("read_only") and actions:
        problems.append(f"okuma sorusu yazma aksiyonu üretti: {actions}")

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
