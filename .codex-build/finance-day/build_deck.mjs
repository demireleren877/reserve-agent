import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const workspaceDir = "/Users/erendemirel/projects/reserve-agent";
const buildDir = path.join(workspaceDir, ".codex-build/finance-day");
const assetDir = path.join(buildDir, "assets");
const outputPath = path.join(workspaceDir, "deliverables/finance-day/Finance_Day_Aktueryada_AI_Actuarius_v2.pptx");
const SKILL_DIR = "/Users/erendemirel/.codex/plugins/cache/openai-primary-runtime/presentations/26.905.11957/skills/presentations";
const RUNTIME_PYTHON = "/Users/erendemirel/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";
const { finalizePresentation } = await import(pathToFileURL(path.join(SKILL_DIR, "container_tools/artifact_tool_utils.mjs")).href);

const W = 1280;
const H = 720;
const FONT = "Avenir Next";
const C = {
  navy: "#0A1020",
  navy2: "#121A2E",
  ink: "#151B2B",
  paper: "#F4F0E8",
  white: "#FFFFFF",
  blue: "#5AA7FF",
  cyan: "#63D8F3",
  copper: "#D78962",
  green: "#5CC6A4",
  text: "#EAF0F8",
  muted: "#AAB5C7",
  line: "#2A3550",
  darkMuted: "#5A6578",
};

const p = Presentation.create({ slideSize: { width: W, height: H } });

function rect(slide, x, y, w, h, fill, radius = 0, line = "none") {
  return slide.shapes.add({
    geometry: radius ? "roundRect" : "rect",
    position: { left: x, top: y, width: w, height: h },
    fill,
    line: line === "none" ? { fill: "none", width: 0 } : { style: "solid", fill: line, width: 1 },
    ...(radius ? { borderRadius: radius } : {}),
  });
}

function text(slide, value, x, y, w, h, size, color = C.text, opts = {}) {
  const s = slide.shapes.add({
    geometry: "textbox",
    position: { left: x, top: y, width: w, height: h },
    fill: "none",
    line: { fill: "none", width: 0 },
  });
  s.text = value;
  s.text.style = {
    typeface: FONT,
    fontSize: size,
    color,
    bold: opts.bold ?? false,
    alignment: opts.align ?? "left",
    verticalAlignment: opts.valign ?? "top",
    autoFit: "shrinkText",
    wrap: "square",
    lineSpacing: opts.lineSpacing ?? 1.0,
    insets: opts.insets ?? { left: 0, right: 0, top: 0, bottom: 0 },
  };
  return s;
}

function rich(slide, runs, x, y, w, h, size, opts = {}) {
  const s = text(slide, "", x, y, w, h, size, opts.color ?? C.text, opts);
  s.text.set([runs.map(([run, style = {}]) => ({
    run,
    textStyle: { typeface: FONT, fontSize: `${size}px`, ...style },
  }))]);
  return s;
}

function title(slide, value, dark = true) {
  text(slide, value, 72, 54, 1136, 70, 38, dark ? C.text : C.ink, { bold: true, valign: "middle" });
}

function footer(slide, n, dark = true) {
  text(slide, "Finance Day 2026", 72, 674, 300, 20, 12, dark ? C.muted : C.darkMuted);
  text(slide, String(n).padStart(2, "0"), 1160, 672, 48, 20, 12, dark ? C.muted : C.darkMuted, { align: "right" });
}

async function addImage(slide, filename, position, alt, fit = "cover", radius = 18) {
  const blob = new Uint8Array(await fs.readFile(path.join(assetDir, filename)));
  return slide.images.add({ blob, contentType: "image/png", alt, fit, position, geometry: "roundRect", borderRadius: radius });
}

function notes(slide, lines) {
  slide.speakerNotes.textFrame.setText(lines);
}

