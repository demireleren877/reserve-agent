"""Ham ClaimRecord listesinden aktüeryal üçgen çifti oluşturur.

- odeme: artımsal (incremental) ödeme → kümülatif paid triangle
- muallak: dönem sonu bakiyesi (stock) → incurred = cum_odeme + muallak

Değerleme tarihi (evaluation date): dataset'teki en büyük gelişim tarihi.
Bu tarih tüm originler için ortak; yeni originler doğal olarak daha az
gelişim dönemi görmüş olur → üçgen yapısı otomatik sağlanır.
"""

from __future__ import annotations

import re
from collections import defaultdict
from typing import Literal

from app.core.triangle import Granularity, Triangle, TriangleType

_YYYYQQ_RE = re.compile(r"^(\d{4})[Qq]([1-4])$")
_YYYY_RE = re.compile(r"^(\d{4})$")


def _parse_period(s: str, granularity: Granularity) -> tuple[str, int]:
    """
    Tarih string'inden period label'ı ve sıralama için
    global sequence index'i (quarter cinsinden) döner.
    """
    s = str(s).strip()

    m = _YYYYQQ_RE.match(s)
    if m:
        y, q = int(m.group(1)), int(m.group(2))
        if granularity == Granularity.YEARLY:
            return str(y), y * 4
        return f"{y}Q{q}", y * 4 + q

    m = _YYYY_RE.match(s)
    if m:
        y = int(m.group(1))
        if granularity == Granularity.YEARLY:
            return str(y), y * 4
        return str(y), y * 4 + 1  # yılı Q1 kabul et

    # ISO / gün formatları
    try:
        from datetime import date as _date
        d = _date.fromisoformat(s[:10])
        y, mo = d.year, d.month
        q = (mo - 1) // 3 + 1
        if granularity == Granularity.YEARLY:
            return str(y), y * 4
        return f"{y}Q{q}", y * 4 + q
    except Exception:
        pass

    raise ValueError(f"Tarih çözümlenemedi: {s!r}")


