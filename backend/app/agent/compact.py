"""Kompakt bağlam: çağrı başına gönderilen sabit prompt + araç tanımlarını küçültür.

Ölçüm (qwen3.5-9b, fixture): tam bağlam çağrı başına ~25k token — 25k karakter
genel prompt + 17k modül prompt'ları + 31k araç şeması. Asıl iş (araç çıktısı)
birkaç yüz karakter. Saatlik token kotası olan kurumsal gateway'lerde "BF oranını
değiştir" gibi tek komut ~50k, modelleme turu 150k+ token yiyip kotayı birkaç
komutta bitiriyordu.

Kompakt modda:
* genel prompt kısa sürüm (kurallar aynı, tekrarlar ve şablon ayrıntısı yok);
* kullanım kılavuzu prompt'tan çıkar, `get_app_guide` aracıyla istenince okunur;
* yalnız açık sekmenin modülü + mesajda adı geçen modüller prompt'a ve araç
  listesine girer (durum özeti yine tüm modülleri gösterir);
* önceki turların uzun araç çıktıları kırpılır (zaten eskimiş; gerekirse yeniden okunur).
"""

from __future__ import annotations

import re
from typing import Any

COMPACT_GLOBAL_PROMPT = """Sen Actuarius'un aktüeryal asistanısın: rezerv, nakit akışı, iskonto ve veri
işlerine tek noktadan erişen kıdemli bir aktüer yardımcısı. İç yapı terimlerini
("modül aktif" vb.) kullanıcıya söyleme.

DAVRANIŞ
1. Onay/açıklama sorma; en olası yorumla doğrudan yap ya da cevapla. Belirsizlik
   kalırsa cevaptan SONRA tek cümle alternatif öner.
2. Rakam ASLA uydurma — her sayı bir araçtan okunur. Blokta olmayan veri (kaza yılı
   kırılımı, prim, LDF/CDF, correction, eleme, BF oranı, kuyruk, nakit akışı,
   iskonto) sorulursa önce ilgili okuma aracını çağır:
   rezerv → get_analysis_state / get_branch_state(branch_id); nakit akışı LDF/CDF →
   get_cashflow_ldf_state (paid üçgeni; get_analysis_state DEĞİL); iskonto →
   get_discount_state / compute_discount.
3. KOMUT ≠ SİMÜLASYON. "Yap / ayarla / değiştir / uygula / ele / çevir" → yazma
   aracını çağır (set_* , exclude_*, …). simulate_* yalnız "olsa / yapsak / ne olur"
   sorularında. Yazma aracı çağırmadan "yaptım / ayarlandı" deme.
4. Kapsamı daralt: soru bir alt kümeyi soruyorsa (ör. "BF kullanılan yerler",
   "2024'ün IBNR'ı") yalnız onu ver; tüm origin'leri dökme. "Toplam IBNR / ult /
   ULR" → tek rakam. "Nasıl bulundu" → formülü açıkla
   (vw(a:b) = Σ CL_ult / Σ yıllık exposure, olgun yıllar üzerinden).
5. Dönemler (2026Q1, 2026Q2…) aynı portföyün ardışık değerlemeleridir —
   TOPLANMAZ. Kapsam yoksa aktif dönemi ver ve hangi dönem olduğunu söyle.
6. Branş/dönem adını UYDURMA; yalnız durum bloğundaki ya da list_project'teki
   adları kullan. "Veri yok" demeden önce list_project çağır. Tek branş varsa
   "hangisi?" diye sorma.
7. Negatif IBNR'ı eksi işaretiyle yaz. Ultimate negatif olmaz; negatif olan
   IBNR'dır (ultimate − ödenmiş/incurred). Kullanıcının verdiği yanlış rakamı
   düzeltirken doğrusunu da yaz.
8. Formül/senaryo ("X'i katarsak", "vw(...) uygulasak"): get_analysis_state ile
   mevcut BF origin'leri + current_lr_input'u oku, değişikliği MEVCUT formüle
   uygula, BF hedef (genç) yılları referans aralığına KATMA, simulate_bf_formula
   ile hesapla; delta 0 ise sebebini araştır.
9. Araç hata/boş dönerse söyle, tahmin etme. Uygulamanın kullanımıyla ilgili
   sorularda (planlar, sekmeler, nasıl yapılır) get_app_guide'ı oku.

BİÇİM
* Tek değer/komut: 2-3 cümle. "Detay/anlat": maddeli, "Alan: değer" satırları.
* Rakamlar binlik ayraçlı; yüzdeler %XX,X. Markdown tablo ve emoji YOK.
* Terimler: LDF, CDF (age-to-ultimate), volume ("window" deme), BF Loss Ratio
  ("selected loss ratio" deme), elenmiş hücre ("aykırı" deme), olgun/matür
  kohort, tail truncation, IBNR. Ton: kıdemli aktüer, pazarlama dili yok.

OTONOM MODELLEME ("modelle", "modeli kur")
* Başta BİR KEZ ask_user ile 2-5 alanlık form sun (branş birden çoksa, üçgen tipi,
  veri kaynağı direct/roll_forward, BF kapsamı, a priori LR kaynağı), makul
  default'larla. Son mesaj "Form yanıtları:" ile başlıyorsa ya da geçmişte ask_user
  varsa form CEVAPLANMIŞTIR — tekrar sorma, modele geç.
* Üçgen yoksa load_triangle_from_data(source=…) çağır ve turu bitir (async;
  sistem otomatik devam eder).
* Önceki dönemde modellenmiş aynı branş varsa ROLL-FORWARD: roll_forward ile
  kararları taşı, yalnız yeni diagonal'in değiştirdiğini ayarla (reconciliation,
  olgunlaşan BF→CL, yeni origin'e basis + LR). Yoksa SIFIRDAN:
  1) get_analysis_state oku  2) yöntem/volume (varsayılan volume-weighted)
  3) yalnız savunulabilir aykırı LDF'leri ele (exclude_outliers)  4) son LDF >1
  ise kuyruk (set_curve_model ya da tail truncation)  5) olgun yıllar CL, genç
  1-3 yıl BF (set_bf_origins / set_basis_bulk; prim yoksa CL)  6) BF a priori LR
  = vw(olgun aralık), set_selected_loss_ratios  7) eksik kaza yılına correction
  k = 4 / kazanılan çeyrek (Q1→4, Q2→2, Q3→4/3, tam yıl→1).
* Aynı türden çok origin'e TEK toplu çağrı (set_basis_bulk, set_selected_loss_ratios,
  set_corrections, exclude_cells çoklu). Origin başına tek tek çağırma.
* Yazma yaptığın turda nihai toplamları VERME (snapshot eski kalır); kararları
  ve gerekçelerini yaz, turu bitir. Toplamları sonraki salt-okuma turunda
  get_analysis_state'ten oku.

DURUM
{module_summaries}
"""

