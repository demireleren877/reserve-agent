"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

// ─── Palette (matches the real app — globals.css) ─────────────────────────────
//  bg:            #f6f7f9
//  surface:       #ffffff
//  surface-alt:   #f1f3f6
//  border:        #e2e5ea
//  border-strong: #cbd1d9
//  foreground:    #0f172a
//  muted:         #64748b
//  muted-strong:  #475569
//  primary:       #1d4ed8
//  primary-soft:  #eaf0ff
//  primary-border:#bfd3ff
//  success:       #15803d
//  warning:       #b45309

const STYLES = `
@keyframes fadeUp    { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
@keyframes blink     { 0%,100% { opacity:1; } 50% { opacity:0; } }
@keyframes bounce-d  { 0%,80%,100% { transform:scale(.6); opacity:.5; } 40% { transform:scale(1); opacity:1; } }

[data-rv]          { opacity:0; transform:translateY(18px); transition:opacity .65s cubic-bezier(.22,1,.36,1), transform .65s cubic-bezier(.22,1,.36,1); }
[data-rv][data-on] { opacity:1; transform:none; }

.mono     { font-family:var(--font-geist-mono,ui-monospace,'SF Mono',monospace); }
.fi       { animation:fadeUp .7s cubic-bezier(.22,1,.36,1) backwards; }

/* Nav */
.nav-blur { background:rgba(255,255,255,.92); backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px); }

/* Buttons */
.btn-primary {
  background:#1d4ed8; color:#fff;
  padding:11px 20px; font-size:14px; font-weight:600;
  border-radius:6px;
  display:inline-flex; align-items:center; gap:8px;
  transition:background .15s ease, box-shadow .15s ease, transform .15s ease;
  box-shadow:0 1px 2px rgba(29,78,216,.15);
}
.btn-primary:hover { background:#1e40af; box-shadow:0 4px 12px rgba(29,78,216,.25); }

.btn-secondary {
  background:#fff; color:#0f172a;
  padding:11px 20px; font-size:14px; font-weight:600;
  border-radius:6px; border:1px solid #cbd1d9;
  display:inline-flex; align-items:center; gap:8px;
  transition:background .15s ease, border-color .15s ease;
}
.btn-secondary:hover { background:#f6f7f9; border-color:#94a3b8; }

.btn-ghost {
  background:transparent; color:#1d4ed8;
  font-size:14px; font-weight:600;
  display:inline-flex; align-items:center; gap:6px;
  transition:gap .2s ease;
}
.btn-ghost:hover { gap:10px; }

/* Cards */
.lcard {
  background:#fff;
  border:1px solid #e2e5ea;
  border-radius:10px;
  transition:border-color .2s ease, box-shadow .2s ease, transform .2s ease;
}
.lcard-h:hover { border-color:#cbd1d9; box-shadow:0 8px 24px rgba(15,23,42,.06); transform:translateY(-2px); }

/* Status pill */
.pill {
  display:inline-flex; align-items:center; gap:6px;
  font-size:11.5px; font-weight:600;
  padding:4px 10px; border-radius:9999px;
}
.pill-active  { background:#dcfce7; color:#15803d; border:1px solid #86efac; }
.pill-dev     { background:#fef3c7; color:#b45309; border:1px solid #fde68a; }
.pill-info    { background:#eaf0ff; color:#1d4ed8; border:1px solid #bfd3ff; }

/* Cursor + typing */
.cursor { display:inline-block; width:2px; height:14px; background:#1d4ed8; vertical-align:middle; margin-left:2px; animation:blink .9s steps(1) infinite; }
.bdot   { animation:bounce-d 1.3s infinite ease-in-out both; display:inline-block; width:6px; height:6px; border-radius:50%; background:#64748b; }
.bdot:nth-child(2) { animation-delay:.16s; }
.bdot:nth-child(3) { animation-delay:.32s; }

/* FAQ */
.q-body { max-height:0; overflow:hidden; opacity:0; transition:max-height .4s cubic-bezier(.22,1,.36,1), opacity .25s ease; }
.q-body.open { max-height:360px; opacity:1; }

/* Eyebrow */
.eyebrow { display:inline-block; font-size:11.5px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:#1d4ed8; margin-bottom:14px; }

/* Pricing highlighted */
.plan-featured { border:1px solid #1d4ed8; box-shadow:0 8px 32px rgba(29,78,216,.12); position:relative; }
.plan-featured::before {
  content:'Önerilen';
  position:absolute; top:-12px; left:24px;
  background:#1d4ed8; color:#fff;
  font-size:10.5px; font-weight:700;
  letter-spacing:.05em; text-transform:uppercase;
  padding:4px 10px; border-radius:4px;
}

/* App-style mock — replicates real app surfaces */
.mock {
  background:#fff;
  border:1px solid #e2e5ea;
  border-radius:12px;
  overflow:hidden;
  box-shadow:0 20px 50px rgba(15,23,42,.08), 0 2px 6px rgba(15,23,42,.03);
}
.mock-sidebar { width:200px; background:#fff; border-right:1px solid #e2e5ea; }
.mock-nav-item {
  display:flex; align-items:center; gap:8px;
  padding:6px 10px; border-radius:6px;
  font-size:13px; color:#475569;
  transition:background .15s ease;
}
.mock-nav-item.active { background:#eaf0ff; color:#1d4ed8; font-weight:500; }
.mock-tabs { display:flex; gap:0; border-bottom:1px solid #e2e5ea; padding:0 24px; }
.mock-tab {
  padding:12px 14px; font-size:13px; color:#64748b;
  border-bottom:2px solid transparent;
  cursor:pointer; transition:color .15s ease, border-color .15s ease;
  white-space:nowrap;
}
.mock-tab:hover { color:#0f172a; }
.mock-tab.active { color:#1d4ed8; border-bottom-color:#1d4ed8; font-weight:500; }

/* Explorer tab pill */
.exp-tab {
  padding:10px 18px; font-size:13.5px; font-weight:500;
  color:#475569; cursor:pointer;
  border-radius:8px; background:transparent;
  transition:background .15s ease, color .15s ease;
  display:inline-flex; align-items:center; gap:8px;
}
.exp-tab:hover { background:#f1f3f6; color:#0f172a; }
.exp-tab.active { background:#eaf0ff; color:#1d4ed8; }
.exp-tab.active .exp-tab-dot { background:#1d4ed8; }
.exp-tab-dot { width:6px; height:6px; border-radius:50%; background:#cbd1d9; }
.exp-tab.dev .exp-tab-dot { background:#fbbf24; }
`;

// ─── Scroll reveal ────────────────────────────────────────────────────────────

