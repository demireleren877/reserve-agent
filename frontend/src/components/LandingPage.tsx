"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { sendContact } from "@/lib/sync/worker-client";
import { WebMcpTools } from "@/components/WebMcpTools";
import { faqSchema, softwareSchema } from "@/lib/seo";
import type { LandingContent } from "@/lib/content/landing";
import styles from "@/app/landing.module.css";

/**
 * Landing — TR (/) ve EN (/en) tarafından paylaşılır.
 * Metinler `c` sözlüğünden gelir; burada yalnızca düzen ve etkileşim var.
 * Bölüm id'leri iki dilde de aynı (dil-nötr) — CSS ve derin bağlantılar bozulmasın.
 *
 * Hareket: `data-reveal` taşıyan öğeler görünür alana girince `data-in` alır;
 * prefers-reduced-motion açıksa her şey baştan görünür (CSS tarafında).
 */

const FILM = "/film/actuarius-film.mp4";
const HERO_LOOP = "/film/hero-loop";
const HERO_POSTER = "/film/hero-poster.jpg";

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

/** Görünür olunca hedefe sayan rakam. */
function CountUp({ to, pre = "", suf = "" }: { to: number; pre?: string; suf?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [v, setV] = useState(to);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setV(0);
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const tick = (t: number) => {
        const p = Math.min(1, (t - t0) / 1400);
        setV(Math.round(to * (1 - Math.pow(1 - p, 4))));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [to]);
  return (
    <span ref={ref}>
      {pre}
      {v}
      {suf}
    </span>
  );
}

const Icon = {
  play: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor" /></svg>
  ),
  arrow: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13m-5-6 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.2 4L19 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ),
  roles: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c.8-3.2 3-5 5.5-5s4.7 1.8 5.5 5" /><circle cx="17" cy="9" r="2.4" /><path d="M16 14.2c2.3.1 4 1.7 4.6 4.3" /></g></svg>
  ),
  lock: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><rect x="5" y="10.5" width="14" height="9.5" rx="2.2" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /><path d="M12 14.2v2.2" /></g></svg>
  ),
  trail: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M7 4v16" /><circle cx="7" cy="7" r="1.8" fill="currentColor" /><circle cx="7" cy="12" r="1.8" fill="currentColor" /><circle cx="7" cy="17" r="1.8" fill="currentColor" /><path d="M11 7h8M11 12h6M11 17h7" /></g></svg>
  ),
  versions: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><rect x="4" y="7" width="11" height="13" rx="2" /><path d="M9 4h9a2 2 0 0 1 2 2v11" /></g></svg>
  ),
};
const GOV_ICONS = [Icon.roles, Icon.lock, Icon.trail, Icon.versions];

