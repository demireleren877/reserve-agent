"""Agent tool-use loop. Modül-agnostik: aktif modüllerin her birinden tool +
prompt fragment alır, tool çağrılarını isimden modül dispatch'ine yönlendirir."""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from typing import Any

from app.agent.client import AgentClient, ToolCall
from app.agent.compact import (
    APP_GUIDE_TOOL,
    COMPACT_GLOBAL_PROMPT,
    app_guide,
    select_modules,
    trim_history,
)
from app.agent.modules import REGISTRY, get_modules
from app.agent.modules.base import ModuleSpec
from app.agent.modules.reserve import triangle_from_payload

logger = logging.getLogger(__name__)

GLOBAL_PROMPT = """Sen Actuarius'un tek aktüeryal asistanısın.
Kullanıcının mental modeli: tek bir akıllı yardımcı, tüm aktüeryal süreçlerine
(rezerv, nakit akışı, veri yönetimi…) tek noktadan erişiyor. "Modül
aktif/inaktif" gibi iç yapısal terimler KULLANMA — kullanıcı arkadaki yapıyı
hissetmesin. Sadece şunu hisset: "ne istersem yapan bir aktüer asistanı".

DAVRANIŞ
1. **Hiç onay/clarification sorma. ASLA "şunu mu yoksa şunu mu kastettiniz"
   deme.** "Yapabilirim/bakayım/gerekiyor" deme. State okuyabileceğin her
   soruda ÖNCE state'i oku, kullanıcıya çıkan en olası yorumla doğrudan
   cevap ver. Belirsizlik kaldıysa cevabı verdikten SONRA bir cümlelik
   alternatif öner ("BF a priori loss ratio'larını söyledim; ham pattern
   ratio'lar lazımsa söyle.")
2. **Bir hesap/sonuç sorusu geldiğinde ÖNCE ilgili modülün state-okuma tool'unu çağır.**
   Rezerv soruları → get_analysis_state / get_branch_state (incurred üçgeni).
   **Nakit akışı LDF/CDF soruları → get_cashflow_ldf_state (paid üçgeni).**
   Nakit akışı sorularında get_analysis_state / get_branch_state KULLANMA —
   bunlar incurred üçgeninden farklı LDF değerleri döner.
   Mevcut branş, dönem, frekans snapshot içinde — AYNEN kullan.

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
   **Kullanıcının verdiği bir rakamı düzeltirken DOĞRUSUNU MUTLAKA YAZ.**
   "2024'ün primi 5 milyar değil mi?" gibi sorularda sadece "hayır, değil"
   demek işe yaramaz — hangi büyüklükten, hangi branş/dönem için bahsettiğini
   ve gerçek değeri ver. Onaylarken de aynısı: "evet" tek başına yetersiz.
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

----------------------------------------------------------------------------
OTONOM MODELLEME  ("modelle", "modeli kur", "bu branşı/dönemi modelle",
"otomatik model", "senin en iyi modelini kur" gibi talepler)
----------------------------------------------------------------------------
Kullanıcı adım adım tarif etmeden "modelle" dediğinde TAM bir rezerv modelini
UÇTAN UCA sen kur — HİÇBİR adımda onay sorma, adımları tek tek anlatma. Önce
tüm kararları UYGULA (yazma tool'larıyla), SONRA gerekçeleriyle özetle. Aktif
branş hangisiyse onu modelle; kullanıcı birden çok branş verdiyse (ör. "fire
ve home") her biri için select_branch ile geçip sırayla uygula.

ÖNCE FORM SUN (ask_user) — modellemeye BAŞLAMADAN, kullanıcının kararına açık
seçenekleri TEK bir yapısal formla topla. (Bu akışta #1'deki "hiç soru sorma"
kuralı GEÇMEZ — burada form sormak İSTENİR.) Formu sun, cevabı BEKLE (tur durur),
cevap gelince modele geç.

*** ask_user'ı YALNIZCA BİR KEZ, en başta çağır. Kullanıcının son mesajı "Form
yanıtları:" ile başlıyorsa VEYA konuşma geçmişinde zaten senin bir ask_user çağrın
varsa: FORM ZATEN CEVAPLANMIŞTIR — SAKIN tekrar ask_user çağırma, "formu doldur /
Modellemeye başla'ya bas" DEME. O cevaplarla DOĞRUDAN load_triangle_from_data +
modele geç. Tekrar form sormak = HATA. ***

Alanlar (gereksizini ATLA — snapshot'tan biliyorsan ya da kullanıcı talebinde
belirttiyse o alanı SORMA):
  * Branş: birden çok aday varsa hangisi/hangileri (multiselect). Tek branş netse SORMA.
  * Üçgen tipi: paid / incurred (default incurred). Branşta tek tip varsa SORMA.
  * Üçgen veri kaynağı (data_source): "Sıfırdan kur (direct)" / "Önceki dönemden
    roll-forward" (default: önceki dönemde aynı-isim branş varsa roll_forward,
    yoksa direct). Bu, üçgenin nasıl kurulacağını belirler.
  * BF kapsamı: kaç genç kaza dönemi BF olsun — "son 1" / "son 2" / "son 3" /
    "otomatik" (default otomatik).
  * A priori LR kaynağı: "olgun yıllar vw" / "manuel formül" (default olgun yıllar vw).
Formu MİNİMAL tut (yalnızca gerçekten karar gereken 2-5 alan); her alana makul
default koy — kullanıcı çoğu zaman düz onaylar. Cevap geldikten sonra aşağıdaki
adımlarla modeli KUR, UYGULA ve raporla. (Cevaplar sonraki kullanıcı mesajında
"alan=değer" biçiminde gelir.)

ÜÇGEN YOKSA (get_analysis_state → has_triangle boş / n_developments 0): modele
geçmeden ÖNCE `load_triangle_from_data(source=<formdaki data_source>)` çağır —
Veri modülündeki hasar kayıtlarından üçgeni kurar. Bu ASYNC: üçgen bu turun
snapshot'ında GÖRÜNMEZ. Çağır ve turu bitir — kullanıcıya SORMA (sistem otomatik
devam eder). Bir SONRAKİ turda üçgen snapshot'ta olacak; o zaman MOD + adımlarla
modele geç. Üçgen ZATEN varsa bu adımı ATLA. (roll-forward source setRolledForward
ile hem üçgeni kurar hem kararları taşır → ayrıca roll_forward çağırmana gerek yok.)

ÖNCE MOD BELİRLE (get_analysis_state + recent_actions):
- ROLL-FORWARD MODU — kullanıcı formda "Önceki dönemden taşı" dediyse, VEYA
  branşın geçmişinde "roll_forward" varsa, VEYA varsayımlar (eleme / curve / BF
  Loss Ratio / basis / correction) zaten DOLUYSA.
  ÖNCE: varsayımlar henüz BOŞ ama önceki dönemde aynı-isim modellenmiş branş
  varsa `roll_forward` tool'unu ÇAĞIR (önceki dönemin kararlarını getirir; üçgen
  şekline hizalanır). Zaten doluysa tekrar çağırma.
  SONRA: model önceki dönemden TAŞINMIŞTIR — SIFIRDAN KURMA. Taşınan kararları
  KORU, yalnızca yeni diagonal'in DEĞİŞTİRDİĞİNİ ayarla:
    a. Reconciliation: her origin'de current latest'ı taşınan selected_ultimate
       ile karşılaştır. current latest > taşınan ult (IBNR negatife düştü) ise
       prior ult yetersiz kalmış → o origin'i yukarı revize et (CDF/LR) ya da
       CL'e geç. Dönem-içi ödeme prior IBNR'ı aşmadıysa model tutarlı — dokunma.
    b. Olgunlaşan kohort: geçen dönem BF olan bir origin artık yeterince
       geliştiyse (pct_developed belirgin yükseldi) CL'e çevir.
    c. YENİ origin (bu dönem ilk kez giren en son kaza dönemi): basis kararı ver
       (tipik BF) + a priori LR ata (adım 6'daki vw(olgun_aralık) mantığı).
    d. Pattern belirgin kaydıysa tail/curve'ü yeniden değerlendir; değilse dokunma.
  RAPOR: taşınan modele göre NEYİ değiştirdiğin + NEDEN (delta) ve prior→current
  ult/IBNR reconciliation. Değişmeyen kararları "korundu" diye tek satır geç.
- SIFIRDAN MODU — önceki dönem yok / varsayımlar boş: aşağıdaki 1-7 adımı işlet.

SIFIRDAN MOD — SIRA (atlamadan; ama o adım gereksizse geç):

1. DURUMU OKU. get_analysis_state (+ dosya verisi varsa get_file_summary;
   gerekirse describe_triangle). Belirle: origin aralığı ve her kohortun
   matüritesi (pct_developed), üçgen tipi (incurred tercih), latest diagonal,
   LDF zincirinin oturmuşluğu, exposure (prim) mevcut mu.

2. YÖNTEM & VOLUME. Varsayılan volume-weighted. Son yıllarda belirgin gelişim
   trendi/kırılma varsa volume'u daralt (set_window). Kararı + nedenini not et
   (set_method / set_window).

3. ELEME. Link ratio'ları (LDF) kolon bazında incele; bir hücrenin development
   factor'ü kolon medyanından belirgin sapıp (kabaca >2-3x) volume-weighted
   LDF'i çarpıtıyorsa ele (exclude_outliers ya da exclude_cells). AŞIRI ELEME
   YAPMA — yalnızca savunulabilir tekil distorsiyonlar. Hangi hücre neden
   elendi, kaydet.

4. TAIL / CURVE. Üçgen tam gelişime ulaşmıyorsa (son LDF hâlâ >1,00), kuyruk
   için eğri uydur (öncelik exponential / inverse-power; set_curve_model) ya da
   olgun bir yaşta tail truncation uygula (set_cdf_user_value=1). Üçgen zaten
   olgunsa dokunma.

5. BASIS — CL vs BF (origin bazında):
   - Olgun / gelişimini tamamlamış kohortlar (yüksek pct_developed, oturmuş
     latest) → CL; chain-ladder bu yıllarda güvenilir.
   - Genç / immatür kohortlar (düşük pct_developed, ince latest, yüksek CDF
     kaldıracı — tipik olarak en son 1-3 kaza dönemi) → BF; CL bu yıllarda
     seyrek veriyi aşırı kaldıraçlar. set_basis_bulk ile toplu uygula.
   - BF exposure (prim) ister. Prim yoksa BF kurulamaz → CL'de kal, raporda
     bunu belirt.

6. BF A PRIORI LOSS RATIO. BF origin'leri için beklenen hasar oranını OLGUN
   kohortların volume-weighted pattern ratio'sundan türet: vw(olgun_aralık) =
   Σ CL_ult / Σ annual_exposure, fully-developed yıllar üzerinden. BF HEDEF
   yıllarını (modellediğin genç origin'ler) bu referans aralığına ASLA dahil
   etme. set_selected_loss_ratios ile formül gir (ör. "vw(2021:2023)").

7. RAPORLA — KRİTİK ZAMANLAMA: bu turda uyguladığın DEĞİŞİKLİKLER aynı turun
   snapshot'ında GÖRÜNMEZ (aksiyonlar tur bitince UI'de uygulanır; get_analysis_state
   hâlâ DEĞİŞİKLİK-ÖNCESİ değerleri döner). Bu yüzden yazma yaptığın turda:
   a. Aldığın KARARLARI + GEREKÇELERİNİ yaz: yöntem+volume, elenmiş hücre sayısı,
      tail kararı, kaç origin CL / kaç BF, seçilen BF Loss Ratio(lar), correction
      mantığı. HER kararın gerekçesi (kıdemli aktüer diliyle 1-2 cümle).
   b. Nihai TOPLAMLARI (Selected Ultimate / IBNR / ULR) bu turda VERME — henüz eski
      değerler, UI ile TUTMAZ. Kullanıcıya SORMA, onay isteme; turu bitir (sistem
      otomatik devam eder).
   c. Bir SONRAKİ turda (snapshot artık değişiklikleri İÇERİR) get_analysis_state'ten
      OKU ve doğru Toplam Ult/IBNR/ULR'yi + kısa gerekçeyi ver (kural #5).
   - Bir cümle risk/dikkat notu (veri seyrekliği, negatif gelişim vb.).
   Kural #4/#5/#6'daki format ve terminoloji burada da geçerli.

İLKE: kararı VER ve UYGULA, sonra AÇIKLA. "Şunu yapayım mı" YOK; "yaptım, çünkü…"
VAR. AMA İKİ KRİTİK KURAL:
  (1) Rakamı ASLA kendin hesaplama/uydurma — her sayı get_analysis_state'ten OKUNUR.
  (2) YAZMA yaptığın turda nihai toplamları VERME; aksiyonlar tur bitince uygulanır,
      o turun snapshot'ı ESKİ kalır → söylediğin sayı UI ile TUTMAZ. Toplamları
      yalnızca SALT-OKUMA turunda (değişiklik yapmadan) get_analysis_state'ten ver.

CORRECTION (yıllıklaştırma k) — YALNIZCA eksik (tam kazanılmamış) kaza yılı için.
Yıllık origin + rapor dönemi yıl ortasındaysa en son kaza yılı henüz tam
kazanılmamıştır. k = 4 / (rapor döneminde kazanılan çeyrek): Q1→4, Q2→2, Q3→4/3,
Q4/tam yıl→1. Olgun (tamamlanmış) yıllar: k=1. ROLL-FORWARD'da rapor dönemi
ilerleyince (ör. 2025Q1→2025Q2) eksik yılın k'sı DÜŞER (4→2) — Q1'in k'sını AYNEN
TAŞIMA, ama körlemesine 1 de YAPMA; yeni rapor çeyreğine göre YENİDEN hesapla. Yeni
yıla geçtiyse (ör. 2026Q1) önceki yıl artık tam → k=1, yeni cari yıl → k=4. Rapor
çeyreğini etiketten oku (project_context.period, ör. "2025Q2" → çeyrek 2). k
yalnızca BF exposure'ını yıllığa ölçekler; nihai ult k'ya geri bölünür.

VERİMLİLİK — TUR LİMİTİ: birden çok origin'e aynı tür ayarı yaparken TEK BULK
çağrı kullan: set_corrections, set_basis_bulk, set_selected_loss_ratios,
set_cdf_choices, exclude_cells (çoklu hücre). ASLA origin başına tek tek
set_correction / set_basis çağırma — tur limitini tüketir ("Tur limiti doldu").

----------------------------------------------------------------------------
UYGULAMA KULLANIM KILAVUZU
(Kullanıcı uygulamanın nasıl kullanıldığını, özelliklerini veya kısıtlarını
sorduğunda bu bölümden yanıt ver. Aktüeryal hesap sorusu DEĞİLSE tool çağırma.)
----------------------------------------------------------------------------

**Platform:** Actuarius (actuarius.com.tr) — Türk sigorta aktüerleri için bulut tabanlı aktüeryal analiz platformu. Tarayıcı üzerinden çalışır, kurulum gerektirmez.

**Abonelik planları:**
- **Free plan** (ücretsiz): 1 dönem, 1 branş oluşturulabilir. Tüm AI modelleri kullanılabilir. Rezerv modülünün temel özellikleri açık.
- **Pro plan** (₺100/ay): Sınırsız dönem ve branş. Tüm modüller açık (Nakit Akışı dahil). Paddle altyapısıyla kredi/banka kartıyla ödeme. İlk satın almadan 14 gün içinde tam iade hakkı.
- Plan yönetimi: sol sidebar'daki profil ikonuna tıkla → "Üyeliği yönet" / "Pro'ya yükselt".

**Modüller (sol sidebar):**

1. **Anasayfa** — Özet gösterge paneli.

2. **Veri** — Ham verinin merkezi deposu. Dönem oluşturulur, her döneme veri setleri yüklenir:
   - **Hasar Verisi (hasar):** Dosya bazlı claim kayıtları. Sütunlar: Dosya No, Branş, Hasar Tarihi, Gelişim Tarihi, Ödeme, Muallak.
   - **Prim Verisi (prim):** Dönemsel kazanılmış prim kayıtları. Sütunlar: Branş, Dönem, Prim.
   - Veriler Cloudflare D1 üzerinde saklanır. Hem Rezerv hem Nakit Akışı modülleri bu veriyi çeker; modüllere manuel dosya yüklemek gerekmez.

3. **Rezerv** — Chain-Ladder + BF ile IBNR rezerv analizi (bkz. detaylı açıklama aşağıda).

4. **Nakit Akışı** — Paid üçgeninden nakit akışı pattern hesabı (Pro plan). Rezerv modülündeki branşların paid üçgenleri otomatik listelenir. 4 sekme:
   - **Veri:** Paid üçgeni (kümülatif / artımsal toggle).
   - **LDF:** Rezerv modülüyle birebir aynı gelişim faktörü ekranı — volume seçimi, hücre eleme, heatmap, CDF satırı.
   - **CF Pattern:** Kaza yılı bazında normalize edilmiş çeyreklik nakit akışı ağırlıkları. Her kaza yılı için rapor dönemine kadar geçen süre (dev_offset = yıl farkı × 4 çeyrek) hesaplanır; her yıl global pattern'ın kendi gelişim noktasından başlayan kuyruğunu alır. Tam gelişmiş yıllar (CDF=1,0) için tüm ağırlık ilk çeyreğe atanır.
   - **Aylık Pattern:** 180 aya dağıtılmış aylık nakit akışı ağırlıkları.
   - Navigasyon: Dönem kartları → Branş kartları → Analiz sekmeleri (Rezerv modülüyle aynı klasör yapısı).

**Rezerv modülü özellikleri (9 sekme):**
- **Veri:** Paid ve/veya Incurred üçgeni. Üçgen Veri modülünden (hasar verisi) çekilir veya doğrudan Excel/CSV yüklenir.
- **Dosya:** DOSYA_NO sütunlu veride dosya bazlı gelişim analizi, büyük hasar, runoff karşılaştırması.
- **LDF:** Volume-weighted development faktörleri, hücre eleme, heatmap.
- **Curve:** Tail extrapolation (exponential, inverse power, power, Weibull). CDF cascade; user override.
- **ILR:** Incurred Loss Ratio üçgeni. Hasar / (prim × correction_k) × 100%.
- **BF:** Exposure (prim), Correction (k), BF Loss Ratio (sabit veya formül), basis seçimi (CL/BF).
- **Ultimate/IBNR:** Origin bazında selected ultimate ve IBNR tablosu.
- **Özet:** Nihai rapor, eleme etkileri.
- **Geçmiş:** Branş işlem logu.

**Temel iş akışı:**
1. Giriş yap (Google veya e-posta/şifre ile Firebase Auth).
2. **Veri** modülüne git → dönem oluştur (format: `2025Q1` — yıl + Q + çeyrek, ör. `2026Q1`) → hasar ve prim verilerini yükle.
3. **Rezerv** modülüne git → dönem + branş oluştur → üçgeni Veri modülünden çek (veya Excel yükle).
4. CL otomatik çalışır; LDF/Curve/BF parametrelerini düzenle.
5. **Nakit Akışı** modülüne git (Pro) → Rezerv'deki paid üçgeni olan branşı seç → LDF ve CF pattern'i incele.
6. **Agent** butonuna (sağ üstte) tıkla — aktif branşı sorgula, senaryo analizi yap.

**Veri saklama:** Cloudflare D1 (Avrupa bölgesi, şifreli). Hesap silindiğinde 30 gün içinde kalıcı silme.

**Sık sorulan sorular:**
- "Dönem nasıl eklenir?" → Veri veya Rezerv modülünde "+ Yeni Dönem" → format: `2025Q1` (4 haneli yıl + Q + çeyrek 1-4, ör. `2026Q1`, `2024Q3`).
- "Yeni branş nasıl eklenir?" → Rezerv → dönem seçili iken "+ Branş".
- "Hasar verisi nasıl yüklenir?" → Veri → dönem seç → "Hasar Verisi" kartına tıkla → wizard.
- "Prim verisi nasıl Rezerv'e aktarılır?" → BF sekmesinde "Veri modülünden yükle" butonu.
- "Üçgen nasıl oluşturulur?" → Veri modülüne hasar yükledikten sonra Rezerv/Veri sekmesinde "Veri Modülünden Yükle".
- "BF nasıl açılır?" → Origin satırında basis sütununu "BF" olarak seç.
- "Tail nasıl kesilir?" → Curve sekmesinde ilgili yaştan itibaren user value=1 gir.
- "Nakit Akışı modülünü nasıl kullanırım?" → Önce Rezerv'de paid üçgeni yüklenmiş bir branş oluştur; sonra Nakit Akışı modülünde o branşı seç.
- "Abonelik iptali?" → Profil → Üyeliği yönet → İptal. Dönem sonuna kadar Pro erişimi devam eder.
- "İade?" → İlk satın almadan 14 gün içinde demireleren877@gmail.com adresine yaz.

**İletişim:** demireleren877@gmail.com · actuarius.com.tr

DURUM
{module_summaries}

----------------------------------------------------------------------------
Aşağıda erişebildiğin tüm araçların ayrıntılı yetkinlikleri. Tool isimleri
benzersizdir; çağırırsan doğru yere yönlendirilir.
----------------------------------------------------------------------------
"""


