import type { Metadata } from "next";

// Oturum akışı sayfaları: ince içerik, arama sonuçlarında yeri yok.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