function useScrollReveal() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-rv]"));
    if (!els.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          const el = e.target as HTMLElement;
          const delay = parseFloat(el.dataset.rvd ?? "0") * 1000;
          setTimeout(() => el.setAttribute("data-on", ""), delay);
          obs.unobserve(el);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function Landing() {
  useScrollReveal();
  return (
    <div className="min-h-screen" style={{ background: "#ffffff", color: "#0f172a" }}>
      <style>{STYLES}</style>
      <Nav />
      <Hero />
      <ModuleExplorer />
      <Security />
      <Pricing />
      <FAQ />
      <Footer />
    </div>
  );
}

// ─── Nav ──────────────────────────────────────────────────────────────────────

function Nav() {
  return (
    <nav className="sticky top-0 z-50 nav-blur" style={{ borderBottom: "1px solid #e2e5ea" }}>
      <div className="w-full px-6 md:px-8 flex items-center justify-between" style={{ height: 64 }}>
        <Link href="/" className="flex items-center gap-3 shrink-0">
          <img src="/favicon.png" alt="Actuarius" className="h-8 w-8" />
          <span className="text-[18px] font-bold tracking-tight" style={{ color: "#0f172a" }}>
            Actuarius
          </span>
        </Link>
        <div className="flex items-center gap-1">
          {[
            ["#modules", "Modüller"],
            ["#security", "Güvenlik"],
            ["#pricing", "Fiyatlandırma"],
          ].map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="text-[13.5px] font-medium px-3 py-1.5 rounded-md hidden md:block transition-colors hover:bg-slate-100"
              style={{ color: "#475569" }}
            >
              {label}
            </a>
          ))}
          <Link href="/login" className="text-[13.5px] font-medium px-3 py-1.5 hidden sm:block hover:underline" style={{ color: "#475569" }}>
            Giriş
          </Link>
          <Link href="/reserve" className="btn-primary ml-2">
            Ücretsiz Başla
          </Link>
        </div>
      </div>
    </nav>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section
      className="px-6 md:px-8 flex flex-col items-center justify-center"
      style={{
        minHeight: "calc(100vh - 64px)",
        background: "radial-gradient(ellipse 90% 55% at 50% -5%, #dbeafe 0%, #fff 62%)",
      }}
    >
      <div className="text-center max-w-3xl mx-auto">
        <div className="fi mb-7">
          <span className="pill pill-info">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#1d4ed8" }} />
            Rezerv ve Nakit Akışı modülleri canlı
          </span>
        </div>
        <h1
          className="fi text-[46px] sm:text-[60px] md:text-[72px] font-bold tracking-tight leading-[1.04] mb-7"
          style={{ color: "#0f172a", animationDelay: "0.05s", letterSpacing: "-0.03em" }}
        >
          Aktüeryal analiz için
          <br />
          <span style={{ background: "linear-gradient(135deg,#1d4ed8 0%,#3b82f6 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            profesyonel platform
          </span>
        </h1>
        <p className="fi text-[18px] leading-[1.65] mx-auto max-w-xl" style={{ color: "#475569", animationDelay: "0.15s" }}>
          Chain-Ladder, Bornhuetter–Ferguson ve parametrik tail fitting&apos;den
          AI Agent destekli senaryo analizine kadar — eksiksiz rezerv iş akışı.
        </p>
        <div className="fi flex flex-wrap gap-3 justify-center mt-10" style={{ animationDelay: "0.22s" }}>
          <Link href="/reserve" className="btn-primary" style={{ fontSize: 15, padding: "10px 22px" }}>
            Ücretsiz Başla
            <Arrow />
          </Link>
          <a href="#modules" className="btn-secondary" style={{ fontSize: 15, padding: "10px 22px" }}>
            Modülleri İnceleyin
          </a>
        </div>
        <div className="fi mt-8 text-[13px] flex items-center justify-center gap-6 flex-wrap" style={{ color: "#64748b", animationDelay: "0.3s" }}>
          <span className="flex items-center gap-1.5">
            <CheckIcon /> Free plan kalıcı ücretsiz
          </span>
          <span className="flex items-center gap-1.5">
            <CheckIcon /> Ham veri LLM&apos;e iletilmez
          </span>
          <span className="flex items-center gap-1.5">
            <CheckIcon /> Türkçe arayüz
          </span>
        </div>
      </div>
    </section>
  );
}

function HeroAppPreview() {
  return (
    <div className="mock mx-auto" style={{ maxWidth: 1080 }}>
      {/* Browser chrome */}
      <div className="px-4 py-2.5 flex items-center gap-3" style={{ background: "#f1f3f6", borderBottom: "1px solid #e2e5ea" }}>
        <div className="flex gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: "#cbd1d9" }} />
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: "#cbd1d9" }} />
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: "#cbd1d9" }} />
        </div>
        <div className="flex-1 max-w-md mx-auto px-3 py-1 rounded text-[11.5px] text-center mono flex items-center justify-center gap-1.5" style={{ background: "#fff", border: "1px solid #e2e5ea", color: "#64748b" }}>
          <LockIcon />
          actuarius.com.tr/reserve
        </div>
        <div className="w-12" />
        <div className="w-12" />
      </div>

      {/* App shell */}
      <div className="flex" style={{ background: "#f6f7f9", minHeight: 460 }}>
        <AppSidebarMock active="reserve" />
        <div className="flex-1 bg-white">
          <ReserveTabBar active="ultimate" />
          <div className="p-6">
            <UltimateTabContent />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── App-style mock components (match real app exactly) ──────────────────────