# Durum bloğunun SINIRI. Blokta her branşın toplam IBNR'ı var; model bunu
# görüp detay sorularında da araç çağırmayı bırakıyordu (correction nerede,
# hangi volume, nakit akışı hazır mı...). Neyin BLOKTA OLMADIĞINI açıkça
# yazmak, toplam sorularındaki hız kazancını bozmadan bunu düzeltiyor.
_STATE_BLOCK_BOUNDARY = """

Bu blok YALNIZ üst düzey özettir: branş listesi, toplam IBNR ve aktif
branşın LDF yöntemi / volume'u (karma dahil). Kaza yılı kırılımı, prim, LDF/CDF
değerleri, correction, elenmiş hücreler, BF oranı, kuyruk kesimi, nakit akışı
deseni ve iskonto BU BLOKTA YOKTUR — blokta olmayan bir sayıyı ASLA tahmin etme. Bunlardan biri
sorulduğunda MUTLAKA araç çağır:
  * aktif branşın detayı        -> get_analysis_state
  * BAŞKA branş/dönem detayı    -> get_branch_state(branch_id)
  * nakit akışı                 -> get_cashflow_state / get_cashflow_pattern_state
  * iskonto                     -> get_discount_state (IBNR için DEĞİL)
  * tüm branşların / dönemin IBNR toplamı -> blokta yazan dönem alt toplamı
Yalnızca yukarıda YAZAN bir toplamı tekrar edeceksen araç çağırma.

KAPSAM — dönemleri TOPLAMA. Dönemler (2026Q1, 2026Q2 ...) aynı portföyün
ARDIŞIK DEĞERLEMELERİdir; IBNR'larını toplamak aynı rezervi iki kez saymaktır.
Blokta her dönemin kendi alt toplamı yazılıdır; branş satırlarını kendin
toplama, yazan alt toplamı kullan.
Kapsam belirtilmemiş "toplam IBNR / toplam rezerv" sorusu AKTİF DÖNEMİ
kastediyor demektir — aktif dönemin toplamını ver ve hangi dönem olduğunu
cevapta söyle, ve aktif branşın bu toplam içindeki payını tek cümleyle ekle —
kullanıcı hangi kapsamı sorduğunu böylece görür. Kullanıcı tek bir branş
kastediyorsa branş adını yazar.
Birden fazla dönem karşılaştırılacaksa toplamı değil, dönem dönem ver."""

