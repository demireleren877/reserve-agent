import Link from "next/link";
import styles from "./landing.module.css";

const workflow = [
  {
    title: "Veriyi bağlayın",
    text: "Ödeme, muallak, prim ve büyük hasar verisini aynı değerleme dönemi altında yönetin.",
  },
  {
    title: "Modeli kurun",
    text: "Chain-Ladder, Bornhuetter–Ferguson ve tail seçimlerini branş bazında uygulayın.",
  },
  {
    title: "Değişimi açıklayın",
    text: "Actual vs Expected, LDF hareketleri ve dosya geçişleriyle farkın kaynağına inin.",
  },
  {
    title: "Sonucu izleyin",
    text: "Ultimate, IBNR, nakit akışı ve iskonto sonuçlarını dönemler arasında takip edin.",
  },
];

const plans = [
  {
    name: "Free",
    price: "₺0",
    note: "Kalıcı ücretsiz",
    description: "Bireysel kullanım ve modeli değerlendirmek için.",
    action: "Ücretsiz başlayın",
    href: "/reserve",
    features: ["1 dönem · 1 branş", "Chain-Ladder ve BF", "AI Agent", "Temel Excel çıktısı"],
  },
  {
    name: "Pro",
    price: "₺100",
    note: "Aylık",
    description: "Düzenli rezerv çalışması yürüten aktüerler için.",
    action: "Pro'ya geçin",
    href: "/onboarding/plan",
    featured: true,
    features: ["Sınırsız dönem ve branş", "Parametrik tail modelleri", "Nakit akışı ve iskonto", "Gelişmiş dışa aktarım"],
  },
  {
    name: "Enterprise",
    price: "Özel",
    note: "Kuruma göre",
    description: "Ekip yönetimi, entegrasyon ve kurumsal destek için.",
    action: "Görüşme planlayın",
    href: "mailto:demireleren877@gmail.com",
    features: ["Çoklu kullanıcı ve roller", "Kurumsal audit workflow", "API ve veri entegrasyonu", "On-premise seçeneği"],
  },
];

const faqs = [
  [
    "Actuarius kimler için?",
    "Rezerv aktüerleri, rezerv yöneticileri ve model değişikliklerini denetleyen ekipler için tasarlandı. Bireysel çalışmadan çok kullanıcılı kurumsal sürece kadar aynı model yapısını korur.",
  ],
  [
    "Hangi rezerv yöntemleri destekleniyor?",
    "Chain-Ladder ve Bornhuetter–Ferguson; hacim, basit ve geometrik LDF seçimleri; parametrik tail modelleri ve kullanıcı CDF seçimleri desteklenir.",
  ],
  [
    "Model değişiklikleri izlenebiliyor mu?",
    "Evet. Kullanıcı etkileşimleri kim, ne zaman, hangi branş ve model üzerinde ne değiştirdi bilgisiyle audit akışına yazılır. LDF ve dönemsel gelişim ekranları değişimin finansal etkisini incelemeyi kolaylaştırır.",
  ],
  [
    "Veriler AI modeline gönderiliyor mu?",
    "AI Agent ham dosyayı doğrudan işlemez; kendisine açılan model bağlamı ve yetkili araçlar üzerinden çalışır. Kurumsal kurulum seçenekleri için ekibimizle mimariyi birlikte değerlendirebilirsiniz.",
  ],
];