// 1. Cover
{
  const s = p.slides.add();
  s.background.fill = C.navy;
  rect(s, 72, 68, 54, 8, C.copper, 4);
  text(s, "FINANCE DAY 2026", 72, 102, 360, 28, 15, C.cyan, { bold: true });
  rich(s, [
    ["Aktüeryada ", { color: C.text, bold: true }],
    ["yapay zekâ", { color: C.copper, bold: true }],
  ], 72, 188, 1040, 86, 56, { bold: true });
  text(s, "Kontrollü bir finans alanında somut kullanım", 72, 286, 820, 52, 28, C.muted);
  text(s, "Actuarius Enterprise", 72, 566, 520, 42, 24, C.text, { bold: true });
  text(s, "Ürün yaklaşımı, güvenlik çerçevesi ve pilot önerisi", 72, 615, 680, 28, 17, C.muted);
  rect(s, 1030, 120, 178, 420, C.navy2, 28, C.line);
  text(s, "AI", 1050, 190, 138, 88, 66, C.cyan, { bold: true, align: "center", valign: "middle" });
  rect(s, 1075, 312, 88, 4, C.copper, 2);
  text(s, "KONTROL\nALTINDA", 1052, 355, 134, 80, 18, C.text, { bold: true, align: "center", valign: "middle", lineSpacing: 1.15 });
  notes(s, [
    "Bu sunumun amacı yalnızca bir ürün göstermek değil. Finansın hata toleransı düşük alanlarından birinde yapay zekâyı nasıl kontrollü kullanabileceğimizi anlatmak.",
    "Actuarius, bu yaklaşımı aktüeryal rezerv süreci üzerinde somutlaştırıyor.",
  ]);
}

// 2. Why actuarial AI is different
{
  const s = p.slides.add();
  s.background.fill = C.paper;
  title(s, "Aktüeryada AI neden farklı", false);
  text(s, "Rezerv sonucu finansal tablolara girer. Bu nedenle hız kadar izlenebilirlik ve tekrar üretilebilirlik de gerekir.", 72, 142, 760, 98, 30, C.ink, { bold: true, lineSpacing: 1.08 });
  const items = [
    ["Hata maliyeti", "Yanlış bir sayı kararları ve raporlamayı etkiler."],
    ["Açıklanabilirlik", "Sonucun hangi veri ve varsayımla oluştuğu görünmelidir."],
    ["Veri sınırı", "Hasar ve poliçe verisi kurum politikasına uygun kalmalıdır."],
    ["Uzman onayı", "Nihai kararın sahibi aktüerdir."],
  ];
  items.forEach((it, i) => {
    const y = 290 + i * 78;
    text(s, String(i + 1).padStart(2, "0"), 72, y, 45, 32, 15, C.copper, { bold: true });
    text(s, it[0], 135, y - 2, 250, 34, 23, C.ink, { bold: true });
    text(s, it[1], 395, y, 760, 38, 18, C.darkMuted);
    if (i < 3) rect(s, 135, y + 53, 1020, 1, "#D7D1C6");
  });
  footer(s, 2, false);
  notes(s, [
    "Aktüerya, üretken yapay zekânın sınırsız hareket edebileceği bir alan değil.",
    "Bu kısıt bir engel değil. Doğru mimariyi tarif ediyor: hesap, veri sınırı, kayıt ve insan onayı ayrı ayrı korunmalı.",
  ]);
}

