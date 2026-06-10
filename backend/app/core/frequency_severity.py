"""Frekans-Şiddet (Frequency-Severity / Average Cost per Claim) rezerv yöntemi.

Klasik iki-üçgen yaklaşımı (Friedland, "Estimating Unpaid Claims"):

    1. Adet üçgeni (kümülatif ihbar edilen hasar adedi) → CL → ult adet  N̂_i
    2. Şiddet üçgeni  S[i][j] = tutar[i][j] / adet[i][j]  (kümülatif ortalama
       hasar maliyeti) → CL → ult şiddet  Ŝ_i
    3. Ult hasar = N̂_i × Ŝ_i
    4. IBNR = ult hasar − son kümülatif tutar (latest)

Gelişimi adet ve şiddet için AYRI yürütmek, doğrudan tutar CL'inden farklı bir
sonuç verir: hasar emergence (frekans) ile hasar maliyeti gelişimi/enflasyonu
(şiddet) ayrışır. Özellikle ihbar hızlı ama ödeme yavaşsa, ya da şiddet trendi
frekanstan farklıysa değerlidir; saf CL için bağımsız bir makullük kontrolüdür.

Şiddet üçgeni `adet == 0` olan (henüz hasar görülmemiş) hücrelerde tanımsızdır;
bu yüzden strict Triangle yapısına sokulmaz, None-toleranslı gelişim faktörü
hesabı kullanılır.

NOT: Şiddet gelişiminde varsayılan hacim-ağırlıklı (volume-weighted) yöntem,
şiddetleri toplanabilir kabul eder. Adet-ağırlıklı şiddet LDF'i (Σ adet·ΔS)
ileride bir iyileştirme olabilir; method parametresiyle simple/geometric da
seçilebilir.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from app.core.ldf import LDFMethod
from app.core.triangle import Triangle


def _is_missing(v: float | None) -> bool:
    return v is None or (isinstance(v, float) and math.isnan(v))


@dataclass
class FSOriginRow:
    origin: str
    latest_count: float
    ultimate_count: float
    count_cdf: float
    latest_severity: float | None
    ultimate_severity: float | None
    severity_cdf: float
    latest_amount: float
    ultimate_loss: float
    ibnr: float


@dataclass
class FrequencySeverityResult:
    origin_periods: list[str]
    development_periods: list[int]
    count_ldfs: list[float]
    severity_ldfs: list[float]
    method: LDFMethod
    rows: list[FSOriginRow]
    total_latest_amount: float
    total_ultimate_count: float
    total_ultimate_loss: float
    total_ibnr: float

    def summary(self) -> dict:
        return {
            "method": self.method.value,
            "n_origins": len(self.origin_periods),
            "origin_periods": self.origin_periods,
            "development_periods": self.development_periods,
            "count_ldfs": self.count_ldfs,
            "severity_ldfs": self.severity_ldfs,
            "rows": [
                {
                    "origin": r.origin,
                    "latest_count": r.latest_count,
                    "ultimate_count": r.ultimate_count,
                    "count_cdf": r.count_cdf,
                    "latest_severity": r.latest_severity,
                    "ultimate_severity": r.ultimate_severity,
                    "severity_cdf": r.severity_cdf,
                    "latest_amount": r.latest_amount,
                    "ultimate_loss": r.ultimate_loss,
                    "ibnr": r.ibnr,
                }
                for r in self.rows
            ],
            "total_latest_amount": self.total_latest_amount,
            "total_ultimate_count": self.total_ultimate_count,
            "total_ultimate_loss": self.total_ultimate_loss,
            "total_ibnr": self.total_ibnr,
        }


def build_severity_matrix(
    amount: list[list[float | None]],
    count: list[list[float | None]],
) -> list[list[float | None]]:
    """S[i][j] = tutar / adet. adet yok/0 veya tutar yoksa None."""
    out: list[list[float | None]] = []
    for arow, crow in zip(amount, count, strict=True):
        srow: list[float | None] = []
        for a, c in zip(arow, crow, strict=True):
            if _is_missing(a) or _is_missing(c) or c == 0:
                srow.append(None)
            else:
                srow.append(a / c)  # type: ignore[operator]
        out.append(srow)
    return out


def _latest(row: list[float | None]) -> tuple[float | None, int]:
    """Satırdaki son dolu (origin → ultimate yönünde en geç) değer ve indeksi."""
    val: float | None = None
    idx = -1
    for j, v in enumerate(row):
        if not _is_missing(v):
            val = v
            idx = j
    return val, idx


def _aggregate(pairs: list[tuple[float, float]], method: LDFMethod) -> float:
    if not pairs:
        return 1.0
    if method == LDFMethod.VOLUME_WEIGHTED:
        denom = sum(a for a, _ in pairs)
        numer = sum(b for _, b in pairs)
        return numer / denom if denom != 0 else 1.0
    if method == LDFMethod.SIMPLE_AVERAGE:
        ratios = [b / a for a, b in pairs if a != 0]
        return sum(ratios) / len(ratios) if ratios else 1.0
    # geometric
    ratios = [b / a for a, b in pairs if a > 0]
    if not ratios:
        return 1.0
    return math.exp(sum(math.log(r) for r in ratios) / len(ratios))


def _dev_factors(
    values: list[list[float | None]],
    n_dev: int,
    method: LDFMethod,
    n_years: int | None,
    excluded_idx: set[int],
) -> list[float]:
    """None-toleranslı gelişim faktörü (n_dev-1 adet). Her iki ucu da dolu olan
    origin çiftlerini kullanır; n_years verilirse son N origin ile sınırlar."""
    ldfs: list[float] = []
    for j in range(n_dev - 1):
        pairs: list[tuple[int, tuple[float, float]]] = []
        for i, row in enumerate(values):
            if i in excluded_idx:
                continue
            a, b = row[j], row[j + 1]
            if _is_missing(a) or _is_missing(b):
                continue
            pairs.append((i, (a, b)))  # type: ignore[arg-type]
        if n_years is not None and n_years > 0:
            pairs = sorted(pairs, key=lambda p: p[0])[-n_years:]
        ldfs.append(_aggregate([p[1] for p in pairs], method))
    return ldfs


def _cdf_to_ultimate(ldfs: list[float], from_idx: int) -> float:
    """from_idx gelişim adımından ultimate'a kümülatif faktör (LDF çarpımı)."""
    cdf = 1.0
    for k in range(from_idx, len(ldfs)):
        cdf *= ldfs[k]
    return cdf


