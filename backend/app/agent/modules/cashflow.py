"""Nakit Akışı modülü — agent ModuleSpec."""

from __future__ import annotations

from typing import Any

from app.agent.modules.base import ModuleSpec
from app.agent.tools import TOOL_SCHEMAS, dispatch_tool

_CASHFLOW_TOOL_NAMES = {
    "get_cashflow_state",
    "get_cashflow_ldf_state",
    "get_cashflow_pattern_state",
    "set_cashflow_window",
    "exclude_cashflow_cells",
    "clear_cashflow_exclusions",
    "set_cashflow_cdf_model",
    "set_cashflow_cdf_model_bulk",
    "set_cashflow_cdf_user_value",
    "reset_cashflow_curve",
}

CASHFLOW_PROMPT = """Nakit Akışı modülü — branş bazlı LDF/CDF ve aylık ödeme dağılımı.

AMAÇ
Paid üçgeninden LDF hesabı → CDF cascade → nakit akışı pattern → aylık ödeme
dağılımı (180 aya kadar). Bu pattern iskonto modülünde kullanılır.

TEMEL KAVRAMLAR
* LDF penceresi (ldf_window): Son N origin bazlı hacim ağırlıklı LDF agregasyonu.
  Rezerv LDF'inden BAĞIMSIZ. set_cashflow_window ile değiştir.
* Elenen hücreler (cashflowLdfExcludedCells): Paid üçgeninden belirli (origin, step)
  çiftlerini LDF hesabından çıkar. exclude_cashflow_cells ile ekle,
  clear_cashflow_exclusions ile temizle.
* CDF model: Her gelişim dönemi için tail curve modeli.
  1=Initial (LDF'ten), 2=Exp Decay, 3=Inv Power, 4=Power, 5=Weibull, 6=User Value.
  set_cashflow_cdf_model ile değiştir.
* User Value CDF: Manuel CDF değeri. set_cashflow_cdf_user_value ile yaz
  (otomatik olarak model=6 aktif eder).
* Aylık pattern: Nakit Akışı sayfasında CF Pattern sekmesindeki hesaplama
  çalıştırıldığında has_pattern=true olur. Pattern iskonto için zorunludur.

AKIŞ KURALLARI
* Branşların durumunu öğren → get_cashflow_state (özet)
* Belirli branş LDF detayı → get_cashflow_ldf_state (branch_id opsiyonel, yoksa aktif)
* LDF penceresini değiştir → set_cashflow_window(window=..., branch_id=...)
* Hücre ele → exclude_cashflow_cells(cells=[{origin, step}], branch_id=...)
* Tüm elemeleri temizle → clear_cashflow_exclusions(branch_id=...)
* Curve modelini değiştir → set_cashflow_cdf_model(dev_period=..., model=...)
* User CDF yaz → set_cashflow_cdf_user_value(dev_period=..., value=...)
* Curve'i sıfırla → reset_cashflow_curve(branch_id=...)

KRİTİK — ARAÇ SEÇİMİ
* Nakit akışı LDF/CDF soruları için SADECE get_cashflow_ldf_state kullan.
  ASLA get_branch_state veya get_analysis_state kullanma — bunlar rezerv modülüne
  aittir ve incurred üçgeninden hesaplanan farklı LDF değerlerini döner.
* Cashflow LDF'leri PAID üçgeninden hesaplanır; rezerv LDF'leri INCURRED üçgeninden.
  Değerler tamamen farklı olabilir — karıştırma.
* branch_id verilmezse aktif branş varsayılır.
* per_dev dizisindeki step_idx 0-tabanlıdır. step=0 → 1.→2. dönem geçişi.
* Pattern hesaplanmamış branşta iskonto çalışmaz.
* Nakit Akışı sayfasında paid üçgeni yüklü branşlar görünür.
* Pattern verisi → get_cashflow_pattern_state
  - Varsayılan mode='quarterly': CF Pattern sekmesindeki çeyreklik dağılım (period, weight)
  - mode='monthly': 180 aylık Aylık Pattern dağılımı
  - origin belirtilirse o kaza yılının detaylı dizisi, belirtilmezse tüm origin'ler özet
  - Pattern, Nakit Akışı sayfasında branş açılınca otomatik hesaplanır ve kaydedilir.
    Daha önce hiç açılmamış branşta has_pattern=false olur — kullanıcıya Nakit Akışı
    sayfasında o branşa tıklamasını söyle.
"""


def _cashflow_context(session_state: dict[str, Any] | None) -> str:
    if not session_state:
        return "yüklenmemiş"
    periods = session_state.get("periods", []) or []
    branches = [b for p in periods for b in p.get("branches", [])]
    with_tri = sum(1 for b in branches if b.get("has_paid_triangle"))
    with_pat = sum(1 for b in branches if b.get("has_pattern"))
    active_id = session_state.get("active_branch_id")
    active_name = next(
        (b.get("name") for p in periods for b in p.get("branches", [])
         if b.get("id") == active_id),
        None,
    )
    active_str = f", aktif={active_name}" if active_name else ""
    return f"{len(branches)} branş, {with_tri} üçgen yüklü, {with_pat} pattern hesaplı{active_str}"


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