# Bu araçlar çalıştıysa cevabın SAYISAL karşılığı elde edilmiş demektir; o turda
# ask_user ile form açmak kullanıcıya cevap yerine soru döndürür. Prompt'ta
# "soruya cevap verirken form gösterme" yazıyor ama küçük modeller bunu ara sıra
# çiğniyor — bu yüzden kural burada da uygulanıyor.
_ANSWER_PRODUCING_TOOLS = {
    "simulate_bf",
    "simulate_bf_formula",
    "run_chain_ladder",
    "simulate_frequency_severity",
    "compute_discount",
    "get_ilr_triangle",
}


# Kullanıcı state'ten okunabilir bir ŞEY SORDUYSA form gösterilmez — cevap
# verilir. Bu araçlar o cevabın verisini getirir; çalıştıktan sonra ask_user
# yalnızca soru bağlamında engellenir. list_project / list_data_periods bilerek
# DIŞARIDA: "modelle" akışı önce proje ağacını okuyup sonra form açıyor, o meşru.
_STATE_READ_TOOLS = {
    "get_analysis_state",
    "get_branch_state",
    "get_cashflow_state",
    "get_cashflow_ldf_state",
    "get_cashflow_pattern_state",
    "get_discount_state",
    "get_file_summary",
    "describe_triangle",
}

