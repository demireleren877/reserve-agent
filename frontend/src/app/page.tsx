"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

/* ─────────────────────────────────────────────────────────────────────────────
   Actuarius — color-drenched. Saturated indigo→violet→blue mesh carries the
   hero and key bands; bright app surfaces float out of the color; gold accent
   pops. Oversized Archivo display + Fira Code data. Light sections between
   color bands for rhythm. No gradient text, no eyebrow grammar, no card-grid.
   ──────────────────────────────────────────────────────────────────────────── */

const STYLES = `
.lp {
  --paper:   #f4f5fa;
  --paper-2: #ffffff;
  --card:    #ffffff;
  --ink:     #120f2e;
  --ink-2:   #3b3a63;
  --muted:   #6c6b94;
  --line:    #e6e6f1;
  --line-2:  #d6d6e6;

  --indigo-950:#15102e;
  --indigo-900:#1e1b4b;
  --indigo-700:#3730a3;
  --violet:    #6d28d9;
  --violet-2:  #7c3aed;
  --blue:      #1d4ed8;
  --blue-2:    #2563eb;
  --gold:      #f59e0b;
  --gold-2:    #fbbf24;
  --gold-soft: #fef3da;
  --on-color:  #f4f2ff;
  --on-color-2:#c5c2ec;
  --ok:        #16a34a;

  background: var(--paper);
  color: var(--ink);
  font-family: var(--font-archivo), var(--font-geist-sans), system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}
.lp .mono { font-family: var(--font-fira), var(--font-geist-mono), ui-monospace, monospace; font-variant-numeric: tabular-nums; }

/* ── Type ───────────────────────────────────────────────────── */
.lp .display { font-weight: 800; letter-spacing: -0.03em; line-height: 0.96; text-wrap: balance; }
.lp .h2 { font-weight: 800; letter-spacing: -0.025em; line-height: 1.02; font-size: clamp(2.1rem,1.2rem+3.4vw,3.5rem); text-wrap: balance; }
.lp .lede { color: var(--ink-2); line-height: 1.56; text-wrap: pretty; }
.lp .kick { font-family: var(--font-fira),monospace; font-size: 12px; letter-spacing: .16em; text-transform: uppercase; }

/* ── Color drench + animated mesh ───────────────────────────── */
.lp .drench { position: relative; overflow: hidden; background: var(--indigo-900); color: var(--on-color); isolation: isolate; }
.lp .drench .blob { position: absolute; border-radius: 50%; filter: blur(64px); opacity: .85; z-index: -1; will-change: transform; }
.lp .b1 { width: 620px; height: 620px; background: radial-gradient(circle, var(--violet-2), transparent 65%); top: -180px; left: -120px; animation: drift1 22s ease-in-out infinite; }
.lp .b2 { width: 560px; height: 560px; background: radial-gradient(circle, var(--blue-2), transparent 62%); top: -80px; right: -120px; animation: drift2 26s ease-in-out infinite; }
.lp .b3 { width: 520px; height: 520px; background: radial-gradient(circle, #4338ca, transparent 64%); bottom: -220px; left: 30%; animation: drift3 30s ease-in-out infinite; }
.lp .b-gold { width: 320px; height: 320px; background: radial-gradient(circle, rgba(251,191,36,.5), transparent 60%); bottom: -120px; right: 12%; animation: drift2 24s ease-in-out infinite reverse; opacity: .5; }
.lp .grain { position:absolute; inset:0; z-index:-1; opacity:.4;
  background: linear-gradient(rgba(255,255,255,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.06) 1px, transparent 1px);
  background-size: 52px 52px; mask-image: radial-gradient(80% 80% at 50% 30%, #000, transparent 78%); -webkit-mask-image: radial-gradient(80% 80% at 50% 30%, #000, transparent 78%); }

@keyframes drift1 { 0%,100%{ transform: translate(0,0) scale(1) } 50%{ transform: translate(70px,40px) scale(1.12) } }
@keyframes drift2 { 0%,100%{ transform: translate(0,0) scale(1) } 50%{ transform: translate(-60px,50px) scale(1.1) } }
@keyframes drift3 { 0%,100%{ transform: translate(0,0) scale(1) } 50%{ transform: translate(40px,-50px) scale(1.15) } }

/* ── Buttons ────────────────────────────────────────────────── */
.lp .btn { display:inline-flex; align-items:center; gap:8px; font-weight:700; font-size:15px; border-radius:11px; padding:13px 22px; cursor:pointer; transition: transform .35s cubic-bezier(.16,1,.3,1), box-shadow .35s, background .2s, border-color .2s, color .2s; }
.lp .btn-gold { background: var(--gold-2); color: #3b2606; box-shadow: 0 10px 28px -10px rgba(251,191,36,.7); }
.lp .btn-gold:hover { transform: translateY(-2px); box-shadow: 0 18px 38px -12px rgba(251,191,36,.85); }
.lp .btn-gold .arr, .lp .btn-dark .arr, .lp .btn-glass .arr { transition: transform .35s cubic-bezier(.16,1,.3,1); }
.lp .btn-gold:hover .arr, .lp .btn-dark:hover .arr, .lp .btn-glass:hover .arr { transform: translateX(3px); }
.lp .btn-dark { background: var(--ink); color:#fff; }
.lp .btn-dark:hover { transform: translateY(-2px); box-shadow: 0 16px 32px -14px rgba(18,15,46,.6); }
.lp .btn-glass { background: rgba(255,255,255,.1); color:#fff; border:1px solid rgba(255,255,255,.28); backdrop-filter: blur(8px); }
.lp .btn-glass:hover { background: rgba(255,255,255,.18); transform: translateY(-2px); }
.lp .btn-outline { background: transparent; color: var(--ink); border:1px solid var(--line-2); }
.lp .btn-outline:hover { border-color: var(--ink); transform: translateY(-2px); }
.lp .link-arr { color: var(--violet-2); font-weight:700; font-size:14px; display:inline-flex; align-items:center; gap:6px; transition: gap .3s cubic-bezier(.16,1,.3,1); }
.lp .link-arr:hover { gap:10px; }

/* ── Tags ───────────────────────────────────────────────────── */
.lp .tag { display:inline-flex; align-items:center; gap:7px; font-family:var(--font-fira),monospace; font-size:11.5px; letter-spacing:.05em; padding:5px 12px; border-radius:8px; border:1px solid var(--line-2); background: var(--card); color: var(--ink-2); }
.lp .tag-onc { background: rgba(255,255,255,.12); border-color: rgba(255,255,255,.25); color:#fff; }
.lp .tag-gold { background: var(--gold-soft); border-color:#f4dca6; color:#a86a08; }
.lp .tag-ok { background:#e6f7ec; border-color:#bce7c9; color:#15803d; }

/* ── Bright floating surface ────────────────────────────────── */
.lp .float { background: var(--card); border:1px solid rgba(255,255,255,.5); border-radius:16px; box-shadow: 0 2px 4px rgba(18,15,46,.1), 0 40px 80px -36px rgba(18,15,46,.55), 0 0 0 1px rgba(124,58,237,.12); }
.lp .panel { background: var(--card); border:1px solid var(--line); border-radius:14px; }

/* triangle cells */
.lp .tcell { font-family:var(--font-fira),monospace; font-size:13px; text-align:right; padding:7px 11px; color:var(--ink-2); border-radius:6px; opacity:0; transform:translateY(6px); }
.reveal-ready .lp .tcell.fill { animation: cellin .5s cubic-bezier(.16,1,.3,1) forwards; }
.lp .tcell.diag { background: var(--gold-soft); color:#a86a08; font-weight:700; box-shadow: inset 0 0 0 1px #f0d49b; }
.lp .tcell.head { color:var(--muted); font-size:11px; opacity:1; transform:none; }
.lp .trow { font-family:var(--font-fira),monospace; font-size:12px; font-weight:700; }

/* pipeline */
.lp .pnode { transition: transform .3s cubic-bezier(.16,1,.3,1), border-color .3s, background .3s, box-shadow .3s; }
.lp .pnode:hover { transform: translateY(-3px); }

/* nav */
.lp .nav { transition: background .3s, border-color .3s; border-bottom:1px solid transparent; }
.lp .nav.on { background: rgba(244,245,250,.82); backdrop-filter: saturate(1.4) blur(14px); -webkit-backdrop-filter: saturate(1.4) blur(14px); border-bottom:1px solid var(--line); }
.lp .navlink { font-size:14px; color:var(--ink-2); font-weight:600; padding:7px 11px; border-radius:8px; transition: color .2s, background .2s; }
.lp .navlink:hover { color:var(--ink); background: rgba(18,15,46,.05); }

/* agent terminal (on indigo) */
.lp .term { background: rgba(11,8,32,.55); border:1px solid rgba(255,255,255,.14); border-radius:16px; backdrop-filter: blur(10px); }
.lp .term-h { border-bottom:1px solid rgba(255,255,255,.12); }
.lp .bub-u { background: var(--gold-2); color:#3b2606; }
.lp .bub-a { background: rgba(255,255,255,.1); border:1px solid rgba(255,255,255,.16); color:#ece9ff; }
.lp .bdot { width:6px;height:6px;border-radius:50%;background:#a59fd6;display:inline-block;animation:bnc 1.3s infinite ease-in-out both; }
.lp .bdot:nth-child(2){animation-delay:.16s}.lp .bdot:nth-child(3){animation-delay:.32s}
.lp .cur { display:inline-block;width:2px;height:14px;background:var(--gold-2);vertical-align:middle;margin-left:2px;animation:blink .9s steps(1) infinite; }

/* faq */
.lp .faq { display:grid; grid-template-rows:0fr; transition: grid-template-rows .42s cubic-bezier(.16,1,.3,1); }
.lp .faq.open { grid-template-rows:1fr; }
.lp .faq > div { overflow:hidden; }

/* app mock */
.lp .lcard { background: var(--card); border:1px solid var(--line); border-radius:10px; }
.lp .mtab { padding:10px 12px; font-size:12px; color:var(--muted); border-bottom:2px solid transparent; white-space:nowrap; }
.lp .mtab.on { color:var(--violet-2); border-bottom-color:var(--violet-2); font-weight:700; }

@keyframes bnc{0%,80%,100%{transform:scale(.6);opacity:.5}40%{transform:scale(1);opacity:1}}
@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
@keyframes cellin{to{opacity:1;transform:none}}
@keyframes rise{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:none}}
.lp .rise{ animation: rise .9s cubic-bezier(.16,1,.3,1) backwards; }

.reveal-ready .lp [data-rv]{opacity:0;transform:translateY(24px);transition:opacity .9s cubic-bezier(.16,1,.3,1),transform .9s cubic-bezier(.16,1,.3,1);}
.reveal-ready .lp [data-rv][data-on]{opacity:1;transform:none;}

@media (prefers-reduced-motion: reduce){
  .lp .rise{animation:none}
  .lp .blob{animation:none!important}
  .reveal-ready .lp [data-rv]{opacity:1!important;transform:none!important;transition:none}
  .reveal-ready .lp .tcell{opacity:1!important;transform:none!important;animation:none}
  .lp [data-parallax]{transform:none!important}
}
`;

