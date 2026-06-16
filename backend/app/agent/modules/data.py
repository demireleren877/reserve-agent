"""Veri modülü + Navigasyon — agent ModuleSpec."""

from __future__ import annotations

from typing import Any

from app.agent.modules.base import ModuleSpec
from app.agent.tools import TOOL_SCHEMAS, dispatch_tool

_DATA_NAV_TOOL_NAMES = {
    "list_data_periods",
    "navigate_to",
}

DATA_PROMPT = """Veri modülü — merkezi veri deposu ve uygulama navigasyonu.

VERİ MODÜLÜNDEKİ VERİ TİPLERİ
* hasar: Dosya bazlı hasar kayıtları (dosya_no, branş, hasar_tarihi, ödeme, muallak)
* prim: Dönemsel prim kazanım verileri (branş, dönem, ep)
* ucgen: Hazır paid/incurred gelişim üçgeni

KRİTİK — STOK vs AKIŞ (muallak ve ödeme yorumu):
* **Ödeme = AKIŞ.** Her gelişim döneminde o döneme ait ödeme yazılır; dönemler
  boyunca TOPLANIR → kümülatif ödeme. dataset meta'daki total_odeme budur.
* **Muallak = STOK** (dönem sonu rezerv bakiyesi). Her gelişim döneminde
  YENİDEN yazılır; ASLA dönemler boyunca toplama. Bir dosyanın muallağı =
  yalnızca SON gelişim dönemindeki bakiye. Portföy muallağı = her dosyanın son
  muallağının toplamı. dataset meta'daki total_muallak zaten bu şekilde
  (son diagonal) hesaplanır — onu olduğu gibi kullan, satır satır TOPLAMA.
* Incurred = kümülatif ödeme + son dönem muallağı (meta'da total_incurred).
* Kendi ham kayıt toplaman gerekirse muallağı satırlar boyunca toplama hatasına
  düşme; bu, aynı bakiyeyi defalarca sayıp gerçek değerin katlarına çıkarır.

VERİ ARAÇLARI
* list_data_periods: Tüm dönemleri ve dataset meta bilgilerini listele.
  Hangi dönemlerde hangi veriler var, kayıt sayıları, branş listeleri, toplam tutarlar.

NAVİGASYON
* navigate_to(module=...): Kullanıcıyı belirli modüle yönlendir.
  Modüller: 'reserve' | 'cashflow' | 'discount' | 'data' | 'home'
  Kullanım: "iskonto sayfasını aç", "nakit akışına git", "veri modülüne geç"

ÖNEMLİ
* Veri yükleme/silme işlemleri agent tarafından yapılamaz.
* Kullanıcı veri yüklemek istiyorsa → navigate_to(module='data') ile yönlendir.
"""


def _data_context(session_state: dict[str, Any] | None) -> str:
    if not session_state:
        return "yüklenmemiş"
    periods = session_state.get("periods", []) or []
    total_datasets = sum(len(p.get("datasets", [])) for p in periods)
    return f"{len(periods)} dönem, {total_datasets} dataset"


def _data_dispatch(
    tool_name: str, args: dict[str, Any], ctx: dict[str, Any]
) -> dict[str, Any]:
    ss = ctx.get("session_state")
    return dispatch_tool(tool_name, args, session_state=ss)


data_module = ModuleSpec(
    name="data",
    label="Veri & Navigasyon",
    system_prompt=DATA_PROMPT,
    tool_schemas=[s for s in TOOL_SCHEMAS if s["function"]["name"] in _DATA_NAV_TOOL_NAMES],
    dispatch=_data_dispatch,
    context_provider=_data_context,
)
