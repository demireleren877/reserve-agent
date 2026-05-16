"""Cashflow pattern hesaplama motoru.

Algoritma:
  1. Ham kayıtları (origin_year, dev_date, paid) → çeyreklik dev period'a çevir
  2. Kümülatif üçgen inşa et
  3. Son N yıl hacim ağırlıklı development factor hesapla
  4. CDF'yi geriye doğru çarp
  5. 100/CDF inkremental → normalize ağırlık (rapor tarihinden sonraki period'lar)
  6. Her origin yılı için kendi içinde yeniden normalize et
  7. Quarterly → monthly (÷3)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Optional


MAX_PERIODS = 60  # 15 yıl × 4 çeyrek
N_YEARS_DF = 5    # development factor için son N yıl


@dataclass
class CashflowRecord:
    origin_year: int
    dev_date: date   # development (raporlama) tarihi
    paid: float


@dataclass
class DevFactorRow:
    period: int
    df: float
    cdf: float
    sum_current: float
    sum_next: float
    inv_cdf_100: float
    inv_cdf_100_inc: float
    weight: float            # ham ağırlık (period 3+, normalize edilmemiş toplam)
    global_weight: float     # normalize (0-59 toplamı 1)


@dataclass
class PerOriginRow:
    origin_year: int
    latest: float
    latest_period: int
    cdf: float
    ultimate: float
    ibnr: float


@dataclass
class CashflowResult:
    origin_years: list[int]
    report_date: date
    # origin_year -> {period -> cumulative_paid}
    triangle: dict[int, dict[int, float]]
    # origin_year -> {period -> incremental_paid}
    incremental: dict[int, dict[int, float]]
    dev_factors: list[DevFactorRow]
    # origin_year -> list[{period, weight}]  (60 entry, future only)
    quarterly_pattern: dict[int, list[dict]]
    # origin_year -> list[{month, weight}]   (180 entry, future only)
    monthly_pattern: dict[int, list[dict]]
    per_origin: list[PerOriginRow] = field(default_factory=list)
    max_period: int = MAX_PERIODS


# ─── Development period ───────────────────────────────────────────────────────

def dev_period(origin_year: int, dev_date: date) -> int:
    """Çeyreklik dev period: her çeyrek = 1 period, 0-tabanlı."""
    year_diff = dev_date.year - origin_year
    quarter = (dev_date.month - 1) // 3   # 0=Q1, 1=Q2, 2=Q3, 3=Q4
    return max(0, year_diff * 4 + quarter)


def report_date_from_records(records: list[CashflowRecord]) -> date:
    return max(r.dev_date for r in records)


def excluded_periods(origin_year: int, report_date: date) -> int:
    """Bu origin yılı için zaten raporlanmış (geçmiş) period sayısı.

    Returns kaç period'u atlamalıyız (0..N-1).
    Örn: 2024, rapor=01.07.2024 → 3 (period 0,1,2 geçmişte)
    """
    year_diff = report_date.year - origin_year
    report_quarter = (report_date.month - 1) // 3
    return year_diff * 4 + report_quarter + 1


# ─── Triangle ────────────────────────────────────────────────────────────────

def build_triangle(records: list[CashflowRecord]) -> tuple[
    dict[int, dict[int, float]],   # cumulative
    dict[int, dict[int, float]],   # incremental
]:
    """Records → kümülatif üçgen."""
    # Grupla: origin_year → period → incremental toplamı
    inc: dict[int, dict[int, float]] = {}
    for r in records:
        p = dev_period(r.origin_year, r.dev_date)
        if p >= MAX_PERIODS:
            continue
        row = inc.setdefault(r.origin_year, {})
        row[p] = row.get(p, 0.0) + r.paid

    # Kümülatif
    cum: dict[int, dict[int, float]] = {}
    for year, periods in inc.items():
        row: dict[int, float] = {}
        running = 0.0
        for p in sorted(periods):
            running += periods[p]
            row[p] = running
        cum[year] = row

    return cum, inc


# ─── Development factors ─────────────────────────────────────────────────────

def _sorted_periods(cum: dict[int, dict[int, float]]) -> list[int]:
    """Tüm origin yıllarında görünen dev period'larını sıralı döndür."""
    periods: set[int] = set()
    for row in cum.values():
        periods.update(row.keys())
    return sorted(periods)


