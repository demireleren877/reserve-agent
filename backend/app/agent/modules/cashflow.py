"""Nakit Akışı modülü — agent ModuleSpec."""

from __future__ import annotations

from typing import Any

from app.agent.modules.base import ModuleSpec
from app.agent.tools import TOOL_SCHEMAS, dispatch_tool

_CASHFLOW_TOOL_NAMES = {
    "get_cashflow_state",
    "set_cashflow_window",
    "set_cashflow_cdf_model",
    "set_cashflow_cdf_model_bulk",
    "reset_cashflow_curve",
}

CASHFLOW_PROMPT = """Nakit Akışı modülü — branş bazlı aylık ödeme dağılımı hesaplama.

AMAÇ
Paid üçgeninden CDF cascade → nakit akışı pattern → aylık ödeme dağılımı
(180 aya kadar). Bu pattern iskonto modülünde kullanılır.

TEMEL KAVRAMLAR
* LDF penceresi (cashflow_ldf_window): Rezerv LDF'inden BAĞIMSIZ. Cashflow için
  ayrı bir "volume" penceresi seçilebilir. set_cashflow_window ile değiştir.
* CDF model (cashflow_cdf_model): Her gelişim dönemi için tail curve modeli.
  1=Initial (LDF'ten), 2=Exp Decay, 3=Inv Power, 4=Power, 5=Weibull, 6=User Value.
  set_cashflow_cdf_model ile değiştir.
* Aylık pattern: Cashflow sayfasında hesaplama çalıştırıldıktan sonra
  has_pattern=true olur. Bu pattern iskonto hesabı için gereklidir.

AKIŞ KURALLARI
* Hangi branşlarda cashflow hesaplanmış? → get_cashflow_state
* LDF penceresini değiştir → set_cashflow_window(window=..., branch_id=...)
* Curve modelini değiştir → set_cashflow_cdf_model(dev_period=..., model=...)
* Curve'i sıfırla → reset_cashflow_curve(branch_id=...)
* Hesaplama (computeCashflow) agent tarafından tetiklenemez — kullanıcı
  Nakit Akışı sayfasında "Hesapla" butonuna tıklamalıdır.

ÖNEMLİ
* branch_id verilmezse aktif branş varsayılır.
* Pattern hesaplanmamış branşta iskonto çalışmaz → kullanıcıyı Cashflow
  modülüne yönlendir.
"""


def _cashflow_context(session_state: dict[str, Any] | None) -> str:
    if not session_state:
        return "yüklenmemiş"
    branches = session_state.get("branches", []) or []
    with_pattern = sum(1 for b in branches if b.get("has_pattern"))
    return f"{len(branches)} branş, {with_pattern} tanesi hesaplanmış"


def _cashflow_dispatch(
    tool_name: str, args: dict[str, Any], ctx: dict[str, Any]
) -> dict[str, Any]:
    ss = ctx.get("session_state")
    return dispatch_tool(tool_name, args, session_state=ss)


cashflow_module = ModuleSpec(
    name="cashflow",
    label="Nakit Akışı",
    system_prompt=CASHFLOW_PROMPT,
    tool_schemas=[s for s in TOOL_SCHEMAS if s["function"]["name"] in _CASHFLOW_TOOL_NAMES],
    dispatch=_cashflow_dispatch,
    context_provider=_cashflow_context,
)
