"""İskonto modülü — agent ModuleSpec."""

from __future__ import annotations

from typing import Any

from app.agent.modules.base import ModuleSpec
from app.agent.tools import TOOL_SCHEMAS, dispatch_tool

_DISCOUNT_TOOL_NAMES = {
    "get_discount_state",
    "compute_discount",
}

DISCOUNT_PROMPT = """İskonto modülü — nakit akışı tabanlı Unpaid Liability iskontosu.

TEMEL KAVRAMLAR
* Unpaid Liability = muallak + IBNR (rezerv modülünden)
* İskontolu Unpaid = Σ [nakit_akışı(t) × v(t)]  burada v(t) = 1/(1+r_t)^(t/12)
* İskonto Tutarı = Unpaid Liability − İskontolu Unpaid
* Duration = ağırlıklı ortalama ödeme ayı
* İskonto Oranları: SEDDK 2025 = %30 (flat), IFRS 17 = piyasa gözlemlenebilir

ARAÇLAR
* get_discount_state: Tüm branşların özet iskonto sonuçları (%30 ile)
* compute_discount: Belirli branş + faiz oranı/eğrisi ile detaylı hesap
  - rate_mode='flat': flat_rate=0.30 gibi tek faiz
  - rate_mode='curve': curve_nodes=[{month:12, rate:0.28}, ...] term yapısı

ÖNEMLİ KISITLAMALAR
* İskonto hesabı için cashflow pattern gereklidir.
* Pattern eksikse → cashflow modülüne yönlendir: navigate_to(module='cashflow')
* Backend tarafındaki compute_discount, aylık pattern yerine ortalama duration
  kullanır — yaklaşık sonuç verir. Tam sonuç için navigate_to(module='discount').

AKIŞ
1. "Hangi branşların iskonto sonuçları var?" → get_discount_state
2. "X branşını %25 ile iskonto et" → compute_discount(branch_id=..., rate_mode='flat', flat_rate=0.25)
3. "Yield curve ile iskonto" → compute_discount(rate_mode='curve', curve_nodes=[...])
4. "İskonto sayfasına git" → navigate_to(module='discount')
"""


def _discount_context(session_state: dict[str, Any] | None) -> str:
    if not session_state:
        return "yüklenmemiş"
    branches = session_state.get("branches", []) or []
    with_discount = sum(
        1 for b in branches if b.get("quick_discount_at_30pct") is not None
    )
    return f"{len(branches)} branş, {with_discount} tanesi iskonto edilebilir"


def _discount_dispatch(
    tool_name: str, args: dict[str, Any], ctx: dict[str, Any]
) -> dict[str, Any]:
    # discount snapshot'ı (branches + quick_discount) bu modülün session_state'i.
    # compute_discount için reserve periods/per_origin + cashflow pattern gerekiyor;
    # bunlar discount snapshot'ta da derlenmiş halde tutulur (branches içinde).
    ss = ctx.get("session_state")
    return dispatch_tool(tool_name, args, session_state=ss)


discount_module = ModuleSpec(
    name="discount",
    label="İskonto",
    system_prompt=DISCOUNT_PROMPT,
    tool_schemas=[s for s in TOOL_SCHEMAS if s["function"]["name"] in _DISCOUNT_TOOL_NAMES],
    dispatch=_discount_dispatch,
    context_provider=_discount_context,
)
