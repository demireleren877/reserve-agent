import { FAQ_TR, FAQ_EN } from "@/lib/seo";

/**
 * Landing içeriği — tek kaynak, iki dil.
 *
 * Sayfa iki dilde yayınlanıyor (TR: /, EN: /en). Metinler burada tutulur ki
 * iki kopya birbirinden ayrışmasın; bileşen yalnızca düzeni bilir.
 */

export type Locale = "tr" | "en";

export interface LandingContent {
  locale: Locale;
  /** Bu dilin kanonik yolu — hreflang ve dil seçici için. */
  path: string;
  nav: {
    modules: string; agent: string; close: string; modeling: string;
    governance: string; faq: string; pricing: string;
    login: string; cta: string; otherLang: string; otherLangPath: string;
  };
  hero: {
    eyebrow: string; title1: string; title2: string; lede: string;
    ctaPrimary: string; ctaSecondary: string; note: string; agentStrip: string;
  };
  modules: {
    label: string; h2: string; p: string;
    items: { t: string; s: string; d: string; shot: string }[];
  };
  agent: {
    label: string; h2: string; p: string;
    tools: { m: string; n: number; d: string }[];
  };
  close: { label: string; h2: string; p: string; steps: { n: string; t: string; d: string }[] };
  modeling: {
    label: string; h2: string; p: string; frame: string;
    prev: string; next: string; tablist: string;
    steps: { t: string; d: string; shot: string; copy: string }[];
  };
  governance: { label: string; h2: string; p: string; items: { t: string; d: string }[] };
  pricing: {
    label: string; h2: string; p: string;
    plans: { n: string; p: string; s: string; f: string[]; h: string; a: string; on?: boolean }[];
  };
  faq: { label: string; h2: string; p: string; items: { q: string; a: string }[] };
  contact: {
    label: string; h2: string; p: string;
    name: string; email: string; company: string; optional: string;
    message: string; placeholder: string;
    submit: string; sending: string; tryFree: string;
    okTitle: string; okBody: string; okFallback: string; again: string;
    note: string; genericError: string;
  };
  footer: { privacy: string; terms: string; contact: string };
}

const SHOTS = {
  dataMap: "/shots/data-map.webp",
  ldf: "/shots/ldf.webp",
  cashflow: "/shots/cashflow.webp",
  discount: "/shots/discount.webp",
  dataTab: "/shots/data-tab.webp",
  files: "/shots/files.webp",
  curve: "/shots/curve.webp",
  ilr: "/shots/ilr.webp",
  bf: "/shots/bf.webp",
  ultimate: "/shots/ultimate.webp",
};

