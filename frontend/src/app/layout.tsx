import type { Metadata } from "next";
import { Geist, Geist_Mono, Archivo, Fira_Code } from "next/font/google";
import { AuthProvider } from "@/lib/auth/auth-context";
import { SITE, organizationSchema, webSiteSchema } from "@/lib/seo";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Landing-only display + data faces. The app keeps using Geist.
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700", "800"],
});

const firaCode = Fira_Code({
  variable: "--font-fira",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: "Actuarius — Aktüeryal Rezerv ve IBNR Analiz Platformu",
    // Alt sayfalar kendi başlığını verir; marka adı otomatik eklenir.
    template: "%s · Actuarius",
  },
  description:
    "Actuarius; sigorta şirketleri ve aktüerler için uçtan uca aktüeryal analiz platformu. " +
    "Chain-Ladder ve Bornhuetter-Ferguson ile IBNR rezerv hesabı, nakit akışı projeksiyonu ve " +
    "IFRS 17 iskonto tek sistemde. AI Agent tüm modülleri yürütür; her karar denetim iziyle saklanır.",
  applicationName: SITE.name,
  category: "business",
  authors: [{ name: "Actuarius", url: SITE.url }],
  creator: "Actuarius",
  publisher: "Actuarius",
  keywords: [
    "aktüerya",
    "aktüeryal analiz",
    "aktüeryal yazılım",
    "IBNR",
    "IBNR hesaplama",
    "rezerv hesaplama",
    "hasar rezervi",
    "Chain-Ladder",
    "Bornhuetter-Ferguson",
    "gelişim üçgeni",
    "run-off üçgeni",
    "LDF",
    "nakit akışı projeksiyonu",
    "IFRS 17",
    "iskonto",
    "sigorta",
    "reasürans",
    "actuarial software",
    "loss reserving",
    "actuarius",
  ],
  alternates: {
    canonical: "/",
    languages: { "tr-TR": SITE.url },
  },
  openGraph: {
    type: "website",
    siteName: SITE.name,
    locale: "tr_TR",
    url: SITE.url,
    title: "Actuarius — Aktüeryal Rezerv ve IBNR Analiz Platformu",
    description:
      "Veri, rezerv, nakit akışı ve iskonto tek platformda. AI Agent tüm modülleri yürütür: " +
      "dönemi kapatır, modeli kurar, raporu üretir.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Actuarius — Aktüeryal Rezerv ve IBNR Analiz Platformu",
    description:
      "Veri, rezerv, nakit akışı ve iskonto tek platformda. AI Agent tüm modülleri yürütür.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  formatDetection: { telephone: false, address: false, email: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="tr"
      className={`${geistSans.variable} ${geistMono.variable} ${archivo.variable} ${firaCode.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        {/* Yapısal veri — arama motorları ve LLM'ler için makine-okunur künye */}
        <script
          type="application/ld+json"
          // İçerik sabit ve bizim ürettiğimiz JSON; kullanıcı girdisi içermez.
          dangerouslySetInnerHTML={{
            __html: JSON.stringify([organizationSchema(), webSiteSchema()]),
          }}
        />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