// 3. Operating principle diagram
{
  const s = p.slides.add();
  s.background.fill = C.navy;
  title(s, "Çalışma prensibi");
  text(s, "Hesabı deterministik motor üretir. AI bağlamı toplar ve açıklamayı hızlandırır. Aktüer onaylar.", 72, 125, 1040, 58, 26, C.muted);

  const boxes = [
    { x: 72, label: "AI KATMANI", body: "Soruyu anlar\nDoğru analizi seçer\nTaslak açıklama üretir", color: C.cyan },
    { x: 454, label: "HESAP MOTORU", body: "Versiyonlu yöntemler\nAynı girdiye aynı sonuç\nKontrol testleri", color: C.blue },
    { x: 836, label: "AKTÜER", body: "Varsayımı değerlendirir\nİstisnayı inceler\nNihai sonucu onaylar", color: C.copper },
  ];
  const shapes = boxes.map((b) => {
    const box = rect(s, b.x, 245, 308, 260, C.navy2, 22, C.line);
    rect(s, b.x, 245, 308, 7, b.color, 3);
    text(s, b.label, b.x + 28, 285, 252, 26, 15, b.color, { bold: true });
    text(s, b.body, b.x + 28, 340, 252, 120, 24, C.text, { lineSpacing: 1.25 });
    return box;
  });
  s.shapes.connect(shapes[0], shapes[1], { kind: "straight", fromSide: "right", toSide: "left", line: { style: "solid", fill: C.muted, width: 2 }, tail: { type: "triangle", width: "sm", length: "sm" } });
  s.shapes.connect(shapes[1], shapes[2], { kind: "straight", fromSide: "right", toSide: "left", line: { style: "solid", fill: C.muted, width: 2 }, tail: { type: "triangle", width: "sm", length: "sm" } });
  text(s, "Kontrol noktası: AI hiçbir aşamada kayıtsız ve doğrulanmamış bir rezerv sonucu üretmez.", 145, 565, 990, 50, 22, C.text, { bold: true, align: "center" });
  footer(s, 3, true);
  notes(s, [
    "Bizim yaklaşımımızda AI hesap motorunun yerine geçmiyor.",
    "AI, aktüerin doğal dildeki sorusunu ilgili kontrole ve hesap fonksiyonuna bağlıyor. Sayıyı versiyonlu motor döndürüyor. Aktüer bağlamı ve varsayımı değerlendirerek onaylıyor.",
  ]);
}

// 4. Data workflow
{
  const s = p.slides.add();
  s.background.fill = C.paper;
  title(s, "Veri hazırlığı tek bir kapanış bağlamında", false);
  text(s, "Dosya yükleme, kolon eşleme ve dönem bağlamı aynı çalışma alanında tutulur.", 72, 122, 760, 48, 24, C.darkMuted);
  await addImage(s, "data-map.png", { left: 520, top: 180, width: 688, height: 430 }, "Actuarius Enterprise veri kolon eşleme ekranı");
  const steps = [
    ["01", "Veriyi tanı", "Dosya yapısını ve alanları kontrol et"],
    ["02", "Döneme bağla", "Aynı kapanış bağlamını koru"],
    ["03", "Analize hazırla", "Eksik veya uyumsuz alanları görünür kıl"],
  ];
  steps.forEach((it, i) => {
    const y = 218 + i * 116;
    text(s, it[0], 72, y, 45, 30, 14, C.copper, { bold: true });
    text(s, it[1], 130, y - 3, 310, 34, 24, C.ink, { bold: true });
    text(s, it[2], 130, y + 39, 310, 48, 17, C.darkMuted);
  });
  text(s, "AI fırsatı", 72, 574, 110, 25, 14, C.blue, { bold: true });
  text(s, "Kolon önerisi, kalite kontrol özeti ve anomali açıklaması", 190, 570, 285, 48, 17, C.ink, { bold: true });
  footer(s, 4, false);
  notes(s, [
    "İlk değer noktası veri hazırlığı. Aktüer bugün önemli zamanını dosya yapısını anlamaya ve hatayı aramaya ayırıyor.",
    "AI burada karar vermek yerine kolon eşleme önerisi, kalite özeti ve anomali açıklaması sağlayabilir. Kullanıcı her eşlemeyi görür ve onaylar.",
  ]);
}