def calc_dev_factors(
    cum: dict[int, dict[int, float]],
    n_years: int = N_YEARS_DF,
) -> list[tuple[int, float]]:
    """Her period çifti için son N yıl hacim ağırlıklı DF."""
    periods = _sorted_periods(cum)
    all_years = sorted(cum.keys())
    factors: list[tuple[int, float]] = []

    for i in range(len(periods) - 1):
        p_cur = periods[i]
        p_nxt = periods[i + 1]
        # Her iki period'da da veri olan yıllar
        valid = [y for y in all_years if p_cur in cum[y] and p_nxt in cum[y]]
        if not valid:
            continue
        subset = valid[-n_years:]
        s_cur = sum(cum[y][p_cur] for y in subset)
        s_nxt = sum(cum[y][p_nxt] for y in subset)
        if s_cur == 0:
            continue
        factors.append((p_cur, s_nxt / s_cur))

    return factors


def calc_cdf(factors: list[tuple[int, float]]) -> dict[int, float]:
    """Geriye doğru çarpım → CDF sözlüğü."""
    if not factors:
        return {}
    cdf: dict[int, float] = {}
    periods = [p for p, _ in factors]
    # Son period sonrası CDF = 1.0
    last_p = periods[-1]
    # factors listesinde (p, df) var; p → p+1 adımını temsil ediyor
    # En son period sonrası CDF=1
    # Son faktörün sağ period'ı = bir sonraki period
    right_periods = [p for p, _ in factors[1:]] + [factors[-1][0] + 1]
    cdf[right_periods[-1]] = 1.0
    for (p, df), rp in zip(reversed(factors), reversed(right_periods[:-1] + [right_periods[-1]])):
        cdf[p] = df * cdf.get(rp, 1.0)

    return cdf


def _build_full_cdf(factors: list[tuple[int, float]]) -> dict[int, float]:
    """Tüm period'lar için CDF (geriye doğru çarpım)."""
    if not factors:
        return {}
    period_list = [p for p, _ in factors]
    df_map = dict(factors)
    # Bir sonraki period → CDF=1 seed
    next_p = period_list[-1] + 1
    cdf: dict[int, float] = {next_p: 1.0}
    for p in reversed(period_list):
        nxt = period_list[period_list.index(p) + 1] if p != period_list[-1] else next_p
        cdf[p] = df_map[p] * cdf.get(nxt, 1.0)
    return cdf


# ─── Ağırlık ve pattern ──────────────────────────────────────────────────────

def calc_weights(
    cdf: dict[int, float],
    factors: list[tuple[int, float]],
    min_period_for_base: int = 3,
) -> list[DevFactorRow]:
    """100/CDF incremental → normalize ağırlık hesapla.

    min_period_for_base: global ağırlık toplamında kullanılacak ilk period
    (varsayılan 3: period 0,1,2 rapor tarihinde zaten bilinenler hariç)
    """
    period_list = sorted(cdf.keys())
    df_map = dict(factors)

    # 100/CDF ve inkremental
    inv100: dict[int, float] = {p: 100.0 / cdf[p] for p in period_list}
    inv100_inc: dict[int, float] = {}
    for i, p in enumerate(period_list):
        if i == 0:
            inv100_inc[p] = inv100[p]
        else:
            inv100_inc[p] = inv100[p] - inv100[period_list[i - 1]]

    # Global normalize: period >= min_period_for_base
    base_periods = [p for p in period_list if p >= min_period_for_base]
    total = sum(inv100_inc[p] for p in base_periods)

    rows: list[DevFactorRow] = []
    for p in period_list:
        df_val = df_map.get(p, 1.0)
        # sum_current, sum_next — sonraki period var mı?
        idx = period_list.index(p)
        nxt = period_list[idx + 1] if idx + 1 < len(period_list) else None
        s_cur = 0.0
        s_nxt = 0.0

        raw_w = inv100_inc.get(p, 0.0)
        global_w = (raw_w / total) if total > 0 and p >= min_period_for_base else 0.0

        rows.append(DevFactorRow(
            period=p,
            df=df_val,
            cdf=cdf[p],
            sum_current=s_cur,
            sum_next=s_nxt,
            inv_cdf_100=inv100[p],
            inv_cdf_100_inc=raw_w,
            weight=raw_w,
            global_weight=global_w,
        ))

    return rows