# Kullanıcının EKRANINI oynatan araçlar. Bir soruya cevap verirken çağrılmaları
# kullanıcıyı sorusunu sorarken başka yere savuruyor. Cevabın verisi zaten
# okunduysa (state aracı çalıştı) ve soru sorulduysa listeden çıkarılırlar.
# Açıklamaya yazmak yetmedi: izole denemede tutuyor, tam koşuda sızıyordu.
_VIEW_MOVING_TOOLS = {"navigate_to", "select_branch"}
# Kompakt modda modül seçiminden bağımsız hep sunulan araçlar (gezinme + proje haritası).
_ALWAYS_OFFERED = {"navigate_to", "list_project"}

_QUESTION_RE = re.compile(
    # "ne kdar", "nekadar" gibi yazım hataları da soru (SEM08: "2024 kaza yılnın
    # ibnrı ne kdar" soru sayılmadığı için korumalar hiç çalışmadı).
    r"\?|\b(ne kadar|ne kdar|nekadar|ne|nedir|neler|hangi|neden|niçin|nasıl|kaç|mı|mi|mu|mü)\b",
    re.IGNORECASE,
)


# Görünüm taşıyan araçların MEŞRU tetikleyicileri. Soru sorulduğunda bu
# araçlar listeden düşer; ama "veri sekmesine geçer misin?" hem soru hem
# gerçek bir navigasyon isteği, onu engellemek kullanıcıyı kırar.
_NAV_INTENT_RE = re.compile(
    r"\b(sekme\w*|sayfa\w*|ekran\w*|mod[uü]l\w*|tab)\b"
    r"|\bbran[şs]\w*\s+(ge[çc]|git|a[çc])\w*"
    r"|\b(ge[çc]i[şs]\s*yap|yönlendir)\w*",
    re.IGNORECASE,
)


# Model bir değişikliğin YAPILDIĞINI söylüyor mu. Qwen 3.5 9B "2021 için LR'ı
# %30 yap" komutuna "ayarladım" deyip hiçbir araç çağırmıyordu (AG02, 2/6):
# kullanıcı değişiklik yapıldı sanıyor, model hiçbir şeyi değiştirmemiş.
# "hesapladım" bilerek yok — hesap salt okunur, aksiyon üretmez.
_COMPLETION_CLAIM_RE = re.compile(
    r"\b(ayarla(dım|ndı|nmıştır)|güncelle(dim|ndi|nmiştir)|uygula(dım|ndı|nmıştır)"
    r"|değiştir(dim|ildi|ilmiştir)|ele(dim|ndi|nmiştir)|kaldır(dım|ıldı)"
    r"|temizle(dim|ndi)|çevir(dim|ildi)|aldım|alındı|set edildi"
    r"|olarak (ayarlandı|güncellendi|değiştirildi|kaydedildi))\b",
    re.IGNORECASE,
)
_ALREADY_RE = re.compile(r"\bzaten\b", re.IGNORECASE)
# "Modelle", "modeli kur", "bu branşı modelle" — otonom modelleme komutu.
_MODEL_INTENT_RE = re.compile(r"\bmodel(le|i kur|i oluştur|lemeye başla)", re.IGNORECASE)

_NUDGE_FALSE_CLAIM = (
    "[SİSTEM KONTROLÜ] Cevabın bir değişikliğin yapıldığını söylüyor ama bu turda "
    "HİÇBİR değişiklik uygulanmadı — hiçbir yazma aracı çağrılmadı. İstenen "
    "değişikliği ilgili araçla şimdi uygula; uygulayamıyorsan nedenini açıkça söyle. "
    "Yapılmamış bir şeyi yapıldı diye yazma. Bu kontrolü kullanıcı görmüyor: ondan "
    "bahsetme, özür dileme, \"haklısınız\" deme."
)
_NUDGE_MODEL_FORM = (
    "[SİSTEM KONTROLÜ] Modelleme komutuna araç çağırmadan cevap verdin. Seçenekleri "
    "düz metin olarak YAZMA — ask_user aracını çağır (gerekirse önce durumu oku). "
    "Bu kontrolü kullanıcı görmüyor: ondan bahsetme."
)

_HIDDEN = " Bu kontrolü kullanıcı görmüyor: ondan bahsetme, özür dileme."
_NUDGE_DATA_READ = (
    "[SİSTEM KONTROLÜ] Soru durum bloğunda OLMAYAN veri istiyor (blok yalnız branş/dönem "
    "IBNR toplamlarını ve aktif branşın yöntem/volume'unu taşır). Hiç araç çağırmadan "
    "rakam verdin. İlgili okuma aracını çağır — get_analysis_state (kaza yılı, ultimate, "
    "LR, LDF/CDF), get_ilr_triangle (hasar/prim üçgeni), get_branch_state (başka branş/"
    "dönem) — ve cevabı oradan ver; rakam UYDURMA." + _HIDDEN
)
# Blokta karşılığı olmayan veri: kaza yılı, ultimate, üçgenler, oranlar, gelişim.
_DATA_Q_RE = re.compile(
    r"\b(19|20)\d{2}\b|kaza yıl|origin|kohort|ultimate|nihai|üçgen|triangle|\bilr\b"
    r"|loss ratio|hasar/prim|hasar prim|\bldf|\bcdf|gelişim|faktör|pattern|desen|muallak|ödenmiş"
    # V2: "Correction nerede uygulanmış?" → okumadan k=1,333 uydurdu.
    r"|correction|düzeltme|yıllıklaştır|elen|hücre|kuyruk|\btail|curve|override|basis|\bprim|exposure"
    # "BF'de hangi formülü kullanıyoruz?" → okumadan ezberden yanlış formül yazdı.
    r"|\bbf\b|formül",
    re.IGNORECASE,
)
# Emir kipinde veri isteği: "Hasar/prim oranı üçgenini ver" (TK11b: soru
# sayılmadığı için okuma koruması çalışmadı, model üçgeni uydurdu).
_SHOW_RE = re.compile(r"\b(ver|göster|listele|getir|söyle|yaz|özetle|paylaş|raporla)\b", re.IGNORECASE)
_NUDGE_WRONG_YEAR = (
    "[SİSTEM KONTROLÜ] Soru şu kaza yıllarını soruyor: {asked}. Cevabın bunların hiçbirini "
    "içermiyor ({answered} yazdın). Doğru yılın satırını oku ve onu ver." + _HIDDEN
)
_NUDGE_PERIOD_SUM = (
    "[SİSTEM KONTROLÜ] Cevabın dönem toplamlarının TOPLAMINI ({total}) içeriyor. Dönemler "
    "aynı portföyün ardışık değerlemeleridir, toplanmaz. Kapsam belirtilmediyse aktif "
    "dönemin toplamını ver; birden çok dönem gerekiyorsa dönem dönem yaz." + _HIDDEN
)
_NUDGE_SIGN = (
    "[SİSTEM KONTROLÜ] {value} negatif bir değer ama cevabında işaretsiz yazılmış. Negatif "
    "IBNR aktüeryal olarak önemli bir sinyaldir: eksi işaretiyle yaz." + _HIDDEN
)
_NUDGE_NEG_ULTIMATE = (
    "[SİSTEM KONTROLÜ] Cevabın nihai hasara (ultimate) negatif bir tutar ({value}) "
    "yazıyor. Seçilmiş ultimate negatif olmaz; negatif olan IBNR'dır (ultimate − "
    "ödenmiş). Ultimate'i selected_ultimate'ten, IBNR'ı ayrı etiketle ver. Nihaisi "
    "ödenmişin altında kalan yıllar get_analysis_state.ultimate_below_paid'de." + _HIDDEN
)
# "Nihai Hasar (Selected Ultimate): **-183.2 Milyon TL**" — etiket ile negatif
# rakam arasında başka rakam/IBNR/fark sözü yok.
_NEG_ULTIMATE_RE = re.compile(
    r"(?:ultimate|nihai)(?:(?!ibnr|fark|ödenmiş|paid|değiş|artış|azal|düşüş|delta|change)[^\n\d\-−]){0,40}([-−]\s?\d[\d.,]*\s*(?:milyon|mn|m\b)?)",
    re.IGNORECASE,
)
_NUDGE_NEEDLESS_CONFIRM = (
    "[SİSTEM KONTROLÜ] Kullanıcı bu değişikliği açıkça istedi; onay sorma. İlgili "
    "aracı çağırıp uygula. Gerçekten eksik bir bilgi (oran, yıl, hücre) yoksa "
    "soru sorma." + _HIDDEN
)
# AG10: "Bu hücreyi çıkarmak ister misiniz?" — komut zaten verilmişken.
_CONFIRM_ASK_RE = re.compile(
    r"ister mi(?:sin|siniz)|onaylıyor mu(?:sun|sunuz)|onaylar mı(?:sın|sınız)"
    r"|(?:yapayım|uygulayayım|eleyeyim|çıkarayım|değiştireyim|ayarlayayım) mı"
    r"|emin mi(?:sin|siniz)",
    re.IGNORECASE,
)
_SIMULATE_TOOLS = {"simulate_bf", "simulate_bf_formula", "simulate_frequency_severity"}
_APPLY_CMD_RE = re.compile(
    r"\b(yap|ayarla|değiştir|uygula|güncelle|çevir|gir|set et|kaydet)\b", re.IGNORECASE
)
# "simüle et", "senaryo", "olsa" → kullanıcı gerçekten simülasyon istiyor.
_SCENARIO_RE = re.compile(r"simül|senaryo|\bolsa|olursa|what if", re.IGNORECASE)
_NUDGE_SIMULATED_ONLY = (
    "[SİSTEM KONTROLÜ] Kullanıcı değişikliğin UYGULANMASINI istedi ama yalnız simülasyon "
    "yaptın; hiçbir şey değişmedi. İlgili yazma aracını çağır (BF oranı → "
    "set_selected_loss_ratio(s), basis → set_basis_bulk) ve uygula." + _HIDDEN
)
_NUDGE_BASIS_MISSING = (
    "[SİSTEM KONTROLÜ] Kullanıcı BF istedi ama yalnız loss ratio yazdın; {origins} hâlâ CL "
    "bazında, LR bu haliyle ultimate'i değiştirmez. set_basis_bulk (ya da set_bf_origins) "
    "ile basis'i BF yap." + _HIDDEN
)