// 5. Reserving workflow
{
  const s = p.slides.add();
  s.background.fill = C.navy;
  title(s, "Rezerv modeli insan kontrolünde ilerler");
  text(s, "Model adımları görünür kalır. Seçim ve dışlama kararları aktüerin çalışma kaydına dönüşür.", 72, 120, 1050, 48, 24, C.muted);
  await addImage(s, "ldf.png", { left: 72, top: 188, width: 900, height: 450 }, "Actuarius Enterprise LDF seçim ekranı");
  rect(s, 1000, 210, 208, 390, C.navy2, 20, C.line);
  text(s, "AI’nın rolü", 1026, 245, 160, 30, 18, C.cyan, { bold: true });
  text(s, "Seçilen faktörü açıklamak\n\nDönemler arası farkı araştırmak\n\nKontrol soruları önermek", 1026, 306, 160, 210, 20, C.text, { lineSpacing: 1.2 });
  text(s, "Seçim yetkisi aktüerde kalır", 1026, 540, 160, 40, 16, C.copper, { bold: true });
  footer(s, 5, true);
  notes(s, [
    "Model ekranında her adım görünür. Aktüer hangi gelişim faktörünü kullandığını ve hangi hücreyi dışladığını açık biçimde görür.",
    "AI’nın katkısı, seçimi aktüer adına yapmak değil. Seçimi açıklamak, dönem farklarını araştırmak ve kontrol sorularını hızlandırmak.",
  ]);
}

// 6. AI use cases
{
  const s = p.slides.add();
  s.background.fill = C.paper;
  title(s, "AI kullanım alanları", false);
  await addImage(s, "ultimate.png", { left: 650, top: 150, width: 558, height: 349 }, "Actuarius Enterprise Ultimate ve IBNR ekranı");
  const items = [
    ["Doğal dilde analiz", "Aktüer sorusunu ilgili veri ve modele bağlama"],
    ["Kontrol ve karşılaştırma", "Dönem, branş ve yöntem farklarını inceleme"],
    ["Açıklama taslağı", "Sonucun dayanaklarını rapor diline dönüştürme"],
    ["İş akışı desteği", "Eksik adımı ve bekleyen kontrolü hatırlatma"],
  ];
  items.forEach((it, i) => {
    const y = 162 + i * 103;
    rect(s, 72, y + 4, 8, 62, i < 2 ? C.blue : C.copper, 4);
    text(s, it[0], 105, y, 470, 30, 23, C.ink, { bold: true });
    text(s, it[1], 105, y + 40, 470, 45, 17, C.darkMuted);
  });
  rect(s, 650, 535, 558, 74, "#E5DFD4", 16);
  text(s, "Temel kural", 674, 553, 110, 22, 14, C.copper, { bold: true });
  text(s, "AI, doğrulanmış fonksiyonları çağırır ve sonucu kaynak bağlamıyla sunar.", 790, 548, 390, 43, 18, C.ink, { bold: true });
  footer(s, 6, false);
  notes(s, [
    "Dört kullanım alanı öncelikli. İlki doğal dilde analiz, ikincisi kontroller, üçüncüsü açıklama taslağı, dördüncüsü süreç desteği.",
    "Bu yeteneklerin ortak kuralı aynı: AI serbestçe sayı uydurmaz. Doğrulanmış fonksiyonları çağırır ve dönen sonucu kaynak bağlamıyla sunar.",
  ]);
}

