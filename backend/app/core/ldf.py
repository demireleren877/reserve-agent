"""LDF (Loss Development Factor) hesaplama."""

from __future__ import annotations

import math
from enum import Enum

from app.core.triangle import Triangle


class LDFMethod(str, Enum):
    VOLUME_WEIGHTED = "volume_weighted"
    SIMPLE_AVERAGE = "simple_average"
    GEOMETRIC_AVERAGE = "geometric_average"


def compute_ldfs(
    triangle: Triangle,
    method: LDFMethod = LDFMethod.VOLUME_WEIGHTED,
    n_years: int | None = None,
    excluded_origins: set[str] | None = None,
) -> list[float]:
    excluded = {str(o) for o in (excluded_origins or set())}
    n_dev = triangle.n_developments

    ldfs: list[float] = []
    for j in range(n_dev - 1):
        pairs = _collect_pairs(triangle, j, excluded, n_years)
        if not pairs:
            ldfs.append(1.0)
            continue
        ldfs.append(_aggregate(pairs, method))
    return ldfs


def _collect_pairs(
    triangle: Triangle,
    dev_index: int,
    excluded: set[str],
    n_years: int | None,
) -> list[tuple[float, float]]:
    pairs: list[tuple[int, tuple[float, float]]] = []
    for origin_idx, origin in enumerate(triangle.origin_periods):
        if origin in excluded:
            continue
        row = triangle.values[origin_idx]
        a, b = row[dev_index], row[dev_index + 1]
        if _is_missing(a) or _is_missing(b):
            continue
        pairs.append((origin_idx, (a, b)))  # type: ignore[arg-type]

    if n_years is not None and n_years > 0:
        pairs = sorted(pairs, key=lambda p: p[0])[-n_years:]

    return [p[1] for p in pairs]


def _aggregate(pairs: list[tuple[float, float]], method: LDFMethod) -> float:
    match method:
        case LDFMethod.VOLUME_WEIGHTED:
            denom = sum(a for a, _ in pairs)
            numer = sum(b for _, b in pairs)
            return numer / denom if denom != 0 else 1.0
        case LDFMethod.SIMPLE_AVERAGE:
            ratios = [b / a for a, b in pairs if a != 0]
            return sum(ratios) / len(ratios) if ratios else 1.0
        case LDFMethod.GEOMETRIC_AVERAGE:
            ratios = [b / a for a, b in pairs if a > 0]
            if not ratios:
                return 1.0
            log_sum = sum(math.log(r) for r in ratios)
            return math.exp(log_sum / len(ratios))


def _is_missing(v: float | None) -> bool:
    return v is None or (isinstance(v, float) and math.isnan(v))
