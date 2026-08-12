/**
 * Tek doğruluk kaynağı: site künyesi, yapısal veri (JSON-LD) ve SSS içeriği.
 *
 * SSS listesi hem landing'deki görünür bölümü hem FAQPage şemasını besler —
 * ikisi ayrı yerde yazılırsa arama motoru "görünmeyen içerik" sayar.
 */

export const SITE = {
  name: "Actuarius",
  url: "https://actuarius.com.tr",
  email: "info@actuarius.com.tr",
  locale: "tr-TR",
  tagline: "Aktüeryal rezerv ve IBNR analiz platformu",
} as const;

/** Ürünün gerçekten yaptığı işler — şemadaki featureList ve llms.txt ile aynı. */
export const FEATURES = [
  "Chain-Ladder ile IBNR rezerv hesabı",
  "Bornhuetter-Ferguson (BF) yöntemi ve a priori hasar oranı",
  "Gelişim faktörleri (LDF), hücre eleme ve hacim seçimi",
  "Parametrik kuyruk modelleri: exponential, inverse power, power, Weibull",
  "Büyük hasar (large loss) ayrımı: gross / attritional / large",
  "Frekans-şiddet (ortalama hasar maliyeti) yöntemi",
  "Roll-forward ile dönem kapanışı ve Actual vs Expected mutabakatı",
  "Nakit akışı projeksiyonu (çeyreklik ve aylık ödeme deseni)",
  "IFRS 17 iskonto: getiri eğrisi, illikidite primi, risk marjı ve LIC",
  "Senaryo versiyonları ve model kilidi",
  "Kullanıcı, model ve zaman bağlamlı denetim izi",
  "Excel ve CSV çıktısı, Oracle tablosundan veri okuma",
  "Tüm modülleri yürütebilen AI Agent (45 araç)",
] as const;

export const MODULES = [
  { name: "Veri", desc: "Dönem bazlı hasar, prim ve büyük hasar verisi; Oracle veya Excel/CSV." },
  { name: "Rezerv", desc: "Chain-Ladder ve Bornhuetter-Ferguson ile ultimate ve IBNR." },
  { name: "Nakit Akışı", desc: "Ödeme deseninden çeyreklik ve aylık nakit akışı projeksiyonu." },
  { name: "İskonto", desc: "IFRS 17 eğrisi, illikidite primi ve risk marjı ile LIC." },
] as const;

export const PRICING = [
  { name: "Free", price: "0", desc: "1 dönem ve 1 branş; rezerv modülü ve AI Agent dahil." },
  { name: "Pro", price: "100", desc: "Sınırsız dönem ve branş; nakit akışı, iskonto ve senaryo versiyonları." },
  { name: "Enterprise", price: null, desc: "Çoklu kullanıcı ve roller, Oracle entegrasyonu, kurumsal audit akışı, on-premise." },
] as const;

