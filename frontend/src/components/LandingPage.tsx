"use client";

import { useCallback, useState } from "react";
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
 */
export function LandingPage({ c }: { c: LandingContent }) {
  const [step, setStep] = useState(2); // LDF
  const [form, setForm] = useState({ name: "", email: "", company: "", message: "", website: "" });
  const [status, setStatus] = useState<"idle" | "sending" | "ok" | "error">("idle");
  const [errMsg, setErrMsg] = useState("");

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

  const steps = c.modeling.steps;

  return (
    <div className={styles.page} lang={c.locale}>
      <WebMcpTools c={c} onFillContact={fillContact} />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([softwareSchema(c.locale), faqSchema(c.locale)]),
        }}
      />

      <header className={styles.nav}>
        <Link href={c.path} className={styles.brand}>
          <img src="/logo-128.png" alt="" width={34} height={34} className={styles.logo} />
          Actuarius
        </Link>
        <nav className={styles.navLinks}>
          <a href="#modules">{c.nav.modules}</a>
          <a href="#agent">{c.nav.agent}</a>
          <a href="#close">{c.nav.close}</a>
          <a href="#modeling">{c.nav.modeling}</a>
          <a href="#governance">{c.nav.governance}</a>
          <a href="#faq">{c.nav.faq}</a>
          <a href="#pricing">{c.nav.pricing}</a>
        </nav>
        <div className={styles.navCta}>
          <Link href={c.nav.otherLangPath} className={styles.lang} hrefLang={c.locale === "tr" ? "en" : "tr"}>
            {c.nav.otherLang}
          </Link>
          <Link href="/login" className={styles.ghost}>{c.nav.login}</Link>
          <Link href="/reserve" className={styles.solid}>{c.nav.cta}</Link>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className={styles.hero}>
        <div className={styles.wrap}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>{c.hero.eyebrow}</p>
            <h1>{c.hero.title1}<br />{c.hero.title2}</h1>
            <p className={styles.lede}>{c.hero.lede}</p>
            <div className={styles.actions}>
              <Link href="/reserve" className={styles.solidLg}>{c.hero.ctaPrimary}</Link>
              <a href="#contact" className={styles.ghostLg}>{c.hero.ctaSecondary}</a>
            </div>
            <p className={styles.note}>{c.hero.note}</p>
          </div>

          {/* Modül durumları — "all-in-one" sinyali hero'da */}
          <div className={styles.strip}>
            {c.modules.items.map((m) => (
              <div key={m.t} className={styles.stripItem}>
                <b>{m.t}</b>
                <i>{m.s}</i>
              </div>
            ))}
            <div className={`${styles.stripItem} ${styles.stripAgent}`}>
              <b>AI Agent</b>
              <i>{c.hero.agentStrip}</i>
            </div>
          </div>
        </div>
      </section>

      {/* ── Modüller — 2×2 ── */}
      <section className={styles.section} id="modules">
        <div className={styles.wrap}>
          <div className={styles.head}>
            <p className={styles.label}>{c.modules.label}</p>
            <h2>{c.modules.h2}</h2>
            <p>{c.modules.p}</p>
          </div>
          <div className={styles.grid2}>
            {c.modules.items.map((m) => (
              <article key={m.t} className={styles.modCard}>
                <img loading="lazy" decoding="async" width={1600} height={1000} src={m.shot} alt={`Actuarius — ${m.t}`} />
                <div className={styles.modBody}>
                  <div className={styles.modTop}>
                    <h3>{m.t}</h3>
                    <span className={styles.state}>{m.s}</span>
                  </div>
                  <p>{m.d}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Agent — 4 ── */}
      <section className={styles.sectionAlt} id="agent">
        <div className={styles.wrap}>
          <div className={styles.head}>
            <p className={styles.label}>{c.agent.label}</p>
            <h2>{c.agent.h2}</h2>
            <p>{c.agent.p}</p>
          </div>
          <div className={styles.grid4}>
            {c.agent.tools.map((t) => (
              <div key={t.m} className={styles.tile}>
                <span className={styles.tileNum}>{t.n}</span>
                <h3>{t.m}</h3>
                <p>{t.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Kapanış — 5 adım ── */}
      <section className={styles.section} id="close">
        <div className={styles.wrap}>
          <div className={styles.head}>
            <p className={styles.label}>{c.close.label}</p>
            <h2>{c.close.h2}</h2>
            <p>{c.close.p}</p>
          </div>
          <ol className={styles.stepper}>
            {c.close.steps.map((s) => (
              <li key={s.n} className={styles.stepItem}>
                <span className={styles.stepNo}>{s.n}</span>
                <h3>{s.t}</h3>
                <p>{s.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Modelleme — tab + slider ── */}
      <section className={styles.sectionAlt} id="modeling">
        <div className={styles.wrap}>
          <div className={styles.head}>
            <p className={styles.label}>{c.modeling.label}</p>
            <h2>{c.modeling.h2}</h2>
            <p>{c.modeling.p}</p>
          </div>
          <div className={styles.tabs} role="tablist" aria-label={c.modeling.tablist}>
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

          <div className={styles.slider}>
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
                    <figcaption>{m.copy}</figcaption>
                  </figure>
                ))}
              </div>
            </div>

            <div className={styles.controls}>
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
      </section>

      {/* ── Yönetişim — 4 ── */}
      <section className={styles.section} id="governance">
        <div className={styles.wrap}>
          <div className={styles.head}>
            <p className={styles.label}>{c.governance.label}</p>
            <h2>{c.governance.h2}</h2>
            <p>{c.governance.p}</p>
          </div>
          <div className={styles.grid4}>
            {c.governance.items.map((g) => (
              <div key={g.t} className={styles.tile}><h3>{g.t}</h3><p>{g.d}</p></div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Fiyat — 3 ── */}
      <section className={styles.sectionAlt} id="pricing">
        <div className={styles.wrap}>
          <div className={styles.head}>
            <p className={styles.label}>{c.pricing.label}</p>
            <h2>{c.pricing.h2}</h2>
            <p>{c.pricing.p}</p>
          </div>
          <div className={styles.grid3}>
            {c.pricing.plans.map((p) => (
              <div key={p.n} className={`${styles.plan} ${p.on ? styles.planOn : ""}`}>
                <span className={styles.planName}>{p.n}</span>
                <span className={styles.planPrice}>{p.p}<i>{p.s}</i></span>
                <ul>{p.f.map((x) => <li key={x}>{x}</li>)}</ul>
                <Link href={p.h} className={p.on ? styles.solidLg : styles.ghostLgDark}>{p.a}</Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SSS — görünür içerik FAQPage şemasıyla birebir aynı ── */}
      <section className={styles.section} id="faq">
        <div className={styles.wrap}>
          <div className={styles.head}>
            <p className={styles.label}>{c.faq.label}</p>
            <h2>{c.faq.h2}</h2>
            <p>{c.faq.p}</p>
          </div>
          <div className={styles.grid2}>
            {c.faq.items.map((f) => (
              <details key={f.q} className={styles.faq}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── İletişim ── */}
      <section className={styles.section} id="contact">
        <div className={styles.wrap}>
          <div className={styles.cta}>
            <p className={styles.label}>{c.contact.label}</p>
            <h2>{c.contact.h2}</h2>
            <p>{c.contact.p}</p>

            {status === "ok" ? (
              <div className={styles.formOk} role="status">
                <b>{c.contact.okTitle}</b>
                <span>{c.contact.okBody.replace("{to}", form.email || c.contact.okFallback)}</span>
                <button type="button" className={styles.ghostLgDark} onClick={() => setStatus("idle")}>
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
                  <button type="submit" className={styles.solidLg} disabled={status === "sending"}>
                    {status === "sending" ? c.contact.sending : c.contact.submit}
                  </button>
                  <Link href="/reserve" className={styles.ghostLgDark}>{c.contact.tryFree}</Link>
                </div>
                <p className={styles.formNote}>
                  {c.contact.note} <a href="mailto:info@actuarius.com.tr">info@actuarius.com.tr</a>
                </p>
              </form>
            )}
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.wrap}>
          <div className={styles.footInner}>
            <span className={styles.footBrand}>
              <img src="/logo-128.png" alt="" width={26} height={26} className={styles.footLogo} />
              Actuarius
              <em>actuarius.com.tr</em>
            </span>
            <span className={styles.footLinks}>
              <Link href="/privacy">{c.footer.privacy}</Link>
              <Link href="/terms">{c.footer.terms}</Link>
              <a href="#contact">{c.footer.contact}</a>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
