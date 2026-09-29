"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { sendContact } from "@/lib/sync/worker-client";
import { WebMcpTools } from "@/components/WebMcpTools";
import { faqSchema, softwareSchema, SITE } from "@/lib/seo";
import type { LandingContent } from "@/lib/content/landing";
import styles from "@/app/landing.module.css";

/**
 * Landing — TR (/) ve EN (/en) tarafından paylaşılır; metinler `c` sözlüğünden gelir.
 *
 * Görsel dil: temiz kağıt, kobalt veri. Hero'da gelişim üçgeninin gerçek 3D hali
 * (beyaz zeminli döngü, multiply ile sayfaya karışır) ve imleçle hafif derinlik.
 * Hareket: `data-reveal` taşıyan öğeler görünür alana girince `data-in` alır.
 * prefers-reduced-motion açıksa her şey baştan görünür, otomatik akışlar durur.
 */

const FILM = "/film/actuarius-film.mp4";
const HERO_LOOP = "/film/hero-loop-light";
const HERO_POSTER = "/film/hero-light-poster.jpg";
const FILM_POSTER = "/film/hero-poster.jpg";
const MODULE_CYCLE_MS = 7000;

type IconName = "arrow" | "check" | "data" | "model" | "flow" | "discount" | "spark" | "lock" | "menu" | "close" | "play" | "layers" | "trail";

