import Link from "next/link";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen" style={{ background: "#faf9f6", color: "#0a0a14" }}>
      <header className="px-6 md:px-8 h-16 flex items-center border-b" style={{ borderColor: "#e8e5dd", background: "#fff" }}>
        <Link href="/" className="flex items-center gap-2 text-[14px] font-bold tracking-tight">
          <img src="/favicon.png" alt="Actuarius" className="h-7 w-7" />
          Actuarius
        </Link>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-[32px] font-bold mb-2" style={{ letterSpacing: "-0.03em" }}>Gizlilik Politikası</h1>
        <p className="text-[13px] mb-10" style={{ color: "#8a8898" }}>Son güncelleme: Mayıs 2026</p>

        <Section title="1. Topladığımız Veriler">
          Hizmeti kullanırken şu verileri topluyoruz: e-posta adresi ve kimlik doğrulama bilgisi (Firebase Auth), yüklediğiniz aktüeryal veriler (tarayıcıda ve Cloudflare altyapısında şifreli), ödeme bilgileri (yalnızca Paddle tarafından işlenir; kartı saklamamız).
        </Section>

        <Section title="2. Verilerin Kullanımı">
          Verilerinizi yalnızca hizmetin işletimi için kullanırız: hesap yönetimi, veri senkronizasyonu ve teknik destek. Verilerinizi üçüncü şahıslara satmayız.
        </Section>

        <Section title="3. Veri Saklama">
          Aktüeryal verileriniz Cloudflare D1 (SQLite, Avrupa bölgesi) üzerinde saklanır. Hesabınızı sildiğinizde verileriniz 30 gün içinde kalıcı olarak silinir.
        </Section>

        <Section title="4. Üçüncü Taraf Hizmetler">
          <span>
            Şu harici hizmetleri kullanırız:
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li><strong>Firebase</strong> — kimlik doğrulama</li>
              <li><strong>Cloudflare</strong> — altyapı ve veri depolama</li>
              <li><strong>Paddle</strong> — ödeme işleme</li>
              <li><strong>OpenRouter</strong> — yapay zeka model erişimi</li>
            </ul>
          </span>
        </Section>

        <Section title="5. Çerezler">
          Oturum yönetimi için zorunlu çerezler kullanılır. Pazarlama veya izleme amaçlı üçüncü taraf çerez kullanılmaz.
        </Section>

        <Section title="6. Haklarınız (KVKK / GDPR)">
          Verilerinize erişim, düzeltme, silme ve taşıma talep etme haklarına sahipsiniz. Talepleriniz için: <a href="mailto:demireleren877@gmail.com" className="underline">demireleren877@gmail.com</a>
        </Section>

        <Section title="7. Güvenlik">
          Verileriniz aktarım sırasında TLS ile, depolamada Cloudflare altyapısının sağladığı şifrelemeyle korunur.
        </Section>

        <Section title="8. Değişiklikler">
          Bu politika değiştirildiğinde kayıtlı e-posta adresinize bildirim göndeririz.
        </Section>

        <Section title="9. İletişim">
          Gizlilikle ilgili sorularınız için: <a href="mailto:demireleren877@gmail.com" className="underline">demireleren877@gmail.com</a>
        </Section>
      </main>

      <Footer />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-[16px] font-semibold mb-2">{title}</h2>
      <div className="text-[14px] leading-relaxed" style={{ color: "#45445a" }}>{children}</div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="mt-16 px-6 py-8 text-center text-[12px]" style={{ borderTop: "1px solid #e8e5dd", color: "#8a8898" }}>
      <div className="flex items-center justify-center gap-5 flex-wrap">
        <Link href="/terms" className="hover:underline">Kullanım Şartları</Link>
        <Link href="/privacy" className="hover:underline">Gizlilik Politikası</Link>
        <Link href="/refund" className="hover:underline">İade Politikası</Link>
        <a href="mailto:demireleren877@gmail.com" className="hover:underline">İletişim</a>
      </div>
      <p className="mt-3">© 2026 Actuarius</p>
    </footer>
  );
}
