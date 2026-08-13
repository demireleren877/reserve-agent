/**
 * Build sonrası: her statik sayfanın markdown karşılığını üretir.
 *
 * Neden derleme anında? Ajanlara sunulan markdown'ın sayfayla birebir aynı
 * içerikten gelmesini istiyoruz. Kaynak olarak üretilmiş HTML'i kullanmak,
 * içeriği ikinci bir yerde tekrar yazmaya (ve zamanla ayrışmasına) gerek
 * bırakmaz — yeni sayfa eklendiğinde otomatik kapsanır.
 *
 * Çıktı: out/<yol>/index.html  →  out/<yol>/index.md
 * Sunum: functions/_middleware.ts, Accept: text/markdown gelince bunu döndürür.
 */

import { createHash } from "node:crypto";
import { copyFile, readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import TurndownService from "turndown";

const OUT = "out";
const ORIGIN = "https://actuarius.com.tr";

/** robots.txt'te kapalı olan rotalar: ince/auth'lu içerik, markdown da üretilmez. */
const PRIVATE = ["reserve", "cashflow", "discount", "data", "home", "login", "onboarding", "_not-found"];

const td = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
  emDelimiter: "_",
});

// Sayfanın kendisi olmayan kabuk öğeleri markdown'a girmesin.
td.remove(["script", "style", "noscript", "svg", "form", "button"]);

// Ekran görüntüleri: alt metni koru, dosya yolunu değil.
td.addRule("image", {
  filter: "img",
  replacement: (_content, node) => {
    const alt = node.getAttribute("alt") ?? "";
    const src = node.getAttribute("src") ?? "";
    if (!alt && !src) return "";
    const abs = src.startsWith("/") ? `https://actuarius.com.tr${src}` : src;
    return `![${alt}](${abs})`;
  },
});

// <details><summary>Soru</summary><p>Cevap</p></details> → başlık + paragraf
td.addRule("details", {
  filter: (node) => node.nodeName === "DETAILS",
  replacement: (_content, node) => {
    const summary = node.querySelector("summary")?.textContent?.trim() ?? "";
    const rest = Array.from(node.childNodes)
      .filter((n) => n.nodeName !== "SUMMARY")
      .map((n) => n.textContent?.trim() ?? "")
      .filter(Boolean)
      .join("\n\n");
    return `\n\n### ${summary}\n\n${rest}\n\n`;
  },
});

/** out/ altındaki tüm index.html dosyalarını bul. */
async function findPages(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "_next") continue; // derleme varlıkları
      out.push(...(await findPages(p)));
    } else if (e.name === "index.html") {
      out.push(p);
    }
  }
  return out;
}

/** <body> içindeki gezinme/altbilgi kabuğunu atıp asıl içeriği bırak. */
function extractContent(html) {
  const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? html;
  return body
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "");
}

function frontMatter(html, url, lang) {
  const title = html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? "";
  const desc = html.match(/<meta name="description" content="([^"]*)"/i)?.[1] ?? "";
  return [
    "---",
    `title: ${JSON.stringify(title)}`,
    desc ? `description: ${JSON.stringify(desc)}` : null,
    `url: ${JSON.stringify(url)}`,
    `language: ${JSON.stringify(lang)}`,
    "---",
    "",
    "",
  ].filter((l) => l !== null).join("\n");
}

const pages = await findPages(OUT);
let written = 0;

for (const file of pages) {
  const html = await readFile(file, "utf8");
  // out/privacy/index.html → /privacy/   ·   out/index.html → /
  const rel = relative(OUT, file).replace(/index\.html$/, "");
  if (PRIVATE.some((seg) => rel === `${seg}/` || rel.startsWith(`${seg}/`))) continue;
  const url = "https://actuarius.com.tr/" + rel;
  // Kök layout her sayfaya lang="tr" basıyor; gerçek dil yoldan gelir.
  const lang = rel.startsWith("en/") ? "en" : "tr";

  let md = td.turndown(extractContent(html));
  md = md.replace(/\n{3,}/g, "\n\n").trim();
  if (!md) continue;

  await writeFile(file.replace(/index\.html$/, "index.md"), frontMatter(html, url, lang) + md + "\n", "utf8");
  written++;
}

/**
 * Agent Skills keşif dizini (Agent Skills Discovery RFC 0.2.0).
 *
 * Elle yazılmıyor çünkü her kayıt, dosyanın sha256 özetini taşıyor: SKILL.md'de
 * tek karakter değişse index.json yalan söylemeye başlar. Ad ve açıklama da
 * dosyanın kendi front matter'ından okunuyor — tek doğruluk kaynağı SKILL.md.
 */
const SKILLS_DIR = join(OUT, ".well-known", "agent-skills");

function frontMatterField(text, key) {
  const block = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
  const line = block.match(new RegExp(`^${key}:\\s*(.+)$`, "m"))?.[1]?.trim();
  return line ? line.replace(/^["']|["']$/g, "") : null;
}

const skills = [];
for (const e of await readdir(SKILLS_DIR, { withFileTypes: true })) {
  if (!e.isDirectory()) continue;
  const file = join(SKILLS_DIR, e.name, "SKILL.md");
  let body;
  try {
    body = await readFile(file, "utf8");
  } catch {
    continue; // SKILL.md'si olmayan klasör dizine girmez
  }
  const description = frontMatterField(body, "description");
  if (!description) throw new Error(`${file}: front matter'da description yok`);

  skills.push({
    name: frontMatterField(body, "name") ?? e.name,
    type: "skill-md",
    description,
    url: `${ORIGIN}/.well-known/agent-skills/${e.name}/SKILL.md`,
    digest: `sha256:${createHash("sha256").update(body).digest("hex")}`,
  });
}

skills.sort((a, b) => a.name.localeCompare(b.name));

await writeFile(
  join(SKILLS_DIR, "index.json"),
  JSON.stringify(
    { $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json", skills },
    null,
    2,
  ) + "\n",
  "utf8",
);

// Pages advanced mode worker'ı çıktının içine koy — Pages onu burada arar.
await copyFile("scripts/_worker.js", join(OUT, "_worker.js"));

console.log(
  `  markdown: ${written} sayfa üretildi · agent-skills: ${skills.length} beceri · _worker.js kopyalandı`,
);