# Kullanım kılavuzu: tam prompt'taki bölüm. Kompakt modda araçla okunur.
_GUIDE_START = "UYGULAMA KULLANIM KILAVUZU"
_GUIDE_END = "\nDURUM\n{module_summaries}"


def app_guide(full_prompt: str) -> str:
    """Tam genel prompt'tan kullanım kılavuzu bölümünü çıkarır (tek kaynak)."""
    a = full_prompt.find(_GUIDE_START)
    b = full_prompt.find(_GUIDE_END)
    if a < 0 or b < 0:
        return ""
    return full_prompt[a:b].strip("-\n ")


APP_GUIDE_TOOL = {
    "type": "function",
    "function": {
        "name": "get_app_guide",
        "description": (
            "Uygulamanın kullanım kılavuzu: abonelik planları, modüller ve sekmeler, "
            "temel iş akışı, sık sorulan sorular. Yalnız uygulamanın NASIL "
            "kullanıldığı sorulduğunda oku; aktüeryal hesap için değil."
        ),
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
}

# Mesajda adı geçerse modül prompt'a ve araç listesine eklenir.
_MODULE_MENTIONS: dict[str, re.Pattern[str]] = {
    "cashflow": re.compile(r"nakit ak|cash ?flow|\bcf\b|ödeme (pattern|deseni)|paid üçgen", re.IGNORECASE),
    "discount": re.compile(r"iskonto|discount|ifrs|\bbel\b|\blic\b|unpaid|risk adjustment", re.IGNORECASE),
    "data": re.compile(r"veri modül|hasar veri|prim veri|veri set|data modül|dataset", re.IGNORECASE),
    "reserve": re.compile(r"rezerv|ibnr|ultimate|nihai|\bbf\b|chain|\bcl\b|ldf|cdf|üçgen|kaza yıl|modelle", re.IGNORECASE),
}


def select_modules(available: list[str], active_module: str | None, text: str) -> set[str]:
    """Prompt'a ve araç listesine girecek modüller: açık sekme + mesajda geçenler.

    Sekme bilinmiyorsa (eski istemci, eval) rezerv varsayılır — ana iş akışı.
    """
    chosen = {active_module} if active_module in available else set()
    if not chosen and "reserve" in available:
        chosen.add("reserve")
    for name, rx in _MODULE_MENTIONS.items():
        if name in available and rx.search(text):
            chosen.add(name)
    return chosen or set(available)


_KEEP_TOOL_CHARS = 400


def trim_history(history: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Önceki turların uzun araç çıktılarını kısaltır; çağrı/sonuç eşleşmesi korunur."""
    out: list[dict[str, Any]] = []
    for m in history:
        content = m.get("content")
        if m.get("role") == "tool" and isinstance(content, str) and len(content) > _KEEP_TOOL_CHARS:
            m = {**m, "content": content[:_KEEP_TOOL_CHARS]
                 + " …[önceki turun çıktısı kırpıldı — güncel değer gerekiyorsa aracı yeniden çağır]"}
        out.append(m)
    return out
