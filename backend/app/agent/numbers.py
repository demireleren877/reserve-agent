"""Metindeki sayıları okuma — model cevapları ve korumalar için.

Modeller ayraçları tutarsız kullanıyor (1.234.567,89 / 1,234,567.89), eksi için
unicode "−" ya da "–" yazıyor, "183,2 milyon" diyor. Eval denetleyicisinde
olgunlaşan ayrıştırıcı; döngü korumaları da (işaret, dönem toplamı) bunu kullanır.
"""

from __future__ import annotations

import re

_MULT = {
    "bin": 1e3, "milyon": 1e6, "milyar": 1e9,
    "mn": 1e6, "mio": 1e6, "m": 1e6, "k": 1e3, "b": 1e9,
}

# Eksi işareti yalnız önünde harf/rakam yoksa işarettir: "2021-2023" bir
# aralıktır, -2023 değil.
_SIGN = r"(?:(?<![\w.,])-)?"
_NUM = re.compile(
    rf"({_SIGN}\d{{1,3}}(?:[.,]\d{{3}})+(?:[.,]\d+)?|{_SIGN}\d+(?:[.,]\d+)?)"
    r"\s*(bin|milyon|milyar|mn|mio|m|k|b)?\b",
    re.IGNORECASE,
)
# Muhasebe gösterimi: (1.234.567) = -1.234.567. Yalnız binlik ayraçlı sayılar —
# "(2025)" gibi parantez içi yıllar eksiye dönmesin.
_PAREN_NEG = re.compile(r"\(\s*(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?)\s*\)")
_NEG_WORDS = ("negatif", "eksi", "negative", "minus")


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
    """Metindeki tüm sayıları işaretleriyle okur ('183,2 milyon' dahil).

    Modeller eksi için sık sık unicode '−' (U+2212) ya da '–' kullanıyor;
    eskiden bunlar düşüyor ve -190,6 milyon pozitif okunuyordu.
    """
    out: list[float] = []
    text = (text or "").replace("\u2212", "-").replace("\u2013", "-")
    text = _PAREN_NEG.sub(r"-\1", text)
    for raw, suffix in _NUM.findall(text):
        val = _to_float(raw)
        if val is None:
            continue
        out.append(val * _MULT[suffix.lower()] if suffix else val)
        # "-1.212 milyon": tek ayraç + 3 haneli kuyruk binlik sayıldığı için
        # 1,2 milyar okunuyordu. Birim takısı varken ondalık okuma da geçerli —
        # ikisini de ekle (has_number herhangi birini arar).
        body = raw.lstrip("-")
        if suffix and body.count(".") + body.count(",") == 1:
            head, _, tail = body.replace(",", ".").partition(".")
            if len(tail) == 3:
                alt = float(f"{head}.{tail}") * _MULT[suffix.lower()]
                out.append(-alt if raw.startswith("-") else alt)
    return out


def has_number(text: str, target: float, tol: float = 0.02) -> bool:
    """Hedef sayı metinde DOĞRU İŞARETLE geçiyor mu (yüzde tolerans).

    Eskiden işaret duyarsızdı. SEM01'de bu, -183.221.236'lık IBNR'ı işaretsiz
    yazıp "Selected Ultimate" diye sunan bir cevabı geçirdi — negatif IBNR
    aktüeryal olarak anlamlı bir işaret ve düşürülmesi yanıltıcı. Negatif hedef
    için sayı ya eksiyle yazılmış olmalı ya da metin bunu söze dökmüş olmalı
    ("negatif IBNR 183 milyon").
    """
    nums = numbers_in(text)
    if target == 0:
        return any(abs(v) < 1 for v in nums)
    t = abs(target)
    close = [v for v in nums if abs(abs(v) - t) <= tol * t]
    if not close:
        return False
    if target > 0:
        return any(v > 0 for v in close)
    low = (text or "").lower()
    return any(v < 0 for v in close) or any(w in low for w in _NEG_WORDS)
