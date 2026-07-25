"""İskonto modülü — agent ModuleSpec."""

from __future__ import annotations

from typing import Any

from app.agent.modules.base import ModuleSpec
from app.agent.tools import TOOL_SCHEMAS, dispatch_tool

_DISCOUNT_TOOL_NAMES = {
    "get_discount_state",
    "compute_discount",
}

DISCOUNT_PROMPT = """İskonto modülü — standart-bazlı (IFRS 4 / IFRS 17) Unpaid Liability değerlemesi.

TEMEL KAVRAMLAR
* Unpaid Liability = muallak + IBNR (rezerv modülünden, nominal)
* İskontolu Unpaid / BEL = Σ [nakit_akışı(t) × v(t)],  v(t) = 1/(1+r_t)^(t/12)
* Duration = ağırlıklı ortalama ödeme ayı

İKİ STANDART (compute_discount'un standard parametresi)
* IFRS 4 (varsayılan) — Türkiye/SEDDK uygulaması:
  - rate_mode: 'flat' (SEDDK 2025 = %30), 'curve' veya 'none' (nominal, iskontosuz)
  - Risk Adjustment YOK. Bilanço karşılığı = iskontolu unpaid.
* IFRS 17 — LIC (Liability for Incurred Claims):
  - Bottom-up iskonto: risk-free eğri (curve_nodes, verilmezse varsayılan TL
    eğrisi) + illiquidity_premium_bps (varsayılan 100bp)
  - BEL = iskontolu nakit akışları
  - Risk Adjustment (finansal olmayan risk):
    · risk_adjustment_method='pct_of_bel' (varsayılan): RA = BEL × risk_adjustment_pct (varsayılan 0.06)
    · risk_adjustment_method='cost_of_capital': RA = coc_rate × capital_ratio × BEL × (duration/12)
  - LIC = BEL + RA. Bilanço karşılığı = LIC.
  - rate_mode='none' IFRS 17'de GEÇERSİZ (BEL tanımı gereği iskontolu).

ARAÇLAR
* get_discount_state: Tüm branşların özet iskonto sonuçları (IFRS 4 %30 hızlı özet)
* compute_discount: Standart + parametrelerle detaylı hesap. Tüm parametreler
  opsiyonel — verilmeyenler standardın varsayılanına düşer (kullanıcıya esneklik).

ÖNEMLİ KISITLAMALAR
* İskonto hesabı için cashflow pattern gereklidir.
* Pattern eksikse → cashflow modülüne yönlendir: navigate_to(module='cashflow')
* Backend compute_discount aylık pattern yerine ortalama ödeme ayı (tek nokta)
  kullanır — yaklaşık sonuç. Tam aylık hesap + IFRS karşılaştırma tablosu için
  navigate_to(module='discount').

AKIŞ / ÖRNEKLER
1. "Hangi branşların iskonto sonuçları var?" → get_discount_state
2. "X branşını %25 ile iskonto et" → compute_discount(branch_id=..., rate_mode='flat', flat_rate=0.25)
3. "IFRS 17'ye göre LIC nedir?" → compute_discount(standard='ifrs17')
4. "IFRS 17, %8 risk adjustment ile" → compute_discount(standard='ifrs17', risk_adjustment_pct=0.08)
5. "Cost of capital yöntemiyle RA" → compute_discount(standard='ifrs17', risk_adjustment_method='cost_of_capital')
6. "İskontosuz/nominal karşılık" → compute_discount(standard='ifrs4', rate_mode='none')
7. "IFRS 4 ile IFRS 17 farkı?" → iki compute_discount çağrısı (ifrs4 + ifrs17), LIC − iskontolu unpaid farkını yorumla
8. "İskonto sayfasına git" → navigate_to(module='discount')
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
