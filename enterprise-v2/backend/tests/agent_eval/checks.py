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


def evaluate(case: dict, answer: str, tools_called: list[str]) -> tuple[bool, list[str]]:
    """(geçti_mi, kusur_listesi)"""
    problems: list[str] = []
    low = (answer or "").lower()

    want = case.get("expect_tools")
    if want and not (set(want) & set(tools_called)):
        problems.append(f"beklenen araçlardan hiçbiri çağrılmadı: {want} (çağrılan: {tools_called or '—'})")

    for t in case.get("forbid_tools", []):
        if t in tools_called:
            problems.append(f"çağrılmaması gereken araç çağrıldı: {t}")

    for target in case.get("expect_numbers", []):
        if not has_number(answer, target, case.get("tol", 0.02)):
            problems.append(f"beklenen değer cevapta yok: {target:,.0f}")

    for s in case.get("expect_text", []):
        if s.lower() not in low:
            problems.append(f"beklenen ifade yok: {s!r}")

    for s in case.get("forbid_text", []):
        if s.lower() in low:
            problems.append(f"olmaması gereken ifade var: {s!r}")

    if case.get("require_nonempty", True) and not (answer or "").strip():
        problems.append("cevap boş")

    return (not problems), problems