// ─── Motion ───────────────────────────────────────────────────────────────────

function useMotion() {
  useEffect(() => {
    document.documentElement.classList.add("reveal-ready");
    const obs = new IntersectionObserver(
      (es) => es.forEach((e) => {
        if (!e.isIntersecting) return;
        const el = e.target as HTMLElement;
        window.setTimeout(() => el.setAttribute("data-on", ""), parseFloat(el.dataset.rvd ?? "0") * 1000);
        obs.unobserve(el);
      }),
      { threshold: 0.14, rootMargin: "0px 0px -8% 0px" },
    );
    document.querySelectorAll<HTMLElement>("[data-rv]").forEach((el) => obs.observe(el));
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const onScroll = () => {
      if (reduce) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const y = window.scrollY;
        document.querySelectorAll<HTMLElement>("[data-parallax]").forEach((el) => {
          el.style.transform = `translate3d(0, ${y * parseFloat(el.dataset.parallax ?? "0")}px, 0)`;
        });
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { obs.disconnect(); window.removeEventListener("scroll", onScroll); document.documentElement.classList.remove("reveal-ready"); };
  }, []);
}
function useScrolled(t = 12) {
  const [s, setS] = useState(false);
  useEffect(() => { const on = () => setS(window.scrollY > t); on(); window.addEventListener("scroll", on, { passive: true }); return () => window.removeEventListener("scroll", on); }, [t]);
  return s;
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function Landing() {
  useMotion();
  return (
    <div className="lp min-h-screen">
      <style>{STYLES}</style>
      <Nav />
      <Hero />
      <Pipeline />
      <Agent />
      <Security />
      <Pricing />
      <FAQ />
      <CTABand />
      <Footer />
    </div>
  );
}

// ─── Nav ──────────────────────────────────────────────────────────────────────

function Nav() {
  const on = useScrolled();
  return (
    <nav className={"sticky top-0 z-50 nav " + (on ? "on" : "")}>
      <div className="mx-auto max-w-[1180px] px-6 md:px-8 flex items-center justify-between" style={{ height: 68 }}>
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <img src="/favicon.png" alt="Actuarius" className="h-7 w-7" />
          <span className="text-[17px] font-extrabold tracking-tight">Actuarius</span>
        </Link>
        <div className="hidden md:flex items-center gap-1 absolute left-1/2 -translate-x-1/2">
          {[["#modules", "Modüller"], ["#agent", "AI Agent"], ["#security", "Güvenlik"], ["#pricing", "Fiyat"]].map(([h, l]) => (
            <a key={h} href={h} className="navlink">{l}</a>
          ))}
        </div>
        <div className="flex items-center gap-2.5">
          <Link href="/login" className="navlink hidden sm:block">Giriş</Link>
          <Link href="/reserve" className="btn btn-dark" style={{ padding: "9px 16px", fontSize: 14, borderRadius: 10 }}>Ücretsiz başla <Arrow /></Link>
        </div>
      </div>
    </nav>
  );
}

// ─── Hero (drench) ────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="drench" style={{ marginTop: -68, paddingTop: 68 }}>
      <span className="blob b1" /><span className="blob b2" /><span className="blob b3" /><span className="blob b-gold" /><span className="grain" />
      <div className="relative mx-auto max-w-[1180px] px-6 md:px-8 pt-16 md:pt-24 pb-20 md:pb-28 grid lg:grid-cols-[1.04fr_0.96fr] gap-12 lg:gap-12 items-center">
        <div>
          <div className="rise"><span className="tag tag-onc"><span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--gold-2)" }} />REZERV &amp; NAKİT AKIŞI CANLI</span></div>
          <h1 className="display rise mt-6" style={{ fontSize: "clamp(2.9rem,1.3rem+5.6vw,5.4rem)", color: "#fff", animationDelay: ".06s" }}>
            Hasar üçgeninden<br />
            <span style={{ color: "var(--gold-2)" }}>nihai rezerve</span>,<br />
            tek akışta.
          </h1>
          <p className="rise mt-7 text-[17px] md:text-[18.5px]" style={{ color: "var(--on-color-2)", lineHeight: 1.55, maxWidth: "46ch", animationDelay: ".16s" }}>
            Chain-Ladder ve Bornhuetter–Ferguson&apos;dan parametrik tail&apos;e, nakit akışından
            IFRS 17 iskontoya — ve yanında doğal dilde çalışan bir AI aktüer.
          </p>
          <div className="rise mt-9 flex flex-wrap gap-3" style={{ animationDelay: ".24s" }}>
            <Link href="/reserve" className="btn btn-gold">Ücretsiz başla <Arrow /></Link>
            <a href="#modules" className="btn btn-glass">Modülleri gör</a>
          </div>
          <div className="rise mt-8 flex flex-wrap gap-x-6 gap-y-2 mono text-[12px]" style={{ color: "var(--on-color-2)", animationDelay: ".32s" }}>
            {["free plan kalıcı ücretsiz", "ham veri LLM'e gitmez", "Türkçe"].map((t) => (
              <span key={t} className="inline-flex items-center gap-1.5"><span style={{ color: "var(--gold-2)" }}>✦</span>{t}</span>
            ))}
          </div>
        </div>
        <div className="rise" style={{ animationDelay: ".3s" }} data-parallax="-0.022"><TriangleHero /></div>
      </div>
    </section>
  );
}