export default function LandingPage() {
  return (
    <div className={styles.site}>
      <header className={styles.header}>
        <div className={styles.navInner}>
          <Link href="/" className={styles.brand} aria-label="Actuarius ana sayfa">
            <img src="/favicon.png" alt="" className={styles.logo} />
            <span>Actuarius</span>
          </Link>
          <nav className={styles.navLinks} aria-label="Ana navigasyon">
            <a href="#platform">Platform</a>
            <a href="#governance">Yönetişim</a>
            <a href="#pricing">Fiyatlandırma</a>
          </nav>
          <div className={styles.navActions}>
            <Link href="/login" className={styles.loginLink}>Giriş</Link>
            <Link href="/reserve" className={styles.primaryButton}>Ücretsiz başlayın <Arrow /></Link>
          </div>
        </div>
      </header>

      <main>
        <section className={styles.hero} id="platform">
          <div className={styles.heroCopy}>
            <p className={styles.heroLabel}>Aktüeryal rezerv yönetimi</p>
            <h1>Rezerv kararları, kaynağıyla birlikte.</h1>
            <p className={styles.heroText}>
              Actuarius; veriyi, varsayımları, sonuçları ve denetim izini aynı çalışma alanında birleştirir.
              Her değişiklik açıklanabilir, her sonuç yeniden üretilebilir kalır.
            </p>
            <div className={styles.heroActions}>
              <Link href="/reserve" className={styles.primaryButton}>Model oluşturmaya başlayın <Arrow /></Link>
              <a href="mailto:demireleren877@gmail.com" className={styles.secondaryButton}>Kurumsal demo isteyin</a>
            </div>
            <p className={styles.heroFootnote}>Kredi kartı gerekmez · Excel ve CSV ile başlayın</p>
          </div>
          <ModelReview />
        </section>

        <div className={styles.capabilityRail} aria-label="Platform kapsamı">
          <span>Chain-Ladder</span>
          <span>Bornhuetter–Ferguson</span>
          <span>Large loss</span>
          <span>Actual vs Expected</span>
          <span>Cashflow</span>
          <span>Discounting</span>
        </div>

        <section className={styles.workflowSection}>
          <div className={styles.sectionIntro}>
            <h2>Değerleme süreci tek model üzerinde ilerler.</h2>
            <p>
              Dosya yüklemekten dönem kapanışına kadar aynı branş, aynı varsayım seti ve aynı audit bağlamı korunur.
            </p>
          </div>
          <ol className={styles.workflow}>
            {workflow.map((item, index) => (
              <li key={item.title}>
                <span className={styles.stepNumber}>{String(index + 1).padStart(2, "0")}</span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.governanceSection} id="governance">
          <div className={styles.governanceCopy}>
            <p className={styles.sectionLabel}>Model yönetişimi</p>
            <h2>Sonucun yanında, kararın gerekçesini de saklayın.</h2>
            <p>
              Bir LDF neden değişti, hangi dosya segment değiştirdi, IBNR ne kadar etkilendi ve seçimi kim yaptı?
              Actuarius bu soruları sonradan yeniden kurmanız gerekmeden yanıtlar.
            </p>
            <ul className={styles.checkList}>
              <li><Check /> Kullanıcı, branş, model ve zaman bağlamlı audit kayıtları</li>
              <li><Check /> Aykırı LDF&apos;ler için finansal etki odaklı inceleme</li>
              <li><Check /> Dönemsel Ultimate, IBNR, EP ve ULR takibi</li>
              <li><Check /> Büyük hasardan attritional segmente geçiş görünürlüğü</li>
            </ul>
          </div>
          <AuditLedger />
        </section>

        <section className={styles.agentSection} id="agent">
          <div className={styles.agentCopy}>
            <span className={styles.agentMark}>A</span>
            <div>
              <h2>Modeli bilen bir AI çalışma arkadaşı.</h2>
              <p>
                Agent; aktif branşı ve model bağlamını okur, izin verilen araçlarla analiz yapar ve gerçekleştirdiği
                kullanıcı kaynaklı işlemleri audit akışına bırakır.
              </p>
            </div>
          </div>
          <div className={styles.agentExchange} aria-label="AI Agent örnek konuşması">
            <p className={styles.userMessage}>2026Q2 için maddi aykırı LDF&apos;leri incele.</p>
            <div className={styles.agentAnswer}>
              <span className={styles.answerStatus}>İnceleme tamamlandı</span>
              <strong>2 hücre öncelikli inceleme gerektiriyor.</strong>
              <p>2024 · 1→2 hücresindeki değişimin ana nedeni Large → Attritional geçişi.</p>
            </div>
          </div>
        </section>

        <section className={styles.securitySection}>
          <div className={styles.securityHeading}>
            <h2>Kurumsal kullanım için sakin ve kontrollü.</h2>
            <p>Yetki, izlenebilirlik ve veri izolasyonu ürün akışının parçasıdır.</p>
          </div>
          <div className={styles.securityItems}>
            <div><span>01</span><h3>Rol bazlı erişim</h3><p>Kullanıcı ve yönetici yetkilerini çalışma alanı sorumluluklarına göre ayırın.</p></div>
            <div><span>02</span><h3>Kalıcı audit izi</h3><p>Kullanıcı ve Agent işlemlerini aynı zaman çizelgesinde, hedef bağlamıyla inceleyin.</p></div>
            <div><span>03</span><h3>Kurulum esnekliği</h3><p>Enterprise ihtiyaçları için entegrasyon ve on-premise seçeneklerini değerlendirin.</p></div>
          </div>
        </section>

        <section className={styles.pricingSection} id="pricing">
          <div className={styles.sectionIntro}>
            <h2>İhtiyacınız kadar başlayın.</h2>
            <p>Ürünü ücretsiz değerlendirin; model ve ekip kapsamı büyüdüğünde planınızı genişletin.</p>
          </div>
          <div className={styles.pricingGrid}>
            {plans.map((plan) => (
              <article key={plan.name} className={`${styles.plan} ${plan.featured ? styles.featuredPlan : ""}`}>
                <div className={styles.planHeader}>
                  <div><h3>{plan.name}</h3><p>{plan.description}</p></div>
                  {plan.featured && <span className={styles.recommended}>En çok tercih edilen</span>}
                </div>
                <div className={styles.price}><strong>{plan.price}</strong><span>{plan.note}</span></div>
                <ul>{plan.features.map((feature) => <li key={feature}><Check /> {feature}</li>)}</ul>
                {plan.href.startsWith("mailto:") ? (
                  <a href={plan.href} className={plan.featured ? styles.primaryButton : styles.secondaryButton}>{plan.action}</a>
                ) : (
                  <Link href={plan.href} className={plan.featured ? styles.primaryButton : styles.secondaryButton}>{plan.action}</Link>
                )}
              </article>
            ))}
          </div>
        </section>

        <section className={styles.faqSection}>
          <h2>Sık sorulan sorular</h2>
          <div className={styles.faqList}>
            {faqs.map(([question, answer], index) => (
              <details key={question} open={index === 0}>
                <summary>{question}<Plus /></summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className={styles.finalCta}>
          <div>
            <h2>Bir sonraki değerleme döneminizi daha açıklanabilir yönetin.</h2>
            <p>İlk modelinizi ücretsiz oluşturun veya kurumsal kullanım için birlikte planlayalım.</p>
          </div>
          <div className={styles.finalActions}>
            <Link href="/reserve" className={styles.lightButton}>Ücretsiz başlayın <Arrow /></Link>
            <a href="mailto:demireleren877@gmail.com" className={styles.darkOutlineButton}>Demo isteyin</a>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerBrand}>
          <Link href="/" className={styles.brand}><img src="/favicon.png" alt="" className={styles.logo} /><span>Actuarius</span></Link>
          <p>Aktüeryal rezerv kararları için izlenebilir çalışma alanı.</p>
        </div>
        <div className={styles.footerLinks}>
          <div><strong>Platform</strong><a href="#platform">Ürün</a><a href="#governance">Yönetişim</a><a href="#pricing">Fiyatlandırma</a></div>
          <div><strong>Yasal</strong><Link href="/terms">Kullanım şartları</Link><Link href="/privacy">Gizlilik</Link><Link href="/refund">İade politikası</Link></div>
        </div>
        <div className={styles.footerBottom}><span>© 2026 Actuarius</span><span>İstanbul, Türkiye</span></div>
      </footer>
    </div>
  );
}

function ModelReview() {
  return (
    <div className={styles.reviewVisual} aria-label="Actuarius model review özeti">
      <div className={styles.reviewTopbar}>
        <div className={styles.windowDots}><span /><span /><span /></div>
        <span>Model review · 2026Q2</span>
        <span className={styles.reviewReady}>Review ready</span>
      </div>
      <div className={styles.reviewContext}>
        <div><small>Branş</small><strong>Motor TPL</strong></div>
        <div><small>Segment</small><strong>Attritional</strong></div>
        <div><small>Basis</small><strong>Incurred · BF</strong></div>
      </div>
      <div className={styles.reviewMetrics}>
        <div><small>Latest</small><strong>₺1,04bn</strong><span>2026Q2</span></div>
        <div><small>IBNR</small><strong>₺170,4m</strong><span className={styles.positive}>+2,8% vs Q1</span></div>
        <div><small>Ultimate</small><strong>₺1,21bn</strong><span>ULR 64,2%</span></div>
      </div>
      <div className={styles.reviewBody}>
        <div className={styles.miniTriangle}>
          <div className={styles.triangleHeader}><strong>Development</strong><span>12</span><span>24</span><span>36</span><span>48</span></div>
          {[
            ["2022", "1.842", "1.224", "1.063", "1.018"],
            ["2023", "1.915", "1.302", "1.074", "—"],
            ["2024", "2.312", "1.405", "—", "—"],
            ["2025", "2.566", "—", "—", "—"],
          ].map((row, index) => (
            <div key={row[0]} className={index === 2 ? styles.flaggedRow : ""}>
              {row.map((cell, cellIndex) => cellIndex === 0 ? <strong key={cellIndex}>{cell}</strong> : <span key={cellIndex}>{cell}</span>)}
            </div>
          ))}
        </div>
        <div className={styles.reviewNote}>
          <span className={styles.noteLabel}>Decision context</span>
          <strong>2024 · 12→24</strong>
          <p>Factor is 13,2% above the column median. IBNR impact: ₺4,8m.</p>
          <div className={styles.noteMeta}><span>Owner</span><b>E. Demirel</b><span>Status</span><b>Open</b></div>
        </div>
      </div>
    </div>
  );
}

function AuditLedger() {
  const items = [
    ["14:32", "LDF selection updated", "Motor TPL · 2026Q2", "E. Demirel"],
    ["14:28", "Large → Attritional transition reviewed", "Claim 24413081", "AI Agent"],
    ["13:51", "BF selected loss ratio revised", "2025 accident year", "S. Kaya"],
    ["11:04", "Quarterly data imported", "12.408 records", "E. Demirel"],
  ];
  return (
    <div className={styles.auditLedger}>
      <div className={styles.ledgerHeader}><div><span>Audit workspace</span><strong>2026Q2 close</strong></div><span className={styles.liveStatus}>Live</span></div>
      <div className={styles.ledgerFilters}><span>All modules</span><span>Motor TPL</span><span>All users</span></div>
      <div className={styles.ledgerTable}>
        {items.map(([time, action, target, actor]) => (
          <div key={`${time}-${action}`}>
            <time>{time}</time>
            <p><strong>{action}</strong><span>{target}</span></p>
            <b>{actor}</b>
          </div>
        ))}
      </div>
      <div className={styles.ledgerFooter}><span>4 actions shown</span><strong>Export audit report →</strong></div>
    </div>
  );
}

function Arrow() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function Check() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 12 4 4L19 6" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function Plus() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
}
