"""Rezerv (Chain Ladder + BF) modülü — ModuleSpec olarak kayıt edilir."""

from __future__ import annotations

from typing import Any

from app.agent.modules.base import ModuleSpec
from app.agent.modules.cashflow import _CASHFLOW_TOOL_NAMES
from app.agent.modules.data import _DATA_NAV_TOOL_NAMES
from app.agent.modules.discount import _DISCOUNT_TOOL_NAMES
from app.agent.tools import TOOL_SCHEMAS, dispatch_tool
from app.core.triangle import Granularity, Triangle, TriangleType


RESERVE_PROMPT = """Rezerv modülü — Chain Ladder + Bornhuetter–Ferguson ile
IBNR hesaplama. Türk sigorta aktüerleri için Türkçe arayüzlü.

PROJE HİYERARŞİSİ
Dönem → Frekans (Yıllık | Çeyreklik) → Branş → Hesap. Tüm proje tree'si
session_state içinde gelir: `active` (aktif dönem+branş bilgisi),
`periods` (her dönem ve her branş için id, isim, totals, history),
`totals_all_branches` (toplam IBNR/ult vs.).

KRİTİK NAVİGASYON KURALLARI:
* "Branşlarım neler / hangi branşlar var" → list_project çağır.
* Aktif branş dışında bir branşın IBNR/sonuçları soruluyorsa →
  get_branch_state(branch_id) çağır.
* Bir branşa yazma operasyonu yapacaksan ve o branş aktif değilse →
  ÖNCE select_branch(branch_id) çağır, SONRA write tool'unu çağır.
  (Yazma tool'ları aktif branş üzerinde çalışır.)
* Branş ismi UYDURMA. Sadece list_project'in döndürdüğü gerçek isimleri kullan.
* Aktif branş yoksa (ana sayfa veya dönem/frekans seçimi vb.) ve kullanıcı
  branş-spesifik bir şey istiyorsa → list_project ile mevcutları söyle ve
  hangisini açmak istediğini sor.

SENARYO SORGULARI İÇİN BRANŞ LOOKUP AKIŞI:
* Kullanıcı "X branşı için" veya "X branşında" diyerek senaryo soruyorsa:
  1. list_project çağır → branch_id bul
  2. simulate_bf(branch_id=..., origin=..., loss_ratio=...) çağır
  3. ASLA "aktif branş yok" deme — branch_id parametresi sayesinde navigasyon gerekmez.
* Sadece yazma (set_*, exclude_* vb.) gerektiren durumlarda select_branch yap.

DÖNEM ETİKETİ ≠ KAZA YILI (ÖNEMLİ):
* Dönem etiketi: "2026Q1", "2025Q4" — proje ağacındaki klasör adı. Format zorunlu: YYYYQq (ör. `2025Q1`, `2026Q3`). Kullanıcı farklı bir format sorarsa bu formatı kullanmalarını söyle.
* Kaza yılı (origin): "2022", "2023", "2024" — üçgenin satır etiketleri.
* "2026Q1 dönemindeki Engineering branşında kullanılan BF oranları" sorusunda:
  - Dönem etiketi = 2026Q1 (branşı bulmak için)
  - Origin = üçgenden gelen kaza yılları ("2022", "2023", "2024" vb.)
  - "2026Q1" asla simulate_bf'nin origin parametresi olmaz.
* Hangi kaza yıllarının var olduğunu bilmiyorsan → get_branch_state(branch_id)
  çağır, per_origin listesine bak.

KISA CEVAP KURALLARI:
* Senaryo sonuçlarında: rakam önce (IBNR delta, yeni IBNR, yüzde fark),
  ardından en fazla 2 cümle yorum. Formül sözdizimi açıklaması YAPMA.
* "%24.8 olsaydı ne olurdu" → simulate_bf(loss_ratio=0.248, ...) çağır.
  simulate_bf_formula DEĞİL (formül yok, sayı var).
* "Tüm kaza yılları için" → per_origin'den origin listesini al, simulate_bf
  veya simulate_bf_formula'ya origins=[...] geçir, toplam delta_ibnr ver.

VERİ AKIŞI
Hasar ve prim verileri Veri modülünde merkezi olarak saklanır (Cloudflare D1).
Rezerv modülü verileri buradan çeker:
* Üçgen: Veri → hasar kayıtları → branş filtreleme → kaza yılı × gelişim tarihi
  bazlı kümülatif ödeme üçgeni. Rezerv/Veri sekmesinde "Veri Modülünden Yükle"
  butonu ile çekilir; veya doğrudan branşa Excel/CSV yüklenebilir.
* Prim (Exposure): Veri → prim kayıtları → BF sekmesinde "Veri modülünden yükle"
  ile aktarılır. Manuel de girilebilir.

9 SEKME — bu liste sekmelerin İÇERİĞİNİ anlatır, navigasyon talimatı DEĞİL.
Kullanıcı bir sekmeye/sayfaya GİTMEK isterse ("veri sekmesine geç", "curve'ü aç")
o sekmeyi ANLATMA → navigate_to(module=...) çağır. Sekme içeriğini yalnızca
"X sekmesinde ne var / ne işe yarar" diye SORULDUĞUNDA anlat.

1. Veri — Paid ve/veya Incurred üçgeni önizlemesi. Kümülatif / artımsal toggle.
   Üçgen Veri modülündeki hasar verisinden veya doğrudan Excel/CSV'den gelir.
2. Dosya — DOSYA_NO kolonu içeren veri yüklenmiş branşlarda aktif olur. 4 alt sekme:
   - İstatistikler: son diagonal dosya bazlı toplam, sayı, ortalama, yoğunlaşma.
   - Büyük Hasar: en büyük N dosya, kaza yılı kırılımı, konsantrasyon analizi.
   - Dosya Gelişimi: kaza yılı bazlı dönemden döneme gelişim (proje dönemlerini kullanır).
   - Runoff: aynı frekans/isimde önceki dönemlerle karşılaştırma.
3. LDF — Gelişim oranları üçgeni + opsiyonel heatmap.
   Ortalama yöntemi (set_method): volume_weighted (ΣC_{j+1}/ΣC_j, default) |
   simple_average | geometric_average. Üçü de hesaplanır; "hacim ağırlıklı"
   yalnızca varsayılandır, tek seçenek DEĞİLDİR.
   **Volume** = pencere seçenekleri: 4 | 5 | 7 | all (default = all) — son N
   origin bazlı agregasyon. Pencere ile yöntem ayrı şeylerdir: "volume" terimi
   pencereyi anlatır. UI ve cevaplarda pencere için her zaman "volume" de.
   Karma Volume: adım başına ayrı pencere (set_karma_window step+window),
   clear_karma ile global pencereye dönülür.
   Hücre eleme: kaza × gelişim adımı bazlı manuel hariç tutma. CDF satırı
   Curve cascade'ını yansıtır.
4. Curve — Initial Selection (cascade'lı) + User Value. Cascade kuralı:
   period "user" ise effCDF = user_value; "initial" ise effCDF[i] = LDF[i] × effCDF[i+1].
   Tail truncation: belirli yaştan sonrası 1'e çekmek tüm önceki yaşları indirger.
5. ILR — Incurred Loss Ratio üçgeni. Her (kaza yılı, gelişim adımı) için
   hasar / (prim × correction_k) × 100%. Prim girilmemiş originler null döner.
   >100% kırmızı, >80% sarı. BF sekmesinden prim girilmesi gerekir.
6. BF — Latest, Exposure (prim), Correction (k), % Developed, Pattern Ratio,
   BF Loss Ratio, New Ultimate. Prim Veri modülünden veya manuel girilebilir.
   Correction k: çeyreklik modelde tamamlanmamış kaza yılı için annualization
   (Q1 → 4; Q1+Q2 → 2; Q1-Q3 → 4/3 ≈ 1.333). k=1 veya boş = düzeltme yok.
   exposure_annual = premium × k; pattern_ratio = cl_ult / exposure_annual;
   bf_ult_annual = latest + selected_lr × exposure_annual × (1 − %dev);
   bf_ultimate = bf_ult_annual / k; bf_ibnr = bf_ult − latest.
   CL hesabı correction'dan etkilenmez.
7. Ultimate / IBNR — Origin × (CL Ult | BF Ult) basis seçimi.
8. Özet — Final rapor + eleme etkisi özeti.
9. Geçmiş — history (timestamp + action + source: user|agent + detail).

SELECTED LOSS RATIO FORMÜL SÖZ DİZİMİ
  * Sayı: 0.75 veya 75%
  * avg(2020, 2021, 2022) — pattern ratio aritmetik ortalaması; virgüllü belirli yıllar
  * avg(2020:2022) — aralık (inclusive; 2020, 2021, 2022 hepsini kapsar)
  * vw(2020:2024) — volume-weighted: Σcl_ult / Σexposure_annual; aralık
  * vw(2020, 2022, 2024) — belirli yıllar için volume-weighted (aralık GEREKMİYOR)
  * sum_cl(...) / sum_exp(...)
  * avg(2020:2022) * 1.1
  * Çeyreklik: avg(2020Q1:2021Q4)
  * Boş string → varsayılana (Pattern Ratio) dön

  ÖNEMLİ: vw/avg içindeki yıllar REFERANS alınan (LR hesabına katılan) yıllardır.
  Bu formül simulate_bf_formula veya set_selected_loss_ratio'ya formula= parametresi
  olarak verilir; origins= ise formülün UYGULANACAĞI hedef kaza yıllarıdır.
  Eğer hedef origin'ler basis="cl" kullanıyorsa BF LR değişikliği IBNR'ı etkilemez —
  önce set_basis(origin, "bf") ile basis'i BF'e çekmelisin.

TOOL'LAR
Navigasyon: list_project · select_branch(branch_id [, period_id]) ·
            get_branch_state(branch_id [, period_id])
Okuma: describe_triangle · get_analysis_state (aktif branş için)
LDF: set_window (= volume) · set_method · set_karma_window · clear_karma ·
     exclude_cells · include_cells · clear_exclusions · exclude_outliers ·
     average_ldf_pair
Curve: set_cdf_user_value · set_cdf_choice · set_cdf_choices · set_curve_model ·
       set_curve_include (tail-fit regresyonuna adım dahil/hariç) · reset_curve
BF: set_selected_loss_ratio(s) · set_premium(s) · set_correction(s)
Ultimate: set_basis · set_basis_bulk · set_bf_origins (BF + CL dönüşü + LR tek çağrı)
Senaryo (durumu DEĞİŞTİRMEZ): simulate_bf · simulate_bf_formula · run_chain_ladder ·
            simulate_frequency_severity (Frekans-Şiddet: adet × ortalama maliyet;
            sadece DOSYA_NO'lu hasar verisinden yüklenen branşlarda adet üçgeni mevcut)
ILR: get_ilr_triangle — aktif branşın ILR üçgenini döner (prim girilmemişse null)
Dosya: get_file_summary — son diagonal özeti; get_claim_movement(origin, step) — LDF geçişinin dosya bazlı paid/muallak hareketi

KURALLAR
* DFM = "development factor method" = gelişim faktörü yöntemi = link ratio = CL
  basis. "Sadece 2025 BF, gerisi DFM/CL", "son yıl BF, son 4 yılın ağırlıklı
  ortalamasıyla" → set_bf_origins TEK çağrı (origins=["2025"], lr_last_n=4).
  Yıl aralığını kendin hesaplama.
* Kullanıcı oran vermediyse loss ratio'ya dokunma; "BF ayarla" yalnız basis
  değişikliğidir. Oran uydurma (ör. kendiliğinden %100).
* Yazma araçlarından SONRA yeni IBNR / nihai / ULR rakamı YAZMA: değişiklik
  arayüzde uygulanınca yeniden hesaplanır, bu turda okuduğun durum ESKİDİR.
  "Uygulandı; sonuçlar ekranda güncellendi" de, ne değiştiğini söyle.
* Nihai < ödenmiş: get_analysis_state.ultimate_below_paid boş değilse nihai,
  IBNR ya da ödenmemiş yükümlülük sorulduğunda
  bunu söyle — nihai ödenmişten az olamaz. Olası nedenler: olgun yaşlarda negatif
  incurred gelişimi (CDF < 1) ya da düşük BF oranı. Rakamları DÜZELTME; işaretle.
* exclude_cells step 0-INDEXLI: step=0 → "1→2", step=1 → "2→3". Kullanıcı
  "step 2 ele" derse step=1 gönder. ÖNCE describe_triangle çağır, origin
  format ve geçiş sayısını gör. Tahmin yapma; boş döndüyse kullanıcıyı uyar.
* Tail truncation: "X. periyodtan sonrasını 1'e çek" → her ileri d için
  set_cdf_user_value(d, 1) + set_cdf_choice(d, "user") (set_cdf_choices toplu).
* Cevapta branş adı geçerken AYNEN snapshot'taki ismi kullan; sektör
  örnekleri (kasko, trafik, sağlık vb.) ezbere kullanma.

ÖRNEK SENARYOLAR
"2024 BF %400 olsa IBNR farkı?" → simulate_bf(origin="2024", loss_ratio=4.0)
"Engineering branşında %24.8 olsaydı?" → list_project → branch_id bul → simulate_bf(branch_id=..., origin="2024", loss_ratio=0.248)
"Engineering branşı BF olan tüm kaza yılları" → list_project → get_branch_state(branch_id) → per_origin'deki origin'leri topla → her biri için simulate_bf ile mevcut LR; kısaca cevapla
"vw(2021:2023) uygulasak etkisi ne olur?" → simulate_bf_formula(formula="vw(2021:2023)", origins=["2024","2025","2026"])
"2022 ve 2024 ağırlıklı ortalaması kullansaydık?" → simulate_bf_formula(formula="vw(2022, 2024)", origins=[...hedef yıllar...])
"2026Q1 yıllığa tamamla" → set_correction(origin="2026Q1", value=4)  [buradaki "2026Q1" kaza yılı origin'i, dönem etiketi değil]
"10. dönemden sonrası 1" → ileri her d için set_cdf_user_value(d,1)+choice user
"2021 step 2 LDF aykırı" → exclude_cells [{origin:"2021", step:1}]  (UI'da 2→3)
"Aykırıları %10 sapmadan ele" → exclude_outliers(10,"both","median")

AKTÜERYAL ÖZ
LDF: bir yaştan diğerine taşıma oranı. CDF: yaş→ultimate çarpanı (LDF'lerin
ürünü). Ultimate = Latest × CDF. IBNR = Ultimate − Latest. Pattern ratio =
CL_ult / annual_exposure. Selected LR yoksa pattern ratio; o da yoksa 0.7.
"""


