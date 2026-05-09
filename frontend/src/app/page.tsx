"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

// ─── Color palette ────────────────────────────────────────────────────────────
// bg: #faf9f6  bg-alt: #f3f1ec  card: #fff  border: #e8e5dd
// text: #0a0a14  text-2: #45445a  text-3: #8a8898
// blue: #2553e4  blue-soft: #ebf0ff  purple: #6d28d9  purple-soft: #f3edff

const ANIMATIONS = `
@keyframes fadeInUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
@keyframes pulse-dot { 0%, 100% { box-shadow: 0 0 0 0 rgba(37,83,228,0.4); } 50% { box-shadow: 0 0 0 6px rgba(37,83,228,0); } }
@keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
@keyframes orbDrift { 0%, 100% { transform: translate(0,0) scale(1); } 33% { transform: translate(40px,-30px) scale(1.05); } 66% { transform: translate(-30px,40px) scale(0.95); } }
@keyframes typing { from { width: 0; } to { width: 100%; } }
@keyframes blink { 50% { opacity: 0; } }
@keyframes scrollHint { 0% { transform: translateY(0); opacity: 0.4; } 50% { transform: translateY(6px); opacity: 1; } 100% { transform: translateY(0); opacity: 0.4; } }
@keyframes glow { 0%, 100% { box-shadow: 0 0 24px rgba(37,83,228,0.18); } 50% { box-shadow: 0 0 36px rgba(37,83,228,0.32); } }

.fade-in-up { animation: fadeInUp 0.8s cubic-bezier(0.22, 1, 0.36, 1) backwards; }
.float-slow { animation: float 6s ease-in-out infinite; }
.pulse-dot { animation: pulse-dot 2s ease-in-out infinite; }
.glow-on { animation: glow 3s ease-in-out infinite; }
.orb { animation: orbDrift 20s ease-in-out infinite; }

.hover-lift { transition: transform 0.4s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.4s; }
.hover-lift:hover { transform: translateY(-4px); box-shadow: 0 12px 40px rgba(10, 10, 20, 0.08); }

.shimmer-bg {
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent);
  background-size: 200% 100%;
  animation: shimmer 3s ease-in-out infinite;
}

.grid-bg {
  background-image:
    linear-gradient(to right, rgba(10,10,20,0.04) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(10,10,20,0.04) 1px, transparent 1px);
  background-size: 48px 48px;
  mask-image: radial-gradient(ellipse 80% 60% at 50% 30%, black 30%, transparent 100%);
}

.text-gradient {
  background: linear-gradient(135deg, #0a0a14 0%, #2553e4 50%, #6d28d9 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.cta-blue {
  background: linear-gradient(180deg, #2563eb, #1e40af);
  color: white;
  box-shadow: 0 1px 0 rgba(255,255,255,0.2) inset, 0 4px 12px rgba(37,83,228,0.25);
  transition: all 0.2s;
}
.cta-blue:hover { transform: translateY(-1px); box-shadow: 0 1px 0 rgba(255,255,255,0.2) inset, 0 6px 20px rgba(37,83,228,0.4); }

.glass-nav {
  background: rgba(250, 249, 246, 0.72);
  backdrop-filter: saturate(180%) blur(14px);
  -webkit-backdrop-filter: saturate(180%) blur(14px);
}
`;

export default function Landing() {
  return (
    <div className="min-h-screen relative overflow-x-hidden" style={{ background: "#faf9f6", color: "#0a0a14" }}>
      <style>{ANIMATIONS}</style>
      <BackgroundOrbs />
      <Nav />
      <Hero />
      <FeatureBento />
      <LiveDemo />
      <AgentSection />
      <Pricing />
      <FAQ />
      <Footer />
    </div>
  );
}

// ─── Decorative background ───────────────────────────────────────────────────

function BackgroundOrbs() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
      <div className="absolute top-[-200px] right-[-200px] w-[600px] h-[600px] rounded-full orb"
        style={{ background: "radial-gradient(circle, rgba(37,83,228,0.13) 0%, transparent 70%)" }} />
      <div className="absolute top-[40%] left-[-300px] w-[700px] h-[700px] rounded-full orb"
        style={{ background: "radial-gradient(circle, rgba(109,40,217,0.08) 0%, transparent 70%)", animationDelay: "-7s" }} />
      <div className="absolute bottom-[10%] right-[-100px] w-[500px] h-[500px] rounded-full orb"
        style={{ background: "radial-gradient(circle, rgba(37,83,228,0.07) 0%, transparent 70%)", animationDelay: "-14s" }} />
    </div>
  );
}

// ─── Nav ──────────────────────────────────────────────────────────────────────

function Nav() {
  return (
    <nav className="sticky top-0 z-50 glass-nav" style={{ borderBottom: "1px solid #e8e5dd" }}>
      <div className="max-w-6xl mx-auto px-6 md:px-8 h-15 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo />
          <span className="text-[14.5px] font-semibold tracking-tight">Reserve Agent</span>
        </Link>
        <div className="flex items-center gap-1">
          <a href="#features" className="text-[13px] font-medium px-3 py-1.5 rounded-md hidden sm:block transition" style={{ color: "#45445a" }}>Özellikler</a>
          <a href="#pricing" className="text-[13px] font-medium px-3 py-1.5 rounded-md hidden sm:block transition" style={{ color: "#45445a" }}>Fiyatlandırma</a>
          <a href="#faq" className="text-[13px] font-medium px-3 py-1.5 rounded-md hidden md:block transition" style={{ color: "#45445a" }}>SSS</a>
          <Link href="/reserve" className="ml-2 cta-blue text-[13px] font-semibold px-4 py-1.5 rounded-lg">
            Uygulamaya Gir
          </Link>
        </div>
      </div>
    </nav>
  );
}

