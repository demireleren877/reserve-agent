"""Zincir merdiven (Chain Ladder) hesaplama.

Her origin için:
    ultimate = latest_value × CDF(origin_dev → N)
    reserve  = ultimate - latest_value

CDF (cumulative development factor), o origin'in bulunduğu gelişim döneminden
ultimate'a kadar olan LDF'lerin çarpımıdır.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from app.core.ldf import LDFMethod, compute_ldfs
from app.core.triangle import Triangle


def _is_missing(v: float | None) -> bool:
    return v is None or (isinstance(v, float) and math.isnan(v))


@dataclass
class ChainLadderResult:
    origin_periods: list[str]
    ldfs: list[float]
    cdfs: list[float]
    latest_per_origin: list[float]
    ultimate_per_origin: list[float]
    reserve_per_origin: list[float]
    method: LDFMethod
    total_ultimate: float
    total_reserve: float
    total_latest: float

    def summary(self) -> dict:
        return {
            "method": self.method.value,
            "n_origins": len(self.origin_periods),
            "ldfs": self.ldfs,
            "cdfs": self.cdfs,
            "origin_periods": self.origin_periods,
            "latest_per_origin": self.latest_per_origin,
            "ultimate_per_origin": self.ultimate_per_origin,
            "reserve_per_origin": self.reserve_per_origin,
            "total_ultimate": self.total_ultimate,
            "total_reserve": self.total_reserve,
            "total_latest": self.total_latest,
        }


def run_chain_ladder(
    triangle: Triangle,
    method: LDFMethod = LDFMethod.VOLUME_WEIGHTED,
    n_years: int | None = None,
    excluded_origins: set[str] | None = None,
    ldf_override: list[float] | None = None,
) -> ChainLadderResult:
    """Klasik zincir merdiven hesaplaması.

    Args:
        triangle: Kümülatif üçgen (paid veya incurred).
        method: LDF hesap yöntemi.
        n_years: Son N origin'i kullan.
        excluded_origins: Hariç tutulacak origin yılları.
        ldf_override: Verilirse hesaplama yerine kullanılır (uzunluk n_dev-1 olmalı).
    """
    expected_ldf_count = triangle.n_developments - 1

    if ldf_override is not None:
        if len(ldf_override) != expected_ldf_count:
            raise ValueError(
                f"LDF override uzunluğu ({len(ldf_override)}) beklenen değer "
                f"({expected_ldf_count}) ile uyuşmuyor"
            )
        ldfs = list(ldf_override)
    else:
        ldfs = compute_ldfs(
            triangle, method=method, n_years=n_years, excluded_origins=excluded_origins
        )

    latest_per_origin: list[float] = []
    cdfs: list[float] = []
    ultimate_per_origin: list[float] = []

    for i, row in enumerate(triangle.values):
        latest_val: float | None = None
        latest_dev_idx: int = -1
        for j, v in enumerate(row):
            if not _is_missing(v):
                latest_val = v  # type: ignore[assignment]
                latest_dev_idx = j
        if latest_val is None:
            raise ValueError(f"Origin {triangle.origin_periods[i]} için değer yok")

        cdf = 1.0
        for k in range(latest_dev_idx, expected_ldf_count):
            cdf *= ldfs[k]

        latest_per_origin.append(latest_val)
        cdfs.append(cdf)
        ultimate_per_origin.append(latest_val * cdf)

    reserve_per_origin = [
        ult - lat for ult, lat in zip(ultimate_per_origin, latest_per_origin, strict=True)
    ]

    return ChainLadderResult(
        origin_periods=list(triangle.origin_periods),
        ldfs=ldfs,
        cdfs=cdfs,
        latest_per_origin=latest_per_origin,
        ultimate_per_origin=ultimate_per_origin,
        reserve_per_origin=reserve_per_origin,
        method=method,
        total_ultimate=sum(ultimate_per_origin),
        total_reserve=sum(reserve_per_origin),
        total_latest=sum(latest_per_origin),
    )