def _ibnr_values(obj: Any, under_ibnr: bool = False) -> list[float]:
    """Araç çıktısında anahtarı 'ibnr' içeren sayısal değerler."""
    out: list[float] = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            out += _ibnr_values(v, under_ibnr or "ibnr" in str(k).lower())
    elif isinstance(obj, list):
        for v in obj:
            out += _ibnr_values(v, under_ibnr)
    elif under_ibnr and isinstance(obj, (int, float)) and not isinstance(obj, bool):
        out.append(float(obj))
    return out


def _synthetic_read_tool(messages: list[dict[str, Any]]) -> str:
    """Model zorunlu okumayı yok saydığında döngünün yapacağı okuma."""
    last = next((m for m in reversed(messages) if m.get("role") == "user"), None)
    text = str((last or {}).get("content") or "")
    if re.search(r"hasar/prim|hasar prim|\bilr\b|loss ratio üçgen", text, re.IGNORECASE):
        return "get_ilr_triangle"
    return "get_analysis_state"


# Önce okunması gereken durum: formül senaryosu MEVCUT BF origin'lerine ve
# formüllerine uygulanır. Kompakt prompt'ta Qwen 3.5 9B okumadan origin'leri
# tahmin edip ("2024, 2025, 2026") doğrudan simüle ediyordu (TK01, 3/3).
_PREREQ_READS = {"simulate_bf_formula": "get_analysis_state"}


def _missing_prereq(name: str, tool_invocations: list[dict[str, Any]]) -> str | None:
    need = _PREREQ_READS.get(name)
    if need and not any(t["name"] == need for t in tool_invocations):
        return (f"Önce {need} çağır: senaryo MEVCUT BF origin'lerine (basis='bf') ve "
                "current_lr_input formüllerine uygulanır; origin'leri tahmin etme.")
    return None


def _lr_origins(actions: list[dict[str, Any]]) -> set[str]:
    out: set[str] = set()
    for a in actions:
        pl = a.get("payload") or {}
        if a.get("type") == "set_selected_loss_ratio":
            out.add(str(pl.get("origin", "")))
        elif a.get("type") == "set_selected_loss_ratios":
            out |= {str(i.get("origin", "")) for i in pl.get("items", [])}
    return out - {""}


def _basis_origins(actions: list[dict[str, Any]]) -> set[str]:
    out: set[str] = set()
    for a in actions:
        pl = a.get("payload") or {}
        if a.get("type") == "set_basis":
            out.add(str(pl.get("origin", "")))
        elif a.get("type") == "set_basis_bulk":
            out |= {str(i.get("origin", "")) for i in pl.get("items", [])}
    return out - {""}


_NUDGE_UNIT = (
    "[SİSTEM KONTROLÜ] Cevabındaki {written} araç çıktısında {actual} olarak geçiyor: "
    "birim yanlış (milyon/milyar). Rakamı araç çıktısındaki birimiyle yaz." + _HIDDEN
)
_YEAR_RE = re.compile(r"\b((?:19|20)\d{2})\b")
# Bu uyarılardan sonra model bir OKUMA yapmalı: bir sonraki çağrıda araç zorunlu.
# Qwen 3.5 9B uyarıyı okuyup yine araçsız cevap veriyordu (D3, V2, V6).
_NUDGES_NEEDING_A_READ = (_NUDGE_DATA_READ,)

# Arayüzün işlem uygulanan turdan sonra gönderdiği görünmez "devam" mesajı.
# Bu turda model önceki turun değişikliğini özetlerken ("ayarlandı") yeni bir
# aksiyon yoktur — koruma bunu yalan sanıp geri çeviriyor, model de kullanıcıya
# "haklısınız, hiçbir değişiklik uygulanmadı" diyordu (oysa uygulanmıştı).
_AUTO_CONTINUE_PREFIX = "(System) Previous actions have been applied"