def build_triangles(
    records: list[dict],
    brans: str,
    origin_granularity: Literal["yearly", "quarterly"],
    development_granularity: Literal["yearly", "quarterly"],
) -> tuple[Triangle, Triangle]:
    """
    Brans'a göre filtreli kayıtlardan (paid, incurred) üçgen çifti döner.

    paid    : artımsal ödemelerin kümülatifi
    incurred: kümülatif ödeme + dönem sonu muallak
    """
    orig_gran = Granularity(origin_granularity)
    dev_gran = Granularity(development_granularity)

    filtered = [r for r in records if str(r.get("brans", "")).strip() == brans]
    if not filtered:
        raise ValueError(f"'{brans}' branşına ait kayıt bulunamadı")

    # ── Hücre bazlı toplamlama ────────────────────────────────────────────────
    # odeme  : akış (flow)  → tüm kayıtların toplamı doğru
    # muallak: stok (stock) → aynı hücre içinde birden fazla kayıt varsa
    #          (örn. yıllık granülaritede Q1–Q4 kayıtları) sadece EN SON
    #          gelişim tarihine ait muallak alınmalı (per dosya_no)
    inc_odeme: dict[tuple[int, int], float] = defaultdict(float)
    # (o_seq, d_seq_agg) → {dosya_no: (exact_d_seq, muallak)}
    _latest_muallak: dict[tuple[int, int], dict[str, tuple[int, float]]] = defaultdict(dict)
    origin_label: dict[int, str] = {}
    dev_label: dict[int, str] = {}

    for r in filtered:
        try:
            o_label, o_seq = _parse_period(str(r["hasar_tarihi"]), orig_gran)
            d_label, d_seq = _parse_period(str(r["gelisim_tarihi"]), dev_gran)
            # Tam tarih seq (her zaman çeyreklik) — aynı aggregated hücre içinde
            # kayıtları sıralamak için kullanılır
            _, d_seq_exact = _parse_period(str(r["gelisim_tarihi"]), Granularity.QUARTERLY)
        except ValueError:
            continue
        if d_seq < o_seq:
            continue

        origin_label[o_seq] = o_label
        dev_label[d_seq] = d_label

        odeme_val = float(r.get("odeme") or 0)
        muallak_val = float(r.get("muallak") or 0)
        dosya_no = str(r.get("dosya_no", ""))

        inc_odeme[(o_seq, d_seq)] += odeme_val

        # Her dosya_no için aggregated hücredeki en son kaydın muallağını sakla
        cell_key = (o_seq, d_seq)
        existing = _latest_muallak[cell_key].get(dosya_no)
        if existing is None or d_seq_exact > existing[0]:
            _latest_muallak[cell_key][dosya_no] = (d_seq_exact, muallak_val)

    if not origin_label:
        raise ValueError("Geçerli kayıt bulunamadı")

    # Her hücre için muallak = dosya bazlı "son muallak" değerlerinin toplamı
    muallak: dict[tuple[int, int], float] = {
        cell: sum(v for _, v in per_dosya.values())
        for cell, per_dosya in _latest_muallak.items()
    }

    # Değerleme tarihi = dataset'teki en büyük gelişim seq'i
    eval_dev_seq = max(dev_label.keys())

    origin_seqs = sorted(origin_label.keys())  # eski → yeni

    # Gelişim yaşları: her origin'in yaş aralığı farklı, union al ama
    # en eski origin'e göre max yaşı belirle (diğerleri daha az yaş görür)
    oldest_seq = origin_seqs[0]
    max_age = eval_dev_seq - oldest_seq + 1
    if max_age < 1:
        raise ValueError("Geçerli gelişim dönemi bulunamadı")

    # Sadece gözlemlenen dev_seq'lerden gelen yaşları kullan
    # (boş yaşları doldurma; sadece verisi olan gelişim dönemleri sütun olsun)
    observed_ages: set[int] = set()
    for (o_seq, d_seq) in list(inc_odeme.keys()) + list(muallak.keys()):
        age = d_seq - o_seq + 1
        if 1 <= age <= max_age:
            observed_ages.add(age)

    if not observed_ages:
        raise ValueError("Geçerli hücre bulunamadı")

    dev_ages = sorted(observed_ages)
    min_age = dev_ages[0]

    # Hiçbir gelişim dönemi görmemiş (çok yeni) originleri çıkar
    origin_seqs = [o for o in origin_seqs if eval_dev_seq - o + 1 >= min_age]
    if not origin_seqs:
        raise ValueError("Geçerli origin bulunamadı")

    # Her origin için max geçerli age = eval_dev_seq - o_seq + 1
    # Bu değer origin ne kadar eski ise o kadar büyük → monoton azalan → üçgen garantisi
    origin_periods = [origin_label[s] for s in origin_seqs]
    development_periods = dev_ages

    paid_values: list[list[float | None]] = []
    incurred_values: list[list[float | None]] = []

    for o_seq in origin_seqs:
        max_age_for_origin = eval_dev_seq - o_seq + 1
        paid_row: list[float | None] = []
        incurred_row: list[float | None] = []
        cum_paid = 0.0

        for age in dev_ages:
            if age > max_age_for_origin:
                # Bu origin için değerleme tarihini geçti → alt köşegen
                paid_row.append(None)
                incurred_row.append(None)
                continue

            d_seq = o_seq + age - 1
            inc = inc_odeme.get((o_seq, d_seq), 0.0)
            mual = muallak.get((o_seq, d_seq), 0.0)

            # Veri yoksa: kümülatif ödeme taşınır (carry-forward), muallak = 0
            cum_paid += inc
            paid_row.append(cum_paid)
            incurred_row.append(cum_paid + mual)

        paid_values.append(paid_row)
        incurred_values.append(incurred_row)

    paid_tri = Triangle(
        origin_periods=origin_periods,
        development_periods=development_periods,
        values=paid_values,
        triangle_type=TriangleType.PAID,
        origin_granularity=orig_gran,
        development_granularity=dev_gran,
    )
    incurred_tri = Triangle(
        origin_periods=origin_periods,
        development_periods=development_periods,
        values=incurred_values,
        triangle_type=TriangleType.INCURRED,
        origin_granularity=orig_gran,
        development_granularity=dev_gran,
    )
    return paid_tri, incurred_tri