// 7. Executive question scenario
{
  const s = p.slides.add();
  s.background.fill = C.navy;
  title(s, "Örnek yönetici sorusu");
  text(s, "“2025Q4 Motor IBNR neden değişti?”", 72, 132, 1000, 55, 34, C.copper, { bold: true });
  const steps = [
    ["1", "Bağlam", "Dönem ve branşı belirler"],
    ["2", "Kontrol", "Veri, LDF ve varsayımı karşılaştırır"],
    ["3", "Hesap", "Motor doğrulanmış sonuçları döndürür"],
    ["4", "Açıklama", "Etki kaynaklarını taslak metne çevirir"],
  ];
  const bs = [];
  steps.forEach((it, i) => {
    const x = 72 + i * 294;
    const b = rect(s, x, 250, 250, 230, C.navy2, 20, C.line);
    bs.push(b);
    text(s, it[0], x + 24, 270, 40, 40, 28, i === 3 ? C.copper : C.cyan, { bold: true });
    text(s, it[1], x + 24, 328, 200, 34, 23, C.text, { bold: true });
    text(s, it[2], x + 24, 382, 200, 66, 17, C.muted, { lineSpacing: 1.15 });
  });
  for (let i = 0; i < bs.length - 1; i++) {
    s.shapes.connect(bs[i], bs[i + 1], { kind: "straight", fromSide: "right", toSide: "left", line: { style: "solid", fill: C.muted, width: 2 }, tail: { type: "triangle", width: "sm", length: "sm" } });
  }
  text(s, "Çıktı: yöneticiye kısa yanıt, aktüere inceleme izi", 300, 554, 680, 48, 24, C.text, { bold: true, align: "center" });
  footer(s, 7, true);
  notes(s, [
    "Bu soru bugün birden fazla dosya ve ekran arasında araştırma gerektirebilir.",
    "Agent önce bağlamı belirler, sonra ilgili kontrollere gider. Hesap motoru sonuçları verir. Agent bunları kısa bir açıklamaya çevirir. Aktüer ayrıntılı inceleme izini korur.",
  ]);
}

// 8. Control model
{
  const s = p.slides.add();
  s.background.fill = C.paper;
  title(s, "Kurumsal kontrol modeli", false);
  text(s, "Temel ürün çalışıyor. Yönetim katmanını kontrollü pilot sırasında tamamlamayı planlıyoruz.", 72, 122, 1060, 48, 24, C.darkMuted);
  text(s, "MEVCUT TEMEL", 72, 202, 350, 26, 14, C.blue, { bold: true });
  text(s, "HEDEF KONTROLLER", 690, 202, 400, 26, 14, C.copper, { bold: true });
  const left = ["Yerel masaüstü uygulaması", "Şirket ağı içindeki Oracle", "Deterministik hesap motoru", "Kullanıcı ve işlem kaydı altyapısı"];
  const right = ["Parolalar için kurumsal kasa", "Modül ve veri bazlı yetki", "Değiştirilemez kapanış kaydı", "Kurum içi ve bulut AI politikası"];
  left.forEach((v, i) => {
    text(s, String(i + 1).padStart(2, "0"), 72, 262 + i * 76, 42, 28, 14, C.blue, { bold: true });
    text(s, v, 132, 257 + i * 76, 430, 36, 22, C.ink, { bold: true });
  });
  right.forEach((v, i) => {
    text(s, String(i + 1).padStart(2, "0"), 690, 262 + i * 76, 42, 28, 14, C.copper, { bold: true });
    text(s, v, 750, 257 + i * 76, 450, 36, 22, C.ink, { bold: true });
  });
  rect(s, 622, 228, 1, 340, "#D2CCC0");
  text(s, "İlke", 72, 594, 55, 22, 14, C.copper, { bold: true });
  text(s, "AI erişimi kurum politikası, kayıt ve insan onayı ile sınırlandırılır.", 140, 588, 800, 36, 20, C.ink, { bold: true });
  footer(s, 8, false);
  notes(s, [
    "Bu slaytta mevcut durum ile hedef kontrol katmanını açıkça ayırıyoruz.",
    "Yerel çalışma, Oracle bağlantısı ve deterministik motor elimizde. Kurumsal parola kasası, ayrıntılı yetki, değiştirilemez kapanış ve AI sağlayıcı politikası pilotun kontrol kapsamını oluşturmalı.",
  ]);
}