def _guard_nudge(
    messages: list[dict[str, Any]],
    content: str,
    tool_invocations: list[dict[str, Any]],
    actions: list[dict[str, Any]],
    block: str = "",
    bases: dict[str, str] | None = None,
) -> str | None:
    """Son cevap kabul edilmeden önce geri çevrilmeli mi (tur başına en fazla bir kez).

    Komutlarda: yapılmamış değişikliği "yaptım" demek, formu düz metin yazmak.
    Sorularda: blokta olmayan veriyi okumadan vermek, sorulan yılı vermemek.
    Her cevapta: dönemleri toplamak, negatif rakamı işaretsiz yazmak.
    Arayüzün gizli devam/doğrulama turları hiç denetlenmez.
    Hepsi Qwen 3.5 9B'de (LM Studio) ölçülmüş hatalardan.
    """
    from app.agent.numbers import has_number, numbers_in

    last = next((m for m in reversed(messages) if m.get("role") == "user"), None)
    text = str((last or {}).get("content") or "")
    if text.startswith(_AUTO_CONTINUE_PREFIX):
        return None
    asked = _is_question(messages)
    ran = {t["name"] for t in tool_invocations}
    answer = content or ""

    if not asked and _MODEL_INTENT_RE.search(text) and not tool_invocations:
        return _NUDGE_MODEL_FORM
    if (
        not asked
        and not actions
        and answer
        and _COMPLETION_CLAIM_RE.search(answer)
        and not _ALREADY_RE.search(answer)  # "zaten BF bazında" meşru
        # "İskontoyu hesapla" → compute_discount çalıştı: iş yapıldı, yazma
        # gerekmiyordu (TK04: geri çevirme "Haklısınız" diye özür ürettirdi).
        and not (ran & _ANSWER_PRODUCING_TOOLS)
    ):
        return _NUDGE_FALSE_CLAIM
    if not asked and not actions and _CONFIRM_ASK_RE.search(answer):
        return _NUDGE_NEEDLESS_CONFIRM
    # "BF oranını %40 yap" → yalnız simulate_bf çalıştı, hiçbir şey uygulanmadı;
    # cevap "ayarlandıysa…" diye senaryo anlatıyordu (Qwen 3.5 9B).
    if not asked and not actions and (ran & _SIMULATE_TOOLS) and _APPLY_CMD_RE.search(text):
        return _NUDGE_SIMULATED_ONLY
    # "BF'e al" komutunda yalnız LR yazıp basis'i değiştirmemek (AG01): CL
    # bazındaki origin'de LR ultimate'i hiç etkilemez.
    if not asked and re.search(r"\bbf\b", text, re.IGNORECASE):
        lr_origins = _lr_origins(actions)
        if lr_origins and not _basis_origins(actions):
            still_cl = sorted(o for o in lr_origins if (bases or {}).get(o, "cl") != "bf")
            if still_cl:
                return _NUDGE_BASIS_MISSING.format(origins=", ".join(still_cl))
    # Blokta olmayan veriyi hiç okumadan rakamla vermek (uydurma üçgen, IBNR'ı
    # ultimate diye vermek, kaza yılı yerine branş toplamı).
    wants_data = asked or bool(_SHOW_RE.search(text))
    if wants_data and _DATA_Q_RE.search(text) and not ran and re.search(r"\d", answer):
        return _NUDGE_DATA_READ
    # Sorulan kaza yılı cevapta hiç yok, başka yıllar var ("2024 kaza yılnın
    # ibnrı" → 2025'in rakamı).
    q_years = set(_YEAR_RE.findall(text))
    a_years = set(_YEAR_RE.findall(answer))
    # Sorulan yıl cevapta hiç yoksa (başka yıl ya da hiç yıl) — SEM08'de cevap
    # yıl söylemeden 2025'in satırını verdi.
    if asked and q_years and re.search(r"\d", answer) and not (q_years & a_years):
        return _NUDGE_WRONG_YEAR.format(asked=", ".join(sorted(q_years)),
                                        answered=", ".join(sorted(a_years)) or "hiç yıl")
    # IBNR'ı nihai hasar diye sunmak (V6, SEM02).
    for m in _NEG_ULTIMATE_RE.finditer(answer):
        vals = numbers_in(m.group(1))
        if vals and vals[0] <= -100_000:
            return _NUDGE_NEG_ULTIMATE.format(value=m.group(1).strip())
    # Birim kayması: araç -123,760,430 dedi, cevap "-123.76 Milyar" (TK04).
    sources = block + " " + " ".join(str(t.get("output")) for t in tool_invocations)
    src_vals = [v for v in numbers_in(sources) if abs(v) >= 1_000]
    for m in re.finditer(r"[-−]?\s?\d[\d.,]*\s*(?:milyar|milyon|mlr|mn)\b", answer, re.IGNORECASE):
        vals = numbers_in(m.group(0))
        if not vals:
            continue
        v = vals[0]
        near = lambda x: any(abs(abs(s) - abs(x)) <= 0.01 * abs(x) for s in src_vals)  # noqa: E731
        if near(v):
            continue
        for k in (1_000, 0.001):
            if near(v / k):
                return _NUDGE_UNIT.format(written=m.group(0).strip(), actual=f"{v / k:,.0f}")
    # Dönem alt toplamlarının toplamı: aynı portföyü iki kez saymak.
    subtotals = [numbers_in(m.group(1))[0] for m in re.finditer(r"dönem toplamı IBNR (-?[\d,.]+)", block)
                 if numbers_in(m.group(1))]
    if len(subtotals) > 1:
        total = sum(subtotals)
        if total and has_number(answer, total, 0.005):
            return _NUDGE_PERIOD_SUM.format(total=f"{total:,.0f}")
    # Negatif değeri işaretsiz yazmak (bloktan ya da bu turun araç çıktılarından).
    if not re.search(r"negatif|eksi|negative", answer, re.IGNORECASE):
        # Yalnız IBNR değerleri: iskonto tutarı gibi kalemleri işaretsiz yazmak doğal.
        ibnr_vals = [v for t in tool_invocations for v in _ibnr_values(t.get("output"))]
        negatives = {v for v in numbers_in(block) + ibnr_vals if v <= -100_000}
        got = numbers_in(answer)
        for v in sorted(negatives):
            if any(abs(g - abs(v)) <= 0.005 * abs(v) for g in got if g > 0) and \
               not any(abs(g - v) <= 0.005 * abs(v) for g in got if g < 0):
                return _NUDGE_SIGN.format(value=f"{v:,.0f}")
    return None

_LR_TOOLS = {"set_selected_loss_ratio", "set_selected_loss_ratios"}
_NUM_RE = re.compile(r"\d+(?:[.,]\d+)?")


def _invented_rate(name: str, args: dict[str, Any], messages: list[dict[str, Any]]) -> str | None:
    """Kullanıcının vermediği SABİT bir loss ratio yazılıyor mu.

    Qwen 3.5 9B (LM Studio) "son dönem için bf ayarlasana" komutuna kendiliğinden
    %100, başka bir koşuda %400 LR yazdı. Formüller (vw(2021:2024) gibi) serbest:
    kullanıcı "son 4 yılın ağırlıklı ortalaması" diyebilir. Sabit sayı ise
    kullanıcının mesajında (oran ya da yüzde olarak) geçmeli.
    """
    if name not in _LR_TOOLS:
        return None
    items = args.get("items") if name == "set_selected_loss_ratios" else [args]
    last = next((m for m in reversed(messages) if m.get("role") == "user"), None)
    said = {float(x.replace(",", ".")) for x in _NUM_RE.findall(str((last or {}).get("content") or ""))}
    for it in items or []:
        raw = str((it or {}).get("formula", (it or {}).get("value", ""))).strip().rstrip("%").replace(",", ".")
        try:
            v = float(raw)
        except ValueError:
            continue  # formül — serbest
        if not any(abs(v - s) < 1e-9 or abs(v * 100 - s) < 1e-6 or abs(v - s * 100) < 1e-6 for s in said):
            return (
                f"{name} reddedildi: kullanıcı {raw} oranını vermedi. Oran UYDURMA. "
                "Yalnız BF/CL geçişi istendiyse set_bf_origins ya da set_basis_bulk kullan; "
                "oran gerekiyorsa kullanıcıya hangi oranı istediğini sor."
            )
    return None


def _wants_navigation(messages: list[dict[str, Any]]) -> bool:
    last = next((m for m in reversed(messages) if m.get("role") == "user"), None)
    return bool(_NAV_INTENT_RE.search(str((last or {}).get("content") or "")))


def _is_question(messages: list[dict[str, Any]]) -> bool:
    last = next((m for m in reversed(messages) if m.get("role") == "user"), None)
    return bool(_QUESTION_RE.search(str((last or {}).get("content") or "")))