export function LandingPage({ c }: { c: LandingContent }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const filmRef = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState(2); // LDF
  const [scrolled, setScrolled] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", company: "", message: "", website: "" });
  const [status, setStatus] = useState<"idle" | "sending" | "ok" | "error">("idle");
  const [errMsg, setErrMsg] = useState("");

  useReveal(rootRef);

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  async function submitContact(e: React.FormEvent) {
    e.preventDefault();
    if (status === "sending") return;
    setStatus("sending");
    setErrMsg("");
    try {
      await sendContact(form);
      setStatus("ok");
      setForm({ name: "", email: "", company: "", message: "", website: "" });
    } catch (e) {
      setStatus("error");
      setErrMsg(e instanceof Error ? e.message : c.contact.genericError);
    }
  }

  const set = (k: keyof typeof form) => (ev: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: ev.target.value }));

  /** WebMCP aracının çağırdığı yol: formu doldurur, göndermez — onay kullanıcıda. */
  const fillContact = useCallback(
    (fields: { name: string; email: string; company: string; message: string }) => {
      setForm({ ...fields, website: "" });
      setStatus("idle");
      setErrMsg("");
    },
    [],
  );

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

  const steps = c.modeling.steps;
  const maxTools = Math.max(...c.agent.tools.map((t) => t.n));

  return (
    <div className={styles.page} lang={c.locale} ref={rootRef}>
      <WebMcpTools c={c} onFillContact={fillContact} />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([softwareSchema(c.locale), faqSchema(c.locale)]),
        }}
      />

      <header className={`${styles.nav} ${scrolled ? styles.navScrolled : ""}`}>
        <div className={styles.navInner}>
          <Link href={c.path} className={styles.brand}>
            <img src="/logo-128.png" alt="" width={30} height={30} className={styles.logo} />
            Actuarius
          </Link>
          <nav className={styles.navLinks}>
            <a href="#modules">{c.nav.modules}</a>
            <a href="#agent">{c.nav.agent}</a>
            <a href="#close">{c.nav.close}</a>
            <a href="#modeling">{c.nav.modeling}</a>
            <a href="#governance">{c.nav.governance}</a>
            <a href="#pricing">{c.nav.pricing}</a>
            <a href="#faq">{c.nav.faq}</a>
          </nav>
          <div className={styles.navCta}>
            <Link href={c.nav.otherLangPath} className={styles.lang} hrefLang={c.locale === "tr" ? "en" : "tr"}>
              {c.nav.otherLang}
            </Link>
            <Link href="/login" className={styles.navGhost}>{c.nav.login}</Link>
            <Link href="/reserve" className={styles.navSolid}>{c.nav.cta}</Link>
          </div>
        </div>
      </header>

      {/* ── Hero — sinematik, karanlık ── */}
      <section className={styles.hero}>
        <video
          className={styles.heroVideo}
          poster={HERO_POSTER}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          aria-hidden="true"
        >
          <source src={`${HERO_LOOP}.webm`} type="video/webm" />
          <source src={`${HERO_LOOP}.mp4`} type="video/mp4" />
        </video>
        <div className={styles.heroShade} aria-hidden="true" />
        <div className={styles.heroGrid} aria-hidden="true" />

        <div className={`${styles.wrap} ${styles.heroInner}`}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow} data-reveal>
              <span className={styles.pulse} />
              {c.hero.eyebrow}
            </p>
            <h1 data-reveal style={{ ["--d" as string]: "80ms" }}>
              <span>{c.hero.title1}</span>
              <span className={styles.gradText}>{c.hero.title2}</span>
            </h1>
            <p className={styles.lede} data-reveal style={{ ["--d" as string]: "160ms" }}>{c.hero.lede}</p>
            <div className={styles.actions} data-reveal style={{ ["--d" as string]: "240ms" }}>
              <Link href="/reserve" className={styles.btnPrimary}>
                {c.hero.ctaPrimary}
                <i>{Icon.arrow}</i>
              </Link>
              <a href="#contact" className={styles.btnGlass}>{c.hero.ctaSecondary}</a>
              <button type="button" className={styles.btnFilm} onClick={openFilm}>
                <span className={styles.playDot}>{Icon.play}</span>
                {c.hero.film}
                <em>1:11</em>
              </button>
            </div>
            <p className={styles.note} data-reveal style={{ ["--d" as string]: "320ms" }}>{c.hero.note}</p>
          </div>

          {/* Modül durumları — "hepsi bir arada" sinyali */}
          <div className={styles.strip} data-reveal style={{ ["--d" as string]: "420ms" }}>
            {c.modules.items.map((m) => (
              <div key={m.t} className={styles.stripItem}>
                <span className={styles.stripDot} />
                <b>{m.t}</b>
                <i>{m.s}</i>
              </div>
            ))}
            <div className={`${styles.stripItem} ${styles.stripAgent}`}>
              <span className={styles.stripDot} />
              <b>AI Agent</b>
              <i>{c.hero.agentStrip}</i>
            </div>
          </div>
        </div>
      </section>

      {/* ── Rakam bandı ── */}
      <section className={styles.stats} aria-label="Actuarius">
        <div className={`${styles.wrap} ${styles.statsGrid}`}>
          {c.stats.map((s, i) => (
            <div key={s.l} className={styles.stat} data-reveal style={{ ["--d" as string]: `${i * 90}ms` }}>
              <b><CountUp to={s.v} pre={s.pre} suf={s.suf} /></b>
              <span>{s.l}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Modüller — bento ── */}
      <section className={styles.section} id="modules">
        <div className={styles.wrap}>
          <div className={styles.head} data-reveal>
            <p className={styles.label}>{c.modules.label}</p>
            <h2>{c.modules.h2}</h2>
            <p>{c.modules.p}</p>
          </div>
          <div className={styles.bento}>
            {/* Rezerv kahraman kart olarak başta; numaralar asıl sırayı korur */}
            {[1, 0, 2, 3].map((i, order) => ({ m: c.modules.items[i], i, order })).map(({ m, i, order }) => (
              <article
                key={m.t}
                className={`${styles.modCard} ${order === 0 ? styles.modHero : ""}`}
                data-reveal
                style={{ ["--d" as string]: `${order * 80}ms` }}
              >
                <div className={styles.modBody}>
                  <div className={styles.modTop}>
                    <span className={styles.modNo}>{String(i + 1).padStart(2, "0")}</span>
                    <span className={styles.state}><span />{m.s}</span>
                  </div>
                  <h3>{m.t}</h3>
                  <p>{m.d}</p>
                </div>
                <div className={styles.modShot}>
                  <img loading="lazy" decoding="async" width={1600} height={1000} src={m.shot} alt={`Actuarius — ${m.t}`} />
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Agent — karanlık ── */}
      <section className={styles.dark} id="agent">
        <div className={styles.orbits} aria-hidden="true">
          <i /><i /><i />
        </div>
        <div className={`${styles.wrap} ${styles.agentGrid}`}>
          <div className={styles.agentCopy} data-reveal>
            <p className={styles.labelDark}>{c.agent.label}</p>
            <h2>{c.agent.h2}</h2>
            <p>{c.agent.p}</p>
            <ul className={styles.toolList}>
              {c.agent.tools.map((t, i) => (
                <li key={t.m} style={{ ["--w" as string]: `${(t.n / maxTools) * 100}%`, ["--d" as string]: `${300 + i * 120}ms` }}>
                  <div className={styles.toolHead}>
                    <b>{t.n}</b>
                    <span>{t.m}</span>
                  </div>
                  <div className={styles.toolBar}><i /></div>
                  <p>{t.d}</p>
                </li>
              ))}
            </ul>
          </div>

          <div className={styles.console} data-reveal style={{ ["--d" as string]: "150ms" }}>
            <div className={styles.consoleBar}>
              <span className={styles.live} />
              {c.agent.console}
              <em>rezerv / 2025Q4 / Motor</em>
            </div>
            <ol className={styles.log}>
              {c.agent.log.map((l, i) => (
                <li key={l.m} style={{ ["--i" as string]: i }}>
                  <span className={styles.logTime}>09:14:{String(2 + i * 3).padStart(2, "0")}</span>
                  <span className={styles.logCheck}>{Icon.check}</span>
                  <div>
                    <b>{l.m}</b>
                    <span>{l.d}</span>
                  </div>
                </li>
              ))}
            </ol>
            <div className={styles.consoleFoot}>
              <span>{c.agent.tools.reduce((a, t) => a + t.n, 0)} {c.locale === "tr" ? "araç" : "tools"}</span>
              <span>{c.locale === "tr" ? "↺ geri alınabilir · denetimde ✓" : "↺ reversible · audited ✓"}</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Kapanış — zaman çizelgesi ── */}
      <section className={styles.section} id="close">
        <div className={styles.wrap}>
          <div className={styles.head} data-reveal>
            <p className={styles.label}>{c.close.label}</p>
            <h2>{c.close.h2}</h2>
            <p>{c.close.p}</p>
          </div>
          <ol className={styles.timeline} data-reveal>
            {c.close.steps.map((s, i) => (
              <li key={s.n} className={styles.tItem} style={{ ["--i" as string]: i }}>
                <span className={styles.tNode}>{s.n}</span>
                <h3>{s.t}</h3>
                <p>{s.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Modelleme — sekmeler + çerçeveli ekran ── */}
      <section className={styles.sectionAlt} id="modeling">
        <div className={styles.wrap}>
          <div className={styles.head} data-reveal>
            <p className={styles.label}>{c.modeling.label}</p>
            <h2>{c.modeling.h2}</h2>
            <p>{c.modeling.p}</p>
          </div>
          <div className={styles.tabs} role="tablist" aria-label={c.modeling.tablist} data-reveal>
            {steps.map((m, i) => (
              <button
                key={m.t}
                role="tab"
                aria-selected={i === step}
                className={`${styles.tab} ${i === step ? styles.tabOn : ""}`}
                onClick={() => setStep(i)}
              >
                <span className={styles.tabNo}>{String(i + 1).padStart(2, "0")}</span>
                <b>{m.t}</b>
                <i>{m.d}</i>
              </button>
            ))}
          </div>

          <div className={styles.slider} data-reveal>
            <div className={styles.viewport}>
              <div className={styles.track} style={{ transform: `translateX(-${step * 100}%)` }}>
                {steps.map((m, i) => (
                  <figure key={m.t} className={styles.slide} aria-hidden={i !== step}>
                    <div className={styles.frame}>
                      <div className={styles.frameBar}>
                        <i /><i /><i />
                        <span>{c.modeling.frame} — {m.t.toLowerCase()}</span>
                      </div>
                      <img loading="lazy" decoding="async" width={1600} height={1000} src={m.shot} alt={`Actuarius — ${m.t}`} />
                    </div>
                  </figure>
                ))}
              </div>
            </div>

            <div className={styles.controls}>
              <p className={styles.caption} key={step}>{steps[step].copy}</p>
              <div className={styles.ctrlBtns}>
                <button
                  className={styles.arrow}
                  onClick={() => setStep((i) => (i - 1 + steps.length) % steps.length)}
                  aria-label={c.modeling.prev}
                >
                  ←
                </button>
                <span className={styles.counter}>
                  {String(step + 1).padStart(2, "0")} / {String(steps.length).padStart(2, "0")}
                </span>
                <button
                  className={styles.arrow}
                  onClick={() => setStep((i) => (i + 1) % steps.length)}
                  aria-label={c.modeling.next}
                >
                  →
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Yönetişim ── */}
      <section className={styles.section} id="governance">
        <div className={styles.wrap}>
          <div className={styles.govGrid}>
            <div className={styles.govCopy} data-reveal>
              <p className={styles.label}>{c.governance.label}</p>
              <h2>{c.governance.h2}</h2>
              <p>{c.governance.p}</p>
              <div className={styles.record} aria-hidden="true">
                {(c.locale === "tr"
                  ? [["kim", "Aktüer · E.D."], ["ne zaman", "14.01.2026 · 14:32"], ["ne", "2019 · 36→48 hücresi elendi"], ["neden", "Tek büyük hasar kaynaklı aykırı gelişim"]]
                  : [["who", "Actuary · E.D."], ["when", "14.01.2026 · 14:32"], ["what", "2019 · 36→48 cell excluded"], ["why", "Outlying development from a single large claim"]]
                ).map(([k, v]) => (
                  <div key={k}><span>{k}</span><b>{v}</b></div>
                ))}
              </div>
            </div>
            <div className={styles.govTiles}>
              {c.governance.items.map((g, i) => (
                <div key={g.t} className={styles.govTile} data-reveal style={{ ["--d" as string]: `${i * 90}ms` }}>
                  <span className={styles.govIcon}>{GOV_ICONS[i % GOV_ICONS.length]}</span>
                  <h3>{g.t}</h3>
                  <p>{g.d}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Fiyat ── */}
      <section className={styles.sectionAlt} id="pricing">
        <div className={styles.wrap}>
          <div className={styles.head} data-reveal>
            <p className={styles.label}>{c.pricing.label}</p>
            <h2>{c.pricing.h2}</h2>
            <p>{c.pricing.p}</p>
          </div>
          <div className={styles.plans}>
            {c.pricing.plans.map((p, i) => (
              <div
                key={p.n}
                className={`${styles.plan} ${p.on ? styles.planOn : ""}`}
                data-reveal
                style={{ ["--d" as string]: `${i * 90}ms` }}
              >
                <span className={styles.planName}>{p.n}</span>
                <span className={styles.planPrice}>{p.p}<i>{p.s}</i></span>
                <ul>
                  {p.f.map((x) => (
                    <li key={x}><span>{Icon.check}</span>{x}</li>
                  ))}
                </ul>
                <Link href={p.h} className={p.on ? styles.btnPrimary : styles.btnOutline}>{p.a}</Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SSS — görünür içerik FAQPage şemasıyla birebir aynı ── */}
      <section className={styles.section} id="faq">
        <div className={`${styles.wrap} ${styles.faqGrid}`}>
          <div className={styles.headLeft} data-reveal>
            <p className={styles.label}>{c.faq.label}</p>
            <h2>{c.faq.h2}</h2>
            <p>{c.faq.p}</p>
          </div>
          <div className={styles.faqList}>
            {c.faq.items.map((f) => (
              <details key={f.q} className={styles.faq}>
                <summary>{f.q}<span aria-hidden="true" /></summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── İletişim ── */}
      <section className={styles.contact} id="contact">
        <div className={styles.contactGlow} aria-hidden="true" />
        <div className={`${styles.wrap} ${styles.contactGrid}`}>
          <div className={styles.contactCopy} data-reveal>
            <p className={styles.labelDark}>{c.contact.label}</p>
            <h2>{c.contact.h2}</h2>
            <p>{c.contact.p}</p>
            <p className={styles.mail}>
              {c.contact.note} <a href="mailto:info@actuarius.com.tr">info@actuarius.com.tr</a>
            </p>
          </div>

          <div className={styles.formCard} data-reveal style={{ ["--d" as string]: "120ms" }}>
            {status === "ok" ? (
              <div className={styles.formOk} role="status">
                <span className={styles.okIcon}>{Icon.check}</span>
                <b>{c.contact.okTitle}</b>
                <span>{c.contact.okBody.replace("{to}", form.email || c.contact.okFallback)}</span>
                <button type="button" className={styles.btnOutlineDark} onClick={() => setStatus("idle")}>
                  {c.contact.again}
                </button>
              </div>
            ) : (
              <form className={styles.form} onSubmit={submitContact} noValidate>
                <div className={styles.formRow}>
                  <label className={styles.field}>
                    <span>{c.contact.name}</span>
                    <input value={form.name} onChange={set("name")} required minLength={2} maxLength={80} autoComplete="name" />
                  </label>
                  <label className={styles.field}>
                    <span>{c.contact.email}</span>
                    <input type="email" value={form.email} onChange={set("email")} required maxLength={160} autoComplete="email" />
                  </label>
                </div>
                <label className={styles.field}>
                  <span>{c.contact.company} <i>{c.contact.optional}</i></span>
                  <input value={form.company} onChange={set("company")} maxLength={120} autoComplete="organization" />
                </label>
                <label className={styles.field}>
                  <span>{c.contact.message}</span>
                  <textarea value={form.message} onChange={set("message")} required minLength={10} maxLength={4000} rows={4}
                    placeholder={c.contact.placeholder} />
                </label>

                {/* Honeypot — gözden gizli, botlar doldurur */}
                <input
                  className={styles.hp}
                  value={form.website}
                  onChange={set("website")}
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                />

                {status === "error" && <p className={styles.formErr} role="alert">{errMsg}</p>}

                <div className={styles.formActions}>
                  <button type="submit" className={styles.btnPrimary} disabled={status === "sending"}>
                    {status === "sending" ? c.contact.sending : c.contact.submit}
                  </button>
                  <Link href="/reserve" className={styles.btnOutlineDark}>{c.contact.tryFree}</Link>
                </div>
              </form>
            )}
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.wrap}>
          <div className={styles.footInner}>
            <span className={styles.footBrand}>
              <img src="/logo-128.png" alt="" width={24} height={24} className={styles.footLogo} />
              Actuarius
              <em>actuarius.com.tr</em>
            </span>
            <span className={styles.footLinks}>
              <Link href="/privacy">{c.footer.privacy}</Link>
              <Link href="/terms">{c.footer.terms}</Link>
              <a href="#contact">{c.footer.contact}</a>
              <span>© {new Date().getFullYear()}</span>
            </span>
          </div>
        </div>
      </footer>

      {/* ── Film ── */}
      <dialog ref={filmRef} className={styles.film} onClose={() => filmRef.current?.querySelector("video")?.pause()}
        onClick={(e) => { if (e.target === e.currentTarget) closeFilm(); }}>
        <div className={styles.filmBox}>
          <button type="button" className={styles.filmClose} onClick={closeFilm} aria-label={c.hero.filmClose}>×</button>
          <video src={FILM} poster={HERO_POSTER} controls playsInline preload="none" />
        </div>
      </dialog>
    </div>
  );
}
