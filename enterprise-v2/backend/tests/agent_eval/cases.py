"""Senaryo bankası — bir aktüerya yönetmeninin gerçekten yapacağı işler.

Dört eksende ölçülür:
  * doğruluk   — rakam fixture'dan bağımsız hesaplanan değerle tutuyor mu
  * semantik   — aynı şeyi farklı kelimelerle sorunca anlıyor mu, bağlam
                 taşıyor mu, olmayan şeyi uydurmuyor mu
  * agentic    — okuma sorusunda yazmıyor, komut verilince gerçekten yazıyor,
                 hatadan dönüyor, gereksiz zincir kurmuyor
  * kombinasyon— doğru araçları doğru SIRAYLA ve doğru modülden seçiyor mu

Bir senaryo `q` (tek tur) ya da `turns` (çok tur, geçmiş taşınır) alır.
"""

from __future__ import annotations

from typing import Any

def build_cases(project: dict) -> list[dict]:
    per = {p["label"]: p for p in project["periods"]}
    q2f = per["2026Q2"]["branches"][0]
    q2e = per["2026Q2"]["branches"][1]
    q1f = per["2026Q1"]["branches"][0]

    ibnr_q2 = q2f["totals"]["ibnr"]
    # Aktif DÖNEMİN toplamı — kapsamsız "toplam IBNR" bunu kastediyor.
    ibnr_period_q2 = sum(b["totals"]["ibnr"] for b in per["2026Q2"]["branches"])
    ibnr_q1 = q1f["totals"]["ibnr"]
    ult_q2 = q2f["totals"]["selected_ultimate"]
    eng_ibnr = q2e["totals"]["ibnr"]
    rows = {r["origin"]: r for r in q2f["per_origin"]}
    bf_origins = sorted(r["origin"] for r in q2f["per_origin"] if r["basis"] == "bf")
    # Dönem bazlı toplamlar. TÜM dönemlerin toplamı bilinçli olarak yok:
    # dönemler ardışık değerlemeler, toplanmaları aynı rezervi iki kez saymak.
    period_ibnr = {
        p["label"]: sum(b["totals"]["ibnr"] for b in p["branches"])
        for p in project["periods"]
    }

    # "2024 LR %25 olsaydı" senaryosunun DOĞRU cevabı — BF formülünün aynısı:
    #   BF_ult_annual = exposure_annual × LR × (1 − geliştirilmiş oran) + latest
    _r24 = rows["2024"]
    _bf_annual = _r24["premium_annual"] * 0.25 * (1 - _r24["pct_developed"]) + _r24["latest"]
    _bf = _bf_annual / _r24["correction"] if _r24["correction"] else _bf_annual
    bf_2024_at_25 = _bf - _r24["latest"]   # IBNR

    READ = ["get_analysis_state", "get_branch_state", "list_project"]

    cases: list[dict[str, Any]] = [
        # ── 1. Durum tespiti ────────────────────────────────────────────────
        dict(id="G1", kat="genel", q="Merhaba, elimizde hangi branşlar ve hangi dönemler var?",
             expect_tools=["list_project"],
             expect_text=["fire", "engineering", "2026q1", "2026q2"],
             forbid_text=["kasko", "trafik"]),
        dict(id="G2", kat="genel", q="Şu an hangi branş ve dönem üzerinde çalışıyorum?",
             expect_text=["fire", "2026q2"], forbid_text=["kasko"]),
        dict(id="G3", kat="genel", q="Bu branşta model hangi yöntemle kurulmuş, kısaca özetler misin?",
             # Yöntem bilgisi modül prompt'unda da var; araç şartı yerine
             # cevabın DOĞRU yöntemi söylemesi ölçülür.
             expect_text=["volume"], read_only=True),

        # ── 2. Tek değer ────────────────────────────────────────────────────
        # Kapsamsız "toplam" = AKTİF DÖNEMİN toplamı (bkz. _STATE_BLOCK_BOUNDARY).
        # Tek bir branşın IBNR'ı bir "toplam" değildir; ajan dönem toplamını
        # verip aktif branşın payını da söylemeli. Araç zorunlu değil —
        # sayı durum bloğunda hazır yazıyor, araç çağırmak boşuna tur.
        dict(id="T1", kat="tek-değer", q="Toplam IBNR ne kadar?",
             expect_numbers=[ibnr_period_q2]),
        dict(id="T1b", kat="tek-değer", q="Aktif branşın IBNR'ı ne kadar?",
             expect_numbers=[ibnr_q2]),
        dict(id="T2", kat="tek-değer", q="Seçilmiş ultimate toplamı kaç?",
             expect_tools=READ, expect_numbers=[ult_q2]),
        dict(id="T3", kat="tek-değer", q="IBNR neden negatif çıkıyor, kısaca açıkla.",
             # Kavramsal soru — araç şartı yersiz. Ölçüt MEKANİZMANIN doğru
             # anlatılması: gerçekleşen hasar nihai tahmini aşıyor.
             # Birebir "latest" aramak doğruluğu değil kelime seçimini ölçüyordu
             # ve koşudan koşuya değişiyordu; iki kavramın da geçmesi yeterli.
             expect_text=[
                 ["latest", "son diagonal", "gerçekleşen", "kümülatif",
                  "ödenmiş", "ödenen", "gerçekleşmiş"],
                 ["ultimate", "nihai"],
             ],
             expect_numbers=[]),

        # ── 3. Kırılım ──────────────────────────────────────────────────────
        dict(id="K1", kat="kırılım", q="2024 kaza yılının IBNR'ı ne kadar?",
             expect_tools=READ, expect_numbers=[rows["2024"]["ibnr"]]),
        dict(id="K2", kat="kırılım", q="2023 kaza yılının latest ve CDF değerleri neler?",
             expect_tools=READ,
             expect_numbers=[rows["2023"]["latest"], rows["2023"]["cdf"]], tol=0.05),
        dict(id="K3", kat="kırılım", q="Hangi kaza yılları BF basis'te, hangileri CL?",
             # Agent aralık yazabiliyor ("2023 – 2025"), tek tek de sayabiliyor;
             # ikisi de doğru. Aralığın UÇLARINI ve iki basis adını ara.
             expect_tools=READ,
             expect_text=[bf_origins[0], bf_origins[-1], "bf", "cl"]),
        dict(id="K4", kat="kırılım", q="En yüksek IBNR hangi kaza yılında?",
             expect_tools=READ),

        # ── 4. Dönemsel gelişim ─────────────────────────────────────────────
        dict(id="D1", kat="dönemsel", q="2026Q1'den 2026Q2'ye IBNR nasıl gelişti?",
             # Her iki dönemin branş bazlı IBNR'ı DURUM bloğunda var; araç
             # çağırmadan cevaplamak doğru ve hızlı. Ölçüt İKİ dönemin de
             # sayısının doğru verilmesi.
             expect_numbers=[ibnr_q1, ibnr_q2], tol=0.03),
        dict(id="D2", kat="dönemsel", q="2026Q1 dönemindeki FIRE branşının toplam IBNR'ı neydi?",
             # Bu rakam da DURUM bloğunda (dönem/branş × IBNR listesi). C3 ve D1
             # ile aynı gerekçe: araç çağırmadan cevaplamak doğru ve hızlı.
             expect_numbers=[ibnr_q1], tol=0.03),
        dict(id="D3", kat="dönemsel", q="İki dönem arasındaki ultimate değişimi ne kadar?",
             expect_tools=["get_branch_state", "list_project", "get_analysis_state"],
             expect_numbers=[], tol=0.05),

        # ── 5. Çapraz branş (aktif olmayan) ─────────────────────────────────
        dict(id="C1", kat="çapraz-branş", q="ENGINEERING branşının IBNR'ı ne kadar?",
             # Bu branşın IBNR'ı da DURUM bloğunda (her branş IBNR'ıyla listeli).
             # C3/D1/D2 ile aynı gerekçe: ölçüt araç değil, SAYININ doğruluğu —
             # yanlış branşın rakamını verirse burada yakalanır.
             expect_numbers=[eng_ibnr], tol=0.03),
        dict(id="C2", kat="çapraz-branş", q="İki branşı IBNR açısından karşılaştır.",
             expect_tools=["get_branch_state", "list_project"],
             expect_numbers=[ibnr_q2, eng_ibnr], tol=0.03),
        # Bu senaryo eskiden TÜM dönemlerin toplamını bekliyordu, yani testin
        # kendisi hatayı doğruluyordu: 2026Q1 ile 2026Q2 ardışık değerlemeler,
        # toplamları aynı portföyü iki kez sayar. Doğru cevap dönem dönem.
        dict(id="C3", kat="çapraz-branş", q="Tüm branşların toplam IBNR'ı nedir?",
             expect_numbers=[period_ibnr["2026Q2"], period_ibnr["2026Q1"]], tol=0.02),
        dict(id="C4", kat="çapraz-branş",
             q="Bütün dönemlerin IBNR'ını toplayıp tek rakam söyle.",
             # Talep açıkça yanlış: ajan uyarmalı, uydurulmuş bir toplam vermemeli.
             expect_text=[["ardışık", "değerleme", "toplanmaz", "iki kez",
                           "anlamlı değil", "ayrı ayrı", "dönem dönem"]],
             forbid_numbers=[sum(period_ibnr.values())]),

        # ── 6. Varsayım denetimi ────────────────────────────────────────────
        dict(id="V1", kat="varsayım", q="Kuyruk nereden kesildi, hangi CDF override'ları var?",
             expect_tools=READ, expect_text=["8"]),
        dict(id="V2", kat="varsayım", q="Correction nerede uygulanmış ve neden?",
             expect_tools=READ, expect_text=["2025"]),
        dict(id="V3", kat="varsayım", q="Kaç hücre elendi, hangileri?",
             expect_tools=READ, expect_numbers=[2], tol=0.01),
        dict(id="V4", kat="varsayım", q="LDF hesabında hangi volume seçili?",
             expect_tools=READ, expect_text=["all"]),
        dict(id="V5", kat="varsayım", q="BF kullanılan yerlerde hangi loss ratio kullanılıyor?",
             expect_tools=READ, expect_text=bf_origins[:1]),

        # ── 7. Senaryo ──────────────────────────────────────────────────────
        dict(id="S1", kat="senaryo", q="2024 için loss ratio %25 olsaydı IBNR ne olurdu?",
             # İki araç da meşru: simulate_bf_formula açıklamasında '75%' gibi
             # sabit oranları da kabul ettiğini ve simulate_bf'yi kapsadığını
             # söylüyor. Ölçüt araç değil, SAYI.
             expect_tools=["simulate_bf", "simulate_bf_formula"],
             expect_numbers=[bf_2024_at_25], tol=0.03),
        dict(id="S2", kat="senaryo", q="BF oranına vw(2021:2023) uygulasak ne değişir?",
             expect_tools=["simulate_bf_formula", "get_analysis_state"],
             forbid_text=["fark yok", "değişmez"]),
        dict(id="S3", kat="senaryo", q="2024 kaza yılının primini 300 milyon yap.",
             expect_tools=["set_premium"]),

        # ── 8. Diğer modüller ───────────────────────────────────────────────
        dict(id="M1", kat="modül", q="Nakit akışı deseni hangi branşlarda hazır?",
             expect_tools=["get_cashflow_state", "get_cashflow_pattern_state"],
             expect_text=["fire"]),
        dict(id="M2", kat="modül", q="İskonto modülünde aktif branşın unpaid liability'si ne kadar?",
             expect_tools=["get_discount_state", "compute_discount"],
             expect_numbers=[q2f["totals"]["latest"] + q2f["totals"]["ibnr"]], tol=0.03),

        # ── 9. Tuzak: uydurmamalı ───────────────────────────────────────────
        dict(id="X1", kat="tuzak", q="Kasko branşının IBNR'ı ne kadar?",
             forbid_text=["kasko branşının ibnr'ı", "kasko için toplam ibnr"]),
        dict(id="X2", kat="tuzak", q="2019Q3 dönemindeki rezerv ne kadardı?",
             forbid_text=["2019q3 döneminde toplam"]),
        dict(id="X3", kat="tuzak", q="Bu branşta dosya bazlı en büyük hasar hangisi?",
             forbid_tools=[]),
    ]


    # ═══════════════════════════════════════════════════════════════════════
    # SEMANTİK — aynı şeyi başka kelimeyle sorunca anlıyor mu, bağlam taşıyor
    # mu, olumsuzlamayı çeviriyor mu, olmayanı uydurmuyor mu
    # ═══════════════════════════════════════════════════════════════════════
    cases += [
        dict(id="SEM01", kat="semantik", q="Bu branş için ne kadar karşılık ayırdık?",
             # "karşılık" Türkçe aktüeryada hem IBNR hem toplam muallak
             # yükümlülük (latest + IBNR) anlamına gelir; ikisi de doğru cevap.
             expect_any_numbers=[ibnr_q2, ult_q2], read_only=True),
        dict(id="SEM02", kat="semantik", q="Nihai hasar tahminimiz toplamda kaç?",
             # "nihai hasar" = selected ultimate
             expect_numbers=[ult_q2], read_only=True),
        dict(id="SEM03", kat="semantik", q="What is the total IBNR for the active branch?",
             # İngilizce soru — Türkçe arayüzde de doğru cevaplamalı
             expect_numbers=[ibnr_q2], read_only=True),
        dict(id="SEM04", kat="semantik", q="Gelişim faktörlerinde kaç dönemlik ortalama alıyoruz?",
             # "gelişim faktörü" = LDF, "kaç dönemlik ortalama" = volume/window
             expect_text=[["all", "tüm", "tamam"]], read_only=True),
        dict(id="SEM05", kat="semantik", q="Hangi kaza yılları BF DEĞİL?",
             # olumsuzlama: BF olmayanlar = CL basis
             expect_text=[["cl", "chain"]], forbid_text=["hepsi bf"], read_only=True),
        dict(id="SEM06", kat="semantik",
             q="FIRE mı ENGINEERING mi daha çok rezerv gerektiriyor?",
             # Karşılaştırma sorusu: doğru branşı SEÇMESİ esas; iki rakamı da
             # dökmesi şart değil (biri yeterli).
             expect_any_numbers=[ibnr_q2, eng_ibnr], tol=0.03,
             expect_text=["fire"], read_only=True),
        dict(id="SEM07", kat="semantik", q="Toplam IBNR'ı milyon cinsinden söyle.",
             # birim dönüşümü — tolerans gevşek, "183,2 milyon" da kabul
             expect_numbers=[ibnr_q2], tol=0.03, read_only=True),
        dict(id="SEM08", kat="semantik", q="2024 kaza yılnın ibnrı ne kdar",
             # yazım hatalı girdi
             expect_numbers=[rows["2024"]["ibnr"]], tol=0.03, read_only=True),
        dict(id="SEM09", kat="semantik", q="Modelin genel durumu nasıl, özetler misin?",
             # belirsiz/açık uçlu — uydurmadan gerçek branşı özetlemeli
             expect_text=["fire"], forbid_text=["kasko", "trafik"], read_only=True),
        dict(id="SEM10", kat="semantik",
             q="2025 için correction 4 uygulandı, bunun anlamı ne?",
             # kullanıcı doğru bir olgu söylüyor — teyit edip açıklamalı
             expect_text=[["yıllık", "annual", "çeyrek"]], read_only=True),
        dict(id="SEM11", kat="semantik",
             q="2024'ün primi 5 milyar TL değil mi?",
             # kullanıcı YANLIŞ olgu söylüyor (gerçek ~1.03 milyar) — düzeltmeli
             # Düzeltirken "5 milyar değil" demesi doğal; yasaklamak haksız.
             # Ölçüt: DOĞRU rakamı vermesi ve açıkça reddetmesi.
             expect_numbers=[rows["2024"]["premium"]], tol=0.03,
             expect_text=[["hayır", "değil", "yanlış"]], read_only=True),
        dict(id="SEM12", kat="semantik",
             turns=["2024 kaza yılının IBNR'ı ne kadar?", "Peki 2023?"],
             # bağlam taşıma: ikinci turda "IBNR" kelimesi geçmiyor
             expect_numbers=[rows["2023"]["ibnr"]], tol=0.03, read_only=True),
    ]

    # ═══════════════════════════════════════════════════════════════════════
    # AGENTIC — okuma sorusunda yazmıyor, komutta gerçekten yazıyor, hatadan
    # dönüyor, gereksiz zincir kurmuyor, imkânsızı reddediyor
    # ═══════════════════════════════════════════════════════════════════════
    cases += [
        dict(id="AG01", kat="agentic", q="2022 kaza yılını BF bazına al.",
             # 2022 fixture'da CL — komut gerçekten bir değişiklik yaratmalı.
             # (2023 zaten BF; agent onu "zaten bf" diye doğru reddediyordu.)
             expect_any_actions=["set_basis", "set_basis_bulk"]),
        dict(id="AG02", kat="agentic", q="2021 için loss ratio'yu %30 olarak ayarla.",
             expect_any_actions=["set_selected_loss_ratio", "set_selected_loss_ratios"]),
        dict(id="AG03", kat="agentic", q="Volume'ü 5'e çek.",
             expect_actions=["set_window"]),
        # Prompt "Tek metod: hacim ağırlıklı" derken agent bu üçünü de
        # reddediyordu — araç ve hesap katmanı ise üçünü de destekliyor.
        dict(id="AG18", kat="agentic", q="LDF ortalamasını basit ortalamaya çevir.",
             expect_actions=["set_method"]),
        dict(id="AG19", kat="agentic", q="Geometrik ortalama yöntemine geç.",
             expect_actions=["set_method"]),
        # Pencere ile yöntem ayrı kavramlar: "volume" istendiğinde yöntem
        # değiştirmemeli, pencere aracını kullanmalı.
        dict(id="AG20", kat="agentic", q="Volume penceresini son 4 origin yap.",
             expect_actions=["set_window"]),
        # Karma Volume prompt'ta hiç anılmıyordu; araç erişilemezdi.
        dict(id="AG21", kat="agentic",
             q="İlk gelişim adımı için pencereyi ayrı olarak 4'e sabitle, diğerleri kalsın.",
             expect_any_actions=["set_karma_window"]),
        dict(id="AG04", kat="agentic", q="2019 kaza yılının ilk gelişim hücresini ele.",
             # 2017|0 fixture'da ZATEN elenmiş; agent onu doğru şekilde
             # "zaten elenmiş" diye geçiyordu. 2019 elenmemiş.
             expect_actions=["exclude_cells"]),
        dict(id="AG05", kat="agentic", q="Tüm elemeleri temizle.",
             expect_actions=["clear_exclusions"]),
        dict(id="AG06", kat="agentic",
             turns=["2024 kaza yılının primini 300 milyon yap.",
                    "Şimdi 2024'ün primini söyle."],
             expect_actions=["set_premium"],
             # Yazma ASYNC: snapshot bu turda güncellenmez. Agent bunu bilmeli ve
             # eski rakamı "güncel" diye sunmamalı.
             forbid_text=["300.000.000 olarak kayıtlı"]),
        dict(id="AG07", kat="agentic", q="Toplam IBNR ne kadar?",
             # saf okuma — hiçbir yazma aksiyonu çıkmamalı
             read_only=True, expect_numbers=[ibnr_q2]),
        dict(id="AG08", kat="agentic", q="Kuyruk nereden kesildi?",
             read_only=True),
        dict(id="AG09", kat="agentic", q="2030 kaza yılı için veri ekle.",
             # imkânsız — üçgende 2030 yok; uydurup yazmamalı
             forbid_actions=["set_premium", "set_basis", "exclude_cells"],
             forbid_text=["2030 eklendi", "2030 için veri eklendi"]),
        dict(id="AG10", kat="agentic", q="Nakit akışı modülünde 2023'ün hücresini ele.",
             # doğru modülün aracı seçilmeli
             expect_tools=["exclude_cashflow_cells"],
             forbid_tools=["exclude_cells"]),
        dict(id="AG11", kat="agentic",
             turns=["ENGINEERING branşına geç.", "Şu an hangi branştayım?"],
             expect_actions=["select_branch"]),
        dict(id="AG12", kat="agentic", q="Merhaba, günaydın.",
             # sohbet — araç çağırmaya gerek yok, yazma kesinlikle yok
             read_only=True, max_tools=1),
        dict(id="AG13", kat="agentic", q="Modelle",
             # İKİ davranış da tasarım gereği meşru: eksik seçim varsa form
             # açmak (ask_user) ya da doğrudan otonom modellemeye girmek.
             # Ölçüt: modelleme İŞİNE girmiş olması — sohbetle geçiştirmemesi.
             expect_tools=["ask_user", "roll_forward", "load_triangle_from_data",
                           "get_analysis_state", "set_basis", "set_basis_bulk"]),
        dict(id="AG14", kat="agentic", q="2024'ün primini 300 milyon yap ve sonucu özetle.",
             # yazma + rapor tek turda
             expect_actions=["set_premium"], expect_text=["300"]),
    ]

    # ═══════════════════════════════════════════════════════════════════════
    # ARAÇ KOMBİNASYONU — doğru araçlar, doğru SIRA, doğru modül, kısa zincir
    # ═══════════════════════════════════════════════════════════════════════
    cases += [
        dict(id="TK01", kat="kombinasyon",
             q="Mevcut BF oranlarına vw(2021:2023) uygularsak toplam IBNR nasıl değişir?",
             # önce mevcut durumu oku, sonra simüle et
             expect_tool_sequence=["get_analysis_state", "simulate_bf_formula"],
             read_only=True),
        dict(id="TK02", kat="kombinasyon", q="ENGINEERING'in 2024 kaza yılı IBNR'ı ne?",
             # çapraz branş + origin kırılımı
             expect_tools=["get_branch_state", "list_project"], read_only=True),
        dict(id="TK03", kat="kombinasyon", q="Nakit akışı LDF'leri neler?",
             # paid üçgeni — rezerv aracıyla cevaplanmamalı
             expect_tools=["get_cashflow_ldf_state", "get_cashflow_state"],
             forbid_tools=["get_analysis_state"], read_only=True),
        dict(id="TK04", kat="kombinasyon", q="İskontolu yükümlülüğü %30 sabit oranla hesapla.",
             expect_tools=["compute_discount"], read_only=True),
        dict(id="TK05", kat="kombinasyon", q="Frekans-şiddet yöntemiyle ultimate hesapla.",
             # adet üçgeni yok — net hata vermeli, uydurmamalı
             expect_tools=["simulate_frequency_severity"],
             forbid_text=["ultimate hesaplandı"]),
        dict(id="TK06", kat="kombinasyon", q="Dosya bazlı en büyük hasarları göster.",
             expect_tools=["get_file_summary"],
             forbid_text=["dosya kırılımı yok"]),
        dict(id="TK07", kat="kombinasyon", q="Veri sekmesine geç.",
             expect_actions=["navigate_to"]),
        dict(id="TK08", kat="kombinasyon",
             q="2022, 2023 ve 2024 için primleri sırasıyla 100, 200 ve 300 milyon yap.",
             # toplu araç tercih edilmeli, üç ayrı çağrı değil
             expect_tools=["set_premiums", "set_premium"], max_tools=3),
        dict(id="TK09", kat="kombinasyon", q="Aykırı gelişim oranlarını bul ve ele.",
             expect_tool_sequence=["exclude_outliers"]),
        dict(id="TK10", kat="kombinasyon",
             q="İki dönemin ultimate'ını karşılaştır ve farkı yüzde olarak ver.",
             expect_numbers=[ult_q2], read_only=True),
        dict(id="TK11", kat="kombinasyon", q="Incurred/latest oranı üçgenini göster.",
             expect_tools=["get_ilr_triangle"], read_only=True),
        dict(id="TK12", kat="kombinasyon", q="Bu branşın üçgeni hangi tipte ve kaç dönemlik?",
             expect_tools=["describe_triangle", "get_analysis_state", "get_branch_state"],
             expect_text=["incurred"], read_only=True),
        dict(id="TK13", kat="kombinasyon", q="Veri modülünde hangi dönemler yüklü?",
             expect_tools=["list_data_periods", "list_project"], read_only=True),
        dict(id="TK14", kat="kombinasyon",
             turns=["2024'ü CL bazına al.", "Şimdi 2024'ü tekrar BF yap."],
             # aynı hedefe iki karşıt yazma — ikisi de üretilmeli
             expect_actions=["set_basis"]),
    ]

    return cases
