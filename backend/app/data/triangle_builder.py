"""Ham ClaimRecord listesinden aktüeryal üçgen oluşturur."""

from __future__ import annotations

import re
from collections import defaultdict
from datetime import date
from typing import Literal

from app.core.triangle import Granularity, Triangle, TriangleType

# ─── Tarih çözümleme ──────────────────────────────────────────────────────────

_YYYYQQ_RE = re.compile(r"^(\d{4})[Qq]([1-4])$")
_YYYY_RE = re.compile(r"^(\d{4})$")


def _parse_period(s: str, granularity: Granularity) -> tuple[str, int]:
    """
    Tarih string'inden (hasar_tarihi veya gelisim_tarihi) origin period label'ı
    ve global sequence index'i döner. Index karşılaştırmak için kullanılır.
    """
    s = str(s).strip()

    # yyyyQq formatı
    m = _YYYYQQ_RE.match(s)
    if m:
        y, q = int(m.group(1)), int(m.group(2))
        if granularity == Granularity.YEARLY:
            return str(y), y * 4
        return f"{y}Q{q}", y * 4 + q

    # yyyy formatı
    m = _YYYY_RE.match(s)
    if m:
        y = int(m.group(1))
        if granularity == Granularity.YEARLY:
            return str(y), y * 4
        return str(y), y * 4 + 1  # yılı Q1 olarak kabul et

    # ISO / gün formatları (YYYY-MM-DD vs.)
    for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%d/%m/%Y", "%Y-%m-%d %H:%M:%S"):
        try:
            d = date.fromisoformat(s[:10]) if fmt == "%Y-%m-%d" else None
            if d is None:
                from datetime import datetime
                d = datetime.strptime(s, fmt).date()
            y, mo = d.year, d.month
            q = (mo - 1) // 3 + 1
            if granularity == Granularity.YEARLY:
                return str(y), y * 4
            return f"{y}Q{q}", y * 4 + q
        except Exception:
            continue

    raise ValueError(f"Tarih çözümlenemedi: {s!r}")


# ─── Ana fonksiyon ────────────────────────────────────────────────────────────

def build_triangle(
    records: list[dict],
    brans: str,
    triangle_type: Literal["paid", "incurred"],
    origin_granularity: Literal["yearly", "quarterly"],
    development_granularity: Literal["yearly", "quarterly"],
) -> Triangle:
    """
    Filtrelenmiş kayıtlardan kümülatif üçgen üretir.

    records: ClaimRecord dict listesi (hasar_tarihi, gelisim_tarihi string)
    """
    orig_gran = Granularity(origin_granularity)
    dev_gran = Granularity(development_granularity)

    # Brans filtresi
    filtered = [r for r in records if str(r.get("brans", "")).strip() == brans]
    if not filtered:
        raise ValueError(f"'{brans}' branşına ait kayıt bulunamadı")

    # Her (hasar_period_seq, dev_period_seq) hücresindeki değeri topla
    cell_sums: dict[tuple[int, int], float] = defaultdict(float)
    origin_map: dict[int, str] = {}   # seq → label
    dev_map: dict[int, str] = {}

    for r in filtered:
        try:
            orig_label, orig_seq = _parse_period(str(r["hasar_tarihi"]), orig_gran)
            dev_label, dev_seq = _parse_period(str(r["gelisim_tarihi"]), dev_gran)
        except ValueError:
            continue  # parse edilemeyen satırı atla

        if dev_seq < orig_seq:
            continue  # gelişim tarihi hasar tarihinden önce — anlamsız

        origin_map[orig_seq] = orig_label
        dev_map[dev_seq] = dev_label

        if triangle_type == "paid":
            val = float(r.get("odeme") or 0)
        else:
            val = float(r.get("odeme") or 0) + float(r.get("muallak") or 0)

        cell_sums[(orig_seq, dev_seq)] += val

    if not origin_map:
        raise ValueError("Geçerli kayıt bulunamadı")

    # Sıralı period listeleri
    origin_seqs = sorted(origin_map.keys())
    dev_seqs = sorted(dev_map.keys())

    # Development age (1-based) hesapla
    # Sütun indeksi: dev_seq - origin_seq, cinsinden period sayısı
    # Her origin için o origin_seq'in başlangıcından itibaren age hesaplanır
    # Farklı origin'ler farklı dev_seq'te başlayabilir; en küçük farkı 1 say.

    # Tüm (orig_seq, dev_seq) çiftlerinden gelişim yaşlarını bul
    all_ages: set[int] = set()
    for (orig_seq, dev_seq) in cell_sums:
        age = dev_seq - orig_seq + 1  # quarter/year diff + 1 = age
        all_ages.add(age)

    if not all_ages:
        raise ValueError("Geçerli hücre bulunamadı")

    dev_ages = sorted(all_ages)

    # origin_periods ve development_periods (age listesi)
    origin_periods: list[str] = [origin_map[s] for s in origin_seqs]
    development_periods: list[int] = dev_ages

    # Artımsal matris doldur
    incremental: list[list[float | None]] = [
        [None] * len(dev_ages) for _ in origin_seqs
    ]
    for i, orig_seq in enumerate(origin_seqs):
        for j, age in enumerate(dev_ages):
            dev_seq = orig_seq + age - 1
            if (orig_seq, dev_seq) in cell_sums:
                incremental[i][j] = cell_sums[(orig_seq, dev_seq)]

    # Kümülatif dönüşüm (satır bazlı running sum, None hücreler atlanır)
    cumulative: list[list[float | None]] = []
    for row in incremental:
        cum_row: list[float | None] = []
        running = 0.0
        for v in row:
            if v is None:
                cum_row.append(None)
            else:
                running += v
                cum_row.append(running)
        cumulative.append(cum_row)

    # Alt-sağ köşegeni None yap (gelişim > en son gözlem → üçgen yapısı)
    for i, orig_seq in enumerate(origin_seqs):
        for j, age in enumerate(dev_ages):
            dev_seq = orig_seq + age - 1
            # Eğer bu dev_seq hiçbir kayıtta görülmediyse o origin için None
            if dev_seq not in dev_map:
                cumulative[i][j] = None

    tt = TriangleType(triangle_type)
    return Triangle(
        origin_periods=origin_periods,
        development_periods=development_periods,
        values=cumulative,
        triangle_type=tt,
        origin_granularity=orig_gran,
        development_granularity=dev_gran,
    )
