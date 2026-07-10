"""API Pydantic şemaları."""

from __future__ import annotations

import math

from pydantic import BaseModel, Field, field_validator

from app.core.ldf import LDFMethod
from app.core.triangle import Granularity, Triangle, TriangleType


class TriangleSchema(BaseModel):
    origin_periods: list[str]
    development_periods: list[int]
    values: list[list[float | None]]
    triangle_type: TriangleType = TriangleType.PAID
    origin_granularity: Granularity = Granularity.YEARLY
    development_granularity: Granularity = Granularity.YEARLY

    @field_validator("values")
    @classmethod
    def _nan_to_none(cls, v: list[list[float | None]]) -> list[list[float | None]]:
        return [
            [
                None if (isinstance(c, float) and math.isnan(c)) else c
                for c in row
            ]
            for row in v
        ]

    @field_validator("origin_periods", mode="before")
    @classmethod
    def _coerce_origins(cls, v: list) -> list[str]:
        return [str(x) for x in v]

    def to_domain(self) -> Triangle:
        return Triangle(
            origin_periods=self.origin_periods,
            development_periods=self.development_periods,
            values=self.values,
            triangle_type=self.triangle_type,
            origin_granularity=self.origin_granularity,
            development_granularity=self.development_granularity,
        )

    @classmethod
    def from_domain(cls, tri: Triangle) -> TriangleSchema:
        return cls(
            origin_periods=list(tri.origin_periods),
            development_periods=list(tri.development_periods),
            values=[list(row) for row in tri.values],
            triangle_type=tri.triangle_type,
            origin_granularity=tri.origin_granularity,
            development_granularity=tri.development_granularity,
        )


class UploadResponse(BaseModel):
    triangle: TriangleSchema
    warnings: list[str] = []
    file_data: dict | None = None


class ComputeRequest(BaseModel):
    triangle: TriangleSchema
    method: LDFMethod = LDFMethod.VOLUME_WEIGHTED
    n_years: int | None = Field(default=None, ge=1)
    excluded_origins: list[str] = []
    ldf_override: list[float] | None = None


class ComputeResponse(BaseModel):
    method: str
    n_origins: int
    origin_periods: list[str]
    ldfs: list[float]
    cdfs: list[float]
    latest_per_origin: list[float]
    ultimate_per_origin: list[float]
    reserve_per_origin: list[float]
    total_latest: float
    total_ultimate: float
    total_reserve: float


class ChatMessage(BaseModel):
    role: str
    content: str


class ExcludedCell(BaseModel):
    origin: str
    step: int


class SessionState(BaseModel):
    method: str = "volume_weighted"
    window: str = "all"
    excluded_cells: list[ExcludedCell] = []
    selected_ldfs: list[float] = []
    cdfs: list[float] = []
    total_latest: float | None = None
    total_ultimate: float | None = None
    total_ibnr: float | None = None
    per_origin: list[dict] = []


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    model: str | None = None
    # Yeni çok-modüllü payload: {"reserve": {"triangle": {...}, "session_state": {...}}, ...}
    modules: dict[str, dict] | None = None
    # Geriye dönük (sadece rezerv): üst seviye triangle + session_state
    triangle: TriangleSchema | None = None
    session_state: SessionState | None = None
    # Multi-turn tool history: önceki turların raw OpenAI mesajları (tool çağrısı +
    # sonuçları + assistant mesajları). Varsa agent tool context'ini kaybetmez.
    full_history: list[dict] | None = None


class ToolInvocation(BaseModel):
    id: str
    name: str
    module: str | None = None
    arguments: dict
    output: dict


class AgentAction(BaseModel):
    type: str
    module: str | None = None
    payload: dict


class ChatResponse(BaseModel):
    assistant_message: str
    tool_invocations: list[ToolInvocation] = []
    actions: list[AgentAction] = []
    stopped_reason: str = "final"
    # Bu tura ait raw OpenAI mesajları (tool çağrısı + sonuçları + final assistant).
    # Frontend biriktirir ve sonraki turda full_history olarak geri gönderir.
    raw_additions: list[dict] = []


class ModelOption(BaseModel):
    id: str
    label: str


class ModelsResponse(BaseModel):
    models: list[ModelOption]
    default: str
