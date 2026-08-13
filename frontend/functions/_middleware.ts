/**
 * Ajanlar için markdown içerik pazarlığı (content negotiation).
 *
 * `Accept: text/markdown` gönderen istemcilere sayfanın markdown karşılığı
 * döner; tarayıcılar (Accept: text/html) her zamanki HTML'i alır. Markdown
 * dosyaları derleme sırasında üretilir (scripts/generate-markdown.mjs).
 *
 * Cloudflare'in yerleşik "Markdown for Agents" özelliği Pro ve üzeri planlarda
 * olduğu için pazarlık burada uygulama katmanında yapılıyor.
 */

/** İstemci gerçekten markdown mu istiyor? text/html daha yüksek q ile geldiyse hayır. */
function prefersMarkdown(accept: string): boolean {
  if (!accept) return false;

  const q = (type: string): number | null => {
    // "text/markdown;q=0.9" → 0.9 · "text/markdown" → 1
    const re = new RegExp(`(?:^|,)\\s*${type.replace("/", "\\/")}\\s*(;[^,]*)?`, "i");
    const m = accept.match(re);
    if (!m) return null;
    const qm = m[1]?.match(/q=([0-9.]+)/i);
    return qm ? parseFloat(qm[1]) : 1;
  };

  const md = q("text/markdown");
  if (md === null || md === 0) return false;
  const html = q("text/html") ?? q("\\*/\\*");
  return html === null || md >= html;
}

export const onRequest: PagesFunction = async (context) => {
  const { request, next } = context;

  if (request.method !== "GET" && request.method !== "HEAD") return next();
  if (!prefersMarkdown(request.headers.get("Accept") ?? "")) return next();

  const url = new URL(request.url);
  // Dosya uzantılı yollar sayfa değil (görsel, .txt, .xml…) — dokunma.
  if (/\.[a-z0-9]+$/i.test(url.pathname)) return next();
  // Statik export trailingSlash kullanıyor: /privacy/ → /privacy/index.md
  const path = url.pathname.endsWith("/")
    ? `${url.pathname}index.md`
    : `${url.pathname}/index.md`;

  const mdRequest = new Request(new URL(path, url.origin).toString(), {
    method: "GET",
    headers: { Accept: "text/plain" },
  });

  const res = await next(mdRequest);
  // Markdown yoksa (ör. oturum gerektiren ekran) sessizce HTML'e düş.
  // next() parametresiz çağrılırsa değiştirilmiş istek bağlamı kalır; orijinali ver.
  if (!res.ok) return next(request);

  const body = await res.text();
  const headers = new Headers({
    "Content-Type": "text/markdown; charset=utf-8",
    // Aynı URL iki farklı gövde döndürüyor — ara katmanlar ayrı önbelleklesin.
    Vary: "Accept",
    "Cache-Control": "public, max-age=300",
    // Yaklaşık token sayısı (~4 karakter/token) — ajanlar bütçe planlar.
    "x-markdown-tokens": String(Math.ceil(body.length / 4)),
  });

  return new Response(request.method === "HEAD" ? null : body, { status: 200, headers });
};