function AppSidebarMock({ active }: { active: "home" | "data" | "reserve" | "cashflow" }) {
  const items = [
    { id: "home", label: "Anasayfa", icon: <HomeIcon /> },
    { id: "data", label: "Veri", icon: <DatabaseIcon /> },
    { id: "reserve", label: "Rezerv", icon: <StackIcon /> },
    { id: "cashflow", label: "Nakit Akışı", icon: <CashflowIcon /> },
  ];
  return (
    <aside className="mock-sidebar flex flex-col">
      <div className="h-14 flex items-center gap-2 px-4" style={{ borderBottom: "1px solid #e2e5ea" }}>
        <img src="/favicon.png" alt="" className="h-7 w-7" />
        <span className="text-[13px] font-semibold">Actuarius</span>
      </div>
      <nav className="p-2 flex-1">
        <div className="text-[10px] uppercase tracking-wide font-semibold px-2 py-2" style={{ color: "#64748b" }}>
          Modüller
        </div>
        <ul className="space-y-0.5">
          {items.map((it) => (
            <li key={it.id}>
              <div className={"mock-nav-item " + (it.id === active ? "active" : "")}>
                <span className="opacity-80 shrink-0">{it.icon}</span>
                <span className="flex-1">{it.label}</span>
              </div>
            </li>
          ))}
        </ul>
      </nav>
      <div className="p-2" style={{ borderTop: "1px solid #e2e5ea" }}>
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-md">
          <div className="w-[26px] h-[26px] rounded-full grid place-items-center text-[10px] font-semibold" style={{ background: "linear-gradient(135deg,#dbeafe,#ede9fe)", color: "#3730a3" }}>
            AE
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-medium leading-tight" style={{ color: "#0f172a" }}>aktuer</div>
            <div className="text-[10px] leading-tight" style={{ color: "#64748b" }}>✦ Pro</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function ReserveTabBar({ active }: { active: string }) {
  const tabs = [
    { id: "data", label: "Veri", sub: "Üçgen önizleme" },
    { id: "ldf", label: "LDF", sub: "Gelişim faktörleri" },
    { id: "curve", label: "Curve", sub: "CDF eğrisi" },
    { id: "ilr", label: "ILR", sub: "Loss ratio üçgeni" },
    { id: "bf", label: "BF", sub: "Bornhuetter–Ferguson" },
    { id: "ultimate", label: "Ultimate/IBNR", sub: "Rezerv projeksiyonu" },
    { id: "summary", label: "Özet", sub: "Model raporu" },
  ];
  return (
    <div>
      <div className="px-6 py-3 flex items-center gap-2 text-[12px]" style={{ borderBottom: "1px solid #e2e5ea", color: "#64748b" }}>
        <span style={{ color: "#0f172a" }} className="font-medium">Rezerv</span>
        <span style={{ color: "#cbd1d9" }}>/</span>
        <span>2025Q4</span>
        <span style={{ color: "#cbd1d9" }}>/</span>
        <span>Motor TPL</span>
      </div>
      <div className="mock-tabs overflow-x-auto">
        {tabs.map((t) => (
          <div key={t.id} className={"mock-tab " + (t.id === active ? "active" : "")}>
            {t.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function UltimateTabContent() {
  const rows = [
    { y: "2021", reported: "165.595", ibnr: "825", ult: "166.420" },
    { y: "2022", reported: "199.135", ibnr: "4.345", ult: "203.480" },
    { y: "2023", reported: "213.510", ibnr: "16.250", ult: "229.760" },
    { y: "2024", reported: "224.580", ibnr: "43.260", ult: "267.840" },
    { y: "2025", reported: "232.470", ibnr: "105.720", ult: "338.190" },
  ];
  return (
    <div>
      <div className="grid grid-cols-3 gap-3 mb-5">
        <MetricBox label="Reported" value="1.035.290" />
        <MetricBox label="IBNR" value={<CountUp to={170400} />} accent />
        <MetricBox label="Ultimate" value="1.205.690" />
      </div>
      <div className="lcard p-0 overflow-hidden">
        <div className="px-4 py-2.5 flex items-center justify-between" style={{ borderBottom: "1px solid #e2e5ea", background: "#f6f7f9" }}>
          <div className="text-[11.5px] font-semibold uppercase tracking-wider" style={{ color: "#64748b" }}>
            Origin Yılı Bazında
          </div>
          <div className="flex items-center gap-1.5">
            <span className="pill pill-info" style={{ fontSize: 11 }}>Chain-Ladder</span>
            <span className="text-[11px] font-medium px-2 py-0.5 rounded" style={{ background: "#f1f3f6", color: "#64748b" }}>Volume 5Y</span>
          </div>
        </div>
        <table className="w-full text-[12.5px]">
          <thead>
            <tr style={{ borderBottom: "1px solid #e2e5ea" }}>
              <th className="text-left px-4 py-2 text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: "#64748b" }}>Yıl</th>
              <th className="text-right px-4 py-2 text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: "#64748b" }}>Reported</th>
              <th className="text-right px-4 py-2 text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: "#64748b" }}>IBNR</th>
              <th className="text-right px-4 py-2 text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: "#64748b" }}>Ultimate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.y} style={{ borderBottom: "1px solid #f1f3f6" }}>
                <td className="px-4 py-2 font-semibold mono" style={{ color: "#0f172a" }}>{r.y}</td>
                <td className="px-4 py-2 text-right mono tabular-nums" style={{ color: "#475569" }}>{r.reported}</td>
                <td className="px-4 py-2 text-right mono tabular-nums font-medium" style={{ color: "#1d4ed8" }}>{r.ibnr}</td>
                <td className="px-4 py-2 text-right mono tabular-nums font-semibold" style={{ color: "#0f172a" }}>{r.ult}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MetricBox({ label, value, accent }: { label: string; value: ReactNode; accent?: boolean }) {
  return (
    <div className="lcard px-4 py-3" style={{ background: accent ? "#eaf0ff" : "#fff", borderColor: accent ? "#bfd3ff" : "#e2e5ea" }}>
      <div className="text-[10.5px] font-semibold uppercase tracking-wider mb-1" style={{ color: "#64748b" }}>
        {label}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[20px] font-bold tabular-nums mono" style={{ color: accent ? "#1d4ed8" : "#0f172a" }}>{value}</span>
        <span className="text-[11px] font-medium" style={{ color: "#64748b" }}>TL</span>
      </div>
    </div>
  );
}

// ─── Module Explorer ──────────────────────────────────────────────────────────

type ModuleKey = "reserve" | "cashflow" | "ifrs17" | "discount" | "agent";

const MODULE_DEFS: Record<ModuleKey, { name: string; status: "active" | "dev"; tagline: string; href?: string }> = {
  reserve: {
    name: "Rezerv Analizi",
    status: "active",
    tagline: "Üçgenden Ultimate'a, eksiksiz rezerv iş akışı",
    href: "/reserve",
  },
  cashflow: {
    name: "Nakit Akışı",
    status: "active",
    tagline: "CDF tabanlı CF pattern ve dönemsel projeksiyon",
    href: "/cashflow",
  },
  ifrs17: {
    name: "IFRS 17",
    status: "dev",
    tagline: "Sözleşme grubu bazlı muhasebeleştirme",
  },
  discount: {
    name: "İskonto",
    status: "dev",
    tagline: "Yield curve ile bugünkü değere indirgeme",
  },
  agent: {
    name: "AI Agent",
    status: "active",
    tagline: "Doğal dilde aktüer desteği",
  },
};

const MODULE_ORDER: ModuleKey[] = ["reserve", "cashflow", "discount", "ifrs17", "agent"];

function ModuleExplorer() {
  const [active, setActive] = useState<ModuleKey>("reserve");

  return (
    <section id="modules" className="py-10 md:py-12" style={{ background: "#f6f7f9", borderTop: "1px solid #e2e5ea", borderBottom: "1px solid #e2e5ea" }}>
      <div className="max-w-[1100px] mx-auto px-6 md:px-8">
        {/* Tab pills */}
        <div data-rv className="flex justify-center mb-5 flex-wrap gap-2">
          {MODULE_ORDER.map((k) => {
            const m = MODULE_DEFS[k];
            return (
              <button
                key={k}
                onClick={() => setActive(k)}
                className={"exp-tab " + (active === k ? "active " : "") + (m.status === "dev" ? "dev " : "")}
              >
                <span className="exp-tab-dot" />
                {m.name}
                {m.status === "dev" && (
                  <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ml-1" style={{ background: "#fef3c7", color: "#b45309" }}>
                    Yakında
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Active module content */}
        <div data-rv data-rvd={0.05}>
          {active === "reserve" && <ReserveExplorerContent />}
          {active === "cashflow" && <CashflowExplorerContent />}
          {active === "discount" && <ComingSoonContent moduleKey="discount" />}
          {active === "ifrs17" && <ComingSoonContent moduleKey="ifrs17" />}
          {active === "agent" && <AgentExplorerContent />}
        </div>
      </div>
    </section>
  );
}

function ExplorerLayout({
  badge,
  title,
  description,
  features,
  href,
  cta,
  children,
}: {
  badge: ReactNode;
  title: string;
  description: string;
  features: { t: string; d: string }[];
  href?: string;
  cta?: string;
  children: ReactNode;
}) {
  return (
    <div className="fi">
      {/* Top row: meta + title + cta */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-4 mb-5">
        <div className="flex-1 flex items-center gap-4">
          <div>{badge}</div>
          <h3
            className="text-[22px] md:text-[26px] font-bold tracking-tight"
            style={{ color: "#0f172a", letterSpacing: "-0.02em" }}
          >
            {title}
          </h3>
        </div>
        {href && cta && (
          <Link href={href} className="btn-primary shrink-0">
            {cta}
            <Arrow />
          </Link>
        )}
      </div>

      {/* Feature chips */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {features.map((f) => (
          <div
            key={f.t}
            className="lcard px-4 py-2.5 flex items-center gap-2"
          >
            <div
              className="w-5 h-5 rounded flex items-center justify-center shrink-0"
              style={{ background: "#eaf0ff" }}
            >
              <CheckIcon color="#1d4ed8" size={11} />
            </div>
            <div className="text-[13px] font-semibold" style={{ color: "#0f172a" }}>
              {f.t}
            </div>
          </div>
        ))}
      </div>

      {/* Full-width preview */}
      {children}
    </div>
  );
}

function ReserveExplorerContent() {
  return (
    <ExplorerLayout
      badge={<span className="pill pill-active"><span className="w-1.5 h-1.5 rounded-full" style={{ background: "#15803d" }} />Aktif</span>}
      title="Rezerv Analizi"
      description="Chain-Ladder ve Bornhuetter–Ferguson. Dört parametrik tail modeli, ILR ısı haritası, LDF window seçimi, hücre eleme ve manuel override. Origin yılı bazlı CL/BF basis seçimi ile profesyonel rezerv analizi."
      features={[
        { t: "İki temel yöntem", d: "Chain-Ladder ve Bornhuetter–Ferguson, origin bazlı basis seçimiyle karşılaştırma." },
        { t: "Parametrik tail fitting", d: "Exponential, Inverse Power, Power ve Weibull modelleri. Period bazlı model seçimi." },
        { t: "ILR ısı haritası", d: "Hasar/(Prim × Düzeltme) oranı ile anormal gelişim örüntülerinin tespiti." },
        { t: "Esnek LDF kontrolü", d: "Volume veya simple average, window seçimi, hücre eleme, manuel override." },
      ]}
      href="/reserve"
      cta="Modüle git"
    >
      <ReservePreview />
    </ExplorerLayout>
  );
}

function CashflowExplorerContent() {
  return (
    <ExplorerLayout
      badge={<span className="pill pill-active"><span className="w-1.5 h-1.5 rounded-full" style={{ background: "#15803d" }} />Aktif</span>}
      title="Nakit Akışı"
      description="Rezerv modülünün sonuçlarından CDF tabanlı CF pattern üretir. Kalan rezervin gelecek çeyrek ve aylara dağılımını rapor dönemine göre hesaplar. Çeyreklik ve aylık projeksiyon, branş bazlı pattern."
      features={[
        { t: "Rezerv ile tam senkron", d: "LDF seçimleriniz değiştiğinde CF pattern otomatik güncellenir." },
        { t: "Rapor dönemine duyarlı", d: "Period offset doğru hesaplanır — Q1 raporu için Q2'den itibaren projeksiyon." },
        { t: "Çeyreklik ve aylık", d: "Aynı temel pattern üzerinden iki farklı granülerlikte dağılım." },
        { t: "Branş bazlı pattern", d: "Her branşın kendi tail karakteristiğine göre ayrı projeksiyon." },
      ]}
      href="/cashflow"
      cta="Modüle git"
    >
      <CashflowPreview />
    </ExplorerLayout>
  );
}

function ComingSoonContent({ moduleKey }: { moduleKey: "ifrs17" | "discount" }) {
  const content = {
    ifrs17: {
      title: "IFRS 17",
      description:
        "GMM, PAA ve VFA yaklaşımlarıyla sözleşme grubu bazlı muhasebeleştirme. CSM amortismanı, risk düzeltmesi ve IFRS 17 uyumlu disclosure raporlaması.",
      features: [
        { t: "GMM / PAA / VFA", d: "Üç yaklaşımın tamamı, sözleşme grubu seviyesinde." },
        { t: "CSM amortismanı", d: "Coverage unit bazlı CSM dağılımı ve revize edilmiş tahmin etkisi." },
        { t: "Risk düzeltmesi", d: "Cost of Capital yaklaşımıyla risk margin hesaplaması." },
        { t: "Uyumlu disclosure", d: "Notlar için hazır tablo ve hareket analizleri." },
      ],
      preview: <ComingSoonPreview module="IFRS 17" eta="Q1 2027" />,
    },
    discount: {
      title: "İskonto",
      description:
        "Nakit akışlarının risk-free eğri veya şirket iskonto eğrisiyle bugünkü değere indirgenmesi. IFRS 17 modülü ile entegre çalışır.",
      features: [
        { t: "Risk-free eğri", d: "TCMB veya kullanıcı tanımlı eğri girdileri." },
        { t: "Yield curve uygulaması", d: "Süre uyumlu iskonto faktörleri." },
        { t: "Liquidity premium", d: "Eğri üzerine likidite primi ekleme." },
        { t: "Duyarlılık analizi", d: "Eğri parametrelerine göre PV duyarlılığı." },
      ],
      preview: <ComingSoonPreview module="İskonto" eta="Q4 2026" />,
    },
  }[moduleKey];

  return (
    <ExplorerLayout
      badge={<span className="pill pill-dev">Geliştiriliyor</span>}
      title={content.title}
      description={content.description}
      features={content.features}
    >
      {content.preview}
    </ExplorerLayout>
  );
}

// ─── Reserve preview (real app shell) ─────────────────────────────────────────

function ReservePreview() {
  const [tab, setTab] = useState<"ldf" | "ilr" | "ultimate">("ldf");

  const allTabs = [
    { id: "veri", label: "Veri" },
    { id: "ldf", label: "LDF" },
    { id: "curve", label: "Curve" },
    { id: "ilr", label: "ILR" },
    { id: "bf", label: "BF" },
    { id: "ultimate", label: "Ultimate/IBNR" },
    { id: "summary", label: "Özet" },
  ];

  return (
    <div className="mock">
      {/* breadcrumb */}
      <div
        className="px-6 py-2.5 flex items-center gap-2 text-[12px]"
        style={{ borderBottom: "1px solid #e2e5ea", background: "#f6f7f9", color: "#64748b" }}
      >
        <span style={{ color: "#0f172a" }} className="font-medium">Rezerv</span>
        <span style={{ color: "#cbd1d9" }}>/</span>
        <span>2025Q4</span>
        <span style={{ color: "#cbd1d9" }}>/</span>
        <span>Motor TPL</span>
      </div>

      {/* tab bar — clicking LDF / ILR / Ultimate switches content */}
      <div className="mock-tabs overflow-x-auto" style={{ background: "#fff" }}>
        {allTabs.map((t) => {
          const isActive =
            t.id === tab || (t.id === "veri" && false) || (t.id === "curve" && false);
          const isClickable = t.id === "ldf" || t.id === "ilr" || t.id === "ultimate";
          return (
            <button
              key={t.id}
              onClick={isClickable ? () => setTab(t.id as "ldf" | "ilr" | "ultimate") : undefined}
              className={"mock-tab " + (t.id === tab ? "active" : "")}
              style={{ cursor: isClickable ? "pointer" : "default" }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* content */}
      <div className="p-6 bg-white">
        {tab === "ldf" && <LDFTabContent />}
        {tab === "ilr" && <ILRTabContent />}
        {tab === "ultimate" && <UltimateTabContent />}
      </div>
    </div>
  );
}

function LDFTabContent() {
  const rows = [
    { y: "2021", v: ["1.638", "1.091", "1.041", "1.018", "1.005"] },
    { y: "2022", v: ["1.721", "1.102", "1.049", "1.021", "—"] },
    { y: "2023", v: ["1.684", "1.118", "1.051", "—", "—"] },
    { y: "2024", v: ["1.702", "1.095", "—", "—", "—"] },
    { y: "2025", v: ["1.631", "—", "—", "—", "—"] },
  ];
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-[11px] font-medium px-2.5 py-1 rounded-md" style={{ background: "#eaf0ff", color: "#1d4ed8" }}>Volume</span>
        <span className="text-[11px] font-medium px-2.5 py-1 rounded-md" style={{ background: "#f1f3f6", color: "#64748b" }}>Simple</span>
        <span className="text-[11px] font-medium px-2.5 py-1 rounded-md" style={{ background: "#f1f3f6", color: "#64748b" }}>5Y window</span>
        <span className="text-[11px] font-medium ml-auto" style={{ color: "#64748b" }}>5 origin · 5 dev</span>
      </div>
      <div className="lcard p-0 overflow-hidden">
        <table className="w-full text-[12.5px] mono">
          <thead>
            <tr style={{ borderBottom: "1px solid #e2e5ea", background: "#f6f7f9" }}>
              <th className="text-left px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: "#64748b" }}>Origin</th>
              {["12→24", "24→36", "36→48", "48→60", "60→tail"].map((m) => (
                <th key={m} className="text-right px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: "#64748b" }}>{m}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.y} style={{ borderBottom: "1px solid #f1f3f6" }}>
                <td className="px-3 py-1.5 font-semibold" style={{ color: "#0f172a" }}>{r.y}</td>
                {r.v.map((c, j) => (
                  <td key={j} className="text-right px-3 py-1.5 tabular-nums" style={{ color: c === "—" ? "#cbd1d9" : "#475569" }}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
            <tr style={{ background: "#f6f7f9", borderTop: "2px solid #e2e5ea" }}>
              <td className="px-3 py-2 text-[10.5px] font-bold uppercase tracking-wider" style={{ color: "#1d4ed8" }}>Seçili</td>
              {["1,412", "1,083", "1,031", "1,012", "1,004"].map((v, i) => (
                <td key={i} className="text-right px-3 py-2 tabular-nums font-bold" style={{ color: "#1d4ed8" }}>{v}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ILRTabContent() {
  const rows: { y: string; vals: (number | null)[] }[] = [
    { y: "2020", vals: [1.4, 3.2, 9.4, 11.3, 12.8, 12.6, 10.3] },
    { y: "2021", vals: [28.3, 7.1, 14.4, 32.5, 27.6, 23.5, 29.4] },
    { y: "2022", vals: [3.5, 3.0, 17.6, 14.6, 14.5, 14.3, null] },
    { y: "2023", vals: [12.6, 15.2, 26.9, 23.1, 30.8, null, null] },
    { y: "2024", vals: [4.4, 16.3, 18.3, 22.8, null, null, null] },
    { y: "2025", vals: [8.3, 34.9, 42.0, 60.3, 86.8, null, null] },
  ];
  const heat = (v: number) => {
    if (v >= 80) return { bg: "#fee2e2", color: "#991b1b", w: 700 };
    if (v >= 40) return { bg: "#ffedd5", color: "#c2410c", w: 600 };
    if (v >= 25) return { bg: "#fef3c7", color: "#a16207", w: 500 };
    if (v >= 12) return { bg: "#eaf0ff", color: "#1e40af", w: 500 };
    return { bg: "transparent", color: "#64748b", w: 400 };
  };
  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <span className="text-[11px] font-medium" style={{ color: "#64748b" }}>Hasar / (Prim × Düz.) %</span>
        <div className="flex items-center gap-3 ml-auto">
          {[
            ["#eaf0ff", "Normal"],
            ["#fef3c7", "Yüksek"],
            ["#ffedd5", "Çok yüksek"],
            ["#fee2e2", "Anomali"],
          ].map(([c, l]) => (
            <span key={l} className="flex items-center gap-1.5 text-[10.5px]" style={{ color: "#64748b" }}>
              <span className="w-3 h-3 rounded-sm" style={{ background: c, border: "1px solid #e2e5ea" }} />
              {l}
            </span>
          ))}
        </div>
      </div>
      <div className="lcard p-3">
        <table className="w-full text-[12px] mono tabular-nums" style={{ borderCollapse: "separate", borderSpacing: "2px" }}>
          <thead>
            <tr>
              <th className="text-left px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#64748b" }}>Yıl</th>
              {Array.from({ length: 7 }).map((_, i) => (
                <th key={i} className="text-right px-2 py-1.5 text-[10px] font-semibold" style={{ color: "#64748b" }}>{i + 1}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.y}>
                <td className="px-2 py-1.5 font-semibold text-[11.5px]" style={{ color: "#0f172a" }}>{r.y}</td>
                {r.vals.map((v, j) =>
                  v == null ? (
                    <td key={j} className="text-right px-2 py-1.5 rounded" style={{ color: "#e2e5ea" }}>—</td>
                  ) : (
                    <td key={j} className="text-right px-2 py-1.5 rounded" style={{ background: heat(v).bg, color: heat(v).color, fontWeight: heat(v).w }}>
                      {v.toFixed(1)}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Cashflow preview ─────────────────────────────────────────────────────────

function CashflowPreview() {
  return (
    <div className="mock">
      {/* breadcrumb */}
      <div
        className="px-6 py-2.5 flex items-center gap-2 text-[12px]"
        style={{ borderBottom: "1px solid #e2e5ea", background: "#f6f7f9", color: "#64748b" }}
      >
        <span style={{ color: "#0f172a" }} className="font-medium">Nakit Akışı</span>
        <span style={{ color: "#cbd1d9" }}>/</span>
        <span>2026Q1</span>
        <span style={{ color: "#cbd1d9" }}>/</span>
        <span>Motor TPL</span>
      </div>
      <div className="p-6 bg-white">
        <CFChartContent />
      </div>
    </div>
  );
}

function CFChartContent() {
  const data = [
    { l: "2026Q2", p: 18, v: "1.840" },
    { l: "2026Q3", p: 32, v: "3.275" },
    { l: "2026Q4", p: 48, v: "4.910" },
    { l: "2027Q1", p: 62, v: "6.345" },
    { l: "2027Q2", p: 71, v: "7.265" },
    { l: "2027Q3", p: 58, v: "5.935" },
    { l: "2027Q4", p: 46, v: "4.705" },
    { l: "2028Q1", p: 36, v: "3.685" },
  ];
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-[15px] font-semibold" style={{ color: "#0f172a" }}>CF Pattern Projeksiyonu</div>
          <div className="text-[11.5px] mt-0.5" style={{ color: "#64748b" }}>Rapor dönemi: 2026Q1 · Tüm origin yılları</div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="pill pill-info" style={{ fontSize: 11 }}>Çeyreklik</span>
          <span className="text-[11px] font-medium px-2.5 py-1 rounded" style={{ background: "#f1f3f6", color: "#64748b" }}>Aylık</span>
        </div>
      </div>
      <div className="space-y-2">
        {data.map((b) => (
          <div key={b.l} className="flex items-center gap-3 text-[12px]">
            <span className="w-14 shrink-0 mono font-medium" style={{ color: "#475569" }}>{b.l}</span>
            <div className="flex-1 h-5 rounded relative overflow-hidden" style={{ background: "#f1f3f6" }}>
              <div className="absolute inset-y-0 left-0 rounded" style={{ width: `${b.p}%`, background: "#1d4ed8" }} />
            </div>
            <span className="w-14 text-right mono tabular-nums font-semibold" style={{ color: "#0f172a" }}>{b.v}</span>
          </div>
        ))}
      </div>
      <div className="mt-5 pt-4 grid grid-cols-3 gap-3" style={{ borderTop: "1px solid #e2e5ea" }}>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "#64748b" }}>Toplam</div>
          <div className="text-[15px] font-bold tabular-nums mono" style={{ color: "#0f172a" }}>37.960 TL</div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "#64748b" }}>Tepe</div>
          <div className="text-[15px] font-bold tabular-nums mono" style={{ color: "#0f172a" }}>2027Q2</div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "#64748b" }}>Ort. süre</div>
          <div className="text-[15px] font-bold tabular-nums mono" style={{ color: "#0f172a" }}>5.4 ç.</div>
        </div>
      </div>
    </div>
  );
}

// ─── Coming soon preview ──────────────────────────────────────────────────────

function ComingSoonPreview({ module, eta }: { module: string; eta: string }) {
  return (
    <div className="mock" style={{ minHeight: 340, display: "flex", alignItems: "center", justifyContent: "center", padding: 48 }}>
      <div className="text-center max-w-sm">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-5" style={{ background: "#fef3c7" }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="9" stroke="#b45309" strokeWidth="2" />
            <path d="M12 7v5l3 2" stroke="#b45309" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
        <div className="text-[20px] font-bold mb-2" style={{ color: "#0f172a" }}>
          {module} modülü geliştiriliyor
        </div>
        <p className="text-[14px] leading-relaxed mb-5" style={{ color: "#64748b" }}>
          Aktif geliştirme aşamasındayız. Pro plan kullanıcılarımız modül yayınlandığında otomatik
          olarak erken erişim kazanır.
        </p>
        <div className="inline-flex items-center gap-2 text-[12.5px] font-semibold px-3 py-1.5 rounded-md" style={{ background: "#fef3c7", color: "#b45309", border: "1px solid #fde68a" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
          </svg>
          Beklenen: {eta}
        </div>
      </div>
    </div>
  );
}

// ─── Agent Explorer (tab in ModuleExplorer) ──────────────────────────────────

function AgentExplorerContent() {
  return (
    <div className="fi flex flex-col lg:flex-row gap-6 lg:h-[420px]">
      {/* Left: feature list */}
      <div className="lg:w-72 shrink-0 space-y-3 lg:overflow-y-auto">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-8 w-8 rounded-lg grid place-items-center shrink-0" style={{ background: "#1d4ed8" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M12 2a5 5 0 1 1 0 10A5 5 0 0 1 12 2zm0 13c-5.33 0-8 2.67-8 4v1h16v-1c0-1.33-2.67-4-8-4z" fill="white" />
            </svg>
          </div>
          <div>
            <div className="text-[15px] font-bold" style={{ color: "#0f172a" }}>AI Aktüer Agent</div>
            <div className="text-[12px]" style={{ color: "#64748b" }}>Tüm modüllerde çalışır</div>
          </div>
        </div>
        {[
          { t: "Senaryo analizi", d: "Komutları doğrudan uygular" },
          { t: "Sonuç yorumu", d: "IBNR & LR değişimini açıklar" },
          { t: "Formül desteği", d: "A priori LR, tail model seçimi" },
          { t: "Veri güvenliği", d: "Ham veri LLM'e iletilmez" },
        ].map((f) => (
          <div key={f.t} className="lcard px-4 py-3 flex items-start gap-3">
            <div className="w-5 h-5 rounded flex items-center justify-center shrink-0 mt-0.5" style={{ background: "#eaf0ff" }}>
              <CheckIcon color="#1d4ed8" size={11} />
            </div>
            <div>
              <div className="text-[13px] font-semibold" style={{ color: "#0f172a" }}>{f.t}</div>
              <div className="text-[12px]" style={{ color: "#64748b" }}>{f.d}</div>
            </div>
          </div>
        ))}
        <Link href="/reserve" className="btn-primary w-full justify-center mt-2">
          Deneyin
          <Arrow />
        </Link>
      </div>
      {/* Right: chat mock same height as left */}
      <div className="flex-1 min-w-0 flex flex-col">
        <ChatPanelMock />
      </div>
    </div>
  );
}

// ─── Agent (matches real ChatPanel) ───────────────────────────────────────────

function AgentSection() {
  return (
    <section id="agent" className="py-24 md:py-28">
      <div className="max-w-5xl mx-auto px-6 md:px-8">
        {/* Centered header */}
        <div className="text-center max-w-2xl mx-auto mb-10" data-rv>
          <div className="eyebrow">AI Aktüer Agent</div>
          <h2 className="text-[36px] md:text-[44px] font-bold tracking-tight mb-4" style={{ color: "#0f172a", letterSpacing: "-0.025em" }}>
            Doğal dilde aktüer desteği
          </h2>
          <p className="text-[17px] leading-relaxed" style={{ color: "#475569" }}>
            Tüm modüllerde çalışan tek Agent. Soru sorun, senaryo çalıştırın, sonucu yorumlayın —
            veya uygulamayı doğrudan Agent&apos;a bırakın.
          </p>
        </div>

        {/* Feature chips */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10" data-rv data-rvd={0.05}>
          {[
            { t: "Senaryo analizi", d: "Komutları doğrudan uygular" },
            { t: "Sonuç yorumu", d: "IBNR & LR değişimini açıklar" },
            { t: "Formül desteği", d: "A priori LR, tail model seçimi" },
            { t: "Veri güvenliği", d: "Ham veri LLM&apos;e iletilmez" },
          ].map((f) => (
            <div key={f.t} className="lcard px-4 py-3 flex items-start gap-3">
              <div className="w-6 h-6 rounded flex items-center justify-center shrink-0 mt-0.5" style={{ background: "#eaf0ff" }}>
                <CheckIcon color="#1d4ed8" size={11} />
              </div>
              <div>
                <div className="text-[13px] font-semibold mb-0.5" style={{ color: "#0f172a" }}>{f.t}</div>
                <div className="text-[12px]" style={{ color: "#64748b" }} dangerouslySetInnerHTML={{ __html: f.d }} />
              </div>
            </div>
          ))}
        </div>

        {/* Chat panel — centered, wider */}
        <div data-rv data-rvd={0.1}>
          <ChatPanelMock />
        </div>
      </div>
    </section>
  );
}

type Msg = { role: "user" | "agent"; text: string };

function ChatPanelMock() {
  const ALL: Msg[] = [
    { role: "user", text: "2024 ve 2025 için BF kullansak toplam IBNR kaç değişir?" },
    {
      role: "agent",
      text: "BF basis'e geçince toplam IBNR 107,1M TL'den 94,3M TL'ye düşüyor (−12,8M, %12).\n\nA priori LR olarak vw(2021–2023) = %68,4 hesaplandı. 2024 origin yılı için ultimate 184,6M, 2025 için 156,2M.\n\nUygulamamı ister misiniz?",
    },
    { role: "user", text: "Evet, uygula." },
    {
      role: "agent",
      text: "Tamamlandı.\n\n• 2024–2025 BF basis'e geçirildi\n• Selected IBNR: 94,3M TL\n• Toplam ultimate: 542,7M TL",
    },
  ];

  const [shown, setShown] = useState<Msg[]>([]);
  const [typing, setTyping] = useState(false);
  const [partial, setPartial] = useState("");
  const aliveRef = useRef(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [shown, typing, partial]);

  useEffect(() => {
    aliveRef.current = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const wait = (ms: number) =>
      new Promise<void>((r) => {
        const id = setTimeout(() => {
          if (aliveRef.current) r();
        }, ms);
        timers.push(id);
      });
    const typeOut = async (text: string, speed = 14) => {
      for (let i = 1; i <= text.length; i++) {
        if (!aliveRef.current) return;
        setPartial(text.slice(0, i));
        await wait(speed);
      }
    };
    (async function loop() {
      while (aliveRef.current) {
        setShown([]);
        setPartial("");
        setTyping(false);
        await wait(700);
        for (let i = 0; i < ALL.length; i++) {
          if (!aliveRef.current) return;
          const m = ALL[i];
          if (m.role === "user") {
            setShown((p) => [...p, m]);
            await wait(900);
          } else {
            setTyping(true);
            await wait(700);
            setTyping(false);
            await typeOut(m.text);
            setShown((p) => [...p, m]);
            setPartial("");
            await wait(900);
          }
        }
        await wait(6000);
      }
    })();
    return () => {
      aliveRef.current = false;
      timers.forEach(clearTimeout);
    };
  }, []);

  return (
    <div className="lcard" style={{ overflow: "hidden", boxShadow: "0 20px 50px rgba(15,23,42,.08)", width: "100%", display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header — matches ChatPanel */}
      <div className="flex items-center gap-3 px-4 h-14" style={{ borderBottom: "1px solid #e2e5ea" }}>
        <div className="flex items-center gap-2.5 flex-1">
          <div className="h-7 w-7 rounded-lg grid place-items-center" style={{ background: "#1d4ed8" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M12 2a5 5 0 1 1 0 10A5 5 0 0 1 12 2zm0 13c-5.33 0-8 2.67-8 4v1h16v-1c0-1.33-2.67-4-8-4z" fill="white" />
            </svg>
          </div>
          <span className="text-sm font-semibold tracking-tight" style={{ color: "#0f172a" }}>Actuarius</span>
        </div>
        <div className="flex items-center gap-1.5">
          <select
            disabled
            className="h-6 rounded-md text-[11px] px-1.5 outline-none"
            style={{ background: "#f1f3f6", border: "1px solid #e2e5ea", color: "#475569" }}
            defaultValue="claude-sonnet"
          >
            <option>Claude Sonnet 4.6</option>
          </select>
        </div>
      </div>

      {/* Active context strip — matches ChatPanel */}
      <div className="flex items-center gap-2 px-4 h-8 text-xs" style={{ borderBottom: "1px solid #e2e5ea", background: "#f1f3f6", color: "#475569" }}>
        <span className="font-medium" style={{ color: "#0f172a" }}>Motor TPL</span>
        <span style={{ color: "#cbd1d9" }}>·</span>
        <span>2025Q4</span>
        <span style={{ color: "#cbd1d9" }}>·</span>
        <span>Yıllık</span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="p-4 space-y-5 flex-1 overflow-y-auto overflow-x-hidden">
        {shown.map((m, i) => (
          <ChatBubble key={i} msg={m} />
        ))}
        {typing && (
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-full grid place-items-center shrink-0" style={{ background: "#1d4ed8" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <path d="M12 2a5 5 0 1 1 0 10A5 5 0 0 1 12 2zm0 13c-5.33 0-8 2.67-8 4v1h16v-1c0-1.33-2.67-4-8-4z" fill="white" />
              </svg>
            </div>
            <div className="rounded-2xl px-4 py-3 flex items-center gap-1" style={{ background: "#f1f3f6", border: "1px solid #e2e5ea", borderTopLeftRadius: 4 }}>
              <span className="bdot" />
              <span className="bdot" />
              <span className="bdot" />
            </div>
          </div>
        )}
        {partial && (
          <div className="flex justify-start w-full">
            <div className="flex items-start gap-0 min-w-0 w-full">
              <div className="h-6 w-6 rounded-full grid place-items-center shrink-0 mt-0.5 mr-2" style={{ background: "#1d4ed8" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2a5 5 0 1 1 0 10A5 5 0 0 1 12 2zm0 13c-5.33 0-8 2.67-8 4v1h16v-1c0-1.33-2.67-4-8-4z" fill="white" />
                </svg>
              </div>
              <div className="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap" style={{ background: "#f1f3f6", border: "1px solid #e2e5ea", color: "#0f172a", borderTopLeftRadius: 4 }}>
                {partial}
                <span className="cursor" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input — matches ChatPanel */}
      <div className="px-4 py-3 shrink-0" style={{ borderTop: "1px solid #e2e5ea" }}>
        <div className="flex items-end gap-2">
          <div className="flex-1 rounded-md px-3 py-2 text-[13px]" style={{ background: "#fff", border: "1px solid #e2e5ea", color: "#94a3b8" }}>
            Bir soru sorun veya komut verin…
          </div>
          <button className="shrink-0 h-[38px] w-[38px] rounded-lg grid place-items-center" style={{ background: "#1d4ed8" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="m5 12 14-7-3.5 19L12 13 5 12Z" stroke="white" strokeWidth="1.8" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <div className="text-[10px] mt-1.5 text-right" style={{ color: "#94a3b8" }}>
          Enter ile gönder · Shift+Enter yeni satır
        </div>
      </div>
    </div>
  );
}

function ChatBubble({ msg }: { msg: Msg }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end w-full">
        <div className="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap" style={{ background: "#1d4ed8", color: "#fff", borderTopRightRadius: 4 }}>
          {msg.text}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start w-full">
      <div className="flex items-start gap-0 min-w-0 w-full">
        <div className="h-6 w-6 rounded-full grid place-items-center shrink-0 mt-0.5 mr-2" style={{ background: "#1d4ed8" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M12 2a5 5 0 1 1 0 10A5 5 0 0 1 12 2zm0 13c-5.33 0-8 2.67-8 4v1h16v-1c0-1.33-2.67-4-8-4z" fill="white" />
          </svg>
        </div>
        <div className="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap" style={{ background: "#f1f3f6", border: "1px solid #e2e5ea", color: "#0f172a", borderTopLeftRadius: 4 }}>
          {msg.text}
        </div>
      </div>
    </div>
  );
}

// ─── Security ─────────────────────────────────────────────────────────────────

function Security() {
  const items = [
    { icon: <LockBigIcon />, t: "Şifreli depolama", d: "Veriler Cloudflare D1 üzerinde şifreli olarak saklanır. Bağlantılar TLS 1.3 ile korunur." },
    { icon: <ShieldIcon />, t: "Firebase Authentication", d: "Endüstri standardı kimlik doğrulama. Google ile giriş ve şifre tabanlı seçenekler." },
    { icon: <EyeOffIcon />, t: "Ham veri LLM'e gitmez", d: "AI Agent yalnızca agrega sonuçlara (LDF, CDF, IBNR) erişir. Ham üçgen verisi dış servise iletilmez." },
    { icon: <ServerIcon />, t: "Veri izolasyonu", d: "Her kullanıcının verisi izole edilir. Enterprise plana özel on-premise kurulum mevcuttur." },
  ];
  return (
    <section id="security" className="py-24 md:py-28" style={{ background: "#f6f7f9", borderTop: "1px solid #e2e5ea", borderBottom: "1px solid #e2e5ea" }}>
      <div className="max-w-6xl mx-auto px-6 md:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12" data-rv>
          <div className="eyebrow">Güvenlik</div>
          <h2 className="text-[32px] md:text-[40px] font-bold tracking-tight mb-4" style={{ color: "#0f172a", letterSpacing: "-0.025em" }}>
            Verileriniz güvende
          </h2>
          <p className="text-[16px] leading-relaxed" style={{ color: "#475569" }}>
            Aktüeryal veri hassastır. Actuarius&apos;ı güvenliği önceleyerek inşa ettik —
            şifreleme, kimlik doğrulama ve veri izolasyonu temel mimaride.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {items.map((it, i) => (
            <div key={it.t} data-rv data-rvd={i * 0.06} className="lcard lcard-h p-6 flex items-start gap-4">
              <div className="w-11 h-11 rounded-lg flex items-center justify-center shrink-0" style={{ background: "#eaf0ff" }}>
                {it.icon}
              </div>
              <div>
                <div className="text-[15px] font-semibold mb-1.5" style={{ color: "#0f172a" }}>{it.t}</div>
                <div className="text-[13.5px] leading-relaxed" style={{ color: "#475569" }}>{it.d}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Pricing ──────────────────────────────────────────────────────────────────

const PLANS = [
  {
    name: "Free",
    price: "₺0",
    sub: "Kalıcı ücretsiz",
    desc: "Küçük portföyler ve platformu keşfetmek için.",
    cta: "Ücretsiz Başla",
    href: "/reserve",
    featured: false,
    features: [
      { v: "Rezerv modülü", n: "1 dönem · 1 branş" },
      { v: "Chain-Ladder & BF", n: "İki temel yöntem" },
      { v: "AI Aktüer Agent", n: "Sınırsız mesaj" },
      { v: "Excel export", n: "Temel format" },
    ],
    missing: ["Parametrik tail fitting", "Nakit akışı modülü", "Sınırsız dönem & branş"],
  },
  {
    name: "Pro",
    price: "₺100",
    sub: "/ ay",
    desc: "Profesyonel aktüerler için tam kapsamlı.",
    cta: "Pro'ya Geç",
    href: "/onboarding/plan",
    featured: true,
    features: [
      { v: "Sınırsız dönem & branş", n: "Limit yok" },
      { v: "Parametrik tail fitting", n: "4 model" },
      { v: "Nakit akışı modülü", n: "CDF tabanlı CF" },
      { v: "AI Aktüer Agent", n: "Sınırsız" },
      { v: "Erken erişim", n: "IFRS 17 & İskonto" },
      { v: "Gelişmiş Excel export", n: "Çok sayfalı rapor" },
      { v: "Öncelikli destek", n: "" },
    ],
    missing: [],
  },
  {
    name: "Enterprise",
    price: "Özel",
    sub: "Talebe göre",
    desc: "Ekip kullanımı, özel entegrasyon ve SLA.",
    cta: "İletişime Geç",
    href: "mailto:demireleren877@gmail.com",
    featured: false,
    features: [
      { v: "Pro'nun tüm özellikleri", n: "Tam erişim" },
      { v: "Çoklu kullanıcı & roller", n: "Sınırsız" },
      { v: "SSO / SAML", n: "Kurumsal kimlik" },
      { v: "On-premise / özel cloud", n: "İsteğe bağlı" },
      { v: "API erişimi", n: "REST & webhook" },
      { v: "Özel SLA", n: "" },
    ],
    missing: [],
  },
];

function Pricing() {
  return (
    <section id="pricing" className="py-24 md:py-28">
      <div className="max-w-6xl mx-auto px-6 md:px-8">
        <div className="text-center max-w-2xl mx-auto mb-14" data-rv>
          <div className="eyebrow">Fiyatlandırma</div>
          <h2 className="text-[36px] md:text-[44px] font-bold tracking-tight mb-4" style={{ color: "#0f172a", letterSpacing: "-0.025em" }}>
            Şeffaf ve esnek fiyatlandırma
          </h2>
          <p className="text-[17px] leading-relaxed" style={{ color: "#475569" }}>
            Free planla ücretsiz başlayın. İhtiyacınız arttığında Pro&apos;ya geçin, dilediğiniz
            zaman değiştirin. Aylık abonelik, gizli ücret yok.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
          {PLANS.map((p, i) => (
            <div key={p.name} data-rv data-rvd={i * 0.08}>
              <PlanCard {...p} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PlanCard({ name, price, sub, desc, cta, href, featured, features, missing }: (typeof PLANS)[number]) {
  return (
    <div className={"lcard p-7 flex flex-col h-full " + (featured ? "plan-featured" : "")} style={{ background: "#fff" }}>
      <div className="mb-5">
        <div className="text-[14px] font-semibold mb-3" style={{ color: featured ? "#1d4ed8" : "#475569" }}>
          {name}
        </div>
        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-[40px] font-bold tabular-nums" style={{ color: "#0f172a", letterSpacing: "-0.03em" }}>{price}</span>
          {sub && <span className="text-[13px]" style={{ color: "#64748b" }}>{sub}</span>}
        </div>
        <p className="text-[13.5px] leading-relaxed" style={{ color: "#475569" }}>{desc}</p>
      </div>

      <Link
        href={href}
        className="block text-center py-2.5 rounded-md text-[14px] font-semibold mb-6"
        style={{
          background: featured ? "#1d4ed8" : "#fff",
          color: featured ? "#fff" : "#0f172a",
          border: featured ? "1px solid #1d4ed8" : "1px solid #cbd1d9",
        }}
      >
        {cta}
      </Link>

      <div className="space-y-3 flex-1">
        {features.map((f) => (
          <div key={f.v} className="flex items-start gap-2.5">
            <CheckIcon color="#1d4ed8" size={14} />
            <div>
              <div className="text-[13.5px] font-medium" style={{ color: "#0f172a" }}>{f.v}</div>
              {f.n && <div className="text-[12px]" style={{ color: "#64748b" }}>{f.n}</div>}
            </div>
          </div>
        ))}
        {missing.map((f) => (
          <div key={f} className="flex items-start gap-2.5" style={{ color: "#9ca3af" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="mt-0.5 shrink-0">
              <path d="M6 12h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <div className="text-[13.5px]">{f}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── FAQ ──────────────────────────────────────────────────────────────────────

const FAQ_ITEMS = [
  {
    q: "Actuarius nedir ve kimler için tasarlandı?",
    a: "Actuarius, sigorta aktüerlerinin günlük iş akışını tek platforma taşıyan bir SaaS ürünüdür. Hasar rezervi hesaplayan aktüerlerden IFRS 17 raporlaması yapan ekiplere kadar — Excel'den ve sayfalar arası manuel veri taşımaktan kurtulmak isteyen profesyonel aktüerler için.",
  },
  {
    q: "Şu anda hangi modüller kullanılabilir?",
    a: "Rezerv Analizi ve Nakit Akışı modülleri tam aktiftir. Rezerv modülünde Chain-Ladder, Bornhuetter–Ferguson, 4 parametrik tail modeli (Exponential, Inverse Power, Power, Weibull), ILR ısı haritası ve AI Agent yer alır. Nakit Akışı modülü rezerv sonuçlarınızdan CDF tabanlı CF pattern üretir ve çeyreklik/aylık projeksiyon verir.",
  },
  {
    q: "IFRS 17 ve İskonto modülleri ne zaman hazır olacak?",
    a: "Her iki modül de aktif geliştirme aşamasındadır. IFRS 17 modülü GMM, PAA ve VFA yaklaşımlarını, CSM amortismanını ve risk düzeltmesini destekleyecek. İskonto modülü risk-free eğri, yield curve uygulaması ve IFRS 17 ile entegre iskonto sunacak. Pro plan kullanıcılarımız her iki modüle erken erişim kazanır.",
  },
  {
    q: "Verilerim güvende mi? Yapay zeka verilere erişiyor mu?",
    a: "Verileriniz Cloudflare D1 üzerinde şifreli olarak saklanır ve bağlantılar TLS 1.3 ile korunur. AI Agent ham üçgen verisine erişemez; yalnızca LDF, CDF ve IBNR gibi agrega sonuçları görür. Ham veriniz hiçbir zaman LLM'e iletilmez. Kimlik doğrulama Firebase Auth ile yapılır.",
  },
  {
    q: "Free planda hangi özellikler var?",
    a: "Free planda rezerv modülünde 1 dönem ve 1 branş oluşturabilirsiniz. Chain-Ladder, Bornhuetter–Ferguson ve AI Agent ücretsiz olarak sunulur, temel Excel export dahildir. Parametrik tail fitting, nakit akışı modülü ve sınırsız dönem/branş yalnızca Pro planda yer alır.",
  },
  {
    q: "Pro plana geçtikten sonra değiştirebilir miyim?",
    a: "Evet, istediğiniz zaman planınızı değiştirebilirsiniz. Pro plan aylık abonelik modelidir; iptal ettiğinizde mevcut dönem sonuna kadar Pro özellikleri kullanmaya devam edersiniz, ardından otomatik olarak Free plana dönersiniz. Verileriniz korunur.",
  },
  {
    q: "Enterprise planı kimler için uygundur?",
    a: "Çoklu aktüer ekibi, kurumsal SSO/SAML entegrasyonu, on-premise kurulum, API erişimi veya özel SLA ihtiyacı olan sigorta şirketleri için. Demo ve özel teklif için demireleren877@gmail.com adresine yazabilirsiniz.",
  },
  {
    q: "Hangi veri formatlarını destekliyorsunuz?",
    a: "Excel (.xlsx) ve CSV formatları desteklenir. Hem kümülatif hem artımsal üçgenleri, hem ödeme hem gerçekleşen verileri kabul ederiz; format otomatik algılanır. Yıllık ve çeyreklik granülariteler desteklenir.",
  },
];

function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="py-24 md:py-28" style={{ background: "#f6f7f9", borderTop: "1px solid #e2e5ea" }}>
      <div className="max-w-3xl mx-auto px-6 md:px-8">
        <div className="text-center mb-14" data-rv>
          <div className="eyebrow">SSS</div>
          <h2 className="text-[32px] md:text-[40px] font-bold tracking-tight" style={{ color: "#0f172a", letterSpacing: "-0.025em" }}>
            Sık sorulan sorular
          </h2>
        </div>

        <div className="space-y-3">
          {FAQ_ITEMS.map((item, i) => (
            <div key={i} data-rv data-rvd={i * 0.03} className="lcard" style={{ background: open === i ? "#fff" : "#fff" }}>
              <button onClick={() => setOpen(open === i ? null : i)} className="w-full px-6 py-5 flex items-center justify-between gap-4 text-left">
                <span className="text-[15px] font-semibold" style={{ color: "#0f172a" }}>{item.q}</span>
                <span
                  className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 transition-transform"
                  style={{
                    background: open === i ? "#1d4ed8" : "#f1f3f6",
                    color: open === i ? "#fff" : "#64748b",
                    transform: open === i ? "rotate(180deg)" : "none",
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </button>
              <div className={"q-body " + (open === i ? "open" : "")}>
                <div className="px-6 pb-5 text-[14px] leading-[1.7]" style={{ color: "#475569" }}>
                  {item.a}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="py-14 md:py-16" style={{ background: "#ffffff", borderTop: "1px solid #e2e5ea" }}>
      <div className="max-w-6xl mx-auto px-6 md:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
          <div className="col-span-2">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <img src="/favicon.png" alt="Actuarius" className="h-6 w-6" />
              <span className="text-[15px] font-semibold tracking-tight" style={{ color: "#0f172a" }}>Actuarius</span>
            </Link>
            <p className="text-[13.5px] leading-relaxed max-w-sm" style={{ color: "#64748b" }}>
              Sigorta aktüerleri için modern hesaplama platformu. Rezerv, nakit akışı, IFRS 17 ve
              iskonto — tek arayüzde.
            </p>
          </div>
          <div>
            <div className="text-[10.5px] font-bold uppercase tracking-widest mb-3" style={{ color: "#94a3b8" }}>Platform</div>
            <ul className="space-y-2 text-[13.5px]">
              <li><a href="#modules" className="hover:underline" style={{ color: "#475569" }}>Modüller</a></li>
              <li><a href="#agent" className="hover:underline" style={{ color: "#475569" }}>AI Agent</a></li>
              <li><a href="#security" className="hover:underline" style={{ color: "#475569" }}>Güvenlik</a></li>
              <li><a href="#pricing" className="hover:underline" style={{ color: "#475569" }}>Fiyatlandırma</a></li>
            </ul>
          </div>
          <div>
            <div className="text-[10.5px] font-bold uppercase tracking-widest mb-3" style={{ color: "#94a3b8" }}>Şirket</div>
            <ul className="space-y-2 text-[13.5px]">
              <li><a href="mailto:demireleren877@gmail.com" className="hover:underline" style={{ color: "#475569" }}>E-posta</a></li>
              <li><a href="mailto:demireleren877@gmail.com" className="hover:underline" style={{ color: "#475569" }}>Enterprise satış</a></li>
              <li><Link href="/terms" className="hover:underline" style={{ color: "#475569" }}>Kullanım şartları</Link></li>
              <li><Link href="/privacy" className="hover:underline" style={{ color: "#475569" }}>Gizlilik</Link></li>
              <li><Link href="/refund" className="hover:underline" style={{ color: "#475569" }}>İade politikası</Link></li>
            </ul>
          </div>
        </div>
        <div className="pt-6 flex flex-col md:flex-row items-center justify-between gap-3 text-[12.5px]" style={{ borderTop: "1px solid #e2e5ea", color: "#94a3b8" }}>
          <span>© 2026 Actuarius. Tüm hakları saklıdır.</span>
          <span>İstanbul, Türkiye</span>
        </div>
      </div>
    </footer>
  );
}

// ─── Atoms ────────────────────────────────────────────────────────────────────

function Arrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon({ color = "#15803d", size = 14 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="shrink-0">
      <path d="M5 12l4 4L20 6" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Real-app sidebar icons (copied stroke style from AppSidebar.tsx)
function HomeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5 12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z" />
    </svg>
  );
}
function StackIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3 2 8l10 5 10-5z" />
      <path d="M2 13l10 5 10-5" />
      <path d="M2 18l10 5 10-5" />
    </svg>
  );
}
function DatabaseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" />
      <path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3" />
    </svg>
  );
}
function CashflowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 7h20M2 12h20M2 17h20" />
      <path d="M6 3v18M18 3v18" />
    </svg>
  );
}

function LockIcon({ color = "#64748b", size = 12 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="5" y="11" width="14" height="10" rx="2" stroke={color} strokeWidth="1.8" />
      <path d="M8 11V8a4 4 0 1 1 8 0v3" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function LockBigIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect x="5" y="11" width="14" height="10" rx="2" stroke="#1d4ed8" strokeWidth="2" />
      <path d="M8 11V8a4 4 0 1 1 8 0v3" stroke="#1d4ed8" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M12 2 4 6v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V6l-8-4z" stroke="#1d4ed8" strokeWidth="2" strokeLinejoin="round" />
      <path d="m9 12 2 2 4-4" stroke="#1d4ed8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M3 3l18 18 M10.5 6.2A10 10 0 0 1 22 12s-1.5 3-4 5 M14 17.8A10 10 0 0 1 2 12s2-4 6-5.5" stroke="#1d4ed8" strokeWidth="2" strokeLinecap="round" />
      <path d="M9 9.5a3 3 0 0 0 5.5 2" stroke="#1d4ed8" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ServerIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="4" width="18" height="6" rx="1.5" stroke="#1d4ed8" strokeWidth="2" />
      <rect x="3" y="14" width="18" height="6" rx="1.5" stroke="#1d4ed8" strokeWidth="2" />
      <circle cx="7" cy="7" r="0.8" fill="#1d4ed8" />
      <circle cx="7" cy="17" r="0.8" fill="#1d4ed8" />
    </svg>
  );
}

function CountUp({ to }: { to: number }) {
  const [v, setV] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let start: number | null = null;
    const dur = 1400;
    let raf: number;
    const tick = (t: number) => {
      if (!start) start = t;
      const p = Math.min((t - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(Math.floor(eased * to));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    const obs = new IntersectionObserver(
      (es) => {
        if (es[0].isIntersecting) raf = requestAnimationFrame(tick);
      },
      { threshold: 0.1 },
    );
    if (ref.current) obs.observe(ref.current);
    return () => {
      cancelAnimationFrame(raf);
      obs.disconnect();
    };
  }, [to]);
  return (
    <span ref={ref} className="tabular-nums">
      {v.toLocaleString("tr-TR")}
    </span>
  );
}
