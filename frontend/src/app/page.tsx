"use client";

import { useState } from "react";
import Link from "next/link";
import styles from "./landing.module.css";

/**
 * Actuarius ana sayfası.
 * Tema: tam açık (yumuşak kırık beyaz zemin + beyaz kartlar), bakır aksan.
 * Düzen: simetrik — tüm bölümler aynı dikey ritimde, başlıklar ortalı,
 * ızgaralar tam bölünen sayılarda (2×2, 3×2, 4×2, 4, 3).
 */

const MODULES = [
  { t: "Veri", s: "Bağlı", d: "Dönem bazlı hasar, prim ve büyük hasar verisi. Oracle tablosundan doğrudan ya da Excel/CSV ile.", shot: "/shots/data-map.jpg" },
  { t: "Rezerv", s: "Modelleniyor", d: "Chain-Ladder ve Bornhuetter–Ferguson; gelişim faktörleri, kuyruk, large ayrımı, frekans-şiddet, senaryo versiyonları.", shot: "/shots/ldf.jpg" },
  { t: "Nakit Akışı", s: "Hazır", d: "Ödeme deseninden çeyreklik ve aylık nakit akışı projeksiyonu; rezervle tutarlı kalır.", shot: "/shots/cashflow.jpg" },
  { t: "İskonto", s: "Hazır", d: "IFRS 17 eğrisi, illikidite primi ve risk marjı ile yükümlülük iskontosu (LIC).", shot: "/shots/discount.jpg" },
];

const AGENT_TOOLS: [string, number, string][] = [
  ["Rezerv", 31, "Üçgen, eleme, kuyruk, BF, senaryo, roll-forward"],
  ["Nakit Akışı", 10, "Desen, LDF, hariç tutma, eğri"],
  ["İskonto", 2, "Durum okuma ve LIC hesabı"],
  ["Veri & Navigasyon", 2, "Dönem listesi, modüller arası geçiş"],
];

const CLOSE: [string, string, string][] = [
  ["01", "Veri yüklenir", "Yeni dönemin hasar, prim ve büyük hasar setleri bağlanır."],
  ["02", "Mutabakat", "Yeni köşegen beklenenle karşılaştırılır; sapan kohortlar işaretlenir."],
  ["03", "Revizyon", "Model güncellenir: eleme, baz seçimi, a priori oran, correction."],
  ["04", "Projeksiyon", "Nakit akışı deseni ve IFRS 17 iskontosu hesaplanır."],
  ["05", "Rapor ve kilit", "Özet, segment kırılımı ve Excel çıktısı üretilir; model kilitlenir."],
];

const MODEL_STEPS: { t: string; d: string; shot: string; copy: string }[] = [
  { t: "Veri", d: "Üçgen önizleme", shot: "/shots/data-tab.jpg", copy: "Ödeme ve muallak üçgenleri kümülatif ya da artımsal olarak; veri modülünden çekilir veya Excel'den yüklenir." },
  { t: "Dosya", d: "Hasar kırılımı", shot: "/shots/files.jpg", copy: "Hangi dosya hangi hücreyi taşıyor? Medyan, değişim katsayısı ve konsantrasyon ile dosya bazında dağılım." },
  { t: "LDF", d: "Gelişim faktörleri", shot: "/shots/ldf.jpg", copy: "Hacim penceresi seçilir, aykırı hücre elenir; seçili LDF ve CDF zinciri anında güncellenir." },
  { t: "Curve", d: "Kuyruk uydurma", shot: "/shots/curve.jpg", copy: "Exponential, inverse power, power ve Weibull; adım bazında seçim ve elle CDF girişi." },
  { t: "ILR", d: "Hasar oranı üçgeni", shot: "/shots/ilr.jpg", copy: "Kazanılmış prime göre hasar oranı gelişimi — BF için a priori oran buradan okunur." },
  { t: "BF", d: "Bornhuetter–Ferguson", shot: "/shots/bf.jpg", copy: "Exposure, yıllıklaştırma katsayısı ve beklenen hasar oranı; kohort bazında CL/BF seçimi." },
  { t: "Ultimate / IBNR", d: "Rezerv projeksiyonu", shot: "/shots/ultimate.jpg", copy: "Kaza yılı bazında nihai hasar, IBNR ve ULR — seçilen bazla birlikte." },
];

const GOV: [string, string][] = [
  ["Roller", "Admin ve kullanıcı ayrımı; modül ve veri erişimi role bağlı."],
  ["Model kilidi", "Bir modeli aynı anda tek kişi düzenler; diğerleri salt-okunur görür."],
  ["Denetim izi", "Her yazma işlemi kim · ne zaman · ne · neden bilgisiyle saklanır."],
  ["Versiyonlar", "Senaryolar ayrı versiyonda tutulur; karşılaştırma yan yana yapılır."],
];

