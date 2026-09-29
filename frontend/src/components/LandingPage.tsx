"use client";

import { useCallback, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { sendContact } from "@/lib/sync/worker-client";
import { WebMcpTools } from "@/components/WebMcpTools";
import { DevelopmentSculpture } from "@/components/landing/DevelopmentSculpture";
import { faqSchema, softwareSchema, SITE } from "@/lib/seo";
import type { LandingContent } from "@/lib/content/landing";
import styles from "@/app/landing.module.css";

function Icon({ name, className }: { name: "arrow" | "check" | "data" | "model" | "flow" | "discount" | "spark" | "lock" | "menu" | "close"; className?: string }) {
  const paths = {
    arrow: <><path d="M5 12h14m-6-6 6 6-6 6" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    data: <><ellipse cx="12" cy="5" rx="7" ry="3" /><path d="M5 5v14c0 4 14 4 14 0V5M5 12c0 4 14 4 14 0" /></>,
    model: <><path d="M4 20h16M5 16V9m5 7V5m5 11v-5m5 5V3" /></>,
    flow: <><path d="M3 17 8 8l5 5 8-10M3 21h18" /></>,
    discount: <><path d="M4 4v16h16M7 8l4 3 4 1 6 1" /></>,
    spark: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" /></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" /></>,
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
  };
  return <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

const moduleIcons = ["data", "model", "flow", "discount"] as const;
const claimRows = [
  ["FH-2021-048", "2021", "248.600", "64.200"],
  ["FH-2022-016", "2022", "182.400", "91.500"],
  ["FH-2023-032", "2023", "136.800", "124.700"],
  ["FH-2024-007", "2024", "94.300", "168.400"],
  ["FH-2025-021", "2025", "52.100", "213.600"],
];

function ModuleVisual({ index, c }: { index: number; c: LandingContent }) {
  return <div className={styles.workspace}>
    <div className={styles.workspaceTop}><span className={styles.workspaceMark}>a<span>.</span></span><b>Fire & Home</b><span className={styles.period}>2026 Q2</span></div>
    <div className={styles.workspaceContext}><span>{c.demo.period} <b>2026 Q2</b></span><span>{c.demo.branch} <b>Fire & Home</b></span></div>
    <div className={styles.visualBody}>
      <div className={styles.visualHeading}><h4>{[c.demo.source, c.demo.triangle, c.demo.pattern, c.demo.curve][index]}</h4><span>{index === 0 ? "CSV" : index === 1 ? "LDF" : index === 2 ? "2026–2030" : "IFRS 17"}</span></div>
      {index === 0 && <><div className={styles.dataFile}><Icon name="data" /><span>fire_home_claims.csv</span><span className={styles.ready}><Icon name="check" />{c.demo.status[0]}</span></div><div className={styles.tableScroll}><table className={styles.claimTable}><thead><tr>{[c.demo.claim, c.demo.year, c.demo.paid, c.demo.outstanding].map(t => <th key={t}>{t}</th>)}</tr></thead><tbody>{claimRows.map(r => <tr key={r[0]}>{r.map((v, i) => <td key={i}>{v}</td>)}</tr>)}</tbody></table></div><div className={styles.mapping}><span>claim_id</span><Icon name="arrow" /><span>{c.demo.claim}</span><Icon name="check" /></div></>}
      {index === 1 && <div className={styles.tableScroll}><table className={styles.triangleTable}><thead><tr><th>{c.demo.year}</th>{[1, 2, 3, 4, 5, 6].map(n => <th key={n}>{n} → {n + 1}</th>)}</tr></thead><tbody>{Array.from({ length: 6 }, (_, row) => <tr key={row}><th>{2020 + row}</th>{Array.from({ length: 6 }, (_, col) => <td key={col} data-projected={row + col > 5} data-outlier={row === 2 && col === 2}>{row + col > 5 ? "—" : row === 2 && col === 2 ? "1.842" : (1 + 0.61 / (col + 1) + row * .012).toFixed(3)}</td>)}</tr>)}</tbody><tfoot><tr><th>{c.demo.selection}</th>{["1.640", "1.335", "1.225", "1.178", "1.148", "1.127"].map(v => <td key={v}>{v}</td>)}</tr></tfoot></table></div>}
      {index === 2 && <><div className={styles.chartLegend}><span><i />{c.demo.projection}</span></div><svg className={styles.chart} viewBox="0 0 500 215" role="img" aria-label={c.demo.pattern}><g stroke="#e3eaf3">{[35, 80, 125, 170].map(y => <path d={`M24 ${y}H480`} key={y} />)}</g>{[135, 115, 99, 85, 70, 59, 49, 40, 32, 25, 18, 13].map((h, i) => <rect key={i} x={33 + i * 37} y={180 - h} width="24" height={h} rx="3" fill={i < 4 ? "#175cd3" : i < 8 ? "#709ee9" : "#b6cff3"} />)}{["2026", "2027", "2028", "2029", "2030"].map((t, i) => <text key={t} x={30 + i * 105} y="207" fill="#52657a" fontSize="11">{t}</text>)}</svg><div className={styles.visualFoot}>{c.modules.items[2].tags[1]}<span>Fire & Home</span></div></>}
      {index === 3 && <><div className={styles.chartLegend}><span><i />{c.demo.curve}</span><span><i className={styles.legendPale} />{c.demo.discounted}</span></div><svg className={styles.chart} viewBox="0 0 500 215" role="img" aria-label={c.demo.curve}><g stroke="#e3eaf3">{[35, 80, 125, 170].map(y => <path d={`M24 ${y}H480`} key={y} />)}</g><path d="M30 48C80 65 85 89 130 103S195 127 238 131 310 141 360 145 419 149 475 150V180H30Z" fill="#edf3fd" /><path d="M30 48C80 65 85 89 130 103S195 127 238 131 310 141 360 145 419 149 475 150" stroke="#175cd3" strokeWidth="3" fill="none" /><path d="M30 74C80 90 85 115 130 130S195 150 238 154 310 161 360 164 419 167 475 168" stroke="#7ea4dd" strokeWidth="2" strokeDasharray="5 5" fill="none" />{["1Y", "5Y", "10Y", "15Y", "20Y"].map((t, i) => <text key={t} x={30 + i * 109} y="207" fill="#52657a" fontSize="11">{t}</text>)}</svg><div className={styles.visualFoot}>{c.modules.items[3].tags[2]}<span>LIC</span></div></>}
    </div>
    <div className={styles.workspaceBottom}><span><i />{c.demo.status[index]}</span><Icon name="lock" /></div>
  </div>;
}

export function LandingPage({ c }: { c: LandingContent }) {
  const [activeModule, setActiveModule] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuButton = useRef<HTMLButtonElement>(null);
  const [form, setForm] = useState({ name: "", email: "", company: "", message: "", website: "" });
  const [status, setStatus] = useState<"idle" | "sending" | "ok" | "error">("idle");
  const [errMsg, setErrMsg] = useState("");
  const [sentEmail, setSentEmail] = useState("");
  const fillContact = useCallback((fields: { name: string; email: string; company: string; message: string }) => { setForm({ ...fields, website: "" }); setStatus("idle"); setErrMsg(""); }, []);
  const set = (k: keyof typeof form) => (ev: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [k]: ev.target.value }));
  async function submitContact(e: React.FormEvent) {
    e.preventDefault();
    if (status === "sending") return;
    setStatus("sending"); setErrMsg("");
    try { await sendContact(form); setSentEmail(form.email); setStatus("ok"); setForm({ name: "", email: "", company: "", message: "", website: "" }); }
    catch (error) { setStatus("error"); setErrMsg(error instanceof Error ? error.message : c.contact.genericError); }
  }
  function changeTab(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = e.key === "ArrowRight" ? (index + 1) % 4 : e.key === "ArrowLeft" ? (index + 3) % 4 : e.key === "Home" ? 0 : e.key === "End" ? 3 : null;
    if (next !== null) { e.preventDefault(); setActiveModule(next); tabs.current[next]?.focus(); }
  }
  const navItems = [["modules", c.nav.modules], ["agent", c.nav.agent], ["governance", c.nav.governance], ["pricing", c.nav.pricing]];

  return <div className={styles.page} lang={c.locale}>
    <WebMcpTools c={c} onFillContact={fillContact} />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([softwareSchema(c.locale), faqSchema(c.locale)]) }} />
    <a className={styles.skipLink} href="#main-content">{c.nav.skip}</a>
    <header className={styles.header} onKeyDown={e => { if (e.key === "Escape" && menuOpen) { setMenuOpen(false); menuButton.current?.focus(); } }}>
      <div className={styles.nav}>
        <Link href={c.path} className={styles.brand} aria-label="Actuarius"><Image src="/logo-128.png" alt="" width={34} height={34} priority />Actuarius<span className={styles.brandDot}>.</span></Link>
        <nav className={styles.navLinks} aria-label={c.nav.menu}>{navItems.map(([id, t]) => <a key={id} href={`#${id}`}>{t}</a>)}</nav>
        <div className={styles.navActions}><Link className={styles.lang} href={c.nav.otherLangPath} hrefLang={c.locale === "tr" ? "en" : "tr"}>{c.nav.otherLang}</Link><Link className={styles.login} href="/login">{c.nav.login}</Link><Link className={`${styles.button} ${styles.navStart}`} href="/reserve">{c.nav.cta}<Icon name="arrow" /></Link><button className={styles.menuToggle} ref={menuButton} type="button" aria-expanded={menuOpen} aria-controls="mobile-nav" aria-label={c.nav.menu} onClick={() => setMenuOpen(!menuOpen)}><Icon name={menuOpen ? "close" : "menu"} /></button></div>
      </div>
      {menuOpen && <nav id="mobile-nav" className={styles.mobileNav} aria-label={c.nav.menu}>{navItems.map(([id, t]) => <a key={id} href={`#${id}`} onClick={() => setMenuOpen(false)}>{t}<Icon name="arrow" /></a>)}<Link href="/login">{c.nav.login}</Link><Link href="/reserve">{c.nav.cta}</Link></nav>}
    </header>

    <main id="main-content">
      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={`${styles.wrap} ${styles.heroGrid}`}>
          <div className={styles.heroCopy}><p className={styles.eyebrow}><span />{c.hero.eyebrow}</p><h1 id="hero-title">{c.hero.title1}<span>{c.hero.title2}</span></h1><p className={styles.lede}>{c.hero.lede}</p><div className={styles.actions}><Link className={styles.button} href="/reserve">{c.hero.ctaPrimary}<Icon name="arrow" /></Link><a className={styles.textLink} href="#modules">{c.hero.ctaSecondary}<span aria-hidden="true">↗</span></a></div><p className={styles.heroNote}>{c.hero.note}</p></div>
          <figure className={styles.heroArt}><div className={styles.artCaption}><span>ACTUARIUS / DEVELOPMENT ENGINE</span><span>01—∞</span></div><DevelopmentSculpture locale={c.locale} /><figcaption><span className={styles.artAgent}><Icon name="spark" />AI + actuarial intelligence</span><span>{c.hero.caption}</span></figcaption></figure>
        </div>
        <div className={`${styles.wrap} ${styles.heroRail}`}><span>{c.demo.summary}</span><div>{c.modules.items.map((m, i) => <a key={m.t} href="#modules" onClick={() => setActiveModule(i)}><Icon name={moduleIcons[i]} />{m.t}{i < 3 && <span className={styles.railArrow} aria-hidden="true">→</span>}</a>)}</div></div>
      </section>

      <section className={`${styles.wrap} ${styles.intro}`}><div className={styles.introHead}><h2>{c.intro.title}</h2><p>{c.intro.p}</p></div><div className={styles.benefits}>{c.intro.items.map((item, i) => <div key={item.t}><span className={styles.benefitIndex}>0{i + 1}</span><h3>{item.t}</h3><p>{item.d}</p></div>)}</div></section>

      <section className={styles.platformSection} id="modules"><div className={styles.wrap}><div className={styles.sectionHeading}><span className={styles.sectionLabel}>{c.modules.label}</span><h2>{c.modules.h2}</h2><p>{c.modules.p}</p></div>
        <div className={styles.moduleTabs} role="tablist" aria-label={c.nav.modules}>{c.modules.items.map((m, i) => <button key={m.t} ref={el => { tabs.current[i] = el; }} id={`module-tab-${i}`} type="button" role="tab" aria-selected={activeModule === i} aria-controls={`module-panel-${i}`} tabIndex={activeModule === i ? 0 : -1} onClick={() => setActiveModule(i)} onKeyDown={e => changeTab(e, i)}><span className={styles.tabIndex}>0{i + 1}</span><Icon name={moduleIcons[i]} /><b>{m.t}</b><span className={styles.tabVerb}>{m.s}</span><Icon name="arrow" /></button>)}</div>
        {c.modules.items.map((m, i) => <div key={m.t} id={`module-panel-${i}`} role="tabpanel" aria-labelledby={`module-tab-${i}`} hidden={activeModule !== i} tabIndex={0} className={styles.modulePanel}><div className={styles.moduleCopy}><span className={styles.moduleNumber}>0{i + 1} / 04</span><h3>{m.title}</h3><p>{m.d}</p><ul className={styles.featureList}>{m.tags.map(t => <li key={t}><Icon name="check" />{t}</li>)}</ul><a href="#contact" className={styles.textLink}>{c.hero.ctaPrimary === "Ücretsiz başlayın" ? "Ekibiniz için keşfedin" : "Explore it for your team"}<Icon name="arrow" /></a></div><div className={styles.moduleCanvas}><p className={styles.demoLabel}>{c.demo.label}</p><ModuleVisual index={i} c={c} /><p className={styles.demoNote}>{c.demo.note}</p></div></div>)}
      </div></section>

      <section id="agent" className={`${styles.wrap} ${styles.agentSection}`}><div className={styles.agentCopy}><span className={styles.sectionLabel}><Icon name="spark" />{c.agent.label}</span><h2>{c.agent.h2}</h2><p>{c.agent.p}</p><ul className={styles.featureList}>{c.agent.features.map(t => <li key={t}><Icon name="check" />{t}</li>)}</ul></div><div className={styles.agentDemo}><div className={styles.agentDemoTop}><span><Icon name="spark" />Actuarius Agent</span><span>{c.agent.example}</span></div><div className={styles.prompt}>{c.agent.prompt}<span className={styles.promptArrow} aria-hidden="true">↑</span></div><div className={styles.agentReply}><span className={styles.agentAvatar}><Icon name="spark" /></span><div><p>{c.agent.reply}</p><ol>{c.agent.steps.map((s, i) => <li key={s}><span>{i + 1}</span>{s}<Icon name="check" /></li>)}</ol><div className={styles.agentResult}><Icon name="model" /><span>Fire & Home <b>2026 Q2</b></span><span>CL / BF</span></div></div></div><p className={styles.agentFootnote}>{c.agent.footnote}</p></div></section>

      <section id="governance" className={styles.enterpriseSection}><div className={styles.wrap}><div className={styles.enterpriseGrid}><div><span className={styles.sectionLabel}>{c.enterprise.label}</span><h2>{c.enterprise.title}</h2><p>{c.enterprise.p}</p><a href="#contact" className={styles.buttonLight}>{c.enterprise.cta}<Icon name="arrow" /></a></div><div className={styles.infrastructure}><div className={styles.infraLabel}><Icon name="lock" />{c.enterprise.private}</div><div className={styles.infraApp}><span className={styles.infraLogo}>A</span><b>Actuarius</b><span>{c.enterprise.local}</span></div><div className={styles.infraWires} aria-hidden="true"><i /><i /></div><div className={styles.infraSources}><div><Icon name="data" /><span>{c.enterprise.database}</span></div><div><Icon name="spark" /><span>{c.enterprise.model}</span></div></div></div></div><div className={styles.governanceRow}>{c.governance.items.map((g, i) => <div key={g.t}><span>0{i + 1}</span><h3>{g.t}</h3><p>{g.d}</p></div>)}</div></div></section>

      <section id="pricing" className={`${styles.wrap} ${styles.pricingSection}`}><div className={styles.sectionHeading}><span className={styles.sectionLabel}>{c.pricing.label}</span><h2>{c.pricing.h2}</h2><p>{c.pricing.p}</p></div><div className={styles.plans}>{c.pricing.plans.map(p => <article className={`${styles.plan} ${p.on ? styles.planFeatured : ""}`} key={p.n}><div className={styles.planTop}><h3>{p.n}</h3>{p.on && <span>{c.pricing.recommended}</span>}</div><p>{p.d}</p><div className={styles.price}>{p.p}<span>{p.s}</span></div><Link href={p.h} className={p.on ? styles.button : styles.buttonOutline}>{p.a}<Icon name="arrow" /></Link><ul className={styles.featureList}>{p.f.map(t => <li key={t}><Icon name="check" />{t}</li>)}</ul></article>)}</div></section>

      <section id="faq" className={`${styles.wrap} ${styles.faqSection}`}><div><h2>{c.faq.h2}</h2><p>{c.faq.p}</p><a href="#contact" className={styles.textLink}>{c.footer.contact}<Icon name="arrow" /></a></div><div className={styles.faqList}>{c.faq.items.map(f => <details className={styles.faq} key={f.q}><summary>{f.q}<span aria-hidden="true">+</span></summary><p>{f.a}</p></details>)}</div></section>

      <section id="contact" className={styles.contactSection}><div className={`${styles.wrap} ${styles.contactGrid}`}><div className={styles.contactCopy}><span className={styles.sectionLabel}>{c.contact.label}</span><h2>{c.contact.h2}</h2><p>{c.contact.p}</p><a href={`mailto:${SITE.email}`} className={styles.contactEmail}>{SITE.email}<Icon name="arrow" /></a><div className={styles.contactMotif} aria-hidden="true">{Array.from({ length: 5 }, (_, i) => <i key={i} style={{ width: `${100 - i * 18}%` }} />)}</div></div><div className={styles.contactForm}>
        {status === "ok" ? <div className={styles.formOk} role="status"><Icon name="check" /><h3>{c.contact.okTitle}</h3><p>{c.contact.okBody.replace("{to}", sentEmail)}</p><button type="button" className={styles.buttonOutline} onClick={() => setStatus("idle")}>{c.contact.again}</button></div> : <form onSubmit={submitContact} aria-busy={status === "sending"}><div className={styles.formRow}><label>{c.contact.name}<input name="name" value={form.name} onChange={set("name")} required minLength={2} maxLength={80} autoComplete="name" /></label><label>{c.contact.email}<input name="email" type="email" value={form.email} onChange={set("email")} required maxLength={160} autoComplete="email" /></label></div><label>{c.contact.company}<span className={styles.optional}>({c.contact.optional})</span><input name="company" value={form.company} onChange={set("company")} maxLength={120} autoComplete="organization" /></label><label>{c.contact.message}<textarea name="message" value={form.message} onChange={set("message")} required minLength={10} maxLength={4000} rows={4} placeholder={c.contact.placeholder} /></label><input className={styles.honeypot} aria-hidden="true" name="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={set("website")} />{status === "error" && <p className={styles.formError} role="alert">{errMsg}</p>}<button type="submit" className={styles.button} disabled={status === "sending"}>{status === "sending" ? c.contact.sending : c.contact.submit}<Icon name="arrow" /></button></form>}
      </div></div></section>
    </main>
    <footer className={`${styles.wrap} ${styles.footer}`}><div className={styles.footerTop}><Link href={c.path} className={styles.brand}><Image src="/logo-128.png" alt="" width={30} height={30} />Actuarius<span className={styles.brandDot}>.</span></Link><p>{c.footer.tagline}</p><a href="#main-content" className={styles.backTop} aria-label={c.locale === "tr" ? "Sayfa başına dön" : "Back to top"}>↑</a></div><div className={styles.footerBottom}><span>© {new Date().getFullYear()} Actuarius. {c.footer.rights}</span><div><Link href="/privacy">{c.footer.privacy}</Link><Link href="/terms">{c.footer.terms}</Link><a href="#contact">{c.footer.contact}</a></div></div></footer>
  </div>;
}