// 9. Pilot metrics
{
  const s = p.slides.add();
  s.background.fill = C.navy;
  title(s, "Pilot başarısını ölçme biçimi");
  text(s, "Etki iddiasını kullanım verisiyle doğrulayacağız. Başlangıç değerini pilot öncesinde ölçüp aynı kapanış akışıyla karşılaştıracağız.", 72, 122, 1080, 72, 25, C.muted);
  const metrics = [
    ["Kapanış süresi", "Veri alımından onaylı sonuca kadar geçen süre"],
    ["Analiz süresi", "Fark ve anomali araştırmasına ayrılan uzman zamanı"],
    ["Yeniden çalışma", "Hata veya eksik bağlam nedeniyle tekrarlanan adımlar"],
    ["Denetim kapsamı", "Kaynağı ve onayı kayıtlı kritik işlemlerin oranı"],
  ];
  metrics.forEach((m, i) => {
    const y = 238 + i * 82;
    text(s, `${i + 1}`, 72, y, 45, 34, 25, i === 3 ? C.copper : C.cyan, { bold: true });
    text(s, m[0], 142, y - 2, 310, 34, 23, C.text, { bold: true });
    text(s, m[1], 470, y, 700, 42, 18, C.muted);
    if (i < 3) rect(s, 142, y + 55, 1020, 1, C.line);
  });
  text(s, "Hedef yüzdeler pilot başlangıcında gerçek baz değerlerle belirlenecek.", 72, 605, 900, 32, 18, C.copper, { bold: true });
  footer(s, 9, true);
  notes(s, [
    "Sunumda doğrulanmamış verimlilik oranları kullanmıyoruz.",
    "Pilot öncesinde mevcut kapanış süresini, analiz zamanını ve yeniden çalışmayı ölçeceğiz. Aynı akışın Actuarius ile yürütülen kapanışını karşılaştıracağız.",
  ]);
}

// 10. Roadmap
{
  const s = p.slides.add();
  s.background.fill = C.paper;
  title(s, "90 günlük kontrollü pilot", false);
  text(s, "Tek branş ve tek kapanış dönemi ile başlayıp kontrol kapsamını aşamalı genişletme önerisi", 72, 122, 1060, 48, 24, C.darkMuted);
  const phases = [
    { x: 72, n: "0–30", head: "Hazırlık", color: C.blue, body: "Baz metrikler\nVeri kapsamı\nKullanıcı ve yetki matrisi\nAI kullanım politikası" },
    { x: 454, n: "31–60", head: "Paralel çalışma", color: C.cyan, body: "Mevcut süreçle yan yana çalışma\nSonuç mutabakatı\nKullanıcı geri bildirimi\nKontrol kayıtları" },
    { x: 836, n: "61–90", head: "Değerlendirme", color: C.copper, body: "Başarı metrikleri\nRisk ve kontrol bulguları\nÖlçekleme kararı\nSonraki branş planı" },
  ];
  const ps = phases.map((ph) => {
    const box = rect(s, ph.x, 224, 308, 310, C.white, 22, "#D5CEC2");
    rect(s, ph.x, 224, 308, 8, ph.color, 4);
    text(s, `GÜN ${ph.n}`, ph.x + 26, 262, 160, 26, 14, ph.color, { bold: true });
    text(s, ph.head, ph.x + 26, 307, 250, 40, 26, C.ink, { bold: true });
    text(s, ph.body, ph.x + 26, 370, 250, 125, 19, C.darkMuted, { lineSpacing: 1.26 });
    return box;
  });
  s.shapes.connect(ps[0], ps[1], { kind: "straight", fromSide: "right", toSide: "left", line: { style: "solid", fill: C.darkMuted, width: 2 }, tail: { type: "triangle", width: "sm", length: "sm" } });
  s.shapes.connect(ps[1], ps[2], { kind: "straight", fromSide: "right", toSide: "left", line: { style: "solid", fill: C.darkMuted, width: 2 }, tail: { type: "triangle", width: "sm", length: "sm" } });
  text(s, "Pilot sonunda ölçekleme kararı ölçülen fayda ve kontrol sonuçlarına dayanır.", 168, 586, 944, 40, 21, C.ink, { bold: true, align: "center" });
  footer(s, 10, false);
  notes(s, [
    "Öneri, tek branş ve bir kapanış dönemiyle başlamaktır.",
    "İlk ay veri ve kontrol kapsamını hazırlarız. İkinci ay mevcut süreçle yan yana çalışırız. Son ay ölçümleri, riskleri ve ölçekleme kararını yönetime sunarız.",
  ]);
}

