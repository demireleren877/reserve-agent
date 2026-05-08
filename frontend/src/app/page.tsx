import Link from "next/link";

export default function Landing() {
  return (
    <div
      className="min-h-screen font-[family-name:var(--font-geist-sans)]"
      style={{ background: "#060b14", color: "#f1f5f9" }}
    >
      {/* Nav */}
      <nav
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 h-14"
        style={{ background: "rgba(6,11,20,0.85)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="h-6 w-6 rounded-md grid place-items-center text-white text-[11px] font-bold"
            style={{ background: "#2563eb" }}
          >
            A
          </div>
          <span className="text-[15px] font-semibold tracking-tight">Actuarial Workbench</span>
        </div>
        <Link
          href="/reserve"
          className="text-sm font-medium px-4 py-1.5 rounded-lg transition-all"
          style={{ background: "#2563eb", color: "#fff" }}
        >
          Uygulamaya Gir →
        </Link>
      </nav>

      {/* Hero */}
      <section className="relative pt-36 pb-24 px-8 text-center overflow-hidden">
        {/* Background glow */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(37,99,235,0.18) 0%, transparent 70%)",
          }}
        />
        {/* Grid overlay */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.03]"
          style={{
            backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        <div className="relative max-w-3xl mx-auto">
          <div
            className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1 rounded-full mb-8"
            style={{ background: "rgba(37,99,235,0.15)", border: "1px solid rgba(37,99,235,0.35)", color: "#93c5fd" }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full animate-pulse"
              style={{ background: "#3b82f6" }}
            />
            Aktüeryal hesaplama, AI destekli
          </div>

          <h1
            className="text-5xl sm:text-6xl font-bold leading-[1.1] tracking-tight mb-6"
            style={{ letterSpacing: "-0.03em" }}
          >
            Rezerv hesaplama,{" "}
            <span
              style={{
                background: "linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              aktüere özgü
            </span>
          </h1>

          <p
            className="text-lg leading-relaxed max-w-xl mx-auto mb-10"
            style={{ color: "#94a3b8" }}
          >
            Chain-Ladder, Bornhuetter–Ferguson ve yapay zeka destekli aktüer
            agent ile IBNR hesaplayın. Dönem ve branş hiyerarşisi, tail
            fitting, Excel export.
          </p>

          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Link
              href="/reserve"
              className="px-6 py-2.5 rounded-lg text-sm font-semibold transition-all hover:opacity-90"
              style={{ background: "#2563eb", color: "#fff", boxShadow: "0 0 24px rgba(37,99,235,0.35)" }}
            >
              Hemen Başla
            </Link>
            <a
              href="#features"
              className="px-6 py-2.5 rounded-lg text-sm font-semibold transition-all"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#cbd5e1" }}
            >
              Özellikler
            </a>
          </div>
        </div>

        {/* Hero visual — triangle mock */}
        <div
          className="relative mx-auto mt-16 rounded-xl overflow-hidden max-w-2xl"
          style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", boxShadow: "0 32px 64px rgba(0,0,0,0.5)" }}
        >
          <div
            className="px-4 py-2.5 flex items-center gap-2"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}
          >
            <div className="flex gap-1.5">
              {["#ef4444","#f59e0b","#22c55e"].map((c,i) => (
                <div key={i} className="h-2.5 w-2.5 rounded-full" style={{ background: c, opacity: 0.6 }} />
              ))}
            </div>
            <span className="text-[11px] ml-2" style={{ color: "#475569" }}>Rezerv — 2025 Q4 · Motor</span>
          </div>
          <div className="p-4 overflow-x-auto">
            <HeroTable />
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 px-8 max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold mb-3" style={{ letterSpacing: "-0.02em" }}>Aktüerin ihtiyacı olan her şey</h2>
          <p className="text-base" style={{ color: "#64748b" }}>Hesaplama motoru, veri görünümü ve AI agent tek platformda.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f) => (
            <FeatureCard key={f.title} {...f} />
          ))}
        </div>
      </section>

      {/* Agent section */}
      <section
        className="py-20 px-8"
        style={{ background: "rgba(255,255,255,0.015)", borderTop: "1px solid rgba(255,255,255,0.05)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}
      >
        <div className="max-w-4xl mx-auto flex flex-col lg:flex-row items-center gap-12">
          <div className="flex-1">
            <div
              className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1 rounded-full mb-6"
              style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)", color: "#c4b5fd" }}
            >
              AI Agent
            </div>
            <h2 className="text-3xl font-bold mb-4" style={{ letterSpacing: "-0.02em" }}>
              Aktüer agent ile doğal dilde çalış
            </h2>
            <p className="text-base mb-6" style={{ color: "#64748b", lineHeight: 1.7 }}>
              "2024 kaza yılı için BF kullansak IBNR kaç değişir?" gibi sorular
              sorun. Agent üçgeni anlasın, simülasyon çalıştırsın, LDF ve CDF
              ayarlarını sizin adınıza uygulasın.
            </p>
            <ul className="space-y-2.5">
              {AGENT_BULLETS.map((b) => (
                <li key={b} className="flex items-start gap-2.5 text-sm" style={{ color: "#94a3b8" }}>
                  <span className="mt-0.5 shrink-0" style={{ color: "#a78bfa" }}>✦</span>
                  {b}
                </li>
              ))}
            </ul>
          </div>
          <div
            className="flex-1 w-full rounded-xl overflow-hidden text-left"
            style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)", maxWidth: 420 }}
          >
            <div
              className="px-4 py-2.5 text-xs font-medium flex items-center gap-2"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", color: "#64748b" }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#a78bfa" }} />
              Aktüer Agent
            </div>
            {CHAT_DEMO.map((msg, i) => (
              <div
                key={i}
                className="px-4 py-3 text-[13px] leading-relaxed"
                style={{
                  borderBottom: i < CHAT_DEMO.length - 1 ? "1px solid rgba(255,255,255,0.04)" : undefined,
                  color: msg.role === "user" ? "#cbd5e1" : "#94a3b8",
                }}
              >
                <span
                  className="text-[10px] font-semibold uppercase tracking-wider mr-2"
                  style={{ color: msg.role === "user" ? "#60a5fa" : "#a78bfa" }}
                >
                  {msg.role === "user" ? "Siz" : "Agent"}
                </span>
                {msg.text}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Methods */}
      <section className="py-20 px-8 max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold mb-3" style={{ letterSpacing: "-0.02em" }}>Aktüeryal metodoloji</h2>
          <p className="text-base" style={{ color: "#64748b" }}>Sektörde kabul görmüş metodlar, tam şeffaflıkla uygulanır.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {METHODS.map((m) => (
            <div
              key={m.name}
              className="rounded-xl p-6"
              style={{ border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)" }}
            >
              <div
                className="text-xs font-bold uppercase tracking-widest mb-3"
                style={{ color: m.color }}
              >
                {m.name}
              </div>
              <p className="text-sm leading-relaxed" style={{ color: "#64748b" }}>{m.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-8 text-center">
        <div
          className="max-w-xl mx-auto rounded-2xl p-10"
          style={{
            background: "radial-gradient(ellipse at top, rgba(37,99,235,0.12) 0%, rgba(255,255,255,0.02) 70%)",
            border: "1px solid rgba(37,99,235,0.2)",
          }}
        >
          <h2 className="text-3xl font-bold mb-4" style={{ letterSpacing: "-0.02em" }}>Hemen deneyin</h2>
          <p className="text-base mb-8" style={{ color: "#64748b" }}>
            Kurulum yok, hesap gerekmez. Excel dosyanızı yükleyin, dakikalar içinde IBNR hesabınız hazır.
          </p>
          <Link
            href="/reserve"
            className="inline-flex items-center gap-2 px-7 py-3 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
            style={{ background: "#2563eb", color: "#fff", boxShadow: "0 0 32px rgba(37,99,235,0.4)" }}
          >
            Uygulamayı Aç
            <span>→</span>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer
        className="py-6 px-8 text-center text-xs"
        style={{ borderTop: "1px solid rgba(255,255,255,0.05)", color: "#334155" }}
      >
        Actuarial Workbench · Aktüeryal hesaplama platformu
      </footer>
    </div>
  );
}

// ─── Hero Table ────────────────────────────────────────────────────────────────

function HeroTable() {
  const rows = [
    { origin: "2020", cdf: "1.0312", pct: "96.97%", cl: "48.240", bf: "48.180", ibnr: "1.481", basis: "CL" },
    { origin: "2021", cdf: "1.0890", pct: "91.83%", cl: "53.110", bf: "52.940", ibnr: "4.330", basis: "BF" },
    { origin: "2022", cdf: "1.2140", pct: "82.37%", cl: "61.820", bf: "60.550", ibnr: "11.270", basis: "BF" },
    { origin: "2023", cdf: "1.5880", pct: "62.97%", cl: "74.300", bf: "71.200", ibnr: "27.840", basis: "BF" },
    { origin: "2024", cdf: "3.1200", pct: "32.05%", cl: "88.640", bf: "82.100", ibnr: "62.180", basis: "BF" },
  ];
  const cols = ["Kaza Yılı", "CDF", "% Gel.", "CL Ult.", "BF Ult.", "IBNR", "Baz"];
  return (
    <table className="w-full text-[11px]" style={{ fontFamily: "var(--font-geist-mono)", color: "#94a3b8" }}>
      <thead>
        <tr style={{ color: "#475569" }}>
          {cols.map(c => <th key={c} className="text-right first:text-left px-2 py-1 font-semibold uppercase tracking-wide text-[9px]">{c}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.origin} style={{ borderTop: "1px solid rgba(255,255,255,0.04)", background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)" }}>
            <td className="px-2 py-1.5 font-semibold" style={{ color: "#cbd5e1" }}>{r.origin}</td>
            <td className="text-right px-2 py-1.5">{r.cdf}</td>
            <td className="text-right px-2 py-1.5">{r.pct}</td>
            <td className="text-right px-2 py-1.5">{r.cl}</td>
            <td className="text-right px-2 py-1.5">{r.bf}</td>
            <td className="text-right px-2 py-1.5 font-semibold" style={{ color: "#60a5fa" }}>{r.ibnr}</td>
            <td className="text-right px-2 py-1.5">
              <span
                className="px-1.5 py-0.5 rounded text-[9px] font-bold"
                style={r.basis === "BF"
                  ? { background: "rgba(139,92,246,0.2)", color: "#c4b5fd" }
                  : { background: "rgba(37,99,235,0.2)", color: "#93c5fd" }}
              >
                {r.basis}
              </span>
            </td>
          </tr>
        ))}
        <tr style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }}>
          <td className="px-2 py-1.5 font-bold text-[10px] uppercase tracking-wide" style={{ color: "#475569" }}>Toplam</td>
          <td /><td /><td /><td />
          <td className="text-right px-2 py-1.5 font-bold" style={{ color: "#60a5fa" }}>107.101</td>
          <td />
        </tr>
      </tbody>
    </table>
  );
}

// ─── Feature Card ──────────────────────────────────────────────────────────────

function FeatureCard({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div
      className="rounded-xl p-5 flex flex-col gap-3 transition-all hover:border-opacity-30"
      style={{ border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)" }}
    >
      <span className="text-2xl">{icon}</span>
      <div>
        <div className="text-sm font-semibold mb-1" style={{ color: "#e2e8f0" }}>{title}</div>
        <div className="text-[13px] leading-relaxed" style={{ color: "#475569" }}>{desc}</div>
      </div>
    </div>
  );
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: "△",
    title: "Gelişim Üçgeni",
    desc: "Kümülatif, artımsal, muallak ve gerçekleşen üçgenlerini tek yerden görün. Excel long-format import.",
  },
  {
    icon: "∿",
    title: "LDF & Tail Fitting",
    desc: "Volume-weighted ve simple average LDF. Inverse Power, Exponential ve Weibull tail fit ile CDF uzatma.",
  },
  {
    icon: "◈",
    title: "Curve & CDF",
    desc: "Hücre eleme, window seçimi. CDF cascade mantığıyla period bazlı manuel override.",
  },
  {
    icon: "⊞",
    title: "BF & Loss Ratio",
    desc: "Kaza yılı bazlı prim, düzeltme katsayısı ve formül tabanlı LR (vw, avg, aritmetik).",
  },
  {
    icon: "⬡",
    title: "ILR Üçgeni",
    desc: "Prim-düzeltmeli incurred loss ratio matrisi. BF a priori LR kalibrasyonu için referans.",
  },
  {
    icon: "↓",
    title: "Excel Export",
    desc: "Özet, LDF-CDF, Curve, ILR, BF Girdileri ve tüm üçgenler tek dosyada dokuz sekme.",
  },
];

const AGENT_BULLETS = [
  "Soru-cevap: IBNR, ultimate, loss ratio analizleri",
  "Simülasyon: LR veya CDF değişince etkiyi hesapla",
  "Müdahale: LDF window, CDF override, BF basis değiştir",
  "Karşılaştırma: branş ve dönemler arası analiz",
];

const CHAT_DEMO = [
  { role: "user", text: "2024 ve 2025 için BF kullansak toplam IBNR kaç değişir?" },
  { role: "agent", text: "2024 ve 2025'i BF'e çekince IBNR 107.1M'den 94.3M'ye düşüyor. Fark: −12.8M (%12). Bu iki yılın BF LR'si şu an vw(2021:2023) = %68.4." },
  { role: "user", text: "Uygula" },
  { role: "agent", text: "2024 ve 2025 basis'i BF olarak güncellendi. Selected IBNR: 94.3M." },
];

const METHODS = [
  {
    name: "Chain-Ladder",
    color: "#60a5fa",
    desc: "Tarihsel gelişim örüntüsünden LDF hesaplar. Volume-weighted veya simple average, hücre eleme desteğiyle.",
  },
  {
    name: "Bornhuetter–Ferguson",
    color: "#a78bfa",
    desc: "A priori loss ratio ile CL beklentisini harmanlayan Bayesci yaklaşım. Origin bazlı LR formülleri.",
  },
  {
    name: "Seçilen Ultimate",
    color: "#34d399",
    desc: "Her kaza yılı için CL veya BF arasında seçim yapın. Toplam IBNR tek ekranda konsolide edilir.",
  },
];
