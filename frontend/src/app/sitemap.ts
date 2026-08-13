import type { MetadataRoute } from "next";
import { SITE } from "@/lib/seo";

export const dynamic = "force-static";

/**
 * Yalnız kamuya açık sayfalar. Uygulama ve oturum ekranları robots.txt'te kapalı.
 * Landing iki dilde yayınlanıyor; hreflang alternatifleri her girişte bildirilir.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  const languages = { tr: SITE.url, en: `${SITE.url}/en` };

  return [
    { url: SITE.url, lastModified, changeFrequency: "weekly", priority: 1, alternates: { languages } },
    { url: `${SITE.url}/en`, lastModified, changeFrequency: "weekly", priority: 1, alternates: { languages } },
    { url: `${SITE.url}/api-docs`, lastModified, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE.url}/privacy`, lastModified, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE.url}/terms`, lastModified, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE.url}/refund`, lastModified, changeFrequency: "yearly", priority: 0.3 },
  ];
}
