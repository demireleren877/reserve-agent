import Link from "next/link";

export default function RefundPage() {
  return (
    <div className="min-h-screen" style={{ background: "#faf9f6", color: "#0a0a14" }}>
      <header className="px-6 md:px-8 h-16 flex items-center border-b" style={{ borderColor: "#e8e5dd", background: "#fff" }}>
        <Link href="/" className="flex items-center gap-2 text-[14px] font-bold tracking-tight">
          <div className="h-7 w-7 rounded-md bg-[#2553e4] grid place-items-center text-white text-[11px] font-bold">A</div>
          Reserve Agent
        </Link>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-[32px] font-bold mb-2" style={{ letterSpacing: "-0.03em" }}>İade Politikası</h1>
        <p className="text-[13px] mb-10" style={{ color: "#8a8898" }}>Son güncelleme: Mayıs 2026</p>

        <Section title="1. Genel İlke">
          Müşteri memnuniyeti önceliğimizdir. Ücretli aboneliğinizden memnun kalmadıysanız aşağıdaki koşullar çerçevesinde iade talep edebilirsiniz.
        </Section>

        <Section title="2. İlk Satın Alma İadesi">
          Pro aboneliğini satın aldıktan sonraki <strong>14 gün</strong> içinde tam iade talep edebilirsiniz. Herhangi bir gerekçe sunmanıza gerek yoktur.
        </Section>

        <Section title="3. İptal Sonrası Erişim">
          Aboneliğinizi iptal ettiğinizde, mevcut fatura döneminin sonuna kadar Pro özelliklerine erişiminiz devam eder. Dönem sona erdiğinde hesabınız otomatik olarak Free plana geçer.
        </Section>

        <Section title="4. Kısmi İade">
          14 günlük süre dolduktan sonra kısmi iade verilmez. Ancak teknik sorunlardan kaynaklanan kesintiler için duruma göre değerlendirme yapılır.
        </Section>

        <Section title="5. İade Nasıl Talep Edilir">
          İade talebinizi <a href="mailto:info@reserveagent.io" className="underline">info@reserveagent.io</a> adresine e-posta göndererek iletebilirsiniz. Lütfen hesabınıza kayıtlı e-posta adresini ve satın alma tarihini belirtin. Talepler 3–5 iş günü içinde sonuçlandırılır.
        </Section>

        <Section title="6. Ödeme Yöntemi">
          İadeler orijinal ödeme yönteminize (kredi/banka kartı) yapılır. Paddle altyapısı aracılığıyla işlenir; bankanıza göre 5–10 iş günü sürebilir.
        </Section>

        <Section title="7. Free Plan">
          Free plan ücretsiz olduğundan iade kapsamı dışındadır.
        </Section>

        <Section title="8. İletişim">
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