const PLANS = [
  { n: "Free", p: "₺0", s: "kalıcı", f: ["1 dönem · 1 branş", "Rezerv modülü", "AI Agent", "Excel çıktısı"], h: "/reserve", a: "Ücretsiz başlayın" },
  { n: "Pro", p: "₺100", s: "aylık", f: ["Sınırsız dönem ve branş", "Nakit akışı ve iskonto", "Senaryo versiyonları", "Tüm agent araçları"], h: "/onboarding/plan", a: "Pro'ya geçin", on: true },
  { n: "Enterprise", p: "Özel", s: "kuruma göre", f: ["Çoklu kullanıcı ve roller", "Oracle entegrasyonu", "Kurumsal audit akışı", "On-premise"], h: "mailto:demireleren877@gmail.com", a: "Görüşme planlayın" },
];

export default function V5() {
  const [step, setStep] = useState(2); // LDF

  return (
    <div className={styles.page}>
      <header className={styles.nav}>
        <Link href="/" className={styles.brand}>
          <img src="/favicon.png" alt="" width={34} height={34} className={styles.logo} />
          Actuarius
        </Link>
        <nav className={styles.navLinks}>
          <a href="#moduller">Modüller</a>
          <a href="#agent">Agent</a>
          <a href="#kapanis">Kapanış</a>
          <a href="#modelleme">Modelleme</a>
          <a href="#yonetisim">Yönetişim</a>
          <a href="#fiyat">Fiyat</a>
        </nav>
        <div className={styles.navCta}>
          <Link href="/login" className={styles.ghost}>Giriş</Link>
          <Link href="/reserve" className={styles.solid}>Ücretsiz başlayın</Link>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className={styles.hero}>
        <div className={styles.wrap}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>Uçtan uca aktüeryal analiz platformu</p>
            <h1>Aktüeryal işin tamamı,<br />tek platformda.</h1>
            <p className={styles.lede}>
              Veri yönetimi, rezerv modelleme, nakit akışı, iskonto ve raporlama aynı sistemde.
              AI Agent bu modüllerin hepsinde çalışır — dönemi kapatır, modeli kurar, raporu
              üretir ve her kararın gerekçesini bırakır.
            </p>
            <div className={styles.actions}>
              <Link href="/reserve" className={styles.solidLg}>Ücretsiz başlayın</Link>
              <a href="mailto:demireleren877@gmail.com" className={styles.ghostLg}>Kurumsal demo</a>
            </div>
            <p className={styles.note}>Kredi kartı gerekmez · Excel, CSV veya Oracle ile başlayın</p>
          </div>

          {/* Modül durumları — hero'da hemen "all-in-one" sinyali */}
          <div className={styles.strip}>
            {MODULES.map((m) => (
              <div key={m.t} className={styles.stripItem}>
                <b>{m.t}</b>
                <i>{m.s}</i>
              </div>
            ))}
            <div className={`${styles.stripItem} ${styles.stripAgent}`}>
              <b>AI Agent</b>
              <i>hepsinde çalışır</i>
            </div>
          </div>
        </div>
      </section>

      {/* ── Modüller — 2×2 ── */}
      <section className={styles.section} id="moduller">
        <div className={styles.wrap}>
          <div className={styles.head}>
            <p className={styles.label}>Modüller</p>
            <h2>Dört modül, tek veri katmanı</h2>
            <p>Aynı dönem, aynı branş ve aynı varsayım seti üzerinde çalışırlar; birindeki değişiklik diğerlerine yansır.</p>
          </div>
          <div className={styles.grid2}>
            {MODULES.map((m) => (
              <article key={m.t} className={styles.modCard}>
                <img loading="lazy" decoding="async" src={m.shot} alt={`Actuarius ${m.t} modülü`} />
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
            <p className={styles.label}>AI Agent</p>
            <h2>Tüm modüllerde çalışan bir aktüeryal asistan</h2>
            <p>
              Agent sohbet etmekle kalmaz; veriyi bağlar, üçgeni kurar, aykırı oranı eler, genç
              kohortları BF&apos;e alır, nakit akışını ve iskontoyu çalıştırır, raporu çıkarır.
              Rol ve model kilidine uyar; her adım geri alınabilir ve denetime yazılır.
            </p>
          </div>
          <div className={styles.grid4}>
            {AGENT_TOOLS.map(([m, n, d]) => (
              <div key={m} className={styles.tile}>
                <span className={styles.tileNum}>{n}</span>
                <h3>{m}</h3>
                <p>{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Kapanış — 3×2 ── */}
      <section className={styles.section} id="kapanis">
        <div className={styles.wrap}>
          <div className={styles.head}>
            <p className={styles.label}>Dönem kapanışı</p>
            <h2>Kapanış altı adımda tamamlanır</h2>
            <p>Agent bu adımları uçtan uca yürütebilir; siz onaylar ve gerektiğinde devralırsınız.</p>
          </div>
          <ol className={styles.stepper}>
            {CLOSE.map(([n, t, d]) => (
              <li key={n} className={styles.stepItem}>
                <span className={styles.stepNo}>{n}</span>
                <h3>{t}</h3>
                <p>{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Modelleme — 4×2 + rapor ── */}
      <section className={styles.sectionAlt} id="modelleme">
        <div className={styles.wrap}>
          <div className={styles.head}>
            <p className={styles.label}>Modelleme ve raporlama</p>
            <h2>Sekiz adımlık model akışı</h2>
            <p>Rezerv modülündeki sekmeler süreci birebir izler; her adımın çıktısı bir sonrakini besler.</p>
          </div>
          <div className={styles.tabs} role="tablist" aria-label="Modelleme adımları">
            {MODEL_STEPS.map((m, i) => (
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
                {MODEL_STEPS.map((m, i) => (
                  <figure key={m.t} className={styles.slide} aria-hidden={i !== step}>
                    <div className={styles.frame}>
                      <div className={styles.frameBar}>
                        <i /><i /><i />
                        <span>rezerv / 2026Q2 / Fire &amp; Home — {m.t.toLowerCase()}</span>
                      </div>
                      <img loading="lazy" decoding="async" src={m.shot} alt={`Actuarius ${m.t} ekranı`} />
                    </div>
                    <figcaption>{m.copy}</figcaption>
                  </figure>
                ))}
              </div>
            </div>

            <div className={styles.controls}>
              <button
                className={styles.arrow}
                onClick={() => setStep((i) => (i - 1 + MODEL_STEPS.length) % MODEL_STEPS.length)}
                aria-label="Önceki adım"
              >
                ←
              </button>
              <span className={styles.counter}>
                {String(step + 1).padStart(2, "0")} / {String(MODEL_STEPS.length).padStart(2, "0")}
              </span>
              <button
                className={styles.arrow}
                onClick={() => setStep((i) => (i + 1) % MODEL_STEPS.length)}
                aria-label="Sonraki adım"
              >
                →
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── Yönetişim — 4 ── */}
      <section className={styles.section} id="yonetisim">
        <div className={styles.wrap}>
          <div className={styles.head}>
            <p className={styles.label}>Yönetişim</p>
            <h2>Denetime hazır çalışma</h2>
            <p>Kim neyi neden değiştirdi sorusu sonradan yeniden kurulmaz — kaydedilir.</p>
          </div>
          <div className={styles.grid4}>
            {GOV.map(([t, d]) => (
              <div key={t} className={styles.tile}><h3>{t}</h3><p>{d}</p></div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Fiyat — 3 ── */}
      <section className={styles.sectionAlt} id="fiyat">
        <div className={styles.wrap}>
          <div className={styles.head}>
            <p className={styles.label}>Fiyatlandırma</p>
            <h2>Ücretsiz başlayın</h2>
            <p>Ekip ve modül ihtiyacı büyüdükçe yükseltin.</p>
          </div>
          <div className={styles.grid3}>
            {PLANS.map((p) => (
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

      {/* ── Kapanış çağrısı ── */}
      <section className={styles.section}>
        <div className={styles.wrap}>
          <div className={styles.cta}>
            <h2>Bir sonraki kapanışı birlikte yapalım.</h2>
            <p>Ücretsiz hesapla bir branşı baştan sona modelleyin; agent&apos;ı işin içine alın, sonucu ve gerekçesini görün.</p>
            <div className={styles.actions}>
              <Link href="/reserve" className={styles.solidLg}>Ücretsiz başlayın</Link>
              <a href="mailto:demireleren877@gmail.com" className={styles.ghostLgDark}>Kurumsal demo</a>
            </div>
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.wrap}>
          <div className={styles.footInner}>
            <span className={styles.footBrand}>
              <img src="/favicon.png" alt="" width={26} height={26} className={styles.footLogo} />
              Actuarius
              <em>actuarius.com.tr</em>
            </span>
            <span className={styles.footLinks}>
              <Link href="/privacy">Gizlilik</Link><Link href="/terms">Şartlar</Link>
              <a href="mailto:demireleren877@gmail.com">İletişim</a>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