def run_frequency_severity(
    amount: Triangle,
    count: Triangle,
    method: LDFMethod = LDFMethod.VOLUME_WEIGHTED,
    n_years: int | None = None,
    excluded_origins: set[str] | None = None,
) -> FrequencySeverityResult:
    """Frekans-Şiddet hesabı. amount ve count aynı origin/development eksenine
    sahip olmalıdır (build_triangles aynı kayıtlardan ürettiği için sağlanır)."""
    if amount.origin_periods != count.origin_periods:
        raise ValueError("Tutar ve adet üçgenlerinin origin'leri uyuşmuyor")
    if amount.development_periods != count.development_periods:
        raise ValueError("Tutar ve adet üçgenlerinin gelişim dönemleri uyuşmuyor")

    excl = {str(o) for o in (excluded_origins or set())}
    excluded_idx = {
        i for i, o in enumerate(amount.origin_periods) if o in excl
    }

    n_dev = amount.n_developments
    severity = build_severity_matrix(amount.values, count.values)

    count_ldfs = _dev_factors(count.values, n_dev, method, n_years, excluded_idx)
    severity_ldfs = _dev_factors(severity, n_dev, method, n_years, excluded_idx)

    rows: list[FSOriginRow] = []
    total_latest_amount = 0.0
    total_ult_count = 0.0
    total_ult_loss = 0.0

    for i, origin in enumerate(amount.origin_periods):
        latest_count, jc = _latest(count.values[i])
        latest_amount, _ = _latest(amount.values[i])
        latest_sev, js = _latest(severity[i])

        if latest_count is None or latest_amount is None:
            raise ValueError(f"Origin {origin} için tutar/adet değeri yok")

        count_cdf = _cdf_to_ultimate(count_ldfs, jc) if jc >= 0 else 1.0
        ult_count = latest_count * count_cdf

        if latest_sev is None:
            # Hiç hasar görülmemiş origin → şiddet projeksiyonu yapılamaz;
            # ult hasar 0 (ult adet zaten ~0), IBNR latest tutara göre.
            severity_cdf = 1.0
            ult_sev: float | None = None
            ult_loss = 0.0
        else:
            severity_cdf = _cdf_to_ultimate(severity_ldfs, js) if js >= 0 else 1.0
            ult_sev = latest_sev * severity_cdf
            ult_loss = ult_count * ult_sev

        ibnr = ult_loss - latest_amount

        rows.append(
            FSOriginRow(
                origin=origin,
                latest_count=latest_count,
                ultimate_count=ult_count,
                count_cdf=count_cdf,
                latest_severity=latest_sev,
                ultimate_severity=ult_sev,
                severity_cdf=severity_cdf,
                latest_amount=latest_amount,
                ultimate_loss=ult_loss,
                ibnr=ibnr,
            )
        )
        total_latest_amount += latest_amount
        total_ult_count += ult_count
        total_ult_loss += ult_loss

    return FrequencySeverityResult(
        origin_periods=list(amount.origin_periods),
        development_periods=list(amount.development_periods),
        count_ldfs=count_ldfs,
        severity_ldfs=severity_ldfs,
        method=method,
        rows=rows,
        total_latest_amount=total_latest_amount,
        total_ultimate_count=total_ult_count,
        total_ultimate_loss=total_ult_loss,
        total_ibnr=total_ult_loss - total_latest_amount,
    )
