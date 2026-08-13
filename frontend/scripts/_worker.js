/**
 * Cloudflare Pages "advanced mode" worker.
 *
 * Neden functions/_middleware yerine bu?
 * Pages, functions/ dizinini proje kök ayarına göre arıyor; monorepo'da bu
 * ayar tutmadığında middleware sessizce devre dışı kalıyor (canlıda böyle
 * oldu — dosyalar deploy oldu ama pazarlık çalışmadı). _worker.js derleme
 * çıktısının (out/) içinde durduğu için her zaman bulunur.
 *
 * Sorumlulukları:
 *  1. Accept: text/markdown → sayfanın markdown karşılığı (derlemede üretildi)
 *  2. Keşif bağlantıları (RFC 8288) ve güvenlik başlıkları
 *
 * Advanced mode'da _headers dosyasının uygulanıp uygulanmadığı belgelenmemiş;
 * bu yüzden başlıkların tamamı burada, kodda veriliyor.
 */

const LINK_HEADER = [
  '</.well-known/api-catalog>; rel="api-catalog"',
  '</openapi.json>; rel="service-desc"; type="application/json"',
  '</api-docs/>; rel="service-doc"; type="text/html"',
  '</llms.txt>; rel="describedby"; type="text/plain"',
].join(", ");

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

/** İstemci gerçekten markdown mu istiyor? text/html daha yüksek q ile geldiyse hayır. */
function prefersMarkdown(accept) {
  if (!accept) return false;

  const q = (type) => {
    const re = new RegExp(`(?:^|,)\\s*${type}\\s*(;[^,]*)?`, "i");
    const m = accept.match(re);
    if (!m) return null;
    const qm = m[1] && m[1].match(/q=([0-9.]+)/i);
    return qm ? parseFloat(qm[1]) : 1;
  };

  const md = q("text\\/markdown");
  if (md === null || md === 0) return false;
  const html = q("text\\/html");
  const any = q("\\*\\/\\*");
  const rival = html !== null ? html : any;
  return rival === null || md >= rival;
}

function withCommonHeaders(res, extra) {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) out.headers.set(k, v);
  out.headers.set("Link", LINK_HEADER);
  if (extra) for (const [k, v] of Object.entries(extra)) out.headers.set(k, v);
  return out;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const isRead = request.method === "GET" || request.method === "HEAD";
    // Uzantılı yollar sayfa değil (görsel, .json, .txt…) — pazarlığa girmez.
    const isPage = !/\.[a-z0-9]+$/i.test(url.pathname);

    if (isRead && isPage && prefersMarkdown(request.headers.get("Accept") || "")) {
      const path = url.pathname.endsWith("/")
        ? `${url.pathname}index.md`
        : `${url.pathname}/index.md`;

      const md = await env.ASSETS.fetch(
        new Request(new URL(path, url.origin).toString(), {
          method: "GET",
          headers: { Accept: "text/plain" },
        }),
      );

      if (md.ok) {
        const body = await md.text();
        return new Response(request.method === "HEAD" ? null : body, {
          status: 200,
          headers: {
            "Content-Type": "text/markdown; charset=utf-8",
            // Aynı URL iki farklı gövde döndürüyor — ara katmanlar ayrı önbelleklesin.
            Vary: "Accept",
            "Cache-Control": "public, max-age=300",
            // Yaklaşık token sayısı (~4 karakter/token) — ajanlar bütçe planlar.
            "x-markdown-tokens": String(Math.ceil(body.length / 4)),
            Link: LINK_HEADER,
            ...SECURITY_HEADERS,
          },
        });
      }
      // Markdown yoksa sessizce normal yanıta düş.
    }

    const res = await env.ASSETS.fetch(request);

    // RFC 9727 kataloğu uzantısız bir dosya; medya tipini elle vermek gerekiyor.
    if (url.pathname === "/.well-known/api-catalog") {
      return withCommonHeaders(res, {
        "Content-Type": "application/linkset+json",
        "Cache-Control": "public, max-age=3600",
      });
    }

    return withCommonHeaders(res);
  },
};