// 11. Decision request
{
  const s = p.slides.add();
  s.background.fill = C.navy;
  text(s, "ÖNERİ", 72, 72, 180, 26, 15, C.cyan, { bold: true });
  text(s, "Bir branşta 90 günlük\nkontrollü pilot", 72, 132, 900, 130, 50, C.text, { bold: true, lineSpacing: 1.02 });
  const asks = [
    ["Yönetici sponsoru", "Kapsam ve karar noktalarının sahipliği"],
    ["Aktüerya ile IT temsilcisi", "Veri, güvenlik ve çalışma düzeninin kurulması"],
    ["Ortak başarı ölçütleri", "Pilot öncesi baz değer ve kapanış sonrası karşılaştırma"],
  ];
  asks.forEach((a, i) => {
    const x = 72 + i * 382;
    rect(s, x, 356, 336, 170, C.navy2, 18, C.line);
    text(s, String(i + 1).padStart(2, "0"), x + 24, 380, 42, 26, 14, i === 2 ? C.copper : C.cyan, { bold: true });
    text(s, a[0], x + 24, 422, 286, 34, 22, C.text, { bold: true });
    text(s, a[1], x + 24, 466, 286, 46, 16, C.muted);
  });
  text(s, "Actuarius Enterprise", 72, 616, 360, 30, 20, C.copper, { bold: true });
  text(s, "Sorular ve değerlendirmeler", 800, 616, 408, 30, 18, C.muted, { align: "right" });
  footer(s, 11, true);
  notes(s, [
    "Yönetimden talebimiz geniş ölçekli bir teknoloji yatırımı kararı değil.",
    "Tek branşta, ölçülebilir ve kontrollü bir pilot için sponsor, aktüerya ve IT temsilcisi ile ortak başarı kriterleri istiyoruz.",
    "Pilot sonunda faydayı ve kontrol sonuçlarını birlikte değerlendirebiliriz.",
  ]);
}

await fs.mkdir(path.dirname(outputPath), { recursive: true });
const requirements = {
  explicitTotalSlideCount: 11,
  requiredNativeTableOwnerSlides: [],
  requiredNativeChartOwnerSlides: [],
};
const expectedSlideSizeEmu = "12192000,6858000";
const candidatePath = path.join(workspaceDir, ".codex-finalizer/finance-day-candidate-v2.pptx");
await (await PresentationFile.exportPptx(p)).save(candidatePath);
const result = await finalizePresentation({
  ...requirements,
  workspaceDir,
  candidatePath,
  finalPath: outputPath,
  pythonExecutable: RUNTIME_PYTHON,
  integrityValidatorPath: path.join(SKILL_DIR, "container_tools/inspect_presentation_package_integrity.py"),
  layoutValidatorPath: path.join(SKILL_DIR, "container_tools/inspect_presentation_layout_geometry.py"),
  layoutArgs: ["--expected-slide-size-emu", expectedSlideSizeEmu, "--validate-bullet-geometry", "--validate-heading-fit"],
  requiredNativeTableOwnerSlides: [],
  fontPolicy: { basis: "design", families: [FONT] },
  verifyArtifactToolImport: true,
  receiptPath: path.join(workspaceDir, ".codex-finalizer/Finance_Day_Aktueryada_AI_Actuarius_v2.validation.json"),
});
console.log(JSON.stringify({ outputPath, result }, null, 2));
