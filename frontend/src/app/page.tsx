"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const ANIMATIONS = `
@keyframes fadeInUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
@keyframes pulse-dot { 0%, 100% { box-shadow: 0 0 0 0 rgba(37,83,228,0.4); } 50% { box-shadow: 0 0 0 6px rgba(37,83,228,0); } }
@keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
@keyframes orbDrift { 0%, 100% { transform: translate(0,0) scale(1); } 33% { transform: translate(40px,-30px) scale(1.05); } 66% { transform: translate(-30px,40px) scale(0.95); } }
@keyframes glow { 0%, 100% { box-shadow: 0 0 24px rgba(37,83,228,0.18); } 50% { box-shadow: 0 0 36px rgba(37,83,228,0.32); } }

.fade-in-up { animation: fadeInUp 0.8s cubic-bezier(0.22, 1, 0.36, 1) backwards; }
.float-slow { animation: float 6s ease-in-out infinite; }
.pulse-dot { animation: pulse-dot 2s ease-in-out infinite; }
.glow-on { animation: glow 3s ease-in-out infinite; }
.orb { animation: orbDrift 20s ease-in-out infinite; }
.hover-lift { transition: transform 0.4s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.4s; }
.hover-lift:hover { transform: translateY(-4px); box-shadow: 0 12px 40px rgba(10, 10, 20, 0.08); }
.shimmer-bg { background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent); background-size: 200% 100%; animation: shimmer 3s ease-in-out infinite; }
.grid-bg { background-image: linear-gradient(to right, rgba(10,10,20,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(10,10,20,0.04) 1px, transparent 1px); background-size: 48px 48px; mask-image: radial-gradient(ellipse 80% 60% at 50% 30%, black 30%, transparent 100%); }
.text-gradient { background: linear-gradient(135deg, #0a0a14 0%, #2553e4 50%, #6d28d9 100%); -webkit-background-clip: text; background-clip: text; color: transparent; }
.cta-blue { background: linear-gradient(180deg, #2563eb, #1e40af); color: white; box-shadow: 0 1px 0 rgba(255,255,255,0.2) inset, 0 4px 12px rgba(37,83,228,0.25); transition: all 0.2s; }
.cta-blue:hover { transform: translateY(-1px); box-shadow: 0 1px 0 rgba(255,255,255,0.2) inset, 0 6px 20px rgba(37,83,228,0.4); }
.glass-nav { background: rgba(250, 249, 246, 0.72); backdrop-filter: saturate(180%) blur(14px); -webkit-backdrop-filter: saturate(180%) blur(14px); }
`;

export default function Landing() {
  return (
    <div className="min-h-screen relative overflow-x-hidden" style={{ background: "#faf9f6", color: "#0a0a14" }}>
      <style>{ANIMATIONS}</style>
      <BackgroundOrbs />
      <Nav />
      <Hero />
      <Modules />
      <ReserveDeepDive />
      <AgentSection />
      <Pricing />
      <FAQ />
      <Footer />
    </div>
  );
}

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

function Nav() {
  return (
    <nav className="sticky top-0 z-50 glass-nav" style={{ borderBottom: "1px solid #e8e5dd" }}>
      <div className="max-w-6xl mx-auto px-6 md:px-8 h-15 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo />
          <span className="text-[14.5px] font-semibold tracking-tight">Actuarius</span>
        </Link>
        <div className="flex items-center gap-1">
          <a href="#modules" className="text-[13px] font-medium px-3 py-1.5 rounded-md hidden sm:block transition" style={{ color: "#45445a" }}>Modüller</a>
          <a href="#agent" className="text-[13px] font-medium px-3 py-1.5 rounded-md hidden sm:block transition" style={{ color: "#45445a" }}>Agent</a>
          <a href="#pricing" className="text-[13px] font-medium px-3 py-1.5 rounded-md hidden sm:block transition" style={{ color: "#45445a" }}>Fiyatlandırma</a>
          <Link href="/reserve" className="ml-2 cta-blue text-[13px] font-semibold px-4 py-1.5 rounded-lg">
            Platforma Gir
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
      <span className="relative z-10">A</span>
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
            Rezerv modülü aktif · IFRS 17 ve daha fazlası geliyor
          </div>

          <h1 className="fade-in-up text-[44px] sm:text-[58px] md:text-[66px] font-bold leading-[1.02] mb-7"
            style={{ letterSpacing: "-0.04em", animationDelay: "0.1s" }}>
            <span className="block text-gradient">Aktüerin dijital</span>
            <span className="block" style={{ color: "#0a0a14" }}>çalışma platformu.</span>
          </h1>

          <p className="fade-in-up text-[17px] md:text-[19px] leading-[1.6] mx-auto mb-9 max-w-2xl"
            style={{ color: "#45445a", animationDelay: "0.2s" }}>
            Rezerv analizi, IFRS 17, nakit akışı, iskonto ve daha fazlası — tek platformda.
            Her modülde AI Aktüer Agent ile senaryoları konuşarak yönetin.
          </p>

          <div className="fade-in-up flex flex-wrap items-center justify-center gap-3 mb-10" style={{ animationDelay: "0.3s" }}>
            <Link href="/reserve" className="cta-blue px-6 py-3 rounded-lg text-[14px] font-semibold inline-flex items-center gap-2">
              Ücretsiz Başla
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </Link>
            <a href="#modules" className="px-6 py-3 rounded-lg text-[14px] font-semibold transition hover:bg-white"
              style={{ background: "transparent", border: "1px solid #d8d5cd", color: "#0a0a14" }}>
              Modülleri incele
            </a>
          </div>

          <div className="fade-in-up flex items-center justify-center gap-4 text-[12px] flex-wrap" style={{ color: "#8a8898", animationDelay: "0.4s" }}>
            {["Ücretsiz plan mevcut", "Ham veri LLM'e iletilmez", "Türkiye'nin ilk aktüeryal AI platformu"].map((t, i) => (
              <span key={i} className="flex items-center gap-1.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 2 4 6v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V6l-8-4Z" stroke="currentColor" strokeWidth="1.5"/><path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* Platform preview */}
        <div className="fade-in-up max-w-5xl mx-auto" style={{ animationDelay: "0.55s" }}>
          <PlatformPreview />
        </div>
      </div>
    </section>
  );
}

function PlatformPreview() {
  return (
    <div className="relative">
      <div className="absolute -inset-4 rounded-3xl opacity-50 blur-2xl"
        style={{ background: "linear-gradient(135deg, rgba(37,83,228,0.18), rgba(109,40,217,0.12))" }} />
      <div className="relative rounded-2xl overflow-hidden glow-on" style={{ background: "#fff", border: "1px solid #e8e5dd" }}>
        {/* Browser chrome */}
        <div className="px-4 py-3 flex items-center gap-3" style={{ background: "#f5f3ee", borderBottom: "1px solid #e8e5dd" }}>
          <div className="flex gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: "#fca5a5" }} />
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: "#fcd34d" }} />
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: "#86efac" }} />
          </div>
          <div className="flex-1 max-w-sm mx-auto px-3 py-1 rounded-md text-[11px] font-medium text-center"
            style={{ background: "#fff", border: "1px solid #e8e5dd", color: "#8a8898" }}>
            actuaryagent.online
          </div>
          <div className="flex items-center gap-2 text-[10.5px]" style={{ color: "#8a8898" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 pulse-dot" />
            Live
          </div>
        </div>
        {/* App shell */}
        <div className="grid grid-cols-[180px_1fr] min-h-[260px]">
          {/* Sidebar */}
          <div className="p-3 space-y-1" style={{ background: "#fafaf7", borderRight: "1px solid #e8e5dd" }}>
            <div className="text-[9px] font-bold uppercase tracking-widest px-2 py-2" style={{ color: "#8a8898" }}>Modüller</div>
            {[
              { label: "Rezerv Analizi", active: true, dot: "#2553e4" },
              { label: "IFRS 17", active: false, dot: "#d1d5db", soon: true },
              { label: "Nakit Akışı", active: false, dot: "#d1d5db", soon: true },
              { label: "İskonto", active: false, dot: "#d1d5db", soon: true },
            ].map(m => (
              <div key={m.label} className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] font-medium"
                style={{
                  background: m.active ? "#ebf0ff" : "transparent",
                  color: m.active ? "#2553e4" : "#9ca3af",
                }}>
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: m.dot }} />
                <span className="flex-1 truncate">{m.label}</span>
                {m.soon && <span className="text-[8px] font-bold uppercase tracking-wider px-1 py-0.5 rounded" style={{ background: "#f3f1ec", color: "#9ca3af" }}>Yakında</span>}
              </div>
            ))}
            <div className="mt-3 pt-3" style={{ borderTop: "1px solid #e8e5dd" }}>
              <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] font-medium" style={{ color: "#6d28d9" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4z"/></svg>
                AI Agent
              </div>
            </div>
          </div>
          {/* Content */}
          <div className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-[13px] font-semibold" style={{ color: "#0a0a14" }}>Rezerv Analizi</div>
                <div className="text-[10.5px]" style={{ color: "#8a8898" }}>Motor TPL · 2025 Q4 · Volume Weighted</div>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded"
                style={{ background: "#ebf0ff", color: "#2553e4" }}>Chain-Ladder + BF</span>
            </div>
            <PreviewTriangle />
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewTriangle() {
  const rows = [
    { y: "2021", v: ["1,638", "1,091", "1,041", "1,018"], cdf: "1,089", ibnr: "4.330" },
    { y: "2022", v: ["1,721", "1,102", "1,049", "—"],     cdf: "1,214", ibnr: "11.270" },
    { y: "2023", v: ["1,684", "1,118", "—",    "—"],     cdf: "1,588", ibnr: "27.840" },
    { y: "2024", v: ["1,702", "—",    "—",    "—"],     cdf: "3,120", ibnr: "62.180" },
  ];
  return (
    <table className="w-full text-[11.5px]" style={{ fontFamily: "var(--font-geist-mono, ui-monospace, monospace)" }}>
      <thead>
        <tr style={{ color: "#8a8898" }}>
          <th className="text-left py-1.5 pr-2 text-[10px] font-semibold uppercase tracking-wider">Yıl</th>
          {["12m", "24m", "36m", "48m"].map(m => (
            <th key={m} className="text-right px-1.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider">{m}</th>
          ))}
          <th className="text-right px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#2553e4" }}>CDF</th>
          <th className="text-right pl-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#0a0a14" }}>IBNR</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.y} className="fade-in-up" style={{ borderTop: "1px solid #f0ede4", animationDelay: `${0.6 + i * 0.08}s` }}>
            <td className="py-2 pr-2 font-semibold" style={{ color: "#45445a" }}>{r.y}</td>
            {r.v.map((c, j) => (
              <td key={j} className="text-right px-1.5 py-2 tabular-nums" style={{ color: c === "—" ? "#d6d3cb" : "#45445a" }}>{c}</td>
            ))}
            <td className="text-right px-2 py-2 tabular-nums font-semibold" style={{ color: "#2553e4" }}>{r.cdf}</td>
            <td className="text-right pl-2 py-2 tabular-nums font-semibold" style={{ color: "#0a0a14" }}>{r.ibnr}</td>
          </tr>
        ))}
        <tr style={{ borderTop: "2px solid #e8e5dd" }}>
          <td colSpan={5} />
          <td className="text-right px-2 py-2.5 text-[10px] uppercase tracking-wider" style={{ color: "#8a8898" }}>Toplam</td>
          <td className="text-right pl-2 py-2.5 text-[13px] font-bold tabular-nums" style={{ color: "#0a0a14" }}>
            <CountUp to={105620} format />
          </td>
        </tr>
      </tbody>
    </table>
  );
}

// ─── Modules ──────────────────────────────────────────────────────────────────

const MODULE_LIST = [
  {
    tag: "Aktif",
    tagColor: "#2553e4",
    tagBg: "#ebf0ff",
    icon: <ReserveIcon />,
    name: "Rezerv Analizi",
    desc: "IBNR hesabı, Chain-Ladder, Bornhuetter–Ferguson, parametrik tail fitting ve çok sayfalı Excel export — tam aktüeryal rezerv iş akışı.",
    features: ["Chain-Ladder & BF", "Parametrik tail fitting (4 model)", "ILR üçgeni & ısı haritası", "LDF window & hücre eleme", "AI Agent entegrasyonu"],
    active: true,
  },
  {
    tag: "Yakında",
    tagColor: "#8a8898",
    tagBg: "#f3f1ec",
    icon: <IFRS17Icon />,
    name: "IFRS 17",
    desc: "GMM, PAA ve VFA yaklaşımlarıyla sözleşme grubu bazlı IFRS 17 muhasebeleştirmesi. CSM amortismanı ve risk düzeltmesi hesabı.",
    features: ["GMM / PAA / VFA", "CSM amortismanı", "Risk düzeltmesi", "Karşılaştırmalı raporlama"],
    active: false,
  },
  {
    tag: "Yakında",
    tagColor: "#8a8898",
    tagBg: "#f3f1ec",
    icon: <AvgClaimIcon />,
    name: "Nakit Akışı",
    desc: "Sigorta yükümlülüklerinin dönemsel nakit akışı projeksiyonu. Ödeme örüntüsü ve aktüeryal beklenti analizi.",
    features: ["Ödeme örüntüsü analizi", "Dönemsel projeksiyon", "Senaryo karşılaştırması", "Portföy bazlı görünüm"],
    active: false,
  },
  {
    tag: "Yakında",
    tagColor: "#8a8898",
    tagBg: "#f3f1ec",
    icon: <PricingIcon />,
    name: "İskonto",
    desc: "Nakit akışlarının risk-free eğri veya şirket iskonto eğrisiyle bugünkü değere indirgenmesi.",
    features: ["Risk-free eğri entegrasyonu", "Yield curve uygulaması", "IFRS 17 uyumlu iskonto", "Duyarlılık analizi"],
    active: false,
  },
];

function Modules() {
  return (
    <section id="modules" className="px-6 md:px-8 py-24" style={{ background: "#f3f1ec", borderTop: "1px solid #e8e5dd", borderBottom: "1px solid #e8e5dd" }}>
      <div className="max-w-6xl mx-auto">
        <SectionHead
          tag="Platform Modülleri"
          title="Aktüeryal iş akışının tamamı"
          desc="Her aktüeryal disiplin kendi modülünde. Şu an rezerv modülü tam aktif — diğerleri sırayla geliyor."
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-12">
          {MODULE_LIST.map((m, i) => (
            <div key={m.name}
              className={"rounded-2xl p-6 hover-lift relative overflow-hidden fade-in-up " + (!m.active ? "opacity-70" : "")}
              style={{
                background: m.active ? "#fff" : "#faf9f6",
                border: "1px solid " + (m.active ? "#bfd3ff" : "#e8e5dd"),
                animationDelay: `${i * 0.08}s`,
              }}>
              <div className="flex items-start justify-between mb-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: m.active ? "#ebf0ff" : "#f3f1ec" }}>
                  {m.icon}
                </div>
                <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full"
                  style={{ background: m.tagBg, color: m.tagColor }}>
                  {m.tag}
                </span>
              </div>
              <h3 className="text-[18px] font-bold mb-2" style={{ color: m.active ? "#0a0a14" : "#5a5a6a", letterSpacing: "-0.02em" }}>{m.name}</h3>
              <p className="text-[13px] leading-relaxed mb-4" style={{ color: "#6b7280" }}>{m.desc}</p>
              <div className="space-y-1.5">
                {m.features.map(f => (
                  <div key={f} className="flex items-center gap-2 text-[12.5px]" style={{ color: m.active ? "#374151" : "#9ca3af" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                      <path d="M5 12l4 4L20 6" stroke={m.active ? "#2553e4" : "#d1d5db"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    {f}
                  </div>
                ))}
              </div>
              {m.active && (
                <Link href="/reserve" className="mt-5 inline-flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ color: "#2553e4" }}>
                  Modülü aç
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </Link>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// Module icons
function ReserveIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2553e4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>;
}
function IFRS17Icon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>;
}
function AvgClaimIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>;
}
function PricingIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>;
}

// ─── Reserve deep-dive ────────────────────────────────────────────────────────

function ReserveDeepDive() {
  return (
    <section className="px-6 md:px-8 py-24">
      <div className="max-w-6xl mx-auto">
        <SectionHead
          tag="Rezerv Modülü"
          title="Eksiksiz rezerv iş akışı"
          desc="Veri girişinden Excel raporuna kadar — tüm aktüeryal adımlar tek arayüzde."
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-12">
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

          <FeatureCard tag="Tail" title="Parametrik tail fitting">
            <p className="text-[13px] leading-relaxed" style={{ color: "#5a5a6a" }}>
              Exponential, Inverse Power, Power ve Weibull. Period bazlı model seçimi, cascade CDF.
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
    { y: "2020", vals: [1.4,  3.2,  9.4, 11.3, 12.8, 12.6, 10.3,  9.7, 11.6, null, null] },
    { y: "2021", vals: [28.3, 7.1, 14.4, 32.5, 27.6, 23.5, 29.4, 19.7, null, null, null] },
    { y: "2022", vals: [3.5,  3.0, 17.6, 14.6, 14.5, 14.3, 18.7, null, null, null, null] },
    { y: "2023", vals: [12.6, 15.2, 26.9, 23.1, 30.8, 30.6, null, null, null, null, null] },
    { y: "2024", vals: [4.4, 16.3, 18.3, 22.8, 31.5, null, null, null, null, null, null] },
    { y: "2025", vals: [8.3, 34.9, 42.0, 60.3, 86.8, null, null, null, null, null, null] },
    { y: "2026", vals: [5.5, 20.4, 33.1, null, null, null, null, null, null, null, null] },
  ];
  const cellStyle = (v: number) => {
    if (v >= 80)  return { color: "#dc2626", weight: 700 };
    if (v >= 40)  return { color: "#ea580c", weight: 600 };
    if (v >= 15)  return { color: "#1f2937", weight: 500 };
    return { color: "#9ca3af", weight: 400 };
  };
  return (
    <div className="mt-6 rounded-xl overflow-hidden" style={{ background: "#fff", border: "1px solid #e8e5dd" }}>
      <div className="px-4 py-3 flex items-center justify-between" style={{ background: "#fafaf7", borderBottom: "1px solid #e8e5dd" }}>
        <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#6b7280" }}>Hasar / (Prim × Düz.)</div>
        <div className="flex items-center gap-3 text-[9.5px]" style={{ color: "#6b7280" }}>
          {[["#9ca3af","Normal"],["#ea580c","Yüksek"],["#dc2626","Anomali"]].map(([c,l]) => (
            <span key={l} className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />{l}</span>
          ))}
        </div>
      </div>
      <div className="p-4">
        <table className="w-full text-[10.5px] tabular-nums" style={{ fontFamily: "var(--font-geist-mono, ui-monospace, monospace)" }}>
          <thead><tr style={{ color: "#9ca3af" }}>
            <th className="text-left px-1 py-1 text-[9px] font-semibold uppercase tracking-wider">Yıl</th>
            {Array.from({ length: 11 }).map((_, i) => <th key={i} className="text-right px-1 py-1 text-[9px] font-semibold">{i+1}</th>)}
          </tr></thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={r.y} className="fade-in-up" style={{ borderTop: "1px solid #f3f1ec", animationDelay: `${0.05 + ri * 0.04}s` }}>
                <td className="px-1 py-[5px] font-semibold" style={{ color: "#374151" }}>{r.y}</td>
                {r.vals.map((v, j) => v == null
                  ? <td key={j} className="text-right px-1 py-[5px]" style={{ color: "#e5e7eb" }}>·</td>
                  : <td key={j} className="text-right px-1 py-[5px]" style={{ color: cellStyle(v).color, fontWeight: cellStyle(v).weight }}>{v.toFixed(1)}%</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ImportIllustration() {
  return (
    <div className="mt-5 rounded-xl p-4" style={{ background: "#f5f3ee", border: "1px dashed #c4c0b6" }}>
      <div className="flex items-center gap-3">
        <div className="w-10 h-12 rounded shrink-0 flex items-center justify-center text-[10px] font-bold text-white" style={{ background: "#16a34a" }}>xlsx</div>
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-semibold truncate" style={{ color: "#0a0a14" }}>ucgen-2025-Q4.xlsx</div>
          <div className="h-1.5 rounded-full mt-1.5 overflow-hidden" style={{ background: "#e0ddd2" }}>
            <div className="h-full rounded-full" style={{ width: "78%", background: "linear-gradient(90deg, #2563eb, #6d28d9)" }} />
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
            style={{ background: i === 0 ? "#ebf0ff" : "#fff", border: "1px solid " + (i === 0 ? "#bfd3ff" : "#e8e5dd"), color: i === 0 ? "#2553e4" : "#45445a" }}>
            {x}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Agent section ────────────────────────────────────────────────────────────

function AgentSection() {
  return (
    <section id="agent" className="px-6 md:px-8 py-24" style={{ background: "#f3f1ec", borderTop: "1px solid #e8e5dd", borderBottom: "1px solid #e8e5dd" }}>
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] font-bold px-3 py-1.5 rounded-full mb-6"
            style={{ background: "#f3edff", border: "1px solid #d8c9ff", color: "#6d28d9" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a4 4 0 0 1 4 4 4 4 0 0 1-4 4 4 4 0 0 1-4-4 4 4 0 0 1 4-4Zm0 11c4.4 0 8 1.8 8 4v3H4v-3c0-2.2 3.6-4 8-4Z"/></svg>
            AI Aktüer Agent
          </div>
          <h2 className="text-[36px] md:text-[42px] font-bold mb-5 leading-[1.05]" style={{ letterSpacing: "-0.03em", color: "#0a0a14" }}>
            Her modülde <br />kıdemli aktüer desteği
          </h2>
          <p className="text-[15.5px] leading-[1.7] mb-8" style={{ color: "#45445a", maxWidth: 480 }}>
            Rezerv, IFRS 17, nakit akışı veya iskonto — hangi modülde olursanız olun AI Agent
            sorularınızı yanıtlar, senaryoları hesaplar ve değişiklikleri doğrudan uygular.
            Ham veri LLM'e iletilmez.
          </p>
          <div className="space-y-2.5">
            {[
              "Doğal dilde senaryo analizi ve uygulama",
              "IBNR, ultimate ve loss ratio yorumu",
              "Formül tabanlı a priori LR önerisi",
              "Tüm modüllerde tek agent, tek arayüz",
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
    { role: "agent", text: "Tamamlandı. 2024 ve 2025 BF basis'e geçirildi. Selected IBNR: 94,3M." },
  ];
  return (
    <div className="relative">
      <div className="absolute -inset-4 rounded-3xl opacity-40 blur-2xl pointer-events-none"
        style={{ background: "linear-gradient(135deg, rgba(109,40,217,0.2), rgba(37,83,228,0.15))" }} />
      <div className="relative rounded-2xl overflow-hidden hover-lift" style={{ background: "#fff", border: "1px solid #e8e5dd" }}>
        <div className="px-4 py-3 flex items-center gap-2.5" style={{ borderBottom: "1px solid #e8e5dd", background: "#fafaf7" }}>
          <div className="w-2 h-2 rounded-full pulse-dot" style={{ background: "#6d28d9" }} />
          <span className="text-[12px] font-semibold" style={{ color: "#0a0a14" }}>AI Aktüer Agent</span>
          <span className="ml-auto text-[10.5px]" style={{ color: "#8a8898" }}>Rezerv · Motor TPL</span>
        </div>
        <div className="p-4 space-y-3 max-h-[400px] overflow-y-auto">
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
    desc: "Küçük portföyler ve keşif.",
    highlight: false,
    cta: "Ücretsiz Başla",
    href: "/reserve",
    features: ["Rezerv modülü — temel", "1 dönem · 1 branş", "Chain-Ladder & BF", "AI Agent (tüm modeller)", "Excel export"],
    missing: ["Sınırsız dönem & branş", "Parametrik tail fitting", "IFRS 17 (yakında)"],
  },
  {
    name: "Pro",
    price: "₺890",
    period: "/ ay",
    desc: "Profesyonel aktüerler için tam set.",
    highlight: true,
    cta: "Pro'ya Geç",
    href: "/onboarding/plan",
    features: ["Sınırsız dönem & branş", "Parametrik tail fitting (4 model)", "AI Agent — sınırsız", "Tüm modüllere erken erişim", "Gelişmiş Excel export", "Öncelikli destek"],
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
    features: ["Pro'nun tüm özellikleri", "Çoklu kullanıcı & roller", "SSO / SAML", "On-premise / özel cloud", "API erişimi", "Özel SLA"],
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
          desc="Ücretsiz plan ile başla, ihtiyacın büyüdükçe Pro'ya geç. İstediğin zaman değiştir veya iptal et."
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
    <div className={"relative rounded-2xl p-7 hover-lift flex flex-col"}
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
          style={{ background: highlight ? "#fff" : "#0a0a14", color: highlight ? "#0a0a14" : "#fff" }}>
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
            <div key={f} className="flex items-start gap-2.5 text-[13px]" style={{ color: highlight ? "rgba(255,255,255,0.3)" : "#c4c0b6" }}>
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
  { q: "Actuarius nedir?", a: "Actuarius, aktüeryal iş akışlarını tek platformda birleştiren bir SaaS ürünüdür. Rezerv analizi, IFRS 17, nakit akışı projeksiyonu ve iskonto hesabı gibi aktüeryal disiplinler modüler yapıda sunulmakta; her modülde AI Aktüer Agent ile doğal dilde analiz yapılabilmektedir." },
  { q: "Şu an hangi modüller aktif?", a: "Rezerv Analizi modülü tam aktiftir: Chain-Ladder, Bornhuetter–Ferguson, parametrik tail fitting (Exponential, Inverse Power, Power, Weibull), ILR üçgeni ve AI Agent entegrasyonu içermektedir. IFRS 17, Nakit Akışı ve İskonto modülleri yakında eklenecektir. Pro kullanıcılar tüm yeni modüllere erken erişim kazanır." },
  { q: "Verilerim güvende mi?", a: "Evet. Aktüer Agent ham üçgen verisine değil, yalnızca LDF, CDF ve IBNR gibi agrega sonuçlara erişir; ham veri hiçbir zaman LLM'e iletilmez. Tüm veriler Cloudflare D1 (Avrupa bölgesi, şifreli) üzerinde saklanır. Hesabınızı sildiğinizde verileriniz 30 gün içinde kalıcı olarak silinir." },
  { q: "Free planın kapsamı ne?", a: "Free planda rezerv modülünde 1 dönem ve 1 branş oluşturabilirsiniz. Chain-Ladder, BF ve AI Agent (tüm modeller) ücretsiz kullanılabilir. Parametrik tail fitting ve sınırsız dönem/branş yalnızca Pro'da bulunur." },
  { q: "Enterprise planda neler sunuluyor?", a: "Çoklu kullanıcı yönetimi, SSO/SAML entegrasyonu, Docker tabanlı on-premise kurulum, özel cloud (AWS/Azure/GCP) ve SLA garantisi. Detay için demireleren877@gmail.com adresine ulaşın." },
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
                style={{ maxHeight: open === i ? "300px" : "0", opacity: open === i ? 1 : 0 }}>
                <div className="px-5 pb-4 text-[13.5px] leading-relaxed" style={{ color: "#5a5a6a" }}>{item.a}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function SectionHead({ tag, title, desc }: { tag: string; title: string; desc: string }) {
  return (
    <div className="max-w-2xl">
      <div className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: "#2553e4" }}>{tag}</div>
      <h2 className="text-[32px] md:text-[40px] font-bold mb-4 leading-[1.05]" style={{ letterSpacing: "-0.03em", color: "#0a0a14" }}>{title}</h2>
      <p className="text-[15.5px] leading-relaxed" style={{ color: "#45445a" }}>{desc}</p>
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

// ─── Footer ───────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="px-6 md:px-8 py-12" style={{ borderTop: "1px solid #e8e5dd", background: "#f3f1ec" }}>
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
          <div className="col-span-2">
            <Link href="/" className="flex items-center gap-2.5 mb-4">
              <Logo />
              <span className="text-[15px] font-bold tracking-tight">Actuarius</span>
            </Link>
            <p className="text-[13px] leading-relaxed max-w-xs" style={{ color: "#5a5a6a" }}>
              Türkiye'nin aktüeryal çalışma platformu. Rezerv, IFRS 17, nakit akışı, iskonto ve AI Agent tek yerde.
            </p>
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: "#0a0a14" }}>Platform</div>
            <div className="space-y-2 text-[13px]" style={{ color: "#5a5a6a" }}>
              <a href="#modules" className="block hover:underline">Modüller</a>
              <a href="#agent" className="block hover:underline">AI Agent</a>
              <a href="#pricing" className="block hover:underline">Fiyatlandırma</a>
              <Link href="/reserve" className="block hover:underline">Rezerv Analizi</Link>
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
          <span>© 2026 Actuarius</span>
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