function Logo() {
  return (
    <div className="h-7 w-7 rounded-lg flex items-center justify-center text-white text-[12px] font-bold relative overflow-hidden"
      style={{ background: "linear-gradient(135deg, #2563eb, #6d28d9)" }}>
      <span className="relative z-10">R</span>
      <div className="absolute inset-0 shimmer-bg opacity-50" />
    </div>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="relative px-6 md:px-8 pt-20 pb-16 md:pt-28 md:pb-24">
      <div className="absolute inset-0 grid-bg pointer-events-none" />
      <div className="max-w-6xl mx-auto relative">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="fade-in-up inline-flex items-center gap-2 text-[11.5px] font-semibold px-3 py-1.5 rounded-full mb-7 tracking-wide"
            style={{ background: "#fff", border: "1px solid #e8e5dd", color: "#45445a", boxShadow: "0 1px 2px rgba(10,10,20,0.04)" }}>
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full pulse-dot" style={{ background: "#2553e4" }} />
              <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: "#2553e4" }} />
            </span>
            Aktüeryal Rezerv Analizi · 2026
          </div>

          <h1 className="fade-in-up text-[44px] sm:text-[58px] md:text-[68px] font-bold leading-[1.02] mb-7"
            style={{ letterSpacing: "-0.04em", animationDelay: "0.1s" }}>
            <span className="block text-gradient">IBNR hesabı</span>
            <span className="block" style={{ color: "#0a0a14" }}>artık dakikalar içinde.</span>
          </h1>

          <p className="fade-in-up text-[17px] md:text-[19px] leading-[1.6] mx-auto mb-9 max-w-2xl"
            style={{ color: "#45445a", animationDelay: "0.2s" }}>
            Gelişim üçgeninizi yükleyin · Chain-Ladder, BF ve parametrik tail fitting'i tek
            tıkla çalıştırın · AI Aktüer Agent ile senaryoları konuşarak yönetin.
          </p>

          <div className="fade-in-up flex flex-wrap items-center justify-center gap-3 mb-10" style={{ animationDelay: "0.3s" }}>
            <Link href="/reserve" className="cta-blue px-6 py-3 rounded-lg text-[14px] font-semibold inline-flex items-center gap-2">
              Ücretsiz Başla
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </Link>
            <a href="#live-demo" className="px-6 py-3 rounded-lg text-[14px] font-semibold transition hover:bg-white"
              style={{ background: "transparent", border: "1px solid #d8d5cd", color: "#0a0a14" }}>
              Canlı demo
            </a>
          </div>

          <div className="fade-in-up flex items-center justify-center gap-1.5 text-[12px]" style={{ color: "#8a8898", animationDelay: "0.4s" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 2 4 6v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V6l-8-4Z" stroke="currentColor" strokeWidth="1.5"/><path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Veri tarayıcıda kalır · Hesap gerekmez · Ücretsiz başla
          </div>
        </div>

        {/* Hero visual — animated triangle preview */}
        <div className="fade-in-up max-w-5xl mx-auto" style={{ animationDelay: "0.55s" }}>
          <HeroPreview />
        </div>
      </div>
    </section>
  );
}