/** Landing'de gösterilen ve FAQPage şemasına giren sorular (Türkçe). */
export const FAQ_TR: { q: string; a: string }[] = [
  {
    q: "Actuarius kimler için?",
    a: "Sigorta ve reasürans şirketlerinde çalışan rezerv aktüerleri, aktüerya yöneticileri ve model değişikliklerini denetleyen ekipler için tasarlandı. Bireysel kullanımdan çok kullanıcılı kurumsal sürece kadar aynı model yapısı korunur.",
  },
  {
    q: "Hangi rezerv yöntemleri destekleniyor?",
    a: "Chain-Ladder ve Bornhuetter-Ferguson temel yöntemlerdir. Buna ek olarak frekans-şiddet (ortalama hasar maliyeti) yöntemi, hacim ağırlıklı / basit / geometrik LDF seçimleri, parametrik kuyruk modelleri (exponential, inverse power, power, Weibull) ve kullanıcı tanımlı CDF girişi bulunur.",
  },
  {
    q: "AI Agent tam olarak ne yapabiliyor?",
    a: "Agent dört modülde toplam 45 araca sahiptir. Veriyi bağlar, üçgeni kurar, aykırı gelişim oranlarını eler, genç kaza dönemlerini BF bazına alır, a priori hasar oranını olgun yıllardan türetir, nakit akışını ve iskontoyu çalıştırır ve kapanış raporunu üretir. Uyguladığı her adım arayüzde görünür, geri alınabilir ve denetim kaydına yazılır.",
  },
  {
    q: "Verilerimi nasıl yüklerim?",
    a: "Dosya bazlı hasar verisi ve kazanılmış prim verisi Excel veya CSV olarak yüklenebilir; kurumsal kurulumda doğrudan Oracle tablosundan da okunabilir. Hazır gelişim üçgeniniz varsa onu da içe aktarabilirsiniz.",
  },
  {
    q: "Model değişiklikleri denetlenebiliyor mu?",
    a: "Evet. Her yazma işlemi kim, ne zaman, hangi branş ve model üzerinde ne değiştirdi bilgisiyle denetim izine yazılır. Model kilidi sayesinde bir modeli aynı anda tek kişi düzenler; senaryolar ayrı versiyonlarda tutulur ve yan yana karşılaştırılır.",
  },
  {
    q: "Dönem kapanışı nasıl ilerliyor?",
    a: "Yeni dönem verisi yüklenir, önceki dönemin modeli roll-forward ile taşınabilir, yeni köşegen beklenenle karşılaştırılır (Actual vs Expected), sapan kohortlar revize edilir, nakit akışı ve iskonto hesaplanır, ardından rapor üretilip model kilitlenir.",
  },
  {
    q: "IFRS 17 iskonto desteği var mı?",
    a: "Evet. İskonto modülü getiri eğrisi ve illikidite primiyle nakit akışlarını bugüne indirger, risk marjını ekleyerek gerçekleşmiş hasar yükümlülüğünü (LIC) hesaplar. IFRS 4 tarzı sabit oran ve nominal yaklaşım da desteklenir.",
  },
  {
    q: "Ücretsiz plan neleri kapsıyor?",
    a: "Free plan kalıcı olarak ücretsizdir; 1 dönem ve 1 branş ile rezerv modülünü, Chain-Ladder ve BF hesaplarını, AI Agent'ı ve Excel çıktısını içerir. Kredi kartı istenmez.",
  },
];

// ─── JSON-LD üreticileri ─────────────────────────────────────────────────────

export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE.url}/#organization`,
    name: SITE.name,
    url: SITE.url,
    email: SITE.email,
    logo: { "@type": "ImageObject", url: `${SITE.url}/favicon.png` },
    description: `${SITE.name}, sigorta şirketleri ve aktüerler için uçtan uca aktüeryal analiz platformudur.`,
    areaServed: { "@type": "Country", name: "Türkiye" },
    knowsAbout: [
      "Aktüerya",
      "IBNR rezerv hesaplama",
      "Chain-Ladder",
      "Bornhuetter-Ferguson",
      "Nakit akışı projeksiyonu",
      "IFRS 17",
    ],
    contactPoint: {
      "@type": "ContactPoint",
      email: SITE.email,
      contactType: "sales",
      availableLanguage: ["Turkish", "English"],
    },
  };
}

export function webSiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE.url}/#website`,
    url: SITE.url,
    name: SITE.name,
    description: SITE.tagline,
    inLanguage: SITE.locale,
    publisher: { "@id": `${SITE.url}/#organization` },
  };
}

export function softwareSchema(locale: "tr" | "en" = "tr") {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": `${SITE.url}/#software`,
    name: SITE.name,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Actuarial reserving software",
    operatingSystem: "Web",
    url: locale === "en" ? `${SITE.url}/en` : SITE.url,
    inLanguage: ["tr", "en"],
    description:
      locale === "en"
        ? "End-to-end actuarial analysis platform: data management, IBNR reserving with Chain-Ladder and " +
          "Bornhuetter-Ferguson, cash flow projection and IFRS 17 discounting. An AI agent runs every module."
        : "Uçtan uca aktüeryal analiz platformu: veri yönetimi, Chain-Ladder ve Bornhuetter-Ferguson ile " +
          "IBNR rezerv hesabı, nakit akışı projeksiyonu ve IFRS 17 iskonto. AI Agent tüm modülleri yürütür.",
    featureList: locale === "en" ? [...FEATURES_EN] : [...FEATURES],
    publisher: { "@id": `${SITE.url}/#organization` },
    offers: PRICING.map((p) => ({
      "@type": "Offer",
      name: p.name,
      description: p.desc,
      ...(p.price === null
        ? { priceSpecification: { "@type": "PriceSpecification", priceCurrency: "TRY" } }
        : {
            price: p.price,
            priceCurrency: "TRY",
            ...(p.price !== "0"
              ? {
                  priceSpecification: {
                    "@type": "UnitPriceSpecification",
                    price: p.price,
                    priceCurrency: "TRY",
                    billingIncrement: 1,
                    unitCode: "MON",
                  },
                }
              : {}),
          }),
    })),
  };
}

