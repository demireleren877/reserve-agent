import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from "@/lib/auth/auth-context";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Actuarius — Aktüeryal Analiz Platformu",
  description:
    "Actuarius, sigorta şirketleri ve aktüerler için web tabanlı aktüeryal analiz platformudur. IBNR rezerv hesaplama (Chain-Ladder, Bornhuetter-Ferguson), nakit akışı projeksiyonu ve iskonto modülleri sunar. Türkiye'nin ilk bulut tabanlı aktüeryal rezerv aracı.",
  keywords: [
    "aktüerya",
    "aktüeryal analiz",
    "IBNR",
    "rezerv hesaplama",
    "Chain-Ladder",
    "Bornhuetter-Ferguson",
    "nakit akışı",
    "sigorta",
    "actuarius",
    "actuarial",
    "loss reserving",
  ],
  metadataBase: new URL("https://actuarius.com.tr"),
  openGraph: {
    title: "Actuarius — Aktüeryal Analiz Platformu",
    description:
      "Sigorta şirketleri için IBNR rezerv, nakit akışı ve iskonto hesaplama platformu.",
    url: "https://actuarius.com.tr",
    siteName: "Actuarius",
    locale: "tr_TR",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="tr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
