"""Üçgen (Triangle) domain modeli.

Kümülatif aktüeryal üçgen: satırlar origin period (kaza yılı/çeyreği), sütunlar
development period (gelişim yaşı — yıl veya çeyrek cinsinden). Alt-sağ köşegen
boş olmak zorunda (henüz gelişmemiş dönemler).
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from enum import Enum


class TriangleType(str, Enum):
    PAID = "paid"
    INCURRED = "incurred"


class Granularity(str, Enum):
    YEARLY = "yearly"
    QUARTERLY = "quarterly"


def _is_missing(v: float | None) -> bool:
    return v is None or (isinstance(v, float) and math.isnan(v))


@dataclass
class Triangle:
    origin_periods: list[str]
    development_periods: list[int]
    values: list[list[float | None]]
    triangle_type: TriangleType = field(default=TriangleType.PAID)
    origin_granularity: Granularity = field(default=Granularity.YEARLY)
    development_granularity: Granularity = field(default=Granularity.YEARLY)

    def __post_init__(self) -> None:
        self.origin_periods = [str(o) for o in self.origin_periods]
        self._validate()

    def _validate(self) -> None:
        if not self.origin_periods or not self.development_periods:
            raise ValueError("origin_periods ve development_periods boş olamaz")

        if len(self.values) != len(self.origin_periods):
            raise ValueError(
                f"values satır sayısı ({len(self.values)}) origin_periods "
                f"uzunluğuna ({len(self.origin_periods)}) eşit olmalı"
            )

        for i, row in enumerate(self.values):
            if len(row) != len(self.development_periods):
                raise ValueError(
                    f"values[{i}] sütun sayısı ({len(row)}) development_periods "
                    f"uzunluğuna ({len(self.development_periods)}) eşit olmalı"
                )

        if len(set(self.origin_periods)) != len(self.origin_periods):
            raise ValueError("origin_periods tekrar eden değer içeremez")

        if len(set(self.development_periods)) != len(self.development_periods):
            raise ValueError("development_periods tekrar eden değer içeremez")

        self._validate_triangular_shape()

    def _validate_triangular_shape(self) -> None:
        """Her satır: dolu prefiks + None suffiks. Her origin'in dolu uzunluğu,
        bir öncekinden uzun olamaz (yeni origin'ler daha az gelişmiş)."""
        prev_filled: int | None = None
        for i, row in enumerate(self.values):
            filled = 0
            saw_gap = False
            for v in row:
                if _is_missing(v):
                    saw_gap = True
                    continue
                if saw_gap:
                    raise ValueError(
                        f"Üçgen formu ihlali: satır {i} — boşluktan sonra dolu hücre"
                    )
                filled += 1
            if filled == 0:
                raise ValueError(f"Satır {i} tamamen boş")
            if prev_filled is not None and filled > prev_filled:
                raise ValueError(
                    f"Üçgen formu ihlali: satır {i} dolu hücre sayısı ({filled}) "
                    f"önceki origin'den ({prev_filled}) fazla"
                )
            prev_filled = filled

    @property
    def n_origins(self) -> int:
        return len(self.origin_periods)

    @property
    def n_developments(self) -> int:
        return len(self.development_periods)

    def latest_diagonal(self) -> list[float]:
        result: list[float] = []
        for row in self.values:
            latest: float | None = None
            for v in row:
                if not _is_missing(v):
                    latest = v  # type: ignore[assignment]
            if latest is None:
                raise ValueError("Satırda hiç değer yok — üçgen bozuk")
            result.append(latest)
        return result

    def column(self, dev_period: int) -> list[float]:
        if dev_period not in self.development_periods:
            raise KeyError(f"Development period {dev_period} bulunamadı")
        j = self.development_periods.index(dev_period)
        out: list[float] = []
        for row in self.values:
            v = row[j]
            if not _is_missing(v):
                out.append(v)  # type: ignore[arg-type]
        return out