def _reserve_dispatch(
    name: str, args: dict[str, Any], ctx: dict[str, Any]
) -> dict[str, Any]:
    """Tool dispatch — triangle yokken bile session-state tabanlı tool'ları
    çalıştırır (list_project, select_branch, get_branch_state, simulate_bf).
    Triangle gerektirenler ilgili dispatcher içinde uygun hatayı döner."""
    return dispatch_tool(
        name,
        args,
        triangle=ctx.get("triangle"),
        session_state=ctx.get("session_state"),
        count_triangle=ctx.get("count_triangle"),
    )


def _reserve_context(state: dict[str, Any] | None) -> str:
    """Durum bloğunun rezerv bölümü.

    Branşlar DÖNEME göre gruplanır ve her dönemin kendi alt toplamı yazılır.
    Düz liste verildiğinde model dört satırı toplayıp "toplam IBNR" diye
    sunuyordu (Haiku ile ölçüldü) — oysa dönemler aynı portföyün ARDIŞIK
    değerlemeleri; toplanmaları aynı rezervi iki kez saymak demek.
    """
    if not state:
        return "proje yüklenmedi."
    periods = state.get("periods") or []
    totals = state.get("totals_all_branches") or {}
    active = state.get("active") or {}
    active_period_id = active.get("period_id") or totals.get("active_period_id")

    # Sayımlar totals'tan gelir; bridge doldurmadıysa listeden türet —
    # aksi halde blok "0 branş" derken altında dört branş listeliyordu.
    n_branches = totals.get("branch_count")
    if not n_branches:
        n_branches = sum(len(p.get("branches", [])) for p in periods)
    n_with_data = totals.get("branch_with_data_count")
    if n_with_data is None:
        n_with_data = sum(
            1 for p in periods for b in p.get("branches", []) if b.get("has_triangle")
        )

    def _fmt(v: Any) -> str:
        try:
            return f"{float(v):,.0f}"
        except (TypeError, ValueError):
            return "—"

    blocks: list[str] = []
    for p in periods:
        rows: list[str] = []
        subtotal = 0.0
        have = False
        for b in p.get("branches", []):
            mark = "*" if b.get("is_active") else " "
            ibnr = (b.get("totals") or {}).get("ibnr")
            if isinstance(ibnr, (int, float)):
                subtotal += float(ibnr)
                have = True
            rows.append(
                f"{mark} {b.get('frequency', '?')}/{b.get('name', '?')}"
                f"#{b.get('id', '?')} → IBNR {_fmt(ibnr)}"
            )
        if not rows:
            continue
        is_active_period = p.get("id") == active_period_id
        # Aktif olmayan dönem "önceki değerleme" diye etiketli: Qwen 3.5 9B
        # "tüm branşlar"ı dört satır olarak okuyup aynı branşın iki değerlemesini
        # ayrı branş sanıyordu (C3, 3/3).
        head = f"{p.get('label', '?')}" + (
            " [AKTİF DÖNEM]" if is_active_period else " [ÖNCEKİ DEĞERLEME — aynı branşların eski hali]"
        )
        if have:
            head += f" — dönem toplamı IBNR {_fmt(subtotal)}"
            # Uyarı sayının HEMEN yanında: kural ayrı paragrafta dururken küçük
            # modeller (Qwen 3.5 9B) alt toplamları yine topluyordu (C3/C4, 3/3).
            if len(periods) > 1:
                head += " (ayrı değerleme — diğer dönemle TOPLANMAZ)"
        blocks.append("  " + head + "\n      " + "\n      ".join(rows))

    bits = [f"{len(periods)} dönem, {n_branches} branş ({n_with_data} veri ile)"]
    ap_ibnr = totals.get("active_period_ibnr")
    if ap_ibnr is not None:
        bits.append(f"aktif dönem toplam IBNR: {_fmt(ap_ibnr)}")
    if active.get("branch_name"):
        bits.append(
            f"AKTİF: {active['branch_name']} ({active.get('period_label', '?')}, "
            f"{active.get('frequency', '?')})"
        )
    else:
        bits.append("AKTİF BRANŞ YOK")
    summary = " | ".join(bits)
    # Aktif branşın LDF ayarları blokta hazır: Qwen 3.5 9B "kaç dönemlik ortalama"
    # sorusuna durumu okumadan prompt'taki varsayılandan cevap veriyor, bir
    # koşuda "7" diye uyduruyordu (doğrusu all).
    if active.get("branch_name") and (state.get("method") or state.get("window")):
        setting = f"LDF yöntemi {state.get('method') or '?'} · volume {state.get('window') or '?'}"
        karma = state.get("karma_windows") or {}
        if karma:
            steps = ", ".join(
                f"step {k} ({int(k) + 1}→{int(k) + 2}) {v}"
                for k, v in sorted(karma.items(), key=lambda kv: int(kv[0]))
            )
            setting += f" · karma volume: {steps} (diğer adımlar global volume)"
        summary += f"\n  Aktif branş ayarları: {setting}"
    # "Nihai < ödenmiş" uyarısı BİLEREK blokta yok, get_analysis_state'te.
    # Blokta tutarla yazıldığında Qwen 3.5 9B o sayıyı "Selected Ultimate" diye
    # sundu; tutarsız yazıldığında bile T1 6'da 5'ten 6'da 2'ye düştü — fazladan
    # bir satır, küçük modelin "toplam IBNR" cevabını branş rakamına kaydırıyor.
    if blocks:
        summary += "\n  Dönemler ve branşlar:\n" + "\n".join(blocks)
    return summary


