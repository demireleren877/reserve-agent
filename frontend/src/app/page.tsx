import type { Metadata } from "next";
import { LandingPage } from "@/components/LandingPage";
import { TR } from "@/lib/content/landing";

export const metadata: Metadata = {
  alternates: {
    canonical: "/",
    languages: { "tr-TR": "/", "en": "/en", "x-default": "/" },
  },
};

export default function Page() {
  return <LandingPage c={TR} />;
}