export const TR: LandingContent = {
  locale: "tr",
  path: "/",
  nav: {
    modules: "Modüller", agent: "Agent", close: "Kapanış", modeling: "Modelleme",
    governance: "Yönetişim", faq: "SSS", pricing: "Fiyat",
    login: "Giriş", cta: "Ücretsiz başlayın", otherLang: "EN", otherLangPath: "/en",
  },
  hero: {
    eyebrow: "Uçtan uca aktüeryal analiz platformu",
    title1: "Aktüeryal işin tamamı,",
    title2: "tek platformda.",
    lede:
      "Veri yönetimi, rezerv modelleme, nakit akışı, iskonto ve raporlama aynı sistemde. " +
      "AI Agent bu modüllerin hepsinde çalışır — dönemi kapatır, modeli kurar, raporu üretir " +
      "ve her kararın gerekçesini bırakır.",
    ctaPrimary: "Ücretsiz başlayın",
    ctaSecondary: "Kurumsal demo",
    note: "Kredi kartı gerekmez · Excel, CSV veya Oracle ile başlayın",
    agentStrip: "hepsinde çalışır",
  },
  modules: {
    label: "Modüller",
    h2: "Dört modül, tek veri katmanı",
    p: "Aynı dönem, aynı branş ve aynı varsayım seti üzerinde çalışırlar; birindeki değişiklik diğerlerine yansır.",
    items: [
      { t: "Veri", s: "Bağlı", d: "Dönem bazlı hasar, prim ve büyük hasar verisi. Oracle tablosundan doğrudan ya da Excel/CSV ile.", shot: SHOTS.dataMap },
      { t: "Rezerv", s: "Modelleniyor", d: "Chain-Ladder ve Bornhuetter–Ferguson; gelişim faktörleri, kuyruk, large ayrımı, frekans-şiddet, senaryo versiyonları.", shot: SHOTS.ldf },
      { t: "Nakit Akışı", s: "Hazır", d: "Ödeme deseninden çeyreklik ve aylık nakit akışı projeksiyonu; rezervle tutarlı kalır.", shot: SHOTS.cashflow },
      { t: "İskonto", s: "Hazır", d: "IFRS 17 eğrisi, illikidite primi ve risk marjı ile yükümlülük iskontosu (LIC).", shot: SHOTS.discount },
    ],
  },
  agent: {
    label: "AI Agent",
    h2: "Tüm modüllerde çalışan bir aktüeryal asistan",
    p:
      "Agent sohbet etmekle kalmaz; veriyi bağlar, üçgeni kurar, aykırı oranı eler, genç kohortları " +
      "BF'e alır, nakit akışını ve iskontoyu çalıştırır, raporu çıkarır. Rol ve model kilidine uyar; " +
      "her adım geri alınabilir ve denetime yazılır.",
    tools: [
      { m: "Rezerv", n: 31, d: "Üçgen, eleme, kuyruk, BF, senaryo, roll-forward" },
      { m: "Nakit Akışı", n: 10, d: "Desen, LDF, hariç tutma, eğri" },
      { m: "İskonto", n: 2, d: "Durum okuma ve LIC hesabı" },
      { m: "Veri & Navigasyon", n: 2, d: "Dönem listesi, modüller arası geçiş" },
    ],
  },
  close: {
    label: "Dönem kapanışı",
    h2: "Kapanış beş adımda tamamlanır",
    p: "Agent bu adımları uçtan uca yürütebilir; siz onaylar ve gerektiğinde devralırsınız.",
    steps: [
      { n: "01", t: "Veri yüklenir", d: "Yeni dönemin hasar, prim ve büyük hasar setleri bağlanır." },
      { n: "02", t: "Mutabakat", d: "Yeni köşegen beklenenle karşılaştırılır; sapan kohortlar işaretlenir." },
      { n: "03", t: "Revizyon", d: "Model güncellenir: eleme, baz seçimi, a priori oran, correction." },
      { n: "04", t: "Projeksiyon", d: "Nakit akışı deseni ve IFRS 17 iskontosu hesaplanır." },
      { n: "05", t: "Rapor ve kilit", d: "Özet, segment kırılımı ve Excel çıktısı üretilir; model kilitlenir." },
    ],
  },
  modeling: {
    label: "Modelleme ve raporlama",
    h2: "Yedi adımlık model akışı",
    p: "Rezerv modülündeki sekmeler süreci birebir izler; her adımın çıktısı bir sonrakini besler.",
    frame: "rezerv / 2026Q2 / Fire & Home",
    prev: "Önceki adım", next: "Sonraki adım", tablist: "Modelleme adımları",
    steps: [
      { t: "Veri", d: "Üçgen önizleme", shot: SHOTS.dataTab, copy: "Ödeme ve muallak üçgenleri kümülatif ya da artımsal olarak; veri modülünden çekilir veya Excel'den yüklenir." },
      { t: "Dosya", d: "Hasar kırılımı", shot: SHOTS.files, copy: "Hangi dosya hangi hücreyi taşıyor? Medyan, değişim katsayısı ve konsantrasyon ile dosya bazında dağılım." },
      { t: "LDF", d: "Gelişim faktörleri", shot: SHOTS.ldf, copy: "Hacim penceresi seçilir, aykırı hücre elenir; seçili LDF ve CDF zinciri anında güncellenir." },
      { t: "Curve", d: "Kuyruk uydurma", shot: SHOTS.curve, copy: "Exponential, inverse power, power ve Weibull; adım bazında seçim ve elle CDF girişi." },
      { t: "ILR", d: "Hasar oranı üçgeni", shot: SHOTS.ilr, copy: "Kazanılmış prime göre hasar oranı gelişimi — BF için a priori oran buradan okunur." },
      { t: "BF", d: "Bornhuetter–Ferguson", shot: SHOTS.bf, copy: "Exposure, yıllıklaştırma katsayısı ve beklenen hasar oranı; kohort bazında CL/BF seçimi." },
      { t: "Ultimate / IBNR", d: "Rezerv projeksiyonu", shot: SHOTS.ultimate, copy: "Kaza yılı bazında nihai hasar, IBNR ve ULR — seçilen bazla birlikte." },
    ],
  },
  governance: {
    label: "Yönetişim",
    h2: "Denetime hazır çalışma",
    p: "Kim neyi neden değiştirdi sorusu sonradan yeniden kurulmaz — kaydedilir.",
    items: [
      { t: "Roller", d: "Admin ve kullanıcı ayrımı; modül ve veri erişimi role bağlı." },
      { t: "Model kilidi", d: "Bir modeli aynı anda tek kişi düzenler; diğerleri salt-okunur görür." },
      { t: "Denetim izi", d: "Her yazma işlemi kim · ne zaman · ne · neden bilgisiyle saklanır." },
      { t: "Versiyonlar", d: "Senaryolar ayrı versiyonda tutulur; karşılaştırma yan yana yapılır." },
    ],
  },
  pricing: {
    label: "Fiyatlandırma",
    h2: "Ücretsiz başlayın",
    p: "Ekip ve modül ihtiyacı büyüdükçe yükseltin.",
    plans: [
      { n: "Free", p: "₺0", s: "kalıcı", f: ["1 dönem · 1 branş", "Rezerv modülü", "AI Agent", "Excel çıktısı"], h: "/reserve", a: "Ücretsiz başlayın" },
      { n: "Pro", p: "₺100", s: "aylık", f: ["Sınırsız dönem ve branş", "Nakit akışı ve iskonto", "Senaryo versiyonları", "Tüm agent araçları"], h: "/onboarding/plan", a: "Pro'ya geçin", on: true },
      { n: "Enterprise", p: "Özel", s: "kuruma göre", f: ["Çoklu kullanıcı ve roller", "Oracle entegrasyonu", "Kurumsal audit akışı", "On-premise"], h: "#contact", a: "Görüşme planlayın" },
    ],
  },
  faq: {
    label: "Sık sorulan sorular",
    h2: "Merak edilenler",
    p: "Aradığınızı bulamazsanız aşağıdaki formdan yazın, aynı gün dönelim.",
    items: FAQ_TR,
  },
  contact: {
    label: "Kurumsal demo",
    h2: "Bir sonraki kapanışı birlikte yapalım.",
    p: "Ekibinizin süreci nasıl işliyor anlatın; kurumsal kurulum, entegrasyon ve fiyatlandırmayı birlikte konuşalım. Genelde aynı gün dönüş yapıyoruz.",
    name: "Ad soyad", email: "E-posta", company: "Şirket", optional: "(opsiyonel)",
    message: "Mesaj",
    placeholder: "Kaç branş, hangi dönem sıklığı, mevcut süreçte en çok ne zaman kaybediyorsunuz?",
    submit: "Mesaj gönderin", sending: "Gönderiliyor…", tryFree: "Önce ücretsiz deneyin",
    okTitle: "Mesajınız ulaştı.",
    okBody: "En kısa sürede {to} dönüş yapacağız.",
    okFallback: "belirttiğiniz adrese",
    again: "Yeni mesaj gönder",
    note: "Doğrudan yazmak isterseniz:",
    genericError: "Mesaj gönderilemedi.",
  },
  footer: { privacy: "Gizlilik", terms: "Şartlar", contact: "İletişim" },
};