def build_patterns(
    weight_rows: list[DevFactorRow],
    origin_years: list[int],
    report_date: date,
) -> tuple[dict[int, list[dict]], dict[int, list[dict]]]:
    """Her origin yılı için quarterly ve monthly pattern."""
    # global_weight lookup
    gw: dict[int, float] = {r.period: r.global_weight for r in weight_rows}
    all_periods = sorted(gw.keys())

    quarterly: dict[int, list[dict]] = {}
    monthly: dict[int, list[dict]] = {}

    for year in origin_years:
        excl = excluded_periods(year, report_date)
        included = [p for p in all_periods if p >= excl]
        weight_sum = sum(gw[p] for p in included)

        q_rows: list[dict] = []
        m_rows: list[dict] = []

        if weight_sum == 0:
            # Tüm period'lar geçmişte → Q1 = %100, 60 period
            q_rows = [{"period": s, "weight": 1.0 if s == 1 else 0.0}
                      for s in range(1, MAX_PERIODS + 1)]
            m_rows = [{"month": m, "weight": (1 / 3) if m <= 3 else 0.0}
                      for m in range(1, MAX_PERIODS * 3 + 1)]
        else:
            # Excluded period'ları atla, 1'den başla, 60'a pad'le
            seq = 1
            for p in range(MAX_PERIODS):
                if p < excl:
                    continue
                norm_w = (gw[p] / weight_sum) if p in gw else 0.0
                q_rows.append({"period": seq, "weight": norm_w})
                monthly_w = norm_w / 3.0
                base_month = (seq - 1) * 3
                for offset in range(3):
                    m_rows.append({"month": base_month + offset + 1, "weight": monthly_w})
                seq += 1
            # 60 period'a tamamla
            while seq <= MAX_PERIODS:
                q_rows.append({"period": seq, "weight": 0.0})
                base_month = (seq - 1) * 3
                for offset in range(3):
                    m_rows.append({"month": base_month + offset + 1, "weight": 0.0})
                seq += 1

        quarterly[year] = q_rows
        monthly[year] = m_rows

    return quarterly, monthly


# ─── Triangle → CashflowRecord dönüşümü ──────────────────────────────────────

_Q_END = [(3, 31), (6, 30), (9, 30), (12, 31)]


def _quarter_end(abs_quarter: int) -> date:
    """0-tabanlı mutlak çeyrek → dönem sonu tarihi. abs_quarter = year*4 + q."""
    year = abs_quarter // 4
    m, d = _Q_END[abs_quarter % 4]
    return date(year, m, d)


def _parse_origin(s: str) -> tuple[int, int]:
    """Origin label → (origin_year, origin_abs_quarter)"""
    s = s.strip().upper()
    if "Q" in s:
        yr_str, q_str = s.split("Q", 1)
        yr = int(yr_str)
        return yr, yr * 4 + int(q_str) - 1
    yr = int(s[:4])
    return yr, yr * 4


def triangle_to_cashflow_records(
    origin_periods: list[str],
    development_periods: list[str],
    values: list[list[float | None]],
    origin_granularity: str,
    development_granularity: str,
) -> list[CashflowRecord]:
    """Kümülatif paid triangle → incremental CashflowRecord listesi."""
    records: list[CashflowRecord] = []
    for i, origin in enumerate(origin_periods):
        origin_year, origin_abs_q = _parse_origin(origin)
        row = values[i] if i < len(values) else []
        prev_cum = 0.0
        for j in range(len(development_periods)):
            if j >= len(row):
                break
            val = row[j]
            if val is None:
                break
            incremental = val - prev_cum
            prev_cum = val
            if development_granularity == "yearly":
                dev_date_val = date(origin_year + j, 12, 31)
            else:
                dev_date_val = _quarter_end(origin_abs_q + j)
            if incremental != 0:
                records.append(CashflowRecord(
                    origin_year=origin_year,
                    dev_date=dev_date_val,
                    paid=incremental,
                ))
    return records


# ─── Ana fonksiyon ────────────────────────────────────────────────────────────

