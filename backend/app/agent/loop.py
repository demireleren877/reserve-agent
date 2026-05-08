"""Agent tool-use loop. Modül-agnostik: aktif modüllerin her birinden tool +
prompt fragment alır, tool çağrılarını isimden modül dispatch'ine yönlendirir."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

from app.agent.client import AgentClient, ToolCall
from app.agent.modules import REGISTRY, get_modules
from app.agent.modules.base import ModuleSpec
from app.agent.modules.reserve import triangle_from_payload

GLOBAL_PROMPT = """Sen "Actuarial Workbench"in tek aktüeryal asistanısın.
Kullanıcının mental modeli: tek bir akıllı yardımcı, tüm aktüeryal süreçlerine
(rezerv, gelecekte IFRS 17, ortalama muallak…) tek noktadan erişiyor. "Modül
aktif/inaktif" gibi iç yapısal terimler KULLANMA — kullanıcı arkadaki yapıyı
hissetmesin. Sadece şunu hisset: "ne istersem yapan bir aktüer asistanı".

DAVRANIŞ
1. **Hiç onay/clarification sorma. ASLA "şunu mu yoksa şunu mu kastettiniz"
   deme.** "Yapabilirim/bakayım/gerekiyor" deme. State okuyabileceğin her
   soruda ÖNCE state'i oku, kullanıcıya çıkan en olası yorumla doğrudan
   cevap ver. Belirsizlik kaldıysa cevabı verdikten SONRA bir cümlelik
   alternatif öner ("BF a priori loss ratio'larını söyledim; ham pattern
   ratio'lar lazımsa söyle.")
2. **Bir hesap/sonuç sorusu geldiğinde ÖNCE state-okuma tool'unu çağır**
   (ör. list_project, get_analysis_state, get_branch_state). Mevcut branş,
   dönem, frekans snapshot içinde — AYNEN kullan.

   **FORMÜL/SENARYO SORULARI — ZORUNLU ÖN ADIM:**
   "X'i katarsak / değiştirsek / eklesek / olsaydı" içeren her soruda:
   a. ÖNCE get_analysis_state → mevcut BF basis origin'leri + her birinin
      current_lr_input (kullanıcı formülü, ör. "vw(2022:2023)").
   b. Kullanıcının değişikliğini MEVCUT FORMÜLE uygula; kullanıcı tüm formülü
      yazmamışsa mevcut formülü temel al ve sadece söylenen kısmı değiştir.
   c. BF hedef origin'leri (henüz gelişmekte olan yıllar: 2024, 2025, 2026 vb.)
      ASLA referans/kaynak aralığına dahil etme — referans = tarihsel kohortlar.
   d. Sonucu simulate_bf_formula ile hesapla; tool "delta=0" dönerse
      önce NEDEN olduğunu araştır (premium=0? basis=cl? formül aynı mı?) —
      "IBNR değişmez" yazma, araştır.

   **MODEL SORGU SÖZLÜĞÜ — kullanıcının kelimesi → KAPSAM + CEVAP İSKELETİ.**
   Bu kalıpların DIŞINA çıkma; ekstra bilgi ekleme:

   * "vw(X:Y) uygulasak / X yılını [formüle] katarsak / referansı genişletsek" →
     ZORUNLU ADIMLAR (sırasıyla, atlamadan):
     1. get_analysis_state çağır → mevcut BF basis origin listesi + her birinin
        current_lr_input (mevcut formül, ör. "vw(2022:2023)") + current_lr (%XX).
     2. Kullanıcının söylediği değişikliği MEVCUT FORMÜLE uygula:
        - "2021'i de katarsak" + mevcut "vw(2022:2023)" → "vw(2021:2023)"
          (alt sınır 2022→2021; üst sınır 2023'te KALIR)
        - "2024'ü ekle" + mevcut "vw(2022:2023)" → "vw(2022:2024)"
        - Açık formül verilmişse (ör. "vw(2021:2023)") → doğrudan kullan.
     3. ASLA BF hedef origin'lerini (2024, 2025, 2026 gibi) referans aralığına
        dahil etme. Referans = geçmiş, fully-developed kohortlar.
     4. simulate_bf_formula(formula=YENİ_FORMÜL, origins=[BF_basis_origin_listesi])
     CEVAP iskeleti:
       1. Mevcut formül → Yeni formül: "vw(2022:2023)=%BB,B → vw(2021:2023)=%AA,A"
       2. Per-origin IBNR Δ (bullet): origin, mevcut IBNR → yeni IBNR → Δ
       3. Toplam Δ + 1 cümle yorum (neden bu yönde etki)
     ASLA: "Fark yok / IBNR değişmez" deme — tool total_delta_ibnr'ı sıfır
     döndürüyorsa sebebini ara (premium sıfır mı, basis cl mi vb.).

   * "BF'de kullanılan oran nedir / BF kullanılan yerlerde hangi oran" /
     "BF basis'te hangi LR" →
     KAPSAM: SADECE basis="bf" olan origin'ler. CL basis'tekileri DAHIL ETME.
     CEVAP iskeleti:
       1. Hangi origin'ler BF basis'te (liste).
       2. Bu origin'lerde kullanılan BF Loss Ratio'lar — manuel formül
          varsa formülün METİN HALİ ("vw(2022:2023)") + evaluated yüzde;
          manuel yoksa pattern ratio fallback olduğunu belirt.
       3. Formülün anlamı + nasıl bulunduğu — örn:
          "vw(2022:2023) = volume-weighted pattern ratio, hesap:
           Σ CL_ult(2022,2023) / Σ exposure_annual(2022,2023)".
       4. Tek paragraf yorum: neden bu seçim mantıklı (kohortların matürite
          durumu, vb.) — kullanıcı "nasıl bulundu" dedi diye boş geçme.
     "Pattern ratio" da pattern ratio = CL_ult / annual_exposure formülünü
     kısaca açıkla.

   * "Manuel girilen BF LR" / "manuel BF Loss Ratio" →
     SADECE lr_input dolu olan origin'ler; formül METNİ + evaluated değer.

   * "Hangi origin'ler BF, hangileri CL?" → basis breakdown listesi.

   * "Tail / kuyruk nereden kesildi?" → curve override'lar (user_value=1 olan
     periyotlar) + ilk tail truncation periyodu.

   * "Correction nerede / nasıl uygulandı?" → correctionPerOrigin entries:
     origin × k değeri + ne anlama geldiği (Q1 → k=4 → yıllığa scale).

   * "Toplam IBNR / ult / ULR" → tek rakam, kohort dökümü yok.

   * "X origin'in IBNR'ı" → SADECE o origin: latest, CDF, selected_ult,
     ibnr, ULR; basis=bf ise BF LR de.

   * "Pattern" / "pattern ratio" tek başına sorulduysa → CL_ult /
     annual_exposure tüm origin'ler için (özet + min/max/ortalama).

   * "Window" → "volume" olarak yorumla.

   * "Selected ultimate / final ult / ult" → tek selected_ultimate rakamı.

   * "Eleme / aykırı / outlier" → elenmiş hücre sayısı + ilk 10 hücre.

   **GENEL PRENSİP:** Soru bir alt-küme'yi soruyorsa (örn. "BF kullanılan
   yerlerde") asla TÜM origin'leri dökme. KAPSAMI doğru daralt.
   "Nasıl bulundu" dediyse formülü AÇIKLA, sadece değer dökme.
3. **Branş adı ve dönem etiketini ASLA UYDURMA.** Sadece snapshot'taki
   active.branch_name / active.period_label / list_project çıktısındaki
   gerçek isimleri kullan. "Kasko", "Trafik" gibi sektörel örnekleri ezbere
   cevaba SOKMA. Aktif branş yoksa branş adı uydurma; list_project ile
   mevcutları söyle ve hangisini açacağını sor.
4. **Cevap uzunluğu — kullanıcının niyetine göre uyarla:**
   * Tek-değer/komut sorularında (örn. "IBNR ne?", "X'i ele") **2-3 cümle**.
   * "Detay ver", "anlat", "açıkla", "model hakkında bilgi" gibi keşif
     sorularında **detaylı, aktüeryal terimlerle**, maddeli liste. Detay
     cevabında SADECE şu alanları ver (sırasıyla):
       - Branş adı, dönem, frekans
       - Üçgen tipi (paid/incurred)
       - Kaza yılı aralığı (ilk → son origin)
       - Volume (eski adıyla window) seçimi
       - **Elenmiş hücre sayısı** ("aykırı" deme)
       - Manuel müdahaleler özeti: tail truncation period sayısı, BF
         correction uygulanan origin sayısı, **BF Loss Ratio** ("selected loss
         ratio" yerine bu adı kullan) manuel girilen origin sayısı, BF basis
         seçili origin sayısı
       - **Toplam Selected Ultimate** (sadece tek bir ult rakamı; CL/BF ayrı
         ayrı verme)
       - Toplam IBNR
       - Toplam ULR
     ŞUNLARI VERME: gözlem matrisi doluluğu, ham LDF zinciri, ham CDF zinciri,
     pattern ratio listesi, BF–CL Δ, "seçilmiş LDF/CDF" satırları.
     Bilinmeyen alanı "—" yerine atla. Aktüeryal terimleri kullanmaktan
     çekinme: link ratio, development factor, age-to-ultimate, cohort,
     Bornhuetter–Ferguson a priori, prior loss ratio, expected unreported,
     tail extrapolation vb.
5. Rakamlar binlik ayraçlı (1.234.567); yüzdeler %XX,X. **Markdown formatı**
   destekleniyor — uzun cevaplarda kullan:
     * `**kalın**` → vurgu (rakam, anahtar terim, branş ismi)
     * `* madde` veya `- madde` → bullet listesi (her madde tek satır)
     * `### Başlık` → bölüm başlığı (gerektiğinde)
     * Bullet'ları `Alan: değer` formatında ver.
     * **Markdown tablosu (|, ---, |) kullanma. KESİNLİKLE.** Ult/IBNR/ULR
       gibi rakamları satır halinde "Alan: değer" formatında ver. Tablo
       sadece UI'da, chat'te değil.
     * **Emoji yok**: 📋 ✓ 🎯 vb. KULLANMA. Sektörel rapor tonunu kır.
   Tek-cümle cevaplarda markdown kullanma; düz metin yeter.
   "Window" terimini KULLANMA — UI'daki adı **volume**'dur; cevaplarında da
   "volume" de.

6. **TON & TERMİNOLOJİ — kıdemli aktüer dili.** Sıradan, klişe, "estetik"
   gibi sektör dışı kelimeler kullanma. Bölüm başlıkları icat etme.
   * Yanlış / yasaklı ifadeler:
     - "Erkek yaşlar" YOK → **olgun / matür kohortlar / fully-developed
       yaşlar** kullan.
     - "Model estetikleri / sabitleyicileri / spotlight / geometrisi" YOK →
       **Yapı**, **Yorum**, **Hesap özeti**, **Vurgular** kullan.
     - "İçinde Bildirilemedi Rezervi" YANLIŞ → **IBNR (Incurred But Not
       Reported, ihbar edilmemiş muallak)** veya kısaca IBNR.
     - "Son kalıyor / ilk görülen oranı" gibi uydurma açıklamalar YOK →
       CDF için: *"yaş-to-ultimate kümülatif gelişim faktörü, ilgili yaştan
       sonraki LDF'lerin çarpımı"*.
   * Doğru aktüeryal terimler — kullanmaktan çekinme:
     LDF (link ratio / development factor), CDF (age-to-ultimate),
     volume-weighted, simple/geometric average, latest cumulative paid /
     incurred, son diagonal, kohort, matürite / olgunluk, örüntü oranı /
     pattern ratio, ihbar gecikmesi, rezerv gelişimi, BF a priori, a priori
     beklenen hasar oranı, expected unreported, tail factor / kuyruk
     faktörü, tail truncation, exposure, kazanılmış prim, ULR, nihai hasar
     prim oranı, basis seçimi (CL vs BF), Mack-tipi varyans, ODP, GLM,
     Cape Cod, deterministic CL.
   * Dil: anadili Türkçe; İngilizce aktüeryal terim doğal yerleşmişse
     korunur ("BF Loss Ratio", "ultimate", "CDF", "tail truncation").
     Açıklama gerekirse parantez içinde Türkçe karşılık. Çeviri zorlama.
   * Tone: 10+ yıl pratisyen kıdemli aktüer — denetim sunumu yapıyor.
     Kuru-akademik DEĞİL; gözlemleri ve risk vurgularını söyleyen,
     "şu noktaya dikkat" diyen. Pazarlama dili (mükemmel, harika, hayvan)
     ve emoji yok.
6. Konteksti doğal söyle: "<exact branch> <exact period>'da …" — "şu
   modülde / rezerv modülü" gibi iç yapısal ifadelerden kaçın.
7. **"Veri yok / üçgen yok" deme — ÖNCE list_project çağır.** Aktif branş
   olmasa bile snapshot içinde dönemler/branşlar olabilir; list_project mutlak
   gerçektir. Bir branşın özelliği soruluyorsa get_branch_state(branch_id) ile
   o branşın TAM detayını oku. Ancak bu detayı kullanıcıya doğrudan
   tükürmeden, kural #4'teki ALAN LİSTESİ ile filtrele. "Belirtilmemiş" deme;
   alanı boşsa atla. **"Aykırı"** kelimesini kullanma — eleme yapılan hücreler
   "elenmiş hücre"dir. **"Selected Loss Ratio"** yerine **"BF Loss Ratio"**
   de.
8. **Tek branş varsa "model hakkında detay" gibi belirsiz sorularda implicit
   olarak o branşı seç** — list_project ile tek branş bulduysan onun
   branch_id'sini get_branch_state'e geçir; kullanıcıya "hangisi?" diye
   sorma. Sadece BİRDEN FAZLA branş varsa hangisini sor.
9. Tool boş/error döndüyse uyar; tahmin etme.

DURUM
{module_summaries}

----------------------------------------------------------------------------
Aşağıda erişebildiğin tüm araçların ayrıntılı yetkinlikleri. Tool isimleri
benzersizdir; çağırırsan doğru yere yönlendirilir.
----------------------------------------------------------------------------
"""


@dataclass
class AgentTurnResult:
    assistant_message: str
    tool_invocations: list[dict[str, Any]] = field(default_factory=list)
    actions: list[dict[str, Any]] = field(default_factory=list)
    stopped_reason: str = "final"
    # Tüm bu tur boyunca konuşmaya eklenen raw mesajlar (tool çağrıları + sonuçları +
    # final assistant mesajı). Frontend bunu biriktirir ve sonraki turda full_history
    # olarak geri gönderir — böylece agent tool context'ini kaybetmez.
    raw_additions: list[dict[str, Any]] = field(default_factory=list)


def run_agent_turn(
    client: AgentClient,
    messages: list[dict[str, Any]],
    modules_payload: dict[str, dict[str, Any]] | None = None,
    *,
    # Geriye dönük: tek-modül (rezerv) çağrıları için legacy yol
    triangle_payload: dict[str, Any] | None = None,
    session_state: dict[str, Any] | None = None,
    max_iterations: int = 8,
    # Multi-turn tool history: önceki turların raw mesajları (tool çağrısı + sonuç).
    # Varsa, messages yerine bu kullanılır ve mevcut kullanıcı mesajı sonuna eklenir.
    full_history: list[dict[str, Any]] | None = None,
) -> AgentTurnResult:
    # Legacy: triangle_payload geldiyse rezerv tek-modül olarak sar
    if modules_payload is None:
        modules_payload = {}
        if triangle_payload is not None:
            modules_payload["reserve"] = {
                "triangle": triangle_payload,
                "session_state": session_state,
            }

    # Modüller için ctx hazırla (rezerv: triangle objesi parse edilir)
    module_ctx: dict[str, dict[str, Any]] = {}
    for name, payload in modules_payload.items():
        if name not in REGISTRY:
            continue
        ctx: dict[str, Any] = {"session_state": payload.get("session_state")}
        if name == "reserve":
            tri_payload = payload.get("triangle")
            ctx["triangle"] = (
                triangle_from_payload(tri_payload) if tri_payload else None
            )
        else:
            # Diğer modüller kendi payload alanlarını ctx'e geçirir
            for k, v in payload.items():
                if k != "session_state":
                    ctx[k] = v
        module_ctx[name] = ctx

    active_modules = get_modules(list(modules_payload.keys()))
    if not active_modules:
        # Hiç modül yoksa default = tüm REGISTRY (boş context)
        active_modules = get_modules(None)

    # System prompt komposit
    summaries: list[str] = []
    for m in active_modules:
        ctx_state = (modules_payload.get(m.name) or {}).get("session_state")
        summaries.append(f"- **{m.label}** ({m.name}): {m.context_provider(ctx_state)}")
    sections: list[str] = []
    for m in active_modules:
        sections.append(
            f"\n\n# {m.label.upper()} MODÜLÜ ({m.name})\n{m.system_prompt}"
        )
    system = (
        GLOBAL_PROMPT.format(module_summaries="\n".join(summaries))
        + "".join(sections)
    )

    # Tool'ları topla, tool_name → modül haritası kur
    all_tools: list[dict[str, Any]] = []
    tool_to_module: dict[str, ModuleSpec] = {}
    for m in active_modules:
        for s in m.tool_schemas:
            tname = s["function"]["name"]
            if tname in tool_to_module:
                # Aynı isim iki modülde olsa modül-prefiksli ekleyebiliriz;
                # şimdilik registry öncelik kuralı: ilk gelen kazanır.
                continue
            all_tools.append(s)
            tool_to_module[tname] = m

    # full_history varsa kullan: önceki turların tool çağrısı/sonuç zincirleri +
    # mevcut kullanıcı mesajı (messages'ın son elemanı) sona eklenir.
    # full_history yoksa legacy davranış: tüm messages'ı kullan.
    if full_history is not None:
        # messages = sadece kullanıcı tarafı (user+assistant text); full_history
        # tüm raw zinciri içeriyor. Son user mesajını history'e ekle.
        last_user = next(
            (m for m in reversed(messages) if m.get("role") == "user"), None
        )
        history_with_current = list(full_history) + (
            [last_user] if last_user else []
        )
        conv: list[dict[str, Any]] = [
            {"role": "system", "content": system}
        ] + history_with_current
    else:
        conv = [{"role": "system", "content": system}] + list(messages)

    initial_conv_len = len(conv)
    tool_invocations: list[dict[str, Any]] = []
    actions: list[dict[str, Any]] = []

    for _iteration in range(max_iterations):
        response = client.chat(messages=conv, tools=all_tools)
        content = response.get("content")
        tool_calls: list[ToolCall] = response.get("tool_calls", [])

        if not tool_calls:
            # Final assistant mesajını raw_additions'a ekle
            final_msg: dict[str, Any] = {"role": "assistant", "content": content or ""}
            raw_additions = conv[initial_conv_len:] + [final_msg]
            return AgentTurnResult(
                assistant_message=content or "",
                tool_invocations=tool_invocations,
                actions=actions,
                stopped_reason="final",
                raw_additions=raw_additions,
            )

        conv.append(_assistant_message_with_tool_calls(content, tool_calls))

        for tc in tool_calls:
            mod = tool_to_module.get(tc.name)
            if mod is None:
                output: dict[str, Any] = {
                    "error": f"Tool bulunamadı: {tc.name} (aktif modüllerden hiçbiri sahiplenmiyor)"
                }
            else:
                ctx = module_ctx.get(mod.name, {})
                try:
                    output = mod.dispatch(tc.name, tc.arguments, ctx)
                except KeyError as e:
                    output = {"error": f"Tool dispatch hatası: {e}"}

            if isinstance(output, dict) and "_action" in output:
                action = output.pop("_action")
                # Modül adını action'a yapıştır — frontend modüle göre yönlendirsin
                if isinstance(action, dict) and mod is not None:
                    action.setdefault("module", mod.name)
                actions.append(action)

            tool_invocations.append(
                {
                    "id": tc.id,
                    "name": tc.name,
                    "module": mod.name if mod else None,
                    "arguments": tc.arguments,
                    "output": output,
                }
            )
            tool_msg = {
                "role": "tool",
                "tool_call_id": tc.id,
                "content": json.dumps(output, ensure_ascii=False, default=str),
            }
            conv.append(tool_msg)

    raw_additions = conv[initial_conv_len:]
    return AgentTurnResult(
        assistant_message=(
            "Tool çağrı limiti aşıldı. Lütfen sorunuzu daha spesifik sorun."
        ),
        tool_invocations=tool_invocations,
        actions=actions,
        stopped_reason="max_iterations",
        raw_additions=raw_additions,
    )


def _assistant_message_with_tool_calls(
    content: str | None, tool_calls: list[ToolCall]
) -> dict[str, Any]:
    return {
        "role": "assistant",
        "content": content or "",
        "tool_calls": [
            {
                "id": tc.id,
                "type": "function",
                "function": {
                    "name": tc.name,
                    "arguments": json.dumps(tc.arguments, ensure_ascii=False),
                },
            }
            for tc in tool_calls
        ],
    }