export const EN: LandingContent = {
  locale: "en",
  path: "/en",
  nav: {
    modules: "Modules", agent: "Agent", close: "Close", modeling: "Modelling",
    governance: "Governance", faq: "FAQ", pricing: "Pricing",
    login: "Sign in", cta: "Start free", otherLang: "TR", otherLangPath: "/",
  },
  hero: {
    eyebrow: "End-to-end actuarial analysis platform",
    title1: "Every part of reserving,",
    title2: "on one platform.",
    lede:
      "Data management, reserve modelling, cash flow and IFRS 17 discounting in a single system. " +
      "An AI agent works across all of them — it closes the period, builds the model, produces the " +
      "report and records the reasoning behind every decision.",
    ctaPrimary: "Start free",
    ctaSecondary: "Book a demo",
    note: "No credit card required · Start with Excel, CSV or Oracle",
    agentStrip: "works across all",
  },
  modules: {
    label: "Modules",
    h2: "Four modules, one data layer",
    p: "They run on the same period, the same line of business and the same set of assumptions; a change in one is reflected in the others.",
    items: [
      { t: "Data", s: "Connected", d: "Claim, premium and large-loss data by valuation period. Straight from an Oracle table or via Excel/CSV.", shot: SHOTS.dataMap },
      { t: "Reserving", s: "Modelling", d: "Chain-Ladder and Bornhuetter–Ferguson; development factors, tail fitting, large-loss split, frequency-severity, scenario versions.", shot: SHOTS.ldf },
      { t: "Cash Flow", s: "Ready", d: "Quarterly and monthly cash flow projection from the payment pattern; stays consistent with the reserve.", shot: SHOTS.cashflow },
      { t: "Discounting", s: "Ready", d: "Liability discounting (LIC) with an IFRS 17 yield curve, illiquidity premium and risk adjustment.", shot: SHOTS.discount },
    ],
  },
  agent: {
    label: "AI Agent",
    h2: "An actuarial assistant that works across every module",
    p:
      "The agent does more than chat: it connects the data, builds the triangle, excludes outlying " +
      "link ratios, moves immature cohorts to BF, runs cash flow and discounting, and produces the " +
      "report. It respects roles and model locks; every step is reversible and written to the audit trail.",
    tools: [
      { m: "Reserving", n: 31, d: "Triangle, exclusions, tail, BF, scenarios, roll-forward" },
      { m: "Cash Flow", n: 10, d: "Pattern, LDF, exclusions, curve" },
      { m: "Discounting", n: 2, d: "State read and LIC calculation" },
      { m: "Data & Navigation", n: 2, d: "Period listing, moving between modules" },
    ],
  },
  close: {
    label: "Period close",
    h2: "The close takes five steps",
    p: "The agent can run these end to end; you approve and take over whenever you want.",
    steps: [
      { n: "01", t: "Load the data", d: "Claim, premium and large-loss sets for the new period are connected." },
      { n: "02", t: "Reconcile", d: "The new diagonal is compared with what was expected; deviating cohorts are flagged." },
      { n: "03", t: "Revise", d: "The model is updated: exclusions, basis choice, a priori loss ratio, correction factor." },
      { n: "04", t: "Project", d: "The cash flow pattern and IFRS 17 discounting are calculated." },
      { n: "05", t: "Report and lock", d: "Summary, segment breakdown and Excel output are produced; the model is locked." },
    ],
  },
  modeling: {
    label: "Modelling and reporting",
    h2: "A seven-step model flow",
    p: "The tabs in the reserving module follow the process one to one; each step feeds the next.",
    frame: "reserving / 2026Q2 / Fire & Home",
    prev: "Previous step", next: "Next step", tablist: "Modelling steps",
    steps: [
      { t: "Data", d: "Triangle preview", shot: SHOTS.dataTab, copy: "Paid and incurred triangles, cumulative or incremental; pulled from the data module or uploaded from Excel." },
      { t: "Claims", d: "Claim breakdown", shot: SHOTS.files, copy: "Which claim drives which cell? Distribution by claim file with median, coefficient of variation and concentration." },
      { t: "LDF", d: "Development factors", shot: SHOTS.ldf, copy: "Pick the averaging window, exclude an outlying cell; the selected LDF and the CDF chain update instantly." },
      { t: "Curve", d: "Tail fitting", shot: SHOTS.curve, copy: "Exponential, inverse power, power and Weibull; per-step selection and manual CDF entry." },
      { t: "ILR", d: "Loss ratio triangle", shot: SHOTS.ilr, copy: "Loss ratio development against earned premium — the a priori for BF is read here." },
      { t: "BF", d: "Bornhuetter–Ferguson", shot: SHOTS.bf, copy: "Exposure, annualisation factor and expected loss ratio; CL/BF basis chosen per cohort." },
      { t: "Ultimate / IBNR", d: "Reserve projection", shot: SHOTS.ultimate, copy: "Ultimate loss, IBNR and ULR by accident year — together with the selected basis." },
    ],
  },
  governance: {
    label: "Governance",
    h2: "Audit-ready by construction",
    p: "Who changed what, and why, is not reconstructed afterwards — it is recorded.",
    items: [
      { t: "Roles", d: "Admin and user separation; module and data access follow the role." },
      { t: "Model lock", d: "Only one person edits a model at a time; everyone else sees it read-only." },
      { t: "Audit trail", d: "Every write is stored with who · when · what · why." },
      { t: "Versions", d: "Scenarios are kept as separate versions and compared side by side." },
    ],
  },
  pricing: {
    label: "Pricing",
    h2: "Start free",
    p: "Upgrade as your team and module needs grow.",
    plans: [
      { n: "Free", p: "₺0", s: "forever", f: ["1 period · 1 line of business", "Reserving module", "AI Agent", "Excel export"], h: "/reserve", a: "Start free" },
      { n: "Pro", p: "₺100", s: "per month", f: ["Unlimited periods and lines", "Cash flow and discounting", "Scenario versions", "All agent tools"], h: "/onboarding/plan", a: "Go Pro", on: true },
      { n: "Enterprise", p: "Custom", s: "per organisation", f: ["Multiple users and roles", "Oracle integration", "Enterprise audit workflow", "On-premise"], h: "#contact", a: "Talk to us" },
    ],
  },
  faq: {
    label: "Frequently asked questions",
    h2: "Questions we get",
    p: "If you cannot find what you are looking for, write to us using the form below — we usually reply the same day.",
    items: FAQ_EN,
  },
  contact: {
    label: "Book a demo",
    h2: "Let us run your next close together.",
    p: "Tell us how your team works today; we will go through enterprise setup, integration and pricing with you. We usually reply the same business day.",
    name: "Full name", email: "Email", company: "Company", optional: "(optional)",
    message: "Message",
    placeholder: "How many lines of business, what valuation frequency, and where does your current process cost you the most time?",
    submit: "Send message", sending: "Sending…", tryFree: "Try it free first",
    okTitle: "Your message is in.",
    okBody: "We will get back to you at {to} shortly.",
    okFallback: "the address you gave",
    again: "Send another message",
    note: "Prefer to write directly:",
    genericError: "The message could not be sent.",
  },
  footer: { privacy: "Privacy", terms: "Terms", contact: "Contact" },
};