def compute_cashflow(records: list[CashflowRecord], n_years: int = N_YEARS_DF) -> CashflowResult:
    if not records:
        raise ValueError("Kayıt bulunamadı")

    rdate = report_date_from_records(records)
    cum, inc = build_triangle(records)
    origin_years = sorted(cum.keys())

    factors = calc_dev_factors(cum, n_years=n_years)
    if not factors:
        raise ValueError("Development factor hesaplanamadı — yetersiz veri")

    cdf = _build_full_cdf(factors)
    min_base = excluded_periods(max(origin_years), rdate)
    weight_rows = calc_weights(cdf, factors, min_period_for_base=min_base)
    quarterly, monthly = build_patterns(weight_rows, origin_years, rdate)

    # Per-origin paid ultimates
    per_origin: list[PerOriginRow] = []
    for year in origin_years:
        row = cum.get(year, {})
        if not row:
            continue
        latest_period = max(row.keys())
        latest_val = row[latest_period]
        cdf_val = cdf.get(latest_period, 1.0)
        ultimate = latest_val * cdf_val
        per_origin.append(PerOriginRow(
            origin_year=year,
            latest=latest_val,
            latest_period=latest_period,
            cdf=cdf_val,
            ultimate=ultimate,
            ibnr=ultimate - latest_val,
        ))

    return CashflowResult(
        origin_years=origin_years,
        report_date=rdate,
        triangle=cum,
        incremental=inc,
        dev_factors=weight_rows,
        quarterly_pattern=quarterly,
        monthly_pattern=monthly,
        per_origin=per_origin,
    )


# ─── CSV / Excel yükleme yardımcı ────────────────────────────────────────────

def parse_records_from_bytes(content: bytes, filename: str) -> list[CashflowRecord]:
    """CSV veya Excel baytlarını CashflowRecord listesine çevir.

    Desteklenen sütunlar (büyük/küçük harf farketmez, Türkçe ve İngilizce):
      origin_year / accident_year / kaza_yili / ORIGIN_YEAR
      dev_date / development_date / DEVELOPMENT_DATE
      paid / paid_tl / PAID_TL
    """
    import io
    import re

    def _normalize_col(c: str) -> str:
        return c.strip().lower().replace(" ", "_")

    def _parse_num(v) -> float:
        import math
        if v is None:
            return 0.0
        if isinstance(v, float) and math.isnan(v):
            return 0.0
        s = str(v).strip().replace(",", ".")
        if s in ("", "nan", "NaN", "None", "none", "-"):
            return 0.0
        try:
            return float(s)
        except (ValueError, TypeError):
            return 0.0

    def _parse_date(v) -> Optional[date]:
        if v is None:
            return None
        if isinstance(v, (date, datetime)):
            return v.date() if isinstance(v, datetime) else v
        s = str(v).strip()
        for fmt in ("%d.%m.%Y", "%Y-%m-%d", "%m/%d/%Y", "%Y%m%d"):
            try:
                return datetime.strptime(s, fmt).date()
            except ValueError:
                continue
        return None

    import pandas as pd  # type: ignore

    lower_name = filename.lower()
    if lower_name.endswith(".csv") or lower_name.endswith(".txt"):
        # Ayırıcı otomatik algıla
        sample = content[:4096].decode("utf-8", errors="replace")
        sep = ";" if sample.count(";") > sample.count(",") else ","
        df = pd.read_csv(io.BytesIO(content), sep=sep, low_memory=False)
    else:
        df = pd.read_excel(io.BytesIO(content))

    # Sütun adlarını normalize et
    col_map = {_normalize_col(c): c for c in df.columns}

    def _find(candidates: list[str]) -> Optional[str]:
        for c in candidates:
            if c in col_map:
                return col_map[c]
        return None

    col_year = _find(["origin_year", "accident_year", "kaza_yili", "kaza_yılı", "hasar_yili", "hasar_yılı"])
    col_date = _find(["development_date", "dev_date", "gelistirme_tarihi", "geliştirme_tarihi"])
    col_paid = _find(["paid_tl", "paid", "odenen", "ödenen", "payment"])

    if not col_year or not col_date or not col_paid:
        missing = []
        if not col_year: missing.append("origin_year / accident_year")
        if not col_date: missing.append("development_date")
        if not col_paid: missing.append("paid_tl / paid")
        raise ValueError(f"Zorunlu sütunlar bulunamadı: {', '.join(missing)}")

    records: list[CashflowRecord] = []
    for _, row in df.iterrows():
        year_val = row[col_year]
        try:
            year = int(float(str(year_val)))
        except (ValueError, TypeError):
            continue
        d = _parse_date(row[col_date])
        if d is None:
            continue
        paid = _parse_num(row[col_paid])
        records.append(CashflowRecord(origin_year=year, dev_date=d, paid=paid))

    return records