def triangle_from_payload(payload: dict[str, Any]) -> Triangle:
    return Triangle(
        origin_periods=[str(o) for o in payload["origin_periods"]],
        development_periods=payload["development_periods"],
        values=payload["values"],
        triangle_type=TriangleType(payload.get("triangle_type", "paid")),
        origin_granularity=Granularity(
            payload.get("origin_granularity", "yearly")
        ),
        development_granularity=Granularity(
            payload.get("development_granularity", "yearly")
        ),
    )


# Rezerv = diğer modüllerin sahiplenmediği tüm tool'lar. Kümeyi diğer
# modüllerin kendi tanımlarından türetiyoruz — yeni bir cashflow/discount/data
# tool'u eklendiğinde burada elle güncelleme gerekmez, yanlış modüle düşemez.
_NON_RESERVE_TOOL_NAMES = (
    _CASHFLOW_TOOL_NAMES | _DISCOUNT_TOOL_NAMES | _DATA_NAV_TOOL_NAMES
)

reserve_module = ModuleSpec(
    name="reserve",
    label="Rezerv",
    system_prompt=RESERVE_PROMPT,
    tool_schemas=[s for s in TOOL_SCHEMAS if s["function"]["name"] not in _NON_RESERVE_TOOL_NAMES],
    dispatch=_reserve_dispatch,
    context_provider=_reserve_context,
)