function TriangleHero() {
  const ORIG = ["2021", "2022", "2023", "2024", "2025"];
  const DEV = ["12", "24", "36", "48", "60"];
  const T: (number | null)[][] = [
    [165595, 181230, 188940, 192100, 193520],
    [199135, 217640, 226880, 231050, null],
    [213510, 233190, 243120, null, null],
    [224580, 245880, null, null, null],
    [232470, null, null, null, null],
  ];
  const lastIdx = (r: number) => T[r].filter((x) => x !== null).length - 1;
  return (
    <div className="float p-5 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="kick" style={{ color: "var(--muted)", fontSize: 11 }}>LOSS DEVELOPMENT</div>
          <div className="text-[14px] font-extrabold mt-1" style={{ color: "var(--ink)" }}>Motor TPL · 2025Q4 · incurred</div>
        </div>
        <span className="tag tag-gold">SON DİAGONAL</span>
      </div>
      <div className="overflow-x-auto">
        <table style={{ borderCollapse: "separate", borderSpacing: "3px", width: "100%" }}>
          <thead><tr><th className="tcell head" style={{ textAlign: "left" }}>orig\dev</th>{DEV.map((d) => <th key={d} className="tcell head">{d}</th>)}</tr></thead>
          <tbody>
            {T.map((row, r) => (
              <tr key={ORIG[r]}>
                <td className="trow" style={{ paddingRight: 8, color: "var(--ink)" }}>{ORIG[r]}</td>
                {row.map((v, c) => v === null ? <td key={c} /> : (
                  <td key={c} className={"tcell fill " + (c === lastIdx(r) ? "diag" : "")} style={{ animationDelay: `${(r + c) * 90 + 320}ms` }}>{(v / 1000).toFixed(1)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 pt-4 grid grid-cols-3 gap-3" style={{ borderTop: "1px solid var(--line)" }}>
        {[["REPORTED", "1.035.290", "var(--ink)"], ["IBNR", <CountUp key="i" to={170400} />, "#b8770a"], ["ULTIMATE", "1.205.690", "var(--ink)"]].map(([k, v, col]) => (
          <div key={k as string}>
            <div className="kick" style={{ fontSize: 10, color: "var(--muted)" }}>{k as string}</div>
            <div className="mono text-[19px] font-extrabold mt-1" style={{ color: col as string }}>{v as ReactNode}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Pipeline ────────────────────────────────────────────────────────────────

type ModKey = "reserve" | "cashflow" | "discount" | "ifrs17";
const STEPS: { key: ModKey; n: string; name: string; status: "active" | "dev"; line: string }[] = [
  { key: "reserve", n: "01", name: "Rezerv Analizi", status: "active", line: "Chain-Ladder + BF, tail fitting, ILR ısı haritası" },
  { key: "cashflow", n: "02", name: "Nakit Akışı", status: "active", line: "CDF tabanlı çeyreklik & aylık projeksiyon" },
  { key: "discount", n: "03", name: "İskonto", status: "dev", line: "Risk-free eğriyle bugünkü değere indirgeme" },
  { key: "ifrs17", n: "04", name: "IFRS 17", status: "dev", line: "Sözleşme grubu bazlı muhasebe, CSM" },
];

function Pipeline() {
  const [active, setActive] = useState<ModKey>("reserve");
  return (
    <section id="modules" className="py-20 md:py-28" style={{ background: "var(--paper-2)" }}>
      <div className="mx-auto max-w-[1180px] px-6 md:px-8">
        <div className="max-w-2xl" data-rv>
          <div className="kick" style={{ color: "var(--violet-2)" }}>VERİ → REZERV → NAKİT AKIŞI → İSKONTO</div>
          <h2 className="h2 mt-3">Bir veri seti, bütün bir süreç</h2>
          <p className="lede mt-4 text-[16.5px]" style={{ maxWidth: "56ch" }}>
            Her adım bir öncekinin çıktısından beslenir. Rezerv sonuçları nakit akışını, nakit akışı
            iskontoyu doğrudan besler — sayfalar arası manuel veri taşımak yok.
          </p>
        </div>
        <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-3" data-rv data-rvd={0.04}>
          {STEPS.map((s) => {
            const on = active === s.key;
            return (
              <button key={s.key} onClick={() => setActive(s.key)} className="pnode text-left p-5 rounded-2xl"
                style={{ background: on ? "var(--card)" : "transparent", border: `1px solid ${on ? "transparent" : "var(--line)"}`, boxShadow: on ? "0 18px 36px -20px rgba(109,40,217,.4), 0 0 0 1.5px var(--violet-2)" : "none" }}>
                <div className="flex items-center justify-between">
                  <span className="mono text-[13px] font-extrabold" style={{ color: on ? "var(--violet-2)" : "var(--muted)" }}>{s.n}</span>
                  {s.status === "dev" ? <span className="tag tag-gold" style={{ fontSize: 10, padding: "2px 7px" }}>YAKINDA</span> : <span className="tag tag-ok" style={{ fontSize: 10, padding: "2px 7px" }}>AKTİF</span>}
                </div>
                <div className="text-[16px] font-extrabold tracking-tight mt-3">{s.name}</div>
                <div className="text-[12.5px] mt-1" style={{ color: "var(--muted)", lineHeight: 1.45 }}>{s.line}</div>
              </button>
            );
          })}
        </div>
        <div className="mt-6" data-rv data-rvd={0.06}>
          {active === "reserve" && <ReservePanel />}
          {active === "cashflow" && <CashflowPanel />}
          {active === "discount" && <SoonPanel module="İskonto" eta="Q4 2026" desc="Nakit akışlarının risk-free eğri veya şirket eğrisiyle bugünkü değere indirgenmesi; IFRS 17 ile entegre." />}
          {active === "ifrs17" && <SoonPanel module="IFRS 17" eta="Q1 2027" desc="GMM, PAA ve VFA yaklaşımlarıyla sözleşme grubu bazlı muhasebe; CSM amortismanı ve risk düzeltmesi." />}
        </div>
      </div>
    </section>
  );
}

function PreviewFrame({ crumb, children }: { crumb: string[]; children: ReactNode }) {
  return (
    <div className="panel overflow-hidden" style={{ boxShadow: "0 1px 0 rgba(18,15,46,.04), 0 28px 54px -32px rgba(18,15,46,.3)" }}>
      <div className="px-5 py-2.5 flex items-center gap-2 mono text-[11.5px]" style={{ borderBottom: "1px solid var(--line)", background: "var(--paper)", color: "var(--muted)" }}>
        {crumb.map((c, i) => <span key={i} style={{ color: i === 0 ? "var(--ink)" : undefined, fontWeight: i === 0 ? 700 : 400 }}>{c}{i < crumb.length - 1 && <span style={{ color: "var(--line-2)", margin: "0 6px" }}>/</span>}</span>)}
      </div>
      {children}
    </div>
  );
}

function ReservePanel() {
  const [tab, setTab] = useState<"ldf" | "ilr" | "ultimate">("ldf");
  const tabs = ["Veri", "LDF", "Curve", "ILR", "BF", "Ultimate/IBNR", "Özet"];
  const click: Record<string, "ldf" | "ilr" | "ultimate"> = { LDF: "ldf", ILR: "ilr", "Ultimate/IBNR": "ultimate" };
  const onLabel = { ldf: "LDF", ilr: "ILR", ultimate: "Ultimate/IBNR" }[tab];
  return (
    <PreviewFrame crumb={["Rezerv", "2025Q4", "Motor TPL"]}>
      <div className="flex overflow-x-auto px-5" style={{ borderBottom: "1px solid var(--line)", background: "var(--card)" }}>
        {tabs.map((t) => { const tg = click[t]; return <button key={t} onClick={tg ? () => setTab(tg) : undefined} className={"mtab " + (t === onLabel ? "on" : "")} style={{ cursor: tg ? "pointer" : "default" }}>{t}</button>; })}
      </div>
      <div className="p-5 md:p-6" style={{ background: "var(--card)" }}>{tab === "ldf" && <LDF />}{tab === "ilr" && <ILR />}{tab === "ultimate" && <Ultimate />}</div>
    </PreviewFrame>
  );
}

function Ultimate() {
  const rows = [["2021", "165.595", "825", "166.420"], ["2022", "199.135", "4.345", "203.480"], ["2023", "213.510", "16.250", "229.760"], ["2024", "224.580", "43.260", "267.840"], ["2025", "232.470", "105.720", "338.190"]];
  return (
    <div>
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[["Reported", "1.035.290", false], ["IBNR", "170.400", true], ["Ultimate", "1.205.690", false]].map(([l, v, a]) => (
          <div key={l as string} className="rounded-[11px] px-4 py-3" style={{ background: a ? "var(--gold-soft)" : "var(--card)", border: `1px solid ${a ? "#f0d49b" : "var(--line)"}` }}>
            <div className="kick" style={{ fontSize: 10, color: "var(--muted)" }}>{l as string}</div>
            <div className="mono text-[19px] font-extrabold mt-1" style={{ color: a ? "#b8770a" : "var(--ink)" }}>{v as string}<span className="text-[11px] font-medium ml-1" style={{ color: "var(--muted)" }}>TL</span></div>
          </div>
        ))}
      </div>
      <div className="lcard overflow-hidden">
        <table className="w-full text-[12.5px] mono">
          <thead><tr style={{ borderBottom: "1px solid var(--line)", background: "var(--paper)" }}>{["Yıl", "Reported", "IBNR", "Ultimate"].map((h, i) => <th key={h} className={"px-4 py-2 text-[10.5px] tracking-wider " + (i ? "text-right" : "text-left")} style={{ color: "var(--muted)" }}>{h.toUpperCase()}</th>)}</tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r[0]} style={{ borderBottom: "1px solid #f2f2f8" }}>
              <td className="px-4 py-2 font-extrabold">{r[0]}</td><td className="px-4 py-2 text-right" style={{ color: "var(--ink-2)" }}>{r[1]}</td>
              <td className="px-4 py-2 text-right font-bold" style={{ color: "#b8770a" }}>{r[2]}</td><td className="px-4 py-2 text-right font-extrabold">{r[3]}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

function LDF() {
  const rows = [["2021", ["1.638", "1.091", "1.041", "1.018", "1.005"]], ["2022", ["1.721", "1.102", "1.049", "1.021", "—"]], ["2023", ["1.684", "1.118", "1.051", "—", "—"]], ["2024", ["1.702", "1.095", "—", "—", "—"]], ["2025", ["1.631", "—", "—", "—", "—"]]] as [string, string[]][];
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <span className="tag tag-gold" style={{ fontSize: 11 }}>Volume</span><span className="tag" style={{ fontSize: 11 }}>Simple</span><span className="tag" style={{ fontSize: 11 }}>5Y window</span>
        <span className="mono text-[11px] ml-auto" style={{ color: "var(--muted)" }}>5 origin · 5 dev</span>
      </div>
      <div className="lcard overflow-hidden">
        <table className="w-full text-[12.5px] mono">
          <thead><tr style={{ borderBottom: "1px solid var(--line)", background: "var(--paper)" }}><th className="text-left px-3 py-2 text-[10.5px] tracking-wider" style={{ color: "var(--muted)" }}>ORIGIN</th>{["12→24", "24→36", "36→48", "48→60", "60→TAIL"].map((m) => <th key={m} className="text-right px-3 py-2 text-[10.5px] tracking-wider" style={{ color: "var(--muted)" }}>{m}</th>)}</tr></thead>
          <tbody>
            {rows.map(([y, v]) => <tr key={y} style={{ borderBottom: "1px solid #f2f2f8" }}><td className="px-3 py-1.5 font-extrabold">{y}</td>{v.map((c, j) => <td key={j} className="text-right px-3 py-1.5" style={{ color: c === "—" ? "var(--line-2)" : "var(--ink-2)" }}>{c}</td>)}</tr>)}
            <tr style={{ background: "var(--gold-soft)", borderTop: "2px solid #f0d49b" }}><td className="px-3 py-2 text-[10.5px] font-extrabold tracking-wider" style={{ color: "#b8770a" }}>SEÇİLİ</td>{["1,412", "1,083", "1,031", "1,012", "1,004"].map((v, i) => <td key={i} className="text-right px-3 py-2 font-extrabold" style={{ color: "#b8770a" }}>{v}</td>)}</tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ILR() {
  const rows: [string, (number | null)[]][] = [["2020", [1.4, 3.2, 9.4, 11.3, 12.8, 12.6, 10.3]], ["2021", [28.3, 7.1, 14.4, 32.5, 27.6, 23.5, 29.4]], ["2022", [3.5, 3.0, 17.6, 14.6, 14.5, 14.3, null]], ["2023", [12.6, 15.2, 26.9, 23.1, 30.8, null, null]], ["2024", [4.4, 16.3, 18.3, 22.8, null, null, null]], ["2025", [8.3, 34.9, 42.0, 60.3, 86.8, null, null]]];
  const heat = (v: number) => v >= 80 ? { bg: "#fde2e0", c: "#9a2218", w: 800 } : v >= 40 ? { bg: "#fbe0c4", c: "#b8770a", w: 700 } : v >= 25 ? { bg: "var(--gold-soft)", c: "#b8770a", w: 600 } : v >= 12 ? { bg: "#eee9ff", c: "var(--violet)", w: 600 } : { bg: "transparent", c: "var(--muted)", w: 400 };
  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <span className="mono text-[11px]" style={{ color: "var(--muted)" }}>Hasar / (Prim × Düz.) %</span>
        <div className="hidden sm:flex items-center gap-3 ml-auto">{[["#eee9ff", "Normal"], ["var(--gold-soft)", "Yüksek"], ["#fbe0c4", "Çok yüksek"], ["#fde2e0", "Anomali"]].map(([c, l]) => <span key={l} className="flex items-center gap-1.5 text-[10.5px]" style={{ color: "var(--muted)" }}><span className="w-3 h-3 rounded-sm" style={{ background: c, border: "1px solid var(--line)" }} />{l}</span>)}</div>
      </div>
      <div className="lcard p-3">
        <table className="w-full text-[12px] mono" style={{ borderCollapse: "separate", borderSpacing: "2px" }}>
          <thead><tr><th className="text-left px-2 py-1.5 text-[10px] tracking-wider" style={{ color: "var(--muted)" }}>YIL</th>{Array.from({ length: 7 }).map((_, i) => <th key={i} className="text-right px-2 py-1.5 text-[10px]" style={{ color: "var(--muted)" }}>{i + 1}</th>)}</tr></thead>
          <tbody>{rows.map(([y, vals]) => <tr key={y}><td className="px-2 py-1.5 font-extrabold text-[11.5px]">{y}</td>{vals.map((v, j) => v == null ? <td key={j} className="text-right px-2 py-1.5" style={{ color: "var(--line-2)" }}>—</td> : <td key={j} className="text-right px-2 py-1.5 rounded" style={{ background: heat(v).bg, color: heat(v).c, fontWeight: heat(v).w }}>{v.toFixed(1)}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

function CashflowPanel() {
  const data = [["2026Q2", 18, "1.840"], ["2026Q3", 32, "3.275"], ["2026Q4", 48, "4.910"], ["2027Q1", 62, "6.345"], ["2027Q2", 71, "7.265"], ["2027Q3", 58, "5.935"], ["2027Q4", 46, "4.705"], ["2028Q1", 36, "3.685"]] as [string, number, string][];
  return (
    <PreviewFrame crumb={["Nakit Akışı", "2026Q1", "Motor TPL"]}>
      <div className="p-5 md:p-6" style={{ background: "var(--card)" }}>
        <div className="flex items-center justify-between mb-4">
          <div><div className="text-[15px] font-extrabold">CF Pattern Projeksiyonu</div><div className="mono text-[11.5px] mt-0.5" style={{ color: "var(--muted)" }}>rapor: 2026Q1 · tüm origin</div></div>
          <div className="flex gap-1.5"><span className="tag tag-gold" style={{ fontSize: 11 }}>Çeyreklik</span><span className="tag" style={{ fontSize: 11 }}>Aylık</span></div>
        </div>
        <div className="space-y-2">
          {data.map(([l, p, v], i) => (
            <div key={l} className="flex items-center gap-3 text-[12px]">
              <span className="w-14 shrink-0 mono font-medium" style={{ color: "var(--ink-2)" }}>{l}</span>
              <div className="flex-1 h-5 rounded relative overflow-hidden" style={{ background: "var(--paper)" }}>
                <div className="cfb absolute inset-y-0 left-0 rounded" style={{ width: `${p}%`, background: i === 4 ? "var(--gold-2)" : "var(--violet-2)", animationDelay: `${i * 60}ms` }} />
              </div>
              <span className="w-14 text-right mono font-extrabold">{v}</span>
            </div>
          ))}
        </div>
        <div className="mt-5 pt-4 grid grid-cols-3 gap-3" style={{ borderTop: "1px solid var(--line)" }}>{[["TOPLAM", "37.960 TL"], ["TEPE", "2027Q2"], ["ORT. SÜRE", "5.4 ç."]].map(([k, v]) => <div key={k}><div className="kick" style={{ fontSize: 10, color: "var(--muted)" }}>{k}</div><div className="mono text-[15px] font-extrabold mt-1">{v}</div></div>)}</div>
        <style>{`.lp .cfb{transform-origin:left;animation:cfg .8s cubic-bezier(.16,1,.3,1) backwards}@keyframes cfg{from{transform:scaleX(0)}to{transform:scaleX(1)}}@media(prefers-reduced-motion:reduce){.lp .cfb{animation:none}}`}</style>
      </div>
    </PreviewFrame>
  );
}

function SoonPanel({ module, eta, desc }: { module: string; eta: string; desc: string }) {
  return (
    <PreviewFrame crumb={[module, "geliştiriliyor"]}>
      <div className="grid place-items-center" style={{ minHeight: 320, padding: 40, background: "var(--card)" }}>
        <div className="text-center max-w-sm">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-5" style={{ background: "var(--gold-soft)" }}><svg width="26" height="26" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#b8770a" strokeWidth="2" /><path d="M12 7v5l3 2" stroke="#b8770a" strokeWidth="2" strokeLinecap="round" /></svg></div>
          <div className="text-[19px] font-extrabold mb-2">{module} modülü yolda</div>
          <p className="text-[14px] leading-relaxed mb-5" style={{ color: "var(--ink-2)" }}>{desc}</p>
          <span className="tag tag-gold">Beklenen: {eta}</span>
        </div>
      </div>
    </PreviewFrame>
  );
}

// ─── Agent (indigo band) ──────────────────────────────────────────────────────

function Agent() {
  return (
    <section id="agent" className="drench py-20 md:py-28">
      <span className="blob b1" style={{ top: "-160px", left: "55%" }} /><span className="blob b3" style={{ bottom: "-180px", left: "5%" }} /><span className="grain" />
      <div className="relative mx-auto max-w-[1180px] px-6 md:px-8 grid lg:grid-cols-[1fr_1.05fr] gap-10 lg:gap-14 items-center">
        <div data-rv>
          <span className="tag tag-onc">AI AKTÜER AGENT</span>
          <h2 className="h2 mt-5" style={{ color: "#fff" }}>Bir araç değil,<br />ekibinize katılan <span style={{ color: "var(--gold-2)" }}>bir aktüer</span></h2>
          <p className="mt-5 text-[16.5px] leading-relaxed" style={{ color: "var(--on-color-2)", maxWidth: "50ch" }}>
            Tüm modülleri gören tek agent. Doğal dilde isteyin — senaryoyu hesaplar, hücreyi eler,
            BF&apos;e geçirir, sonucu yorumlar. Yazma işlemleri doğrudan ekranınıza uygulanır.
          </p>
          <ul className="mt-7 space-y-3.5">
            {[["Doğal dilde komut", "“2024'ü BF'e al, vw(2021:2023) uygula” — ve uygulanır."], ["Sonuç yorumu", "IBNR ve loss ratio değişimini gerekçesiyle açıklar."], ["Veri güvenliği", "Ham üçgen LLM'e iletilmez; yalnızca agrega sonuçlar."]].map(([t, d]) => (
              <li key={t} className="flex items-start gap-3"><span className="mt-1 mono text-[13px] font-extrabold shrink-0" style={{ color: "var(--gold-2)" }}>›</span><span><span className="text-[14.5px] font-bold" style={{ color: "#fff" }}>{t}</span><span className="text-[14px]" style={{ color: "var(--on-color-2)" }}> — {d}</span></span></li>
            ))}
          </ul>
          <Link href="/reserve" className="btn btn-gold mt-8">Agent&apos;ı deneyin <Arrow /></Link>
        </div>
        <div data-rv data-rvd={0.08}><Terminal /></div>
      </div>
    </section>
  );
}

type Msg = { role: "user" | "agent"; text: string };
const SCRIPT: Msg[] = [
  { role: "user", text: "2024 ve 2025 için BF kullansak toplam IBNR kaç değişir?" },
  { role: "agent", text: "BF basis'e geçince toplam IBNR 107,1M TL'den 94,3M TL'ye düşüyor (−12,8M, %12).\n\nA priori LR olarak vw(2021–2023) = %68,4 hesaplandı. 2024 origin için ultimate 184,6M, 2025 için 156,2M.\n\nUygulamamı ister misiniz?" },
  { role: "user", text: "Evet, uygula." },
  { role: "agent", text: "Tamamlandı.\n\n• 2024–2025 BF basis'e geçirildi\n• Selected IBNR: 94,3M TL\n• Toplam ultimate: 542,7M TL" },
];

function Terminal() {
  const [shown, setShown] = useState<Msg[]>([]);
  const [typing, setTyping] = useState(false);
  const [partial, setPartial] = useState("");
  const alive = useRef(true);
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => { const el = scroll.current; if (el) el.scrollTop = el.scrollHeight; }, [shown, typing, partial]);
  useEffect(() => {
    alive.current = true;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const wait = (ms: number) => new Promise<void>((r) => { const id = setTimeout(() => alive.current && r(), ms); timers.push(id); });
    const type = async (t: string, s = 13) => { if (reduce) { setPartial(t); return; } for (let i = 1; i <= t.length; i++) { if (!alive.current) return; setPartial(t.slice(0, i)); await wait(s); } };
    (async function loop() {
      while (alive.current) {
        setShown([]); setPartial(""); setTyping(false); await wait(700);
        for (const m of SCRIPT) {
          if (!alive.current) return;
          if (m.role === "user") { setShown((p) => [...p, m]); await wait(900); }
          else { setTyping(true); await wait(700); setTyping(false); await type(m.text); setShown((p) => [...p, m]); setPartial(""); await wait(900); }
        }
        await wait(5500);
      }
    })();
    return () => { alive.current = false; timers.forEach(clearTimeout); };
  }, []);
  return (
    <div className="term" style={{ display: "flex", flexDirection: "column", height: 430, boxShadow: "0 40px 80px -36px rgba(0,0,0,.6)" }}>
      <div className="term-h flex items-center gap-2.5 px-4 h-12">
        <div className="h-6 w-6 rounded-md grid place-items-center" style={{ background: "var(--gold-2)" }}><AgentGlyph s={13} c="#3b2606" /></div>
        <span className="text-[13px] font-extrabold" style={{ color: "#fff" }}>Actuarius</span>
        <span className="mono ml-auto text-[10.5px] px-2 py-0.5 rounded" style={{ background: "rgba(255,255,255,.1)", color: "#c5c2ec" }}>Motor TPL · 2025Q4</span>
      </div>
      <div ref={scroll} className="p-4 space-y-4 flex-1 overflow-y-auto">
        {shown.map((m, i) => <Bubble key={i} m={m} />)}
        {typing && <div className="flex items-center gap-2"><div className="h-6 w-6 rounded-full grid place-items-center shrink-0" style={{ background: "var(--gold-2)" }}><AgentGlyph s={12} c="#3b2606" /></div><div className="bub-a rounded-2xl px-4 py-3 flex items-center gap-1" style={{ borderTopLeftRadius: 4 }}><span className="bdot" /><span className="bdot" /><span className="bdot" /></div></div>}
        {partial && <div className="flex justify-start"><div className="flex items-start w-full"><div className="h-6 w-6 rounded-full grid place-items-center shrink-0 mt-0.5 mr-2" style={{ background: "var(--gold-2)" }}><AgentGlyph s={12} c="#3b2606" /></div><div className="bub-a max-w-[85%] rounded-2xl px-4 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap" style={{ borderTopLeftRadius: 4 }}>{partial}<span className="cur" /></div></div></div>}
      </div>
      <div className="px-4 py-3" style={{ borderTop: "1px solid rgba(255,255,255,.12)" }}>
        <div className="flex items-center gap-2">
          <div className="flex-1 rounded-lg px-3 py-2 text-[12.5px] mono" style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.14)", color: "#9a96c9" }}>komut verin…</div>
          <button className="h-9 w-9 rounded-lg grid place-items-center shrink-0" style={{ background: "var(--gold-2)" }} aria-label="Gönder"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="m5 12 14-7-3.5 19L12 13 5 12Z" stroke="#3b2606" strokeWidth="1.8" strokeLinejoin="round" /></svg></button>
        </div>
      </div>
    </div>
  );
}

function Bubble({ m }: { m: Msg }) {
  if (m.role === "user") return <div className="flex justify-end"><div className="bub-u max-w-[85%] rounded-2xl px-4 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap" style={{ borderTopRightRadius: 4 }}>{m.text}</div></div>;
  return <div className="flex justify-start"><div className="flex items-start w-full"><div className="h-6 w-6 rounded-full grid place-items-center shrink-0 mt-0.5 mr-2" style={{ background: "var(--gold-2)" }}><AgentGlyph s={12} c="#3b2606" /></div><div className="bub-a max-w-[85%] rounded-2xl px-4 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap" style={{ borderTopLeftRadius: 4 }}>{m.text}</div></div></div>;
}

// ─── Security ─────────────────────────────────────────────────────────────────

function Security() {
  const items = [[<LockIcon key="l" />, "Şifreli depolama", "Cloudflare D1 üzerinde şifreli; bağlantılar TLS 1.3."], [<ShieldIcon key="s" />, "Firebase Auth", "Endüstri standardı kimlik doğrulama — Google veya şifre."], [<EyeIcon key="e" />, "Ham veri LLM'e gitmez", "Agent yalnızca agrega sonuçları (LDF, CDF, IBNR) görür."], [<ServerIcon key="v" />, "Veri izolasyonu", "Her kullanıcı izole; Enterprise'da on-premise kurulum."]] as [ReactNode, string, string][];
  return (
    <section id="security" className="py-20 md:py-28" style={{ background: "var(--paper)" }}>
      <div className="mx-auto max-w-[1180px] px-6 md:px-8 grid lg:grid-cols-[0.8fr_1.2fr] gap-10 lg:gap-16 items-start">
        <div data-rv>
          <div className="kick" style={{ color: "var(--violet-2)" }}>GÜVENLİK</div>
          <h2 className="h2 mt-3">Aktüeryal veri hassastır.<br />Mimari buna göre.</h2>
          <p className="lede mt-5 text-[16px]" style={{ maxWidth: "44ch" }}>Şifreleme, kimlik doğrulama ve veri izolasyonu sonradan eklenmiş değil — temel mimarinin parçası.</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-x-10 gap-y-8" data-rv data-rvd={0.06}>
          {items.map(([ic, t, d]) => <div key={t} className="flex items-start gap-3.5"><div className="w-10 h-10 rounded-[11px] grid place-items-center shrink-0" style={{ background: "#eee9ff" }}>{ic}</div><div><div className="text-[15px] font-extrabold mb-1">{t}</div><div className="text-[13.5px] leading-relaxed" style={{ color: "var(--ink-2)" }}>{d}</div></div></div>)}
        </div>
      </div>
    </section>
  );
}

// ─── Pricing ──────────────────────────────────────────────────────────────────

const PLANS = [
  { name: "Free", price: "₺0", sub: "kalıcı ücretsiz", desc: "Küçük portföyler ve keşif için.", cta: "Ücretsiz başla", href: "/reserve", feat: false, f: [["Rezerv modülü", "1 dönem · 1 branş"], ["Chain-Ladder & BF", "İki yöntem"], ["AI Agent", "Sınırsız mesaj"], ["Excel export", "Temel"]], miss: ["Parametrik tail fitting", "Nakit akışı modülü", "Sınırsız dönem & branş"] },
  { name: "Pro", price: "₺100", sub: "/ ay", desc: "Profesyonel aktüerler için tam kapsam.", cta: "Pro'ya geç", href: "/onboarding/plan", feat: true, f: [["Sınırsız dönem & branş", "Limit yok"], ["Parametrik tail fitting", "4 model"], ["Nakit akışı modülü", "CDF tabanlı"], ["AI Agent", "Sınırsız"], ["Erken erişim", "IFRS 17 & İskonto"], ["Gelişmiş export", "Çok sayfalı"], ["Öncelikli destek", ""]], miss: [] },
  { name: "Enterprise", price: "Özel", sub: "talebe göre", desc: "Ekip, entegrasyon ve SLA.", cta: "İletişime geç", href: "mailto:demireleren877@gmail.com", feat: false, f: [["Pro'nun tümü", "Tam erişim"], ["Çoklu kullanıcı & roller", "Sınırsız"], ["SSO / SAML", "Kurumsal"], ["On-premise", "İsteğe bağlı"], ["API erişimi", "REST & webhook"], ["Özel SLA", ""]], miss: [] },
] as const;

function Pricing() {
  return (
    <section id="pricing" className="py-20 md:py-28" style={{ background: "var(--paper-2)" }}>
      <div className="mx-auto max-w-[1180px] px-6 md:px-8">
        <div className="max-w-2xl mb-12" data-rv>
          <div className="kick" style={{ color: "var(--violet-2)" }}>FİYAT</div>
          <h2 className="h2 mt-3">Şeffaf, esnek</h2>
          <p className="lede mt-4 text-[16.5px]" style={{ maxWidth: "52ch" }}>Free planla ücretsiz başlayın; ihtiyaç arttığında Pro&apos;ya geçin. Aylık abonelik, gizli ücret yok.</p>
        </div>
        <div className="grid lg:grid-cols-3 gap-5 items-stretch">{PLANS.map((p, i) => <div key={p.name} data-rv data-rvd={i * 0.06}><Plan p={p} /></div>)}</div>
      </div>
    </section>
  );
}

function Plan({ p }: { p: (typeof PLANS)[number] }) {
  const { name, price, sub, desc, cta, href, feat, f, miss } = p;
  return (
    <div className="rounded-[16px] p-7 flex flex-col h-full relative drench" style={feat ? {} : { background: "var(--card)", border: "1px solid var(--line)" }}>
      {feat && <><span className="blob b1" style={{ width: 360, height: 360, top: -120, left: -60 }} /><span className="grain" /></>}
      {feat && <span className="absolute -top-3 left-7 mono text-[10.5px] font-extrabold tracking-wider px-2.5 py-1 rounded" style={{ background: "var(--gold-2)", color: "#3b2606", zIndex: 1 }}>ÖNERİLEN</span>}
      <div className="relative mb-5">
        <div className="text-[14px] font-extrabold mb-3" style={{ color: feat ? "var(--gold-2)" : "var(--ink-2)" }}>{name}</div>
        <div className="flex items-baseline gap-2 mb-2"><span className="mono text-[36px] font-extrabold" style={{ letterSpacing: "-0.02em", color: feat ? "#fff" : "var(--ink)" }}>{price}</span>{sub && <span className="text-[13px]" style={{ color: feat ? "var(--on-color-2)" : "var(--muted)" }}>{sub}</span>}</div>
        <p className="text-[13.5px] leading-relaxed" style={{ color: feat ? "var(--on-color-2)" : "var(--ink-2)" }}>{desc}</p>
      </div>
      <Link href={href} className={"btn justify-center mb-6 relative " + (feat ? "btn-gold" : "btn-outline")} style={{ width: "100%" }}>{cta}</Link>
      <div className="relative space-y-3 flex-1">
        {f.map(([v, n]) => <div key={v} className="flex items-start gap-2.5"><Check color={feat ? "var(--gold-2)" : "var(--violet-2)"} /><div><div className="text-[13.5px] font-bold" style={{ color: feat ? "#fff" : "var(--ink)" }}>{v}</div>{n && <div className="text-[12px]" style={{ color: feat ? "#a59fd6" : "var(--muted)" }}>{n}</div>}</div></div>)}
        {miss.map((m) => <div key={m} className="flex items-start gap-2.5" style={{ color: "#9aa3b2" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="mt-0.5 shrink-0"><path d="M6 12h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg><div className="text-[13.5px]">{m}</div></div>)}
      </div>
    </div>
  );
}

// ─── FAQ ──────────────────────────────────────────────────────────────────────

const FAQS = [
  ["Actuarius kimler için?", "Hasar rezervi hesaplayan aktüerlerden IFRS 17 raporlaması yapan ekiplere — Excel'den ve sayfalar arası manuel veri taşımaktan kurtulmak isteyen profesyonel sigorta aktüerleri için."],
  ["Şu anda hangi modüller var?", "Rezerv Analizi ve Nakit Akışı tam aktiftir. Rezerv'de Chain-Ladder, Bornhuetter–Ferguson, 4 parametrik tail modeli, ILR ısı haritası ve AI Agent yer alır. Nakit Akışı, rezerv sonuçlarınızdan CDF tabanlı CF pattern üretir."],
  ["IFRS 17 ve İskonto ne zaman?", "İkisi de aktif geliştirmede. İskonto Q4 2026, IFRS 17 Q1 2027 için planlı. Pro kullanıcıları her ikisine erken erişir."],
  ["Verilerim güvende mi?", "Veriler Cloudflare D1'de şifreli saklanır, bağlantılar TLS 1.3 ile korunur. AI Agent ham üçgene erişemez; yalnızca LDF, CDF, IBNR gibi agrega sonuçları görür. Ham veri hiçbir zaman LLM'e iletilmez."],
  ["Free planda neler var?", "Rezerv'de 1 dönem ve 1 branş, Chain-Ladder, BF, AI Agent ve temel Excel export. Parametrik tail fitting, nakit akışı ve sınırsız dönem/branş Pro'dadır."],
  ["Plan değiştirebilir miyim?", "Evet. Pro aylık aboneliktir; iptal ettiğinizde dönem sonuna kadar Pro sürer, ardından Free'ye dönersiniz. Verileriniz korunur."],
  ["Hangi veri formatları?", "Excel (.xlsx) ve CSV. Kümülatif/artımsal üçgenler, ödeme/gerçekleşen veriler — format otomatik algılanır. Yıllık ve çeyreklik granülarite desteklenir."],
];

function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="py-20 md:py-28" style={{ background: "var(--paper)" }}>
      <div className="mx-auto max-w-3xl px-6 md:px-8">
        <div className="kick" style={{ color: "var(--violet-2)" }} data-rv>SSS</div>
        <h2 className="h2 mt-3 mb-9" data-rv>Sık sorulan sorular</h2>
        <div style={{ borderTop: "1px solid var(--line)" }}>
          {FAQS.map(([q, a], i) => {
            const o = open === i;
            return (
              <div key={i} data-rv data-rvd={i * 0.02} style={{ borderBottom: "1px solid var(--line)" }}>
                <button onClick={() => setOpen(o ? null : i)} className="w-full py-5 flex items-center justify-between gap-4 text-left" aria-expanded={o}>
                  <span className="text-[15.5px] font-bold">{q}</span>
                  <span className="w-6 h-6 grid place-items-center shrink-0" style={{ color: "var(--violet-2)", transform: o ? "rotate(45deg)" : "none", transition: "transform .35s cubic-bezier(.16,1,.3,1)" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></span>
                </button>
                <div className={"faq " + (o ? "open" : "")}><div><p className="pb-5 text-[14px] leading-[1.7]" style={{ color: "var(--ink-2)", maxWidth: "66ch" }}>{a}</p></div></div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─── Final CTA (drench) ───────────────────────────────────────────────────────

function CTABand() {
  return (
    <section className="py-20 md:py-28" style={{ background: "var(--paper)" }}>
      <div className="mx-auto max-w-[1180px] px-6 md:px-8">
        <div className="drench rounded-[22px] px-8 md:px-16 py-16 md:py-20" data-rv>
          <span className="blob b1" style={{ top: -140, left: "10%" }} /><span className="blob b2" style={{ bottom: -160, right: "8%", top: "auto" }} /><span className="blob b-gold" /><span className="grain" />
          <div className="relative max-w-2xl">
            <h2 className="display" style={{ color: "#fff", fontSize: "clamp(2.1rem,1.2rem+3.2vw,3.5rem)" }}>Sonraki çeyrek kapanışını Actuarius ile yapın</h2>
            <p className="mt-5 text-[16px]" style={{ color: "var(--on-color-2)", maxWidth: "50ch", lineHeight: 1.6 }}>Free plan kalıcı ücretsiz. Kart gerekmez — beş dakikada ilk üçgeninizi yükleyin.</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/reserve" className="btn btn-gold">Ücretsiz başla <Arrow /></Link>
              <a href="mailto:demireleren877@gmail.com" className="btn btn-glass">Enterprise ile konuş</a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="py-14 md:py-16" style={{ background: "var(--paper-2)", borderTop: "1px solid var(--line)" }}>
      <div className="mx-auto max-w-[1180px] px-6 md:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
          <div className="col-span-2">
            <Link href="/" className="flex items-center gap-2 mb-4"><img src="/favicon.png" alt="Actuarius" className="h-6 w-6" /><span className="text-[15px] font-extrabold tracking-tight">Actuarius</span></Link>
            <p className="text-[13.5px] leading-relaxed max-w-sm" style={{ color: "var(--muted)" }}>Sigorta aktüerleri için modern hesaplama platformu. Rezerv, nakit akışı, IFRS 17 ve iskonto — tek arayüzde.</p>
          </div>
          {[["Platform", [["#modules", "Modüller"], ["#agent", "AI Agent"], ["#security", "Güvenlik"], ["#pricing", "Fiyat"]]], ["Şirket", [["mailto:demireleren877@gmail.com", "E-posta"], ["/terms", "Kullanım şartları"], ["/privacy", "Gizlilik"], ["/refund", "İade politikası"]]]].map(([title, links]) => (
            <div key={title as string}>
              <div className="kick mb-3" style={{ fontSize: 10.5, color: "var(--muted)" }}>{title as string}</div>
              <ul className="space-y-2 text-[13.5px]">{(links as [string, string][]).map(([h, l]) => <li key={l}>{h.startsWith("/") ? <Link href={h} className="hover:underline" style={{ color: "var(--ink-2)" }}>{l}</Link> : <a href={h} className="hover:underline" style={{ color: "var(--ink-2)" }}>{l}</a>}</li>)}</ul>
            </div>
          ))}
        </div>
        <div className="pt-6 flex flex-col md:flex-row items-center justify-between gap-3 mono text-[12px]" style={{ borderTop: "1px solid var(--line)", color: "#9aa3b2" }}><span>© 2026 Actuarius</span><span>İstanbul, Türkiye</span></div>
      </div>
    </footer>
  );
}

// ─── Atoms ────────────────────────────────────────────────────────────────────

function Arrow() { return <svg className="arr" width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function Check({ color = "var(--violet-2)" }: { color?: string }) { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="shrink-0 mt-0.5"><path d="M5 12l4 4L20 6" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function AgentGlyph({ s = 14, c = "#fff" }: { s?: number; c?: string }) { return <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M12 2a5 5 0 1 1 0 10A5 5 0 0 1 12 2zm0 13c-5.33 0-8 2.67-8 4v1h16v-1c0-1.33-2.67-4-8-4z" fill={c} /></svg>; }
function LockIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="5" y="11" width="14" height="10" rx="2" stroke="var(--violet)" strokeWidth="2" /><path d="M8 11V8a4 4 0 1 1 8 0v3" stroke="var(--violet)" strokeWidth="2" strokeLinecap="round" /></svg>; }
function ShieldIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 2 4 6v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V6l-8-4z" stroke="var(--violet)" strokeWidth="2" strokeLinejoin="round" /><path d="m9 12 2 2 4-4" stroke="var(--violet)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function EyeIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M3 3l18 18 M10.5 6.2A10 10 0 0 1 22 12s-1.5 3-4 5 M14 17.8A10 10 0 0 1 2 12s2-4 6-5.5" stroke="var(--violet)" strokeWidth="2" strokeLinecap="round" /><path d="M9 9.5a3 3 0 0 0 5.5 2" stroke="var(--violet)" strokeWidth="2" strokeLinecap="round" /></svg>; }
function ServerIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="6" rx="1.5" stroke="var(--violet)" strokeWidth="2" /><rect x="3" y="14" width="18" height="6" rx="1.5" stroke="var(--violet)" strokeWidth="2" /><circle cx="7" cy="7" r=".8" fill="var(--violet)" /><circle cx="7" cy="17" r=".8" fill="var(--violet)" /></svg>; }

function CountUp({ to }: { to: number }) {
  const [v, setV] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setV(to); return; }
    let start: number | null = null, raf = 0;
    const tick = (t: number) => { if (!start) start = t; const p = Math.min((t - start) / 1500, 1); setV(Math.floor((1 - Math.pow(1 - p, 3)) * to)); if (p < 1) raf = requestAnimationFrame(tick); };
    const obs = new IntersectionObserver((es) => { if (es[0].isIntersecting) raf = requestAnimationFrame(tick); }, { threshold: 0.1 });
    if (ref.current) obs.observe(ref.current);
    return () => { cancelAnimationFrame(raf); obs.disconnect(); };
  }, [to]);
  return <span ref={ref}>{v.toLocaleString("tr-TR")}</span>;
}
