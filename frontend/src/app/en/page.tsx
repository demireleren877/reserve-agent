import type { Metadata } from "next";
import { LandingPage } from "@/components/LandingPage";
import { EN } from "@/lib/content/landing";

const description =
  "Actuarius is an end-to-end actuarial analysis platform for insurers and actuaries. " +
  "IBNR reserving with Chain-Ladder and Bornhuetter-Ferguson, cash flow projection and " +
  "IFRS 17 discounting in one system — with an AI agent that operates every module.";

export const metadata: Metadata = {
  title: { absolute: "Actuarius — Actuarial Reserving and IBNR Platform with an AI Agent" },
  description,
  alternates: {
    canonical: "/en",
    languages: { "tr-TR": "/", "en": "/en", "x-default": "/" },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    alternateLocale: "tr_TR",
    url: "/en",
    title: { absolute: "Actuarius — Actuarial Reserving and IBNR Platform with an AI Agent" },
    description,
  },
  twitter: {
    card: "summary_large_image",
    title: { absolute: "Actuarius — Actuarial Reserving and IBNR Platform with an AI Agent" },
    description,
  },
  keywords: [
    "actuarial software", "loss reserving software", "IBNR calculation",
    "chain ladder software", "Bornhuetter-Ferguson", "reserving platform",
    "AI agent actuarial", "agentic actuarial modelling", "IFRS 17 discounting",
    "claims development triangle", "actuarial reserving AI",
  ],
};

export default function Page() {
  return <LandingPage c={EN} />;
}