function Icon({ name, className }: { name: IconName; className?: string }) {
  const paths: Record<IconName, React.ReactNode> = {
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    check: <path d="m5 12 4 4L19 6" />,
    data: <><ellipse cx="12" cy="5" rx="7" ry="3" /><path d="M5 5v14c0 4 14 4 14 0V5M5 12c0 4 14 4 14 0" /></>,
    model: <path d="M4 20h16M5 16V9m5 7V5m5 11v-5m5 5V3" />,
    flow: <path d="M3 17 8 8l5 5 8-10M3 21h18" />,
    discount: <path d="M4 4v16h16M7 8l4 3 4 1 6 1" />,
    spark: <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" />,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" /></>,
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    play: <path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none" />,
    layers: <path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5" />,
    trail: <><path d="M7 4v16" /><circle cx="7" cy="7" r="1.6" /><circle cx="7" cy="12" r="1.6" /><circle cx="7" cy="17" r="1.6" /><path d="M11 7h8M11 12h6M11 17h7" /></>,
  };
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

const moduleIcons = ["data", "model", "flow", "discount"] as const;
const govIcons = ["layers", "lock", "trail"] as const;
const claimRows = [
  ["FH-2021-048", "2021", "248.600", "64.200"],
  ["FH-2022-016", "2022", "182.400", "91.500"],
  ["FH-2023-032", "2023", "136.800", "124.700"],
  ["FH-2024-007", "2024", "94.300", "168.400"],
  ["FH-2025-021", "2025", "52.100", "213.600"],
];

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Görünür alana giren öğeleri işaretler (tek gözlemci, tüm sayfa). */
function useReveal(root: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const items = Array.from(el.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (!("IntersectionObserver" in window)) {
      items.forEach((i) => i.setAttribute("data-in", ""));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.setAttribute("data-in", "");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    items.forEach((i) => io.observe(i));
    return () => io.disconnect();
  }, [root]);
}

/** Temsili çalışma alanı — gösterim amaçlı örnek veriler (demo.note). */
function ModuleVisual({ index, c }: { index: number; c: LandingContent }) {
  return (
    <div className={styles.workspace}>
      <div className={styles.workspaceTop}>
        <span className={styles.workspaceDots}><i /><i /><i /></span>
        <b>Fire & Home</b>
        <span className={styles.period}>2026 Q2</span>
      </div>
      <div className={styles.workspaceContext}>
        <span>{c.demo.period} <b>2026 Q2</b></span>
        <span>{c.demo.branch} <b>Fire & Home</b></span>
      </div>
      <div className={styles.visualBody}>
        <div className={styles.visualHeading}>
          <h4>{[c.demo.source, c.demo.triangle, c.demo.pattern, c.demo.curve][index]}</h4>
          <span>{index === 0 ? "CSV" : index === 1 ? "LDF" : index === 2 ? "2026–2030" : "IFRS 17"}</span>
        </div>
        {index === 0 && (
          <>
            <div className={styles.dataFile}>
              <Icon name="data" />
              <span>fire_home_claims.csv</span>
              <span className={styles.ready}><Icon name="check" />{c.demo.status[0]}</span>
            </div>
            <div className={styles.tableScroll}>
              <table className={styles.claimTable}>
                <thead><tr>{[c.demo.claim, c.demo.year, c.demo.paid, c.demo.outstanding].map((t) => <th key={t}>{t}</th>)}</tr></thead>
                <tbody>{claimRows.map((r, ri) => <tr key={r[0]} style={{ ["--r" as string]: ri }}>{r.map((v, i) => <td key={i}>{v}</td>)}</tr>)}</tbody>
              </table>
            </div>
            <div className={styles.mapping}><span>claim_id</span><Icon name="arrow" /><span>{c.demo.claim}</span><Icon name="check" /></div>
          </>
        )}
        {index === 1 && (
          <div className={styles.tableScroll}>
            <table className={styles.triangleTable}>
              <thead><tr><th>{c.demo.year}</th>{[1, 2, 3, 4, 5, 6].map((n) => <th key={n}>{n} → {n + 1}</th>)}</tr></thead>
              <tbody>
                {Array.from({ length: 6 }, (_, row) => (
                  <tr key={row}>
                    <th>{2020 + row}</th>
                    {Array.from({ length: 6 }, (_, col) => (
                      <td key={col} data-projected={row + col > 5} data-outlier={row === 2 && col === 2} style={{ ["--d" as string]: row + col }}>
                        {row + col > 5 ? "—" : row === 2 && col === 2 ? "1.842" : (1 + 0.61 / (col + 1) + row * 0.012).toFixed(3)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><th>{c.demo.selection}</th>{["1.640", "1.335", "1.225", "1.178", "1.148", "1.127"].map((v) => <td key={v}>{v}</td>)}</tr></tfoot>
            </table>
          </div>
        )}
        {index === 2 && (
          <>
            <div className={styles.chartLegend}><span><i />{c.demo.projection}</span></div>
            <svg className={styles.chart} viewBox="0 0 500 215" role="img" aria-label={c.demo.pattern}>
              <g stroke="#e8e6f2">{[35, 80, 125, 170].map((y) => <path d={`M24 ${y}H480`} key={y} />)}</g>
              {[135, 115, 99, 85, 70, 59, 49, 40, 32, 25, 18, 13].map((h, i) => (
                <rect key={i} className={styles.bar} style={{ ["--i" as string]: i }} x={33 + i * 37} y={180 - h} width="24" height={h} rx="4"
                  fill={i < 4 ? "#3a42ff" : i < 8 ? "#8d94ff" : "#cfd2ff"} />
              ))}
              {["2026", "2027", "2028", "2029", "2030"].map((t, i) => <text key={t} x={30 + i * 105} y="207" fill="#6b6f85" fontSize="11">{t}</text>)}
            </svg>
            <div className={styles.visualFoot}>{c.modules.items[2].tags[1]}<span>Fire & Home</span></div>
          </>
        )}
        {index === 3 && (
          <>
            <div className={styles.chartLegend}><span><i />{c.demo.curve}</span><span><i className={styles.legendPale} />{c.demo.discounted}</span></div>
            <svg className={styles.chart} viewBox="0 0 500 215" role="img" aria-label={c.demo.curve}>
              <g stroke="#e8e6f2">{[35, 80, 125, 170].map((y) => <path d={`M24 ${y}H480`} key={y} />)}</g>
              <path d="M30 48C80 65 85 89 130 103S195 127 238 131 310 141 360 145 419 149 475 150V180H30Z" fill="#eef0ff" />
              <path className={styles.drawLine} d="M30 48C80 65 85 89 130 103S195 127 238 131 310 141 360 145 419 149 475 150" stroke="#3a42ff" strokeWidth="3" fill="none" pathLength={1} />
              <path d="M30 74C80 90 85 115 130 130S195 150 238 154 310 161 360 164 419 167 475 168" stroke="#c07443" strokeWidth="2" strokeDasharray="5 5" fill="none" />
              {["1Y", "5Y", "10Y", "15Y", "20Y"].map((t, i) => <text key={t} x={30 + i * 109} y="207" fill="#6b6f85" fontSize="11">{t}</text>)}
            </svg>
            <div className={styles.visualFoot}>{c.modules.items[3].tags[2]}<span>LIC</span></div>
          </>
        )}
      </div>
      <div className={styles.workspaceBottom}><span><i />{c.demo.status[index]}</span><Icon name="lock" /></div>
    </div>
  );
}

export function LandingPage({ c }: { c: LandingContent }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const filmRef = useRef<HTMLDialogElement>(null);
  const [activeModule, setActiveModule] = useState(0);
  const [autoplay, setAutoplay] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuButton = useRef<HTMLButtonElement>(null);
  const [form, setForm] = useState({ name: "", email: "", company: "", message: "", website: "" });
  const [status, setStatus] = useState<"idle" | "sending" | "ok" | "error">("idle");
  const [errMsg, setErrMsg] = useState("");
  const [sentEmail, setSentEmail] = useState("");

  useReveal(rootRef);

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  // Modül sekmeleri kendiliğinden ilerler; kullanıcı dokunduğu anda durur.
  useEffect(() => {
    if (!autoplay || prefersReducedMotion()) return;
    const t = window.setTimeout(() => setActiveModule((i) => (i + 1) % 4), MODULE_CYCLE_MS);
    return () => window.clearTimeout(t);
  }, [autoplay, activeModule]);

  const fillContact = useCallback((fields: { name: string; email: string; company: string; message: string }) => {
    setForm({ ...fields, website: "" });
    setStatus("idle");
    setErrMsg("");
  }, []);
  const set = (k: keyof typeof form) => (ev: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: ev.target.value }));

  async function submitContact(e: React.FormEvent) {
    e.preventDefault();
    if (status === "sending") return;
    setStatus("sending");
    setErrMsg("");
    try {
      await sendContact(form);
      setSentEmail(form.email);
      setStatus("ok");
      setForm({ name: "", email: "", company: "", message: "", website: "" });
    } catch (error) {
      setStatus("error");
      setErrMsg(error instanceof Error ? error.message : c.contact.genericError);
    }
  }

  const pickModule = (i: number) => {
    setAutoplay(false);
    setActiveModule(i);
  };
  function changeTab(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = e.key === "ArrowRight" ? (index + 1) % 4 : e.key === "ArrowLeft" ? (index + 3) % 4 : e.key === "Home" ? 0 : e.key === "End" ? 3 : null;
    if (next !== null) {
      e.preventDefault();
      pickModule(next);
      tabs.current[next]?.focus();
    }
  }

  const openFilm = () => {
    const d = filmRef.current;
    if (!d) return;
    d.showModal();
    d.querySelector("video")?.play().catch(() => {});
  };
  const closeFilm = () => {
    const d = filmRef.current;
    if (!d) return;
    d.querySelector("video")?.pause();
    d.close();
  };

  // Hero sahnesi imleçle hafifçe eğilir (yalnızca hassas işaretçilerde).
  const heroRef = useRef<HTMLElement>(null);
  const tilt = (e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType !== "mouse" || prefersReducedMotion()) return;
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--tx", ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
    e.currentTarget.style.setProperty("--ty", ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
  };
  const untilt = () => {
    heroRef.current?.style.setProperty("--tx", "0");
    heroRef.current?.style.setProperty("--ty", "0");
  };

  const navItems = [["modules", c.nav.modules], ["agent", c.nav.agent], ["governance", c.nav.governance], ["pricing", c.nav.pricing]];
  const lines = (s: string) => s.split("\n").map((l, i) => <span key={i} className={styles.line}>{l}</span>);

  return (
    <div className={styles.page} lang={c.locale} ref={rootRef}>
      <WebMcpTools c={c} onFillContact={fillContact} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([softwareSchema(c.locale), faqSchema(c.locale)]) }} />
      <a className={styles.skipLink} href="#main-content">{c.nav.skip}</a>

      <header
        className={`${styles.header} ${scrolled || menuOpen ? styles.headerSolid : ""}`}
        onKeyDown={(e) => {
          if (e.key === "Escape" && menuOpen) {
            setMenuOpen(false);
            menuButton.current?.focus();
          }
        }}
      >
        <div className={styles.nav}>
          <Link href={c.path} className={styles.brand} aria-label="Actuarius">
            <Image src="/logo-128.png" alt="" width={30} height={30} priority className={styles.logo} />
            Actuarius<span className={styles.brandDot}>.</span>
          </Link>
          <nav className={styles.navLinks} aria-label={c.nav.menu}>
            {navItems.map(([id, t]) => <a key={id} href={`#${id}`}>{t}</a>)}
          </nav>
          <div className={styles.navActions}>
            <Link className={styles.lang} href={c.nav.otherLangPath} hrefLang={c.locale === "tr" ? "en" : "tr"}>{c.nav.otherLang}</Link>
            <Link className={styles.login} href="/login">{c.nav.login}</Link>
            <Link className={styles.navStart} href="/reserve">{c.nav.cta}<Icon name="arrow" /></Link>
            <button className={styles.menuToggle} ref={menuButton} type="button" aria-expanded={menuOpen} aria-controls="mobile-nav" aria-label={c.nav.menu} onClick={() => setMenuOpen(!menuOpen)}>
              <Icon name={menuOpen ? "close" : "menu"} />
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav id="mobile-nav" className={styles.mobileNav} aria-label={c.nav.menu}>
            {navItems.map(([id, t]) => <a key={id} href={`#${id}`} onClick={() => setMenuOpen(false)}>{t}<Icon name="arrow" /></a>)}
            <Link href="/login">{c.nav.login}</Link>
            <Link href="/reserve">{c.nav.cta}</Link>
          </nav>
        )}
      </header>

      <main id="main-content">
        {/* ── Hero ── */}
        <section className={styles.hero} aria-labelledby="hero-title" onPointerMove={tilt} onPointerLeave={untilt} ref={heroRef}>
          <div className={styles.heroBackdrop} aria-hidden="true" />
          <div className={`${styles.wrap} ${styles.heroGrid}`}>
            <div className={styles.heroCopy}>
              <p className={styles.eyebrow} data-reveal><span className={styles.pulse} />{c.hero.eyebrow}</p>
              <h1 id="hero-title" data-reveal style={{ ["--d" as string]: "80ms" }}>
                <span className={styles.line}>{c.hero.title1}</span>
                <span className={`${styles.line} ${styles.gradText}`}>{c.hero.title2}</span>
              </h1>
              <p className={styles.lede} data-reveal style={{ ["--d" as string]: "160ms" }}>{c.hero.lede}</p>
              <div className={styles.actions} data-reveal style={{ ["--d" as string]: "240ms" }}>
                <Link className={styles.button} href="/reserve">{c.hero.ctaPrimary}<Icon name="arrow" /></Link>
                <a className={styles.buttonOutline} href="#modules">{c.hero.ctaSecondary}</a>
                <button type="button" className={styles.filmButton} onClick={openFilm}>
                  <span className={styles.playDot}><Icon name="play" /></span>
                  {c.hero.film}
                  <em>1:11</em>
                </button>
              </div>
              <p className={styles.heroNote} data-reveal style={{ ["--d" as string]: "320ms" }}>{c.hero.note}</p>
            </div>

            <figure className={styles.heroArt} data-reveal style={{ ["--d" as string]: "200ms" }}>
              <div className={styles.artCaption}><span>ACTUARIUS / DEVELOPMENT ENGINE</span><span>01—∞</span></div>
              <div className={styles.artStage}>
                <video className={styles.heroVideo} poster={HERO_POSTER} autoPlay muted loop playsInline preload="auto" aria-hidden="true">
                  <source src={`${HERO_LOOP}.webm`} type="video/webm" />
                  <source src={`${HERO_LOOP}.mp4`} type="video/mp4" />
                </video>
                <span className={`${styles.artTag} ${styles.tagObserved}`}><i />{c.demo.observed}</span>
                <span className={`${styles.artTag} ${styles.tagProjected}`}><i />{c.demo.projection}</span>
              </div>
              <figcaption>
                <span className={styles.artAgent}><Icon name="spark" />AI + actuarial intelligence</span>
                <span>{c.hero.caption}</span>
              </figcaption>
            </figure>
          </div>

          <div className={`${styles.wrap} ${styles.heroRail}`} data-reveal style={{ ["--d" as string]: "420ms" }}>
            <span className={styles.railSummary}>{c.demo.summary}</span>
            <div className={styles.railItems}>
              {c.modules.items.map((m, i) => (
                <a key={m.t} href="#modules" onClick={() => pickModule(i)}>
                  <Icon name={moduleIcons[i]} />
                  <b>{m.t}</b>
                  <i>{m.s}</i>
                </a>
              ))}
            </div>
          </div>
        </section>

        {/* ── Giriş — büyük ifade + üç fayda ── */}
        <section className={styles.intro}>
          <div className={styles.wrap}>
            <div className={styles.introHead}>
              <h2 data-reveal>{lines(c.intro.title)}</h2>
              <p data-reveal style={{ ["--d" as string]: "120ms" }}>{c.intro.p}</p>
            </div>
            <div className={styles.benefits}>
              {c.intro.items.map((item, i) => (
                <div key={item.t} className={styles.benefit} data-reveal style={{ ["--d" as string]: `${i * 110}ms` }}>
                  <span className={styles.benefitIndex}>0{i + 1}</span>
                  <h3>{item.t}</h3>
                  <p>{item.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Platform — modül sekmeleri + canlı çalışma alanı ── */}
        <section className={styles.platform} id="modules">
          <div className={styles.wrap}>
            <div className={styles.sectionHeading} data-reveal>
              <span className={styles.sectionLabel}>{c.modules.label}</span>
              <h2>{lines(c.modules.h2)}</h2>
              <p>{c.modules.p}</p>
            </div>

            <div className={styles.moduleTabs} role="tablist" aria-label={c.nav.modules} data-reveal>
              {c.modules.items.map((m, i) => (
                <button
                  key={m.t}
                  ref={(el) => { tabs.current[i] = el; }}
                  id={`module-tab-${i}`}
                  type="button"
                  role="tab"
                  aria-selected={activeModule === i}
                  aria-controls={`module-panel-${i}`}
                  tabIndex={activeModule === i ? 0 : -1}
                  onClick={() => pickModule(i)}
                  onKeyDown={(e) => changeTab(e, i)}
                  className={styles.moduleTab}
                >
                  <span className={styles.tabIcon}><Icon name={moduleIcons[i]} /></span>
                  <span className={styles.tabText}>
                    <span className={styles.tabIndex}>0{i + 1}</span>
                    <b>{m.t}</b>
                    <span className={styles.tabVerb}>{m.s}</span>
                  </span>
                  <span className={styles.tabProgress} aria-hidden="true">
                    <i key={`${activeModule}-${autoplay}`} data-run={activeModule === i && autoplay ? "" : undefined} style={{ ["--ms" as string]: `${MODULE_CYCLE_MS}ms` }} />
                  </span>
                </button>
              ))}
            </div>

            {c.modules.items.map((m, i) => (
              <div
                key={m.t}
                id={`module-panel-${i}`}
                role="tabpanel"
                aria-labelledby={`module-tab-${i}`}
                hidden={activeModule !== i}
                tabIndex={0}
                className={styles.modulePanel}
                onPointerEnter={() => setAutoplay(false)}
                onFocus={() => setAutoplay(false)}
              >
                <div className={styles.moduleCopy}>
                  <span className={styles.moduleNumber}>0{i + 1} / 04</span>
                  <h3>{lines(m.title)}</h3>
                  <p>{m.d}</p>
                  <ul className={styles.featureList}>{m.tags.map((t) => <li key={t}><Icon name="check" />{t}</li>)}</ul>
                  <a href="#contact" className={styles.textLink}>
                    {c.locale === "tr" ? "Ekibiniz için keşfedin" : "Explore it for your team"}<Icon name="arrow" />
                  </a>
                </div>
                <div className={styles.moduleCanvas}>
                  <div className={styles.canvasGlow} aria-hidden="true" />
                  <p className={styles.demoLabel}>{c.demo.label}</p>
                  <ModuleVisual index={i} c={c} />
                  <p className={styles.demoNote}>{c.demo.note}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Agent — canlanan sohbet ── */}
        <section id="agent" className={styles.agentSection}>
          <div className={styles.orbits} aria-hidden="true"><i /><i /><i /></div>
          <div className={`${styles.wrap} ${styles.agentGrid}`}>
            <div className={styles.agentCopy} data-reveal>
              <span className={styles.sectionLabel}><Icon name="spark" />{c.agent.label}</span>
              <h2>{lines(c.agent.h2)}</h2>
              <p>{c.agent.p}</p>
              <ul className={styles.featureList}>{c.agent.features.map((t) => <li key={t}><Icon name="check" />{t}</li>)}</ul>
              <div className={styles.toolChips}>
                {c.agent.tools.map((t) => <span key={t.m} title={t.d}>{t.m}</span>)}
              </div>
            </div>

            <div className={styles.agentDemo} data-reveal style={{ ["--d" as string]: "120ms" }}>
              <div className={styles.agentDemoTop}>
                <span><span className={styles.live} />Actuarius Agent</span>
                <span>{c.agent.example}</span>
              </div>
              <div className={styles.prompt}>
                <span className={styles.promptText}>{c.agent.prompt}</span>
                <span className={styles.promptArrow} aria-hidden="true">↑</span>
              </div>
              <div className={styles.agentReply}>
                <span className={styles.agentAvatar}><Icon name="spark" /></span>
                <div>
                  <p className={styles.replyText}>{c.agent.reply}</p>
                  <ol>
                    {c.agent.steps.map((s, i) => (
                      <li key={s} style={{ ["--i" as string]: i }}>
                        <span>{i + 1}</span>{s}<Icon name="check" />
                      </li>
                    ))}
                  </ol>
                  <div className={styles.agentResult}>
                    <Icon name="model" />
                    <span>Fire & Home <b>2026 Q2</b></span>
                    <span className={styles.resultTag}>CL / BF</span>
                  </div>
                </div>
              </div>
              <p className={styles.agentFootnote}>{c.agent.footnote}</p>
            </div>
          </div>
        </section>

        {/* ── Kurumsal + yönetişim ── */}
        <section id="governance" className={styles.enterprise}>
          <div className={styles.wrap}>
            <div className={styles.enterpriseGrid}>
              <div data-reveal>
                <span className={styles.sectionLabelDark}>{c.enterprise.label}</span>
                <h2>{lines(c.enterprise.title)}</h2>
                <p>{c.enterprise.p}</p>
                <a href="#contact" className={styles.buttonLight}>{c.enterprise.cta}<Icon name="arrow" /></a>
              </div>
              <div className={styles.infrastructure} data-reveal style={{ ["--d" as string]: "120ms" }}>
                <div className={styles.infraLabel}><Icon name="lock" />{c.enterprise.private}</div>
                <div className={styles.infraApp}>
                  <span className={styles.infraLogo}><Image src="/logo-128.png" alt="" width={40} height={40} /></span>
                  <b>Actuarius</b>
                  <span>{c.enterprise.local}</span>
                </div>
                <svg className={styles.infraWires} viewBox="0 0 400 90" preserveAspectRatio="none" aria-hidden="true">
                  <path d="M200 0V30C200 45 100 40 100 60V90" pathLength={1} />
                  <path d="M200 0V30C200 45 300 40 300 60V90" pathLength={1} />
                  <path className={styles.flow} d="M200 0V30C200 45 100 40 100 60V90" pathLength={1} />
                  <path className={styles.flow} d="M200 0V30C200 45 300 40 300 60V90" pathLength={1} />
                </svg>
                <div className={styles.infraSources}>
                  <div><Icon name="data" /><span>{c.enterprise.database}</span></div>
                  <div><Icon name="spark" /><span>{c.enterprise.model}</span></div>
                </div>
              </div>
            </div>

            <div className={styles.governanceHead} data-reveal>
              <span className={styles.sectionLabelDark}>{c.governance.label}</span>
              <h3>{lines(c.governance.h2)}</h3>
              <p>{c.governance.p}</p>
            </div>
            <div className={styles.governanceRow}>
              {c.governance.items.map((g, i) => (
                <div key={g.t} data-reveal style={{ ["--d" as string]: `${i * 100}ms` }}>
                  <span className={styles.govIcon}><Icon name={govIcons[i % govIcons.length]} /></span>
                  <span className={styles.govIndex}>0{i + 1}</span>
                  <h4>{g.t}</h4>
                  <p>{g.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Planlar ── */}
        <section id="pricing" className={styles.pricing}>
          <div className={styles.wrap}>
            <div className={`${styles.sectionHeading} ${styles.center}`} data-reveal>
              <span className={styles.sectionLabel}>{c.pricing.label}</span>
              <h2>{lines(c.pricing.h2)}</h2>
              <p>{c.pricing.p}</p>
            </div>
            <div className={styles.plans}>
              {c.pricing.plans.map((p, i) => (
                <article className={`${styles.plan} ${p.on ? styles.planFeatured : ""}`} key={p.n} data-reveal style={{ ["--d" as string]: `${i * 90}ms` }}>
                  <div className={styles.planTop}>
                    <h3>{p.n}</h3>
                    {p.on && <span>{c.pricing.recommended}</span>}
                  </div>
                  <p>{p.d}</p>
                  <div className={styles.price}>{p.p}<span>{p.s}</span></div>
                  <Link href={p.h} className={p.on ? styles.button : styles.buttonOutline}>{p.a}<Icon name="arrow" /></Link>
                  <ul className={p.on ? styles.featureListDark : styles.featureList}>{p.f.map((t) => <li key={t}><Icon name="check" />{t}</li>)}</ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── SSS — görünür içerik FAQPage şemasıyla birebir aynı ── */}
        <section id="faq" className={styles.faqSection}>
          <div className={`${styles.wrap} ${styles.faqGrid}`}>
            <div className={styles.faqHead} data-reveal>
              <h2>{lines(c.faq.h2)}</h2>
              <p>{c.faq.p}</p>
              <a href="#contact" className={styles.textLink}>{c.footer.contact}<Icon name="arrow" /></a>
            </div>
            <div className={styles.faqList}>
              {c.faq.items.map((f) => (
                <details className={styles.faq} key={f.q}>
                  <summary>{f.q}<span aria-hidden="true" /></summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── İletişim ── */}
        <section id="contact" className={styles.contact}>
          <div className={styles.contactGlow} aria-hidden="true" />
          <div className={`${styles.wrap} ${styles.contactGrid}`}>
            <div className={styles.contactCopy} data-reveal>
              <span className={styles.sectionLabel}>{c.contact.label}</span>
              <h2>{lines(c.contact.h2)}</h2>
              <p>{c.contact.p}</p>
              <p className={styles.contactNote}>{c.contact.note}</p>
              <a href={`mailto:${SITE.email}`} className={styles.contactEmail}>{SITE.email}<Icon name="arrow" /></a>
              <div className={styles.contactMotif} aria-hidden="true">
                {Array.from({ length: 5 }, (_, i) => <i key={i} style={{ ["--w" as string]: `${100 - i * 18}%`, ["--i" as string]: i }} />)}
              </div>
            </div>
            <div className={styles.contactForm} data-reveal style={{ ["--d" as string]: "120ms" }}>
              {status === "ok" ? (
                <div className={styles.formOk} role="status">
                  <span className={styles.okIcon}><Icon name="check" /></span>
                  <h3>{c.contact.okTitle}</h3>
                  <p>{c.contact.okBody.replace("{to}", sentEmail)}</p>
                  <button type="button" className={styles.buttonOutline} onClick={() => setStatus("idle")}>{c.contact.again}</button>
                </div>
              ) : (
                <form onSubmit={submitContact} aria-busy={status === "sending"}>
                  <div className={styles.formRow}>
                    <label>{c.contact.name}<input name="name" value={form.name} onChange={set("name")} required minLength={2} maxLength={80} autoComplete="name" /></label>
                    <label>{c.contact.email}<input name="email" type="email" value={form.email} onChange={set("email")} required maxLength={160} autoComplete="email" /></label>
                  </div>
                  <label>{c.contact.company}<span className={styles.optional}>({c.contact.optional})</span><input name="company" value={form.company} onChange={set("company")} maxLength={120} autoComplete="organization" /></label>
                  <label>{c.contact.message}<textarea name="message" value={form.message} onChange={set("message")} required minLength={10} maxLength={4000} rows={4} placeholder={c.contact.placeholder} /></label>
                  <input className={styles.honeypot} aria-hidden="true" name="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={set("website")} />
                  {status === "error" && <p className={styles.formError} role="alert">{errMsg}</p>}
                  <button type="submit" className={styles.button} disabled={status === "sending"}>
                    {status === "sending" ? c.contact.sending : c.contact.submit}<Icon name="arrow" />
                  </button>
                </form>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.wrap}>
          <div className={styles.footerTop}>
            <Link href={c.path} className={styles.brand}>
              <Image src="/logo-128.png" alt="" width={28} height={28} className={styles.logo} />Actuarius<span className={styles.brandDot}>.</span>
            </Link>
            <p>{c.footer.tagline}</p>
            <a href="#main-content" className={styles.backTop} aria-label={c.locale === "tr" ? "Sayfa başına dön" : "Back to top"}>↑</a>
          </div>
          <div className={styles.footerBottom}>
            <span>© {new Date().getFullYear()} Actuarius. {c.footer.rights}</span>
            <div>
              <Link href="/privacy">{c.footer.privacy}</Link>
              <Link href="/terms">{c.footer.terms}</Link>
              <a href="#contact">{c.footer.contact}</a>
            </div>
          </div>
        </div>
      </footer>

      {/* ── Film ── */}
      <dialog
        ref={filmRef}
        className={styles.film}
        aria-label={c.hero.film}
        onClose={() => filmRef.current?.querySelector("video")?.pause()}
        onClick={(e) => { if (e.target === e.currentTarget) closeFilm(); }}
      >
        <div className={styles.filmBox}>
          <button type="button" className={styles.filmClose} onClick={closeFilm} aria-label={c.hero.filmClose}><Icon name="close" /></button>
          <video src={FILM} poster={FILM_POSTER} controls playsInline preload="none" />
        </div>
      </dialog>
    </div>
  );
}