export function faqSchema(locale: "tr" | "en" = "tr") {
  const items = locale === "en" ? FAQ_EN : FAQ_TR;
  const path = locale === "en" ? "/en" : "";
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": `${SITE.url}${path}/#faq`,
    inLanguage: locale === "en" ? "en" : SITE.locale,
    mainEntity: items.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

/** İngilizce özellik listesi — SoftwareApplication şeması ve llms.txt için. */
export const FEATURES_EN = [
  "IBNR reserving with the Chain-Ladder method",
  "Bornhuetter-Ferguson with a priori loss ratio derived from mature cohorts",
  "Development factors (LDF), cell exclusion and averaging windows",
  "Parametric tail models: exponential, inverse power, power, Weibull",
  "Large-loss split: gross / attritional / large modelled separately",
  "Frequency-severity (average cost per claim) method",
  "Roll-forward period close and Actual vs Expected reconciliation",
  "Cash flow projection (quarterly and monthly payment pattern)",
  "IFRS 17 discounting: yield curve, illiquidity premium, risk adjustment and LIC",
  "Scenario versions and model locking",
  "Audit trail scoped by user, model and time",
  "Excel and CSV export, direct read from Oracle tables",
  "An AI agent that operates every module (45 tools)",
] as const;

/** İngilizce SSS — /en sayfasındaki görünür içerik ve FAQPage şeması. */
export const FAQ_EN: { q: string; a: string }[] = [
  {
    q: "Who is Actuarius for?",
    a: "It is built for reserving actuaries, actuarial managers and the teams that review model changes at insurers and reinsurers. The same model structure carries from individual use to a multi-user enterprise process.",
  },
  {
    q: "Which reserving methods are supported?",
    a: "Chain-Ladder and Bornhuetter-Ferguson are the core methods. On top of those you get the frequency-severity (average cost per claim) method, volume-weighted / simple / geometric LDF averaging, parametric tail models (exponential, inverse power, power, Weibull) and manual CDF entry.",
  },
  {
    q: "What can the AI agent actually do?",
    a: "The agent has 45 tools across four modules. It connects the data, builds the triangle, excludes outlying development ratios, moves immature accident periods onto a BF basis, derives the a priori loss ratio from mature years, runs cash flow and discounting, and produces the closing report. Every step it applies is visible in the interface, reversible and written to the audit trail.",
  },
  {
    q: "How do I load my data?",
    a: "Claim-level loss data and earned premium can be uploaded as Excel or CSV; in an enterprise setup they can be read directly from an Oracle table. If you already have a development triangle, you can import that instead.",
  },
  {
    q: "Can model changes be audited?",
    a: "Yes. Every write is recorded with who made it, when, and on which line of business and model. Model locking means only one person edits a model at a time; scenarios are kept as separate versions and compared side by side.",
  },
  {
    q: "How does the period close work?",
    a: "New period data is loaded, the previous model can be carried forward with roll-forward, the new diagonal is compared against expectation (Actual vs Expected), deviating cohorts are revised, cash flow and discounting are calculated, then the report is produced and the model is locked.",
  },
  {
    q: "Is IFRS 17 discounting supported?",
    a: "Yes. The discounting module discounts cash flows using a yield curve and illiquidity premium, then adds the risk adjustment to produce the liability for incurred claims (LIC). An IFRS 4 style fixed-rate and nominal approach is also supported.",
  },
  {
    q: "What does the free plan include?",
    a: "The Free plan is permanently free: 1 valuation period and 1 line of business, the reserving module, Chain-Ladder and BF calculations, the AI agent and Excel export. No credit card is required.",
  },
];
