import Link from "next/link";

export default function TermsPage() {
  return (
    <div className="min-h-screen" style={{ background: "#faf9f6", color: "#0a0a14" }}>
      <header className="px-6 md:px-8 h-16 flex items-center border-b" style={{ borderColor: "#e8e5dd", background: "#fff" }}>
        <Link href="/" className="flex items-center gap-2 text-[14px] font-bold tracking-tight">
          <div className="h-7 w-7 rounded-md bg-[#2553e4] grid place-items-center text-white text-[11px] font-bold">A</div>
          Reserve Agent
        </Link>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-[32px] font-bold mb-2" style={{ letterSpacing: "-0.03em" }}>Kullanım Şartları</h1>
        <p className="text-[13px] mb-10" style={{ color: "#8a8898" }}>Son güncelleme: Mayıs 2026</p>

        <Section title="1. Kabul">
          Reserve Agent&apos;i kullanarak bu şartları kabul etmiş sayılırsınız. Kabul etmiyorsanız hizmeti kullanmayınız.
        </Section>

        <Section title="2. Hizmet Tanımı">
          Reserve Agent, aktüeryal IBNR rezerv analizi için bulut tabanlı bir platformdur. Hizmet; Chain-Ladder, Bornhuetter-Ferguson ve tail fitting yöntemlerini içerir.
        </Section>

        <Section title="3. Hesap ve Güvenlik">
          Hesabınızın güvenliğinden siz sorumlusunuz. Şifrenizi kimseyle paylaşmayınız. Yetkisiz erişim fark ettiğinizde derhal bildirin.
        </Section>

        <Section title="4. Abonelik ve Ödeme">
          Free plan ücretsizdir. Pro plan aylık abonelik gerektirir. Ödemeler Paddle aracılığıyla işlenir. Fiyatlar KDV hariçtir.
        </Section>

        <Section title="5. İptal ve İade">
          Aboneliği istediğiniz zaman iptal edebilirsiniz. İptal sonrası mevcut dönem sonuna kadar erişim devam eder.
          İade koşulları için <Link href="/refund" className="underline">İade Politikamızı</Link> inceleyin.
        </Section>

        <Section title="6. Fikri Mülkiyet">
          Platform ve içeriklerin tüm hakları Reserve Agent&apos;e aittir. Kullanıcı verilerinizin mülkiyeti size aittir.
        </Section>

        <Section title="7. Sorumluluk Sınırı">
          Reserve Agent, aktüeryal hesaplamalardan doğacak iş kararlarından sorumlu tutulamaz. Platform bir karar destek aracıdır; nihai kararlar kullanıcıya aittir.
        </Section>

        <Section title="8. Değişiklikler">
          Bu şartlar önceden bildirim yapılarak değiştirilebilir. Değişiklikler yayınlandıktan sonra hizmeti kullanmaya devam etmeniz kabulü ifade eder.
        </Section>

        <Section title="9. İletişim">
          Sorularınız için: <a href="mailto:info@reserveagent.io" className="underline">info@reserveagent.io</a>
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
      <p className="text-[14px] leading-relaxed" style={{ color: "#45445a" }}>{children}</p>
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
        <a href="mailto:info@reserveagent.io" className="hover:underline">İletişim</a>
      </div>
      <p className="mt-3">© 2026 Reserve Agent</p>
    </footer>
  );
}