@dataclass
class AgentTurnResult:
    assistant_message: str
    tool_invocations: list[dict[str, Any]] = field(default_factory=list)
    actions: list[dict[str, Any]] = field(default_factory=list)
    stopped_reason: str = "final"
    # ask_user ile istenen yapısal form (chat'te tıklanabilir olarak gösterilir).
    # Doluysa tur "awaiting_input" ile durur; kullanıcı formu doldurup cevabı
    # sonraki turda yollar. None → normal cevap.
    form: dict[str, Any] | None = None
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
    # Otonom modelleme (oku → üçgen yükle → ele → yöntem → curve → basis → LR →
    # correction → tekrar oku → raporla) çok adımlı tool zinciri gerektirir. Bulk
    # tool'lar kullanılınca yeter; tool çağrısı bittiğinde döngü erken durur, bu
    # yalnızca ÜST sınır.
    max_iterations: int = 24,
    # Multi-turn tool history: önceki turların raw mesajları (tool çağrısı + sonuç).
    # Varsa, messages yerine bu kullanılır ve mevcut kullanıcı mesajı sonuna eklenir.
    full_history: list[dict[str, Any]] | None = None,
    # Desktop Agent Ayarları: kullanıcının GLOBAL system prompt'u (None → yerleşik GLOBAL_PROMPT);
    # modül prompt'ları/özetleri yine eklenir (1:1). enabled_tools verilirse LLM'e yalnız o
    # araçlar gönderilir (Ayarlar > Tools aç/kapa).
    global_prompt: str | None = None,
    enabled_tools: set[str] | None = None,
    # Kompakt bağlam (Agent Ayarları): kısa genel prompt, yalnız ilgili modüllerin
    # prompt'u/araçları, kırpılmış geçmiş — token kotası olan uçlar için. Bkz. compact.py.
    compact: bool = False,
    # Kullanıcının açık sekmesi (reserve/cashflow/discount/data); kompakt modda
    # hangi modülün yükleneceğini belirler.
    active_module: str | None = None,
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
            cnt_payload = payload.get("count_triangle")
            ctx["count_triangle"] = (
                triangle_from_payload(cnt_payload) if cnt_payload else None
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

    # Kompakt modda prompt'a/araç listesine girecek modüller
    _last_user = next((m for m in reversed(messages) if m.get("role") == "user"), None)
    _last_text = str((_last_user or {}).get("content") or "")
    prompt_modules = (
        select_modules([m.name for m in active_modules], active_module, _last_text)
        if compact else {m.name for m in active_modules}
    )

    # System prompt komposit
    summaries: list[str] = []
    for m in active_modules:
        ctx_state = (modules_payload.get(m.name) or {}).get("session_state")
        summaries.append(f"- **{m.label}** ({m.name}): {m.context_provider(ctx_state)}")
    sections: list[str] = []
    for m in active_modules:
        if m.name not in prompt_modules:
            continue
        sections.append(
            f"\n\n# {m.label.upper()} MODÜLÜ ({m.name})\n{m.system_prompt}"
        )
    if global_prompt is not None:
        base_prompt = global_prompt
    else:
        base_prompt = COMPACT_GLOBAL_PROMPT if compact else GLOBAL_PROMPT
    summary_block = "\n".join(summaries)
    # Her turda DEĞİŞEN tek parça durum özeti. Prompt'un ortasında durursa
    # ondan sonraki ~16k karakterlik modül prompt'ları da her turda yeniden
    # prefill ediliyor ve lokal modelde KV-cache'in tamamı boşa gidiyor
    # (qwen3.5-9b, LAN: durum ortadayken 10,8 sn → sonda 1,6 sn). Statik kısım
    # önde sabit kalsın, değişen blok en sona.
    try:
        head = base_prompt.format(module_summaries="(Güncel durum bu mesajın SONUNDA, «DURUM (güncel)» bölümünde.)")
    except (KeyError, IndexError):
        # Kullanıcı prompt'unda {module_summaries} yoksa yalnız statik kısım.
        head = base_prompt
    system = (
        head
        + "".join(sections)
        + "\n\n# DURUM (güncel)\n"
        + summary_block
        + _STATE_BLOCK_BOUNDARY
    )

    # Tool'ları topla, tool_name → modül haritası kur
    all_tools: list[dict[str, Any]] = []
    tool_to_module: dict[str, ModuleSpec] = {}
    for m in active_modules:
        for s in m.tool_schemas:
            tname = s["function"]["name"]
            if enabled_tools is not None and tname not in enabled_tools:
                continue
            if tname in tool_to_module:
                # Aynı isim iki modülde olsa modül-prefiksli ekleyebiliriz;
                # şimdilik registry öncelik kuralı: ilk gelen kazanır.
                continue
            tool_to_module[tname] = m
            # Kompakt modda yalnız seçili modüllerin araçları modele SUNULUR;
            # eşleme tam kalır — model geçmişte gördüğü başka modül aracını
            # çağırırsa yine çalışır.
            if m.name in prompt_modules or tname in _ALWAYS_OFFERED:
                all_tools.append(s)
    if compact and (enabled_tools is None or "get_app_guide" in enabled_tools):
        all_tools.append(APP_GUIDE_TOOL)

    # full_history varsa kullan: önceki turların tool çağrısı/sonuç zincirleri +
    # mevcut kullanıcı mesajı (messages'ın son elemanı) sona eklenir.
    # full_history yoksa legacy davranış: tüm messages'ı kullan.
    if full_history is not None:
        # messages = sadece kullanıcı tarafı (user+assistant text); full_history
        # tüm raw zinciri içeriyor. Son user mesajını history'e ekle.
        last_user = next(
            (m for m in reversed(messages) if m.get("role") == "user"), None
        )
        past = trim_history(full_history) if compact else list(full_history)
        history_with_current = past + (
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
    # Bu turda başarıyla uygulanmış (name, args) çiftleri — tekrar uygulanmaz.
    applied_writes: set[tuple[str, str]] = set()
    # Koruma turda en fazla bir kez geri çevirir; geri çevirme mesajları
    # konuşma geçmişine (raw_additions) yazılmaz.
    # Geri çevirme: tur başına en çok iki, aynı tür uyarı bir kez. (V6: okuma
    # uyarısından sonra gelen "Selected Ultimate −183M" etiket hatası tek
    # bütçeyle yakalanamıyordu.)
    nudges_given: set[str] = set()
    _res_ss = (module_ctx.get("reserve") or {}).get("session_state") or {}
    bases = {str(r.get("origin")): str(r.get("basis") or "cl")
             for r in (_res_ss.get("per_origin") or []) if isinstance(r, dict)}
    force_tool = False  # bir sonraki çağrıda araç zorunlu mu
    synthetic_read_ok = True  # zorunlu çağrı yok sayılırsa döngü okuyabilir mi
    guard_msgs: list[dict[str, Any]] = []

    def _additions() -> list[dict[str, Any]]:
        return [m for m in conv[initial_conv_len:] if not any(m is g for g in guard_msgs)]

    for _iteration in range(max_iterations):
        # Hesap aracı çalıştıysa ask_user'ı listeden çıkar. Sadece hata
        # döndürmek yetmiyordu: model reddi görüp aynı çağrıyı üst üste
        # deneyip tur limitini yakıyordu. Araç listede yoksa ısrar edemez.
        turn_tools = all_tools
        _ran = {inv["name"] for inv in tool_invocations}
        _answered = bool(_ran & _ANSWER_PRODUCING_TOOLS)
        _asked = _is_question(messages)
        _drop: set[str] = set()
        if _answered or ((_ran & _STATE_READ_TOOLS) and _asked):
            _drop.add("ask_user")
        # Soru sorulduysa görünüm taşıyan araçları İLK iterasyondan itibaren
        # düşür. Eskiden koruma yalnızca bir okuma aracı çalıştıktan SONRA
        # devreye giriyordu; ilk turda navigate_to masada olduğu için model
        # "2024'ün primi 5 milyar değil mi?" sorusuna sekme değiştirerek
        # cevap veriyordu (Haiku ile ölçüldü). Gerçek bir navigasyon isteği
        # (sekme/sayfa/branş adı geçen) soru biçiminde de gelebilir, o
        # engellenmiyor.
        if _asked and not _wants_navigation(messages):
            _drop |= _VIEW_MOVING_TOOLS
        # Açık uygulama komutunda simülasyon araçları masada olmasın: "BF oranını
        # %40 yap" → model simulate_bf'i seçip hiçbir şey uygulamadan senaryo
        # anlatıyordu (geri çevirme + yeniden deneme = komut başına 2 fazla çağrı).
        if not _asked and _APPLY_CMD_RE.search(_last_text) and not _SCENARIO_RE.search(_last_text):
            _drop |= _SIMULATE_TOOLS
        if _drop:
            turn_tools = [
                t for t in all_tools if t["function"]["name"] not in _drop
            ]
        response = None
        # Son iterasyon ve bu turda hiçbir şey uygulanmadı: model okuma
        # döngüsünde (C4: aynı durumu üst üste okuyup "Tur limiti doldu").
        # Araçları kapat, okuduklarıyla cevap versin. Yazma yapılmış çok adımlı
        # turlar sınırda durmaya devam eder (arayüz 'devam' ile sürdürür).
        if _iteration == max_iterations - 1 and not actions and tool_invocations:
            try:
                response = client.chat(messages=conv, tools=turn_tools, tool_choice="none")
                if response.get("tool_calls"):
                    response = None
            except Exception as e:  # noqa: BLE001
                logger.warning("araçsız son çağrı başarısız: %s", e)
            if response is not None:
                force_tool = False
        if response is None and force_tool:
            force_tool = False
            try:
                response = client.chat(messages=conv, tools=turn_tools, tool_choice="required")
                if not response.get("tool_calls"):
                    # LM Studio "required"ı her zaman uygulamıyor (SEM11: yine
                    # araçsız metin). Okumayı döngü yapar; model sonucu görüp
                    # yeniden cevaplar.
                    names = {t["function"]["name"] for t in turn_tools}
                    read = _synthetic_read_tool(messages)
                    if synthetic_read_ok and read in names:
                        response = {"content": None, "tool_calls": [ToolCall("guard_read", read, {})]}
                    elif not (response.get("content") or "").strip():
                        response = None  # boş/kesilmiş → normal çağrı
                    # Yazma uyarısından sonra araçsız ama dolu cevap meşru bir
                    # ret olabilir ("Uygulayamadım: 2021 BF değil") — kabul.
            except Exception as e:  # noqa: BLE001 — zaman aşımı/400: normal çağrıya düş
                logger.warning("zorunlu araç çağrısı başarısız, normal çağrıya düşülüyor: %s", e)
        if response is None:
            response = client.chat(messages=conv, tools=turn_tools)
        content = response.get("content")
        tool_calls: list[ToolCall] = response.get("tool_calls", [])

        if not tool_calls:
            nudge = None if len(nudges_given) >= 2 else _guard_nudge(
                messages, content or "", tool_invocations, actions, summary_block, bases
            )
            if nudge and nudge[:60] in nudges_given:
                nudge = None
            if nudge and _iteration < max_iterations - 1:
                nudges_given.add(nudge[:60])
                force_tool = (
                    nudge in _NUDGES_NEEDING_A_READ
                    or nudge == _NUDGE_FALSE_CLAIM
                    or nudge == _NUDGE_SIMULATED_ONLY
                    or nudge.startswith(_NUDGE_WRONG_YEAR[:40])
                )
                synthetic_read_ok = nudge not in (_NUDGE_FALSE_CLAIM, _NUDGE_SIMULATED_ONLY)
                u_msg: dict[str, Any] = {"role": "user", "content": nudge}
                if force_tool:
                    # Reddedilen cevabı konuşmada bırakma: model onu kelimesi
                    # kelimesine tekrarlıyordu (V6, SEM11 okumada; AG05 yazmada).
                    new_msgs = [u_msg]
                else:
                    new_msgs = [{"role": "assistant", "content": content or ""}, u_msg]
                conv += new_msgs
                guard_msgs += new_msgs
                continue
            # Boş final ama bu turda tool çalıştıysa, ne yapıldığını özetle
            # ("(empty response)" yerine kullanıcıya faydalı bir şey dönsün).
            final_text = content or ""
            if not final_text.strip():
                if tool_invocations:
                    names = ", ".join(dict.fromkeys(t["name"] for t in tool_invocations))
                    final_text = f"Uygulandı: {names}."
                else:
                    # Model ne metin ne tool çağrısı üretti. Buraya kadar
                    # gelinip boş string dönerse kullanıcı sohbette BOŞ bir
                    # cevap görüyor ve neyin olduğunu anlamıyor. Sessizce boş
                    # dönmektense ne olduğunu söyle.
                    final_text = (
                        "Bu soruya cevap üretemedim (model boş yanıt döndü). "
                        "Soruyu biraz daha somut yazar mısın — hangi branş, "
                        "hangi dönem, hangi büyüklük?"
                    )
            # Final assistant mesajını raw_additions'a ekle
            final_msg: dict[str, Any] = {"role": "assistant", "content": final_text}
            raw_additions = _additions() + [final_msg]
            return AgentTurnResult(
                assistant_message=final_text,
                tool_invocations=tool_invocations,
                actions=actions,
                stopped_reason="final",
                raw_additions=raw_additions,
            )

        conv.append(_assistant_message_with_tool_calls(content, tool_calls))

        pending_form: dict[str, Any] | None = None
        for tc in tool_calls:
            # Aynı yazma işlemini ikinci kez uygulamayı reddet. Model bir
            # aksiyonu uyguladıktan sonra aynı çağrıyı tekrarlıyor (Haiku ile
            # ölçüldü: set_method iki kez, çelişkili promptla altı kez) —
            # set_method'da zararsız görünüyor ama exclude_cells ya da
            # create_version'da durumu bozar ve her tekrar iterasyon
            # bütçesinden yiyor. ask_user'da olduğu gibi reddedip ne
            # yapacağını söylüyoruz; sessiz yok sayma modeli tekrar
            # denemeye itiyordu.
            _sig = (tc.name, json.dumps(tc.arguments, sort_keys=True, default=str))
            _invented = _invented_rate(tc.name, tc.arguments, messages) or _missing_prereq(
                tc.name, tool_invocations
            )
            if _invented:
                output = {"error": _invented}
                tool_invocations.append({
                    "id": tc.id, "name": tc.name,
                    "module": tool_to_module.get(tc.name).name if tool_to_module.get(tc.name) else None,
                    "arguments": tc.arguments, "output": output,
                })
                conv.append({"role": "tool", "tool_call_id": tc.id,
                             "content": json.dumps(output, ensure_ascii=False)})
                continue
            if _sig in applied_writes:
                output = {
                    "error": (
                        f"{tc.name} bu turda AYNI argümanlarla zaten uygulandı ve "
                        "başarılı oldu. Tekrar uygulama — sonucu kullanıcıya bir "
                        "cümleyle yaz ve turu bitir."
                    )
                }
                tool_invocations.append({
                    "id": tc.id, "name": tc.name,
                    "module": tool_to_module.get(tc.name).name if tool_to_module.get(tc.name) else None,
                    "arguments": tc.arguments, "output": output,
                })
                conv.append({"role": "tool", "tool_call_id": tc.id,
                             "content": json.dumps(output, ensure_ascii=False)})
                continue

            mod = tool_to_module.get(tc.name)
            if tc.name == "get_app_guide":
                output = {"guide": app_guide(GLOBAL_PROMPT)}
            elif mod is None:
                output: dict[str, Any] = {
                    "error": f"Tool bulunamadı: {tc.name} (aktif modüllerden hiçbiri sahiplenmiyor)"
                }
            elif tc.name == "ask_user" and any(
                inv["name"] in _ANSWER_PRODUCING_TOOLS for inv in tool_invocations
            ):
                done = ", ".join(
                    inv["name"] for inv in tool_invocations
                    if inv["name"] in _ANSWER_PRODUCING_TOOLS
                )
                output = {
                    "error": (
                        f"ask_user reddedildi: bu turda {done} çalıştı, yani cevabın "
                        "sayısal karşılığı elinde. Kullanıcı soru sordu — form açma, "
                        "sonucu doğrudan yaz ve turu bitir."
                    )
                }
            else:
                ctx = module_ctx.get(mod.name, {})
                try:
                    output = mod.dispatch(tc.name, tc.arguments, ctx)
                except KeyError as e:
                    output = {"error": f"Tool dispatch hatası: {e}"}
                except Exception as e:  # tool içi hata turu öldürmesin — modele bildir
                    output = {
                        "error": f"Tool çalıştırma hatası ({tc.name}): {type(e).__name__}: {e}"
                    }

            # Birden çok aksiyon üreten araçlar (set_bf_origins) "_actions" döndürür.
            if isinstance(output, dict) and "_actions" in output:
                for action in output.pop("_actions") or []:
                    if isinstance(action, dict) and mod is not None:
                        action.setdefault("module", mod.name)
                    actions.append(action)
                applied_writes.add((tc.name, json.dumps(tc.arguments, sort_keys=True, default=str)))
            if isinstance(output, dict) and "_action" in output:
                action = output.pop("_action")
                # Modül adını action'a yapıştır — frontend modüle göre yönlendirsin
                if isinstance(action, dict) and mod is not None:
                    action.setdefault("module", mod.name)
                actions.append(action)
                applied_writes.add(
                    (tc.name, json.dumps(tc.arguments, sort_keys=True, default=str))
                )

            # ask_user → yapısal form: turu durdurup formu kullanıcıya göster.
            if isinstance(output, dict) and "_form" in output:
                pending_form = output.pop("_form")
                output = {"status": "form_shown_awaiting_user_input"}

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

        # ask_user çağrıldıysa turu burada durdur — form kullanıcıya döner, cevap
        # sonraki turda (yeni user mesajı) gelir.
        if pending_form is not None:
            raw_additions = _additions()
            return AgentTurnResult(
                assistant_message=_form_intro(content),
                tool_invocations=tool_invocations,
                actions=actions,
                stopped_reason="awaiting_input",
                raw_additions=raw_additions,
                form=pending_form,
            )

    raw_additions = _additions()
    applied = ", ".join(t["name"] for t in tool_invocations[-10:]) if tool_invocations else ""
    return AgentTurnResult(
        assistant_message=(
            (f"Tur limiti doldu. Şu ana kadar uygulandı: {applied}. " if applied else "Tur limiti doldu. ")
            + "Kaldığım yerden sürdürmek için 'devam' de."
        ),
        tool_invocations=tool_invocations,
        actions=actions,
        stopped_reason="max_iterations",
        raw_additions=raw_additions,
    )



_FORM_DEFAULT = "Modelleme için birkaç seçim gerekli — aşağıdaki formu doldur."


def _form_intro(content: str | None) -> str:
    """ask_user turunda kullanıcıya gösterilecek giriş metni.

    Model form çağrısının yanına çoğu zaman İÇ MUHAKEMESİNİ yazıyor ("Şimdi
    cevabı hazırlayayım: ...") ve o metin cümle ortasında kesiliyor; kullanıcı
    yarım bir düşünce akışı görüyordu. Yalnızca kısa ve tamamlanmış bir giriş
    cümlesini geçir, aksi hâlde standart metni kullan.
    """
    text = (content or "").strip()
    if not text or len(text) > 400:
        return _FORM_DEFAULT
    return text if text[-1] in ".!?:…" else _FORM_DEFAULT


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
