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
) -> tuple[Triangle, Triangle, Triangle | None, dict | None]:
    """
    Brans'a göre filtreli kayıtlardan (paid, incurred, count, file_data) döner.

    paid    : artımsal ödemelerin kümülatifi
    incurred: kümülatif ödeme + dönem sonu muallak
    count   : kümülatif ihbar edilen hasar adedi (distinct dosya_no). dosya_no
              kolonu yoksa None — Frekans-Şiddet bu branşta kullanılamaz.
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
    # Frekans-Şiddet için: her origin'de her dosya_no'nun İLK görüldüğü (aggregated)
    # d_seq — kümülatif ihbar adedi üçgeni buradan türetilir.
    _first_seen: dict[int, dict[str, int]] = defaultdict(dict)
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

        # Frekans-Şiddet: dosya'nın bu origin'de ilk göründüğü (aggregated) d_seq
        if dosya_no:
            fs = _first_seen[o_seq]
            if dosya_no not in fs or d_seq < fs[dosya_no]:
                fs[dosya_no] = d_seq

    if not origin_label:
        raise ValueError("Geçerli kayıt bulunamadı")

    # Her hücre için muallak = dosya bazlı "son muallak" değerlerinin toplamı
    muallak: dict[tuple[int, int], float] = {
        cell: sum(v for _, v in per_dosya.values())
        for cell, per_dosya in _latest_muallak.items()
    }

    # Frekans-Şiddet: (o_seq, d_seq) hücresinde İLK ihbar edilen yeni dosya adedi.
    # Kümülatif ihbar adedi, satır kurulumunda cum_paid gibi taşınarak elde edilir.
    new_count: dict[tuple[int, int], int] = defaultdict(int)
    for o_seq, fs in _first_seen.items():
        for _dosya_no, d_first in fs.items():
            new_count[(o_seq, d_first)] += 1
    has_counts = bool(new_count)

    # Değerleme tarihi = dataset'teki en büyük gelişim seq'i
    eval_dev_seq = max(dev_label.keys())

    origin_seqs = sorted(origin_label.keys())  # eski → yeni

    # Yaşlar: excel_parser ile aynı konvansiyon — 0-indeksli.
    # Her iki granülarite de yıllıksa yaşları yıl birimine (//4) indirge.
    both_yearly = orig_gran == Granularity.YEARLY and dev_gran == Granularity.YEARLY

    oldest_seq = origin_seqs[0]
    max_age = eval_dev_seq - oldest_seq
    if both_yearly:
        max_age = max_age // 4
    if max_age < 0:
        raise ValueError("Geçerli gelişim dönemi bulunamadı")

    # Sadece gözlemlenen dev_seq'lerden gelen yaşları kullan
    observed_ages: set[int] = set()
    for (o_seq, d_seq) in list(inc_odeme.keys()) + list(muallak.keys()):
        raw_age = d_seq - o_seq
        age = raw_age // 4 if both_yearly else raw_age
        if 0 <= age <= max_age:
            observed_ages.add(age)

    if not observed_ages:
        raise ValueError("Geçerli hücre bulunamadı")

    dev_ages = sorted(observed_ages)
    min_age = dev_ages[0]

    # Hiçbir gelişim dönemi görmemiş (çok yeni) originleri çıkar
    if both_yearly:
        origin_seqs = [o for o in origin_seqs if (eval_dev_seq - o) // 4 >= min_age]
    else:
        origin_seqs = [o for o in origin_seqs if eval_dev_seq - o >= min_age]
    if not origin_seqs:
        raise ValueError("Geçerli origin bulunamadı")

    origin_periods = [origin_label[s] for s in origin_seqs]
    development_periods = dev_ages

    paid_values: list[list[float | None]] = []
    incurred_values: list[list[float | None]] = []
    count_values: list[list[float | None]] = []

    for o_seq in origin_seqs:
        max_age_for_origin = (eval_dev_seq - o_seq) // 4 if both_yearly else eval_dev_seq - o_seq
        paid_row: list[float | None] = []
        incurred_row: list[float | None] = []
        count_row: list[float | None] = []
        cum_paid = 0.0
        cum_count = 0.0

        for age in dev_ages:
            if age > max_age_for_origin:
                # Bu origin için değerleme tarihini geçti → alt köşegen
                paid_row.append(None)
                incurred_row.append(None)
                count_row.append(None)
                continue

            d_seq = o_seq + age * 4 if both_yearly else o_seq + age
            inc = inc_odeme.get((o_seq, d_seq), 0.0)
            mual = muallak.get((o_seq, d_seq), 0.0)

            # Veri yoksa: kümülatif ödeme taşınır (carry-forward), muallak = 0
            cum_paid += inc
            cum_count += new_count.get((o_seq, d_seq), 0)
            paid_row.append(cum_paid)
            incurred_row.append(cum_paid + mual)
            count_row.append(cum_count)

        paid_values.append(paid_row)
        incurred_values.append(incurred_row)
        count_values.append(count_row)

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
    # Adet üçgeni: dosya_no kolonu varsa kümülatif ihbar adedi (tip metadata
    # için PAID; adet üçgeninin paid/incurred ayrımı yoktur).
    count_tri: Triangle | None = None
    if has_counts:
        count_tri = Triangle(
            origin_periods=origin_periods,
            development_periods=development_periods,
            values=count_values,
            triangle_type=TriangleType.PAID,
            origin_granularity=orig_gran,
            development_granularity=dev_gran,
        )

    # ── Dosya bazlı kümülatif ödeme (file_data) ───────────────────────────────
    # {origin_label: {dev_label: {dosya_no: cum_paid}}}
    dosya_inc: dict[tuple[str, str], dict[str, float]] = {}
    dosya_d_seq: dict[tuple[str, str], int] = {}

    for r in filtered:
        dosya_no = str(r.get("dosya_no", "")).strip()
        if not dosya_no:
            continue
        try:
            o_lbl, _ = _parse_period(str(r["hasar_tarihi"]), orig_gran)
            d_lbl, d_seq = _parse_period(str(r["gelisim_tarihi"]), dev_gran)
        except ValueError:
            continue
        key = (o_lbl, d_lbl)
        cell = dosya_inc.setdefault(key, {})
        cell[dosya_no] = cell.get(dosya_no, 0.0) + float(r.get("odeme") or 0)
        dosya_d_seq[key] = d_seq

    file_data: dict | None = None
    if dosya_inc:
        fd: dict[str, dict[str, dict[str, float]]] = {}
        for o_lbl in origin_periods:
            cells = sorted(
                (
                    (d_lbl, dosya_d_seq.get((o_lbl, d_lbl), 0), vals)
                    for (o, d_lbl), vals in dosya_inc.items()
                    if o == o_lbl
                ),
                key=lambda x: x[1],
            )
            cum: dict[str, float] = {}
            fd[o_lbl] = {}
            for d_lbl, _, vals in cells:
                for dosya_no, inc in vals.items():
                    cum[dosya_no] = cum.get(dosya_no, 0.0) + inc
                fd[o_lbl][d_lbl] = dict(cum)
        file_data = fd

    return paid_tri, incurred_tri, count_tri, file_data