function HeroPreview() {
  return (
    <div className="relative">
      <div className="absolute -inset-4 rounded-3xl opacity-50 blur-2xl"
        style={{ background: "linear-gradient(135deg, rgba(37,83,228,0.18), rgba(109,40,217,0.12))" }} />
      <div className="relative rounded-2xl overflow-hidden glow-on"
        style={{ background: "#fff", border: "1px solid #e8e5dd" }}>
        {/* Browser chrome */}
        <div className="px-4 py-3 flex items-center gap-3" style={{ background: "#f5f3ee", borderBottom: "1px solid #e8e5dd" }}>
          <div className="flex gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: "#fca5a5" }} />
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: "#fcd34d" }} />
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: "#86efac" }} />
          </div>
          <div className="flex-1 max-w-md mx-auto px-3 py-1 rounded-md text-[11px] font-medium text-center"
            style={{ background: "#fff", border: "1px solid #e8e5dd", color: "#8a8898" }}>
            reserveagent.io / motor-tpl / 2025-q4
          </div>
          <div className="flex items-center gap-2 text-[10.5px]" style={{ color: "#8a8898" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 pulse-dot" />
            Live
          </div>
        </div>
        {/* Content */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px]">
          <div className="p-5 lg:p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-[12px] font-semibold" style={{ color: "#45445a" }}>Motor TPL · Ödeme · 2025 Q4</div>
                <div className="text-[10.5px]" style={{ color: "#8a8898" }}>Volume Weighted · Tail: Inverse Power</div>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded"
                style={{ background: "#ebf0ff", color: "#2553e4" }}>Chain-Ladder + BF</span>
            </div>
            <PreviewTriangle />
          </div>
          <div className="p-5 lg:p-6 lg:border-l" style={{ borderColor: "#e8e5dd", background: "#fafaf7" }}>
            <PreviewStats />
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewTriangle() {
  const rows = [
    { y: "2020", v: ["1,412", "1,083", "1,031", "1,012", "1,004"], cdf: "1,031", ibnr: "1.448" },
    { y: "2021", v: ["1,638", "1,091", "1,041", "1,018", "—"],     cdf: "1,089", ibnr: "4.330" },
    { y: "2022", v: ["1,721", "1,102", "1,049", "—",    "—"],     cdf: "1,214", ibnr: "11.270" },
    { y: "2023", v: ["1,684", "1,118", "—",    "—",    "—"],     cdf: "1,588", ibnr: "27.840" },
    { y: "2024", v: ["1,702", "—",    "—",    "—",    "—"],     cdf: "3,120", ibnr: "62.180" },
  ];
  return (
    <table className="w-full text-[11.5px]" style={{ fontFamily: "var(--font-geist-mono, ui-monospace, monospace)" }}>
      <thead>
        <tr style={{ color: "#8a8898" }}>
          <th className="text-left py-1.5 pr-2 text-[10px] font-semibold uppercase tracking-wider">Yıl</th>
          {["12", "24", "36", "48", "60"].map(m => (
            <th key={m} className="text-right px-1.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider">{m}m</th>
          ))}
          <th className="text-right px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#2553e4" }}>CDF</th>
          <th className="text-right pl-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#0a0a14" }}>IBNR</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.y} className="fade-in-up" style={{
            borderTop: "1px solid #f0ede4",
            animationDelay: `${0.6 + i * 0.08}s`,
          }}>
            <td className="py-2 pr-2 font-semibold" style={{ color: "#45445a" }}>{r.y}</td>
            {r.v.map((c, j) => (
              <td key={j} className="text-right px-1.5 py-2 tabular-nums" style={{ color: c === "—" ? "#d6d3cb" : "#45445a" }}>{c}</td>
            ))}
            <td className="text-right px-2 py-2 tabular-nums font-semibold" style={{ color: "#2553e4" }}>{r.cdf}</td>
            <td className="text-right pl-2 py-2 tabular-nums font-semibold" style={{ color: "#0a0a14" }}>{r.ibnr}</td>
          </tr>
        ))}
        <tr style={{ borderTop: "2px solid #e8e5dd" }}>
          <td colSpan={6} />
          <td className="text-right px-2 py-2.5 text-[10px] uppercase tracking-wider" style={{ color: "#8a8898" }}>Toplam</td>
          <td className="text-right pl-2 py-2.5 text-[13px] font-bold tabular-nums" style={{ color: "#0a0a14" }}>
            <CountUp to={107068} format />
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function PreviewStats() {
  return (
    <div className="space-y-5">
      <div>
        <div className="text-[10px] uppercase tracking-widest font-semibold mb-2" style={{ color: "#8a8898" }}>Toplam IBNR</div>
        <div className="text-[28px] font-bold leading-none" style={{ color: "#0a0a14", letterSpacing: "-0.03em" }}>
          <CountUp to={107068} format />
          <span className="text-[14px] font-medium ml-1.5" style={{ color: "#8a8898" }}>₺K</span>
        </div>
        <div className="text-[11px] mt-1.5 inline-flex items-center gap-1" style={{ color: "#16a34a" }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M7 14l5-5 5 5z"/></svg>
          %4,2 / önceki dönem
        </div>
      </div>
      <div className="h-px" style={{ background: "#e8e5dd" }} />
      <div className="space-y-2.5">
        {[
          { l: "Selected ULR", v: "%72,4", c: "#0a0a14" },
          { l: "5 yıllık LDF window", v: "Aktif", c: "#2553e4" },
          { l: "Tail R²", v: "0,9942", c: "#16a34a" },
          { l: "Eleme", v: "2 hücre", c: "#45445a" },
        ].map(s => (
          <div key={s.l} className="flex items-center justify-between text-[11.5px]">
            <span style={{ color: "#8a8898" }}>{s.l}</span>
            <span className="font-semibold tabular-nums" style={{ color: s.c }}>{s.v}</span>
          </div>
        ))}
      </div>
      <div className="h-px" style={{ background: "#e8e5dd" }} />
      <button className="w-full text-[11px] font-semibold py-2 rounded-lg flex items-center justify-center gap-1.5 transition hover:bg-white"
        style={{ border: "1px solid #e8e5dd", color: "#45445a" }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 4v12m0 0 4-4m-4 4-4-4M4 20h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        Excel raporunu indir
      </button>
    </div>
  );
}

function CountUp({ to, format }: { to: number; format?: boolean }) {
  const [v, setV] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let start: number | null = null;
    const dur = 1600;
    let raf: number;
    const tick = (t: number) => {
      if (start == null) start = t;
      const p = Math.min((t - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(Math.floor(eased * to));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    const obs = new IntersectionObserver(es => {
      if (es[0].isIntersecting) raf = requestAnimationFrame(tick);
    }, { threshold: 0.1 });
    if (ref.current) obs.observe(ref.current);
    return () => { cancelAnimationFrame(raf); obs.disconnect(); };
  }, [to]);
  return <span ref={ref} className="tabular-nums">{format ? v.toLocaleString("tr-TR") : v}</span>;
}

// ─── Feature bento ────────────────────────────────────────────────────────────

function FeatureBento() {
  return (
    <section id="features" className="px-6 md:px-8 py-24">
      <div className="max-w-6xl mx-auto">
        <SectionHead
          tag="Özellikler"
          title="Aktüeryal iş akışının her adımı"
          desc="Veri girişinden Excel raporuna kadar — tüm rezerv hesabı tek bir akıcı arayüzde."
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-12">
          {/* Big card — Incurred Loss Ratio triangle */}
          <FeatureCard className="md:col-span-2 md:row-span-2" tag="ILR" title="Incurred Loss Ratio üçgeni">
            <p className="text-[13px] leading-relaxed mb-4" style={{ color: "#5a5a6a" }}>
              Hasar/Prim oranını her kaza yılı × gelişim ayında izleyin. Anormal
              gelişim örüntülerini renkli ısı haritasıyla anında tespit edin.
            </p>
            <ILRIllustration />
          </FeatureCard>

          <FeatureCard tag="Veri" title="Excel & CSV import">
            <p className="text-[13px] leading-relaxed" style={{ color: "#5a5a6a" }}>
              Kümülatif / artımsal, ödeme / gerçekleşen — format otomatik tanınır.
            </p>
            <ImportIllustration />
          </FeatureCard>

          <FeatureCard tag="LDF" title="Volume-weighted & override">
            <p className="text-[13px] leading-relaxed" style={{ color: "#5a5a6a" }}>
              Window seçimi, hücre eleme, manuel LDF override, gerçek zamanlı IBNR etkisi.
            </p>
            <LDFIllustration />
          </FeatureCard>

          <FeatureCard tag="BF" title="Bornhuetter–Ferguson">
            <p className="text-[13px] leading-relaxed" style={{ color: "#5a5a6a" }}>
              Formül destekli a priori LR — vw(), avg(), aritmetik. Origin bazlı CL/BF seçimi.
            </p>
          </FeatureCard>

          <FeatureCard tag="CDF" title="Cascade & override">
            <p className="text-[13px] leading-relaxed" style={{ color: "#5a5a6a" }}>
              Dönem bazlı 6 model seçimi. Sürükle-seç, kümülatif ve artımsal % gelişim.
            </p>
          </FeatureCard>

          <FeatureCard tag="Çıktı" title="Çok sayfalı Excel raporu">
            <p className="text-[13px] leading-relaxed" style={{ color: "#5a5a6a" }}>
              LDF-CDF, Curve, ILR, BF girdileri, özet ve üçgen tabloları — tek tıkla.
            </p>
          </FeatureCard>
        </div>
      </div>
    </section>
  );
}

function FeatureCard({ tag, title, children, className = "" }: { tag: string; title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={"rounded-2xl p-6 hover-lift relative overflow-hidden " + className}
      style={{ background: "#fff", border: "1px solid #e8e5dd" }}>
      <div className="text-[10px] font-bold uppercase tracking-widest mb-3 inline-block px-2 py-0.5 rounded"
        style={{ background: "#ebf0ff", color: "#2553e4" }}>{tag}</div>
      <h3 className="text-[16px] font-bold mb-2" style={{ color: "#0a0a14", letterSpacing: "-0.015em" }}>{title}</h3>
      {children}
    </div>
  );
}

function ILRIllustration() {
  type Row = { y: string; vals: (number | null)[] };
  const rows: Row[] = [
    { y: "2018",  vals: [4.1,  6.9, 14.2, 13.3, 10.5, 10.7, 11.6, 17.5, 17.2, 15.0, 11.5] },
    { y: "2019",  vals: [10.4, 8.4, 48.0, 158.1, 161.6, 131.6, 167.8, 170.8, 175.3, 221.5, null] },
    { y: "2020",  vals: [1.4,  3.2,  9.4, 11.3, 12.8, 12.6, 10.3,  9.7, 11.6, null, null] },
    { y: "2021",  vals: [28.3, 7.1, 14.4, 32.5, 27.6, 23.5, 29.4, 19.7, null, null, null] },
    { y: "2022",  vals: [3.5,  3.0, 17.6, 14.6, 14.5, 14.3, 18.7, null, null, null, null] },
    { y: "2023",  vals: [12.6, 15.2, 26.9, 23.1, 30.8, 30.6, null, null, null, null, null] },
    { y: "2024",  vals: [4.4, 16.3, 18.3, 22.8, 31.5, null, null, null, null, null, null] },
    { y: "2025",  vals: [8.3, 34.9, 42.0, 60.3, 86.8, null, null, null, null, null, null] },
    { y: "2026",  vals: [5.5, 20.4, 33.1, null, null, null, null, null, null, null, null] },
  ];

  const cellStyle = (v: number) => {
    if (v >= 100) return { color: "#dc2626", weight: 700 };       // bright red, bold
    if (v >= 70)  return { color: "#ea580c", weight: 600 };       // orange
    if (v >= 35)  return { color: "#1f2937", weight: 500 };       // dark gray
    if (v >= 15)  return { color: "#4b5563", weight: 400 };       // mid gray
    return            { color: "#9ca3af", weight: 400 };          // light gray
  };

  return (
    <div className="mt-6 rounded-xl relative overflow-hidden" style={{ background: "#fff", border: "1px solid #e8e5dd" }}>
      <div className="px-4 py-3 flex items-center justify-between" style={{ background: "#fafaf7", borderBottom: "1px solid #e8e5dd" }}>
        <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#6b7280" }}>
          Hasar / (Prim × Düz.)
        </div>
        <div className="flex items-center gap-3 text-[9.5px]" style={{ color: "#6b7280" }}>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#9ca3af" }} />
            Normal
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#ea580c" }} />
            Yüksek
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#dc2626" }} />
            Anomali
          </span>
        </div>
      </div>

      <div className="p-4">
        <table className="w-full text-[10.5px] tabular-nums" style={{ fontFamily: "var(--font-geist-mono, ui-monospace, monospace)" }}>
          <thead>
            <tr style={{ color: "#9ca3af" }}>
              <th className="text-left px-1 py-1 text-[9px] font-semibold uppercase tracking-wider">Yıl</th>
              {Array.from({ length: 11 }).map((_, i) => (
                <th key={i} className="text-right px-1 py-1 text-[9px] font-semibold">{i + 1}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={r.y} className="fade-in-up" style={{
                borderTop: "1px solid #f3f1ec",
                animationDelay: `${0.05 + ri * 0.04}s`,
              }}>
                <td className="px-1 py-[5px] font-semibold" style={{ color: "#374151" }}>{r.y}</td>
                {r.vals.map((v, j) => {
                  if (v == null) {
                    return <td key={j} className="text-right px-1 py-[5px]" style={{ color: "#e5e7eb" }}>·</td>;
                  }
                  const { color, weight } = cellStyle(v);
                  return (
                    <td key={j} className="text-right px-1 py-[5px]" style={{ color, fontWeight: weight }}>
                      {v.toFixed(1)}%
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-3 flex items-center justify-between" style={{ background: "#fafaf7", borderTop: "1px solid #e8e5dd" }}>
        <span className="text-[10px]" style={{ color: "#9ca3af" }}>
          27 origin × 105 gelişim ayı
        </span>
        <span className="text-[10.5px] font-semibold inline-flex items-center gap-1.5" style={{ color: "#dc2626" }}>
          <span className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: "#dc2626" }} />
          2 anomali tespit edildi
        </span>
      </div>
    </div>
  );
}

function ImportIllustration() {
  return (
    <div className="mt-5 rounded-xl p-4 relative overflow-hidden" style={{ background: "#f5f3ee", border: "1px dashed #c4c0b6" }}>
      <div className="flex items-center gap-3">
        <div className="w-10 h-12 rounded shrink-0 flex items-center justify-center text-[10px] font-bold text-white"
          style={{ background: "#16a34a" }}>xlsx</div>
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-semibold truncate" style={{ color: "#0a0a14" }}>uçgen-2025-Q4.xlsx</div>
          <div className="h-1.5 rounded-full mt-1.5 relative overflow-hidden" style={{ background: "#e0ddd2" }}>
            <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: "78%", background: "linear-gradient(90deg, #2563eb, #6d28d9)" }} />
          </div>
          <div className="text-[10px] mt-1" style={{ color: "#8a8898" }}>5 origin × 5 dönem · Kümülatif</div>
        </div>
      </div>
    </div>
  );
}

function LDFIllustration() {
  const v = ["1,412", "1,083", "1,031", "1,012", "1,004"];
  return (
    <div className="mt-5 rounded-xl p-4" style={{ background: "#f5f3ee", border: "1px solid #e8e5dd" }}>
      <div className="text-[9.5px] font-semibold uppercase tracking-widest mb-2" style={{ color: "#8a8898" }}>Selected LDF</div>
      <div className="flex items-center gap-1.5">
        {v.map((x, i) => (
          <div key={i} className="flex-1 text-center px-1.5 py-1.5 rounded text-[10.5px] font-semibold tabular-nums"
            style={{
              background: i === 0 ? "#ebf0ff" : "#fff",
              border: "1px solid " + (i === 0 ? "#bfd3ff" : "#e8e5dd"),
              color: i === 0 ? "#2553e4" : "#45445a",
            }}>
            {x}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Live demo / How it works ─────────────────────────────────────────────────

function LiveDemo() {
  return (
    <section id="live-demo" className="px-6 md:px-8 py-24" style={{ background: "#f3f1ec", borderTop: "1px solid #e8e5dd", borderBottom: "1px solid #e8e5dd" }}>
      <div className="max-w-6xl mx-auto">
        <SectionHead
          tag="Akış"
          title="Üç adımda IBNR raporu"
          desc="Kurulum yok. Hesap gerekmez. Excel dosyanızı yükleyin, analiz başlasın."
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-12">
          {[
            { n: "01", title: "Üçgeni yükle", desc: "Excel veya CSV. Sürükle-bırak ya da yapıştır. Otomatik format tespiti.", color: "#2563eb" },
            { n: "02", title: "LDF & tail", desc: "Volume-weighted ortalamayı incele, outlier'ları ele, parametrik tail seç.", color: "#6d28d9" },
            { n: "03", title: "BF & rapor", desc: "Origin bazlı CL/BF seç. Agent ile senaryolar konuş. Excel'e indir.", color: "#0d9488" },
          ].map((s, i) => (
            <div key={s.n} className="hover-lift rounded-2xl p-6 relative" style={{ background: "#fff", border: "1px solid #e8e5dd" }}>
              <div className="flex items-center justify-between mb-5">
                <div className="text-[26px] font-bold tabular-nums" style={{ color: s.color, letterSpacing: "-0.04em" }}>{s.n}</div>
                <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ background: s.color + "1a" }}>
                  <span className="text-[10px] font-bold" style={{ color: s.color }}>{i + 1}</span>
                </div>
              </div>
              <h3 className="text-[17px] font-bold mb-2" style={{ color: "#0a0a14", letterSpacing: "-0.02em" }}>{s.title}</h3>
              <p className="text-[13.5px] leading-relaxed" style={{ color: "#5a5a6a" }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Agent section ────────────────────────────────────────────────────────────

function AgentSection() {
  return (
    <section className="px-6 md:px-8 py-24">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] font-bold px-3 py-1.5 rounded-full mb-6"
            style={{ background: "#f3edff", border: "1px solid #d8c9ff", color: "#6d28d9" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a4 4 0 0 1 4 4 4 4 0 0 1-4 4 4 4 0 0 1-4-4 4 4 0 0 1 4-4Zm0 11c4.4 0 8 1.8 8 4v3H4v-3c0-2.2 3.6-4 8-4Z"/></svg>
            Aktüer Agent
          </div>
          <h2 className="text-[36px] md:text-[42px] font-bold mb-5 leading-[1.05]" style={{ letterSpacing: "-0.03em", color: "#0a0a14" }}>
            Senaryoları konuşarak yönetin
          </h2>
          <p className="text-[15.5px] leading-[1.7] mb-8" style={{ color: "#45445a", maxWidth: 480 }}>
            LDF window, CDF override, BF basis değişikliği — doğal dilde söyleyin, agent
            uygulasın ve IBNR etkisini yorumlasın. Ham üçgen verisi LLM'e iletilmez,
            yalnızca agrega sonuçlar üzerinden çalışır.
          </p>
          <div className="space-y-2.5">
            {[
              "IBNR, ultimate ve loss ratio yorumu",
              "LDF window ve hücre eleme uygulama",
              "Senaryo karşılaştırması — etki analizi",
              "Formül tabanlı a priori LR önerisi",
            ].map(f => (
              <div key={f} className="flex items-start gap-2.5 text-[14px]" style={{ color: "#45445a" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="shrink-0 mt-0.5">
                  <circle cx="12" cy="12" r="10" fill="#f3edff" />
                  <path d="m8 12 3 3 5-6" stroke="#6d28d9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {f}
              </div>
            ))}
          </div>
        </div>
        <ChatDemo />
      </div>
    </section>
  );
}

function ChatDemo() {
  const messages = [
    { role: "user",  text: "2024 ve 2025 için BF kullansak toplam IBNR kaç değişir?" },
    { role: "agent", text: "BF'e geçince IBNR 107,1M'den 94,3M'ye düşüyor (−12,8M, %12). A priori LR: vw(2021–2023) = %68,4." },
    { role: "user",  text: "Uygula." },
    { role: "agent", text: "Basis güncellendi. Selected IBNR: 94,3M.", short: true },
  ];
  return (
    <div className="relative">
      <div className="absolute -inset-4 rounded-3xl opacity-40 blur-2xl pointer-events-none"
        style={{ background: "linear-gradient(135deg, rgba(109,40,217,0.2), rgba(37,83,228,0.15))" }} />
      <div className="relative rounded-2xl overflow-hidden hover-lift" style={{ background: "#fff", border: "1px solid #e8e5dd" }}>
        <div className="px-4 py-3 flex items-center gap-2.5" style={{ borderBottom: "1px solid #e8e5dd", background: "#fafaf7" }}>
          <div className="w-2 h-2 rounded-full pulse-dot" style={{ background: "#6d28d9" }} />
          <span className="text-[12px] font-semibold" style={{ color: "#0a0a14" }}>Aktüer Agent</span>
          <span className="ml-auto text-[10.5px]" style={{ color: "#8a8898" }}>online</span>
        </div>
        <div className="p-4 space-y-3 max-h-[440px] overflow-y-auto">
          {messages.map((m, i) => (
            <div key={i} className={"flex " + (m.role === "user" ? "justify-end" : "justify-start")}>
              <div className="max-w-[85%] fade-in-up" style={{ animationDelay: `${0.1 + i * 0.4}s` }}>
                {m.role === "agent" && (
                  <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "#6d28d9" }}>Agent</div>
                )}
                <div className="text-[13px] leading-relaxed px-3.5 py-2.5 rounded-2xl"
                  style={{
                    background: m.role === "user" ? "#2553e4" : "#f5f3ee",
                    color: m.role === "user" ? "#fff" : "#0a0a14",
                    borderTopLeftRadius: m.role === "user" ? "1rem" : "0.4rem",
                    borderTopRightRadius: m.role === "user" ? "0.4rem" : "1rem",
                  }}>
                  {m.text}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="p-3" style={{ borderTop: "1px solid #e8e5dd" }}>
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: "#f5f3ee" }}>
            <span className="text-[12.5px] flex-1" style={{ color: "#8a8898" }}>Agent'a mesaj yaz…</span>
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "#2553e4" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="m5 12 14-7-3.5 19L12 13 5 12Z" stroke="white" strokeWidth="1.8" strokeLinejoin="round"/></svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Pricing ──────────────────────────────────────────────────────────────────

const PLANS = [
  {
    name: "Free",
    price: "₺0",
    period: "sonsuza kadar",
    desc: "Küçük portföyler ve deneme.",
    highlight: false,
    cta: "Ücretsiz Başla",
    href: "/reserve",
    features: [
      "3 proje · 1 dönem",
      "Chain-Ladder & BF",
      "LDF & CDF override",
      "Excel export (temel)",
      "Tarayıcı içi veri",
    ],
    missing: ["AI Aktüer Agent", "Parametrik tail fitting", "Çoklu kullanıcı"],
  },
  {
    name: "Pro",
    price: "₺890",
    period: "/ ay",
    desc: "Profesyonel aktüerler için tam set.",
    highlight: true,
    cta: "Pro'ya Geç",
    href: "/reserve",
    features: [
      "Sınırsız proje & dönem",
      "Parametrik tail fitting (4 model)",
      "AI Aktüer Agent — sınırsız",
      "Gelişmiş Excel export",
      "Senaryo karşılaştırması",
      "Öncelikli destek",
    ],
    missing: [],
  },
  {
    name: "Enterprise",
    price: "Özel",
    period: "",
    desc: "Ekip kullanımı, entegrasyon, SLA.",
    highlight: false,
    cta: "Bize Ulaşın",
    href: "mailto:demireleren877@gmail.com",
    features: [
      "Pro'nun tüm özellikleri",
      "Çoklu kullanıcı & roller",
      "SSO / SAML",
      "On-premise / özel cloud",
      "API erişimi",
      "Özel SLA",
    ],
    missing: [],
  },
];

function Pricing() {
  return (
    <section id="pricing" className="px-6 md:px-8 py-24" style={{ background: "#fff", borderTop: "1px solid #e8e5dd", borderBottom: "1px solid #e8e5dd" }}>
      <div className="max-w-6xl mx-auto">
        <SectionHead
          tag="Fiyatlandırma"
          title="Ücretsiz başla, ihtiyaca göre büyüt"
          desc="Tüm planlarda kredi kartı gerekmez. İstediğin zaman değiştir, iptal et."
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-12 items-stretch">
          {PLANS.map(p => <PlanCard key={p.name} {...p} />)}
        </div>
      </div>
    </section>
  );
}

function PlanCard({ name, price, period, desc, highlight, cta, href, features, missing }: typeof PLANS[number]) {
  return (
    <div className={"relative rounded-2xl p-7 hover-lift flex flex-col " + (highlight ? "" : "")}
      style={{
        background: highlight ? "linear-gradient(180deg, #1e2a48 0%, #0f1729 100%)" : "#fff",
        border: highlight ? "none" : "1px solid #e8e5dd",
        boxShadow: highlight ? "0 20px 60px rgba(15,23,41,0.25), 0 0 0 1px rgba(255,255,255,0.06) inset" : "none",
        color: highlight ? "#fff" : "#0a0a14",
      }}>
      {highlight && (
        <>
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[10.5px] font-bold uppercase tracking-widest"
            style={{ background: "linear-gradient(90deg, #2563eb, #6d28d9)", color: "#fff" }}>
            En Popüler
          </div>
          <div className="absolute inset-0 rounded-2xl pointer-events-none opacity-30"
            style={{ background: "radial-gradient(ellipse 80% 40% at 50% 0%, rgba(37,83,228,0.4), transparent 70%)" }} />
        </>
      )}
      <div className="relative">
        <div className="text-[14px] font-bold mb-1" style={{ color: highlight ? "#93c5fd" : "#8a8898" }}>{name}</div>
        <div className="flex items-end gap-1.5 mb-2">
          <span className="text-[40px] font-bold leading-none tabular-nums" style={{ letterSpacing: "-0.04em" }}>{price}</span>
          {period && <span className="text-[13px] mb-1.5" style={{ color: highlight ? "rgba(255,255,255,0.5)" : "#9ca3af" }}>{period}</span>}
        </div>
        <p className="text-[13.5px] mb-6 leading-relaxed" style={{ color: highlight ? "rgba(255,255,255,0.65)" : "#5a5a6a" }}>{desc}</p>
        <Link href={href} className="block text-center py-3 rounded-lg text-[13.5px] font-semibold transition-all mb-7"
          style={{
            background: highlight ? "#fff" : "#0a0a14",
            color: highlight ? "#0a0a14" : "#fff",
          }}>
          {cta}
        </Link>
        <div className="space-y-2.5">
          {features.map(f => (
            <div key={f} className="flex items-start gap-2.5 text-[13px]"
              style={{ color: highlight ? "rgba(255,255,255,0.85)" : "#374151" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="shrink-0 mt-0.5">
                <path d="M5 12l4 4L20 6" stroke={highlight ? "#93c5fd" : "#2553e4"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {f}
            </div>
          ))}
          {missing.map(f => (
            <div key={f} className="flex items-start gap-2.5 text-[13px]"
              style={{ color: highlight ? "rgba(255,255,255,0.3)" : "#c4c0b6" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="shrink-0 mt-0.5">
                <path d="M6 12h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              {f}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── FAQ ──────────────────────────────────────────────────────────────────────

const FAQ_ITEMS = [
  { q: "Verilerim güvende mi?", a: "Evet. Ham üçgen verisi sunucuya iletilmez ve LLM'e gönderilmez. Tüm veriler tarayıcınızın localStorage'ında saklanır. Aktüer Agent yalnızca LDF, CDF, IBNR gibi agrega sonuçlara erişir." },
  { q: "Hangi hesaplama metodları destekleniyor?", a: "Chain-Ladder (volume-weighted, simple/geometrik average), Bornhuetter–Ferguson, parametrik tail fitting (Exponential Decay, Inverse Power, Power, Weibull) ve manuel CDF override." },
  { q: "Excel formatım uyumlu mu?", a: "Evet — kümülatif veya artımsal, ödeme veya gerçekleşen, satır-bazlı veya diagonal. Format otomatik tespit edilir. Hatalı format durumunda yapıştır-import ile manuel düzeltebilirsiniz." },
  { q: "Free planın limiti ne?", a: "Free planda 3 proje ve 1 aktif dönem ile sınırsız Chain-Ladder ve BF analizi yapabilirsiniz. AI Agent ve parametrik tail fitting yalnızca Pro'da bulunur." },
  { q: "Enterprise'da on-premise mümkün mü?", a: "Evet. Enterprise planda Docker tabanlı on-premise kurulum, özel cloud (AWS/Azure/GCP) ve SSO entegrasyonu sunuyoruz. Bize ulaşın." },
];

function FAQ() {
  const [open, setOpen] = useState(0);
  return (
    <section id="faq" className="px-6 md:px-8 py-24">
      <div className="max-w-3xl mx-auto">
        <SectionHead tag="SSS" title="Sık sorulan sorular" desc="Sorularınız mı var? İşte en çok merak edilenler." />
        <div className="mt-10 space-y-2">
          {FAQ_ITEMS.map((item, i) => (
            <div key={i} className="rounded-xl overflow-hidden transition-all"
              style={{ background: "#fff", border: "1px solid " + (open === i ? "#bfd3ff" : "#e8e5dd") }}>
              <button onClick={() => setOpen(open === i ? -1 : i)}
                className="w-full px-5 py-4 flex items-center justify-between gap-4 text-left transition">
                <span className="text-[14.5px] font-semibold" style={{ color: "#0a0a14" }}>{item.q}</span>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                  className="shrink-0 transition-transform" style={{ transform: open === i ? "rotate(180deg)" : "rotate(0)", color: "#8a8898" }}>
                  <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              <div className="overflow-hidden transition-all"
                style={{ maxHeight: open === i ? "200px" : "0", opacity: open === i ? 1 : 0 }}>
                <div className="px-5 pb-4 text-[13.5px] leading-relaxed" style={{ color: "#5a5a6a" }}>{item.a}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Section head ─────────────────────────────────────────────────────────────

function SectionHead({ tag, title, desc }: { tag: string; title: string; desc: string }) {
  return (
    <div className="max-w-2xl">
      <div className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: "#2553e4" }}>{tag}</div>
      <h2 className="text-[32px] md:text-[40px] font-bold mb-4 leading-[1.05]" style={{ letterSpacing: "-0.03em", color: "#0a0a14" }}>{title}</h2>
      <p className="text-[15.5px] leading-relaxed" style={{ color: "#45445a" }}>{desc}</p>
    </div>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="px-6 md:px-8 py-12" style={{ borderTop: "1px solid #e8e5dd", background: "#f3f1ec" }}>
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
          <div className="col-span-2">
            <Link href="/" className="flex items-center gap-2.5 mb-4">
              <Logo />
              <span className="text-[15px] font-bold tracking-tight">Reserve Agent</span>
            </Link>
            <p className="text-[13px] leading-relaxed max-w-xs" style={{ color: "#5a5a6a" }}>
              Aktüeryal rezerv analiz platformu. IBNR, Chain-Ladder, BF ve tail fitting tek yerde.
            </p>
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: "#0a0a14" }}>Ürün</div>
            <div className="space-y-2 text-[13px]" style={{ color: "#5a5a6a" }}>
              <a href="#features" className="block hover:underline">Özellikler</a>
              <a href="#pricing" className="block hover:underline">Fiyatlandırma</a>
              <a href="#faq" className="block hover:underline">SSS</a>
              <Link href="/reserve" className="block hover:underline">Uygulama</Link>
            </div>
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: "#0a0a14" }}>İletişim</div>
            <div className="space-y-2 text-[13px]" style={{ color: "#5a5a6a" }}>
              <a href="mailto:demireleren877@gmail.com" className="block hover:underline">demireleren877@gmail.com</a>
              <a href="mailto:demireleren877@gmail.com" className="block hover:underline">Enterprise satış</a>
            </div>
          </div>
        </div>
        <div className="pt-6 flex flex-col md:flex-row items-center justify-between gap-3 text-[12px]" style={{ borderTop: "1px solid #e8e5dd", color: "#8a8898" }}>
          <span>© 2026 Reserve Agent</span>
          <div className="flex items-center gap-5 flex-wrap justify-center">
            <Link href="/terms" className="hover:underline">Kullanım Şartları</Link>
            <Link href="/privacy" className="hover:underline">Gizlilik Politikası</Link>
            <Link href="/refund" className="hover:underline">İade Politikası</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
