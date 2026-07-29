/**
 * Roll-forward yardımcıları — yeni diagonalin dosya (DOSYA_NO) kırılımını, üçgenin
 * her origin'i için doğru gelişim dönemi etiketine yerleştirir.
 *
 * FileData şekli: origin → gelişim dönemi etiketi → { dosya_no: tutar }.
 */

import { fileOs, filePaid, fileValueForBasis, type Triangle, type FileData, type FileLeaf } from "@/types/triangle";
import { periodOrder } from "@/lib/period-order";

// Python convention: quarterly seq = y*4+q (q ∈ 1..4). seq → "YYYYQq".
export function seqToQLabel(seq: number): string {
  const qRaw = seq % 4;
  const quarter = qRaw === 0 ? 4 : qRaw;
  const year = qRaw === 0 ? Math.floor(seq / 4) - 1 : Math.floor(seq / 4);
  return `${year}Q${quarter}`;
}

export function devDate(origin: string, step: number, tri: Triangle): string {
  const age = tri.development_periods[step];
  if (tri.origin_granularity === "yearly") {
    const oy = parseInt(origin, 10);
    if (tri.development_granularity === "quarterly") {
      return seqToQLabel(oy * 4 + age);
    }
    return String(oy + age);
  }
  const [yr, qt] = origin.split("Q");
  const oq = parseInt(yr, 10) * 4 + parseInt(qt || "1", 10) - 1;
  if (tri.development_granularity === "quarterly") {
    return seqToQLabel(oq + age);
  }
  return String(parseInt(yr, 10) + age);
}

export function lastDate(orig: string, tri: Triangle): string {
  const idx = tri.origin_periods.indexOf(orig);
  for (let s = tri.development_periods.length - 1; s >= 0; s--) {
    if (tri.values[idx]?.[s] != null) return devDate(orig, s, tri);
  }
  return "";
}

/**
 * Roll-forward yeni köşegeninin (= GÜNCEL DÖNEMİN) dosya kırılımını FileData'ya çevirir.
 * Backend yeni diagonalde ödeme akışını ARTIMSAL gönderir; FileData hücreleri ise
 * kümülatif snapshot'tır. Bu nedenle önceki hücrenin dosya bazlı ödemesini taşır,
 * yeni hareketi üzerine ekler; muallak güncel stok olarak doğrudan kullanılır.
 * Eski backend sayı (paid-only) dönerse o=0 kabul edilir.
 */
export function newDiagonalToFileData(
  triangle: Triangle,
  newDiagonalFiles: Record<string, Record<string, number | { p: number; o: number }>>,
  priorFileData?: FileData | null,
): FileData {
  const fd: FileData = {};
  for (const [origin, files] of Object.entries(newDiagonalFiles)) {
    if (!files || Object.keys(files).length === 0) continue;
    const d = lastDate(origin, triangle);
    if (!d) continue;
    const priorDates = Object.keys(priorFileData?.[origin] ?? {});
    const priorSnapshot = priorDates.length
      ? priorFileData?.[origin]?.[priorDates[priorDates.length - 1]] ?? {}
      : {};
    const cell: Record<string, { p: number; o: number }> = {};
    for (const dosya of new Set([...Object.keys(priorSnapshot), ...Object.keys(files)])) {
      const mv = files[dosya];
      const incPaid = typeof mv === "number" ? mv : mv?.p ?? 0;
      const currentOs = typeof mv === "number" ? 0 : mv?.o ?? 0;
      cell[dosya] = { p: filePaid(priorSnapshot[dosya]) + incPaid, o: currentOs };
    }
    fd[origin] = { [d]: cell };
  }
  return fd;
}

/**
 * İki FileData'yı birleştirir (origin → gelişim tarihi → {dosya: tutar}).
 * Roll-forward'da önceki dönemin TÜM köşegenleri + yeni köşegen birlikte kalsın diye.
 * Aynı origin+gelişim tarihi çakışırsa `next` kazanır (yeni köşegen güncel).
 */
export function mergeFileData(
  prior: FileData | null | undefined,
  next: FileData | null | undefined,
): FileData {
  const out: FileData = {};
  for (const src of [prior, next]) {
    if (!src) continue;
    for (const [origin, byDate] of Object.entries(src)) {
      out[origin] = out[origin] ?? {};
      for (const [date, files] of Object.entries(byDate)) {
        out[origin][date] = { ...files };
      }
    }
  }
  return out;
}

/**
 * Eski roll-forward kayıtlarında yeni diagonal `p` alanı yanlışlıkla kümülatif
 * snapshot yerine artımsal hareket olarak saklanmış olabilir. Her hücrede iki
 * adayı (ham snapshot / önceki paid + ham hareket) üçgen toplamıyla karşılaştırır
 * ve daha iyi mutabıklaşanı seçer. Doğrudan yüklenen doğru kümülatif veri değişmez.
 */
export function reconcileFileDataSnapshots(
  triangle: Triangle,
  fileData: FileData | null | undefined,
): FileData {
  if (!fileData) return {};
  const out: FileData = {};
  for (let i = 0; i < triangle.origin_periods.length; i++) {
    const origin = triangle.origin_periods[i];
    let previous: Record<string, FileLeaf> = {};
    out[origin] = {};
    for (let j = 0; j < triangle.development_periods.length; j++) {
      const triangleValue = triangle.values[i]?.[j];
      if (triangleValue == null) continue;
      const date = devDate(origin, j, triangle);
      const byDate = fileData[origin] ?? {};
      // Bazı eski quarterly importlarda FileData tarihleri development age'in
      // ürettiği etiketten bir çeyrek kaymış olabiliyor. Exact anahtar ile gözlem
      // sırasındaki anahtarı birlikte dene; üçgen hücresine en iyi mutabıklaşanı seç.
      const observableIndex = triangle.values[i].slice(0, j + 1).filter((value) => value != null).length - 1;
      const orderedDates = Object.keys(byDate).sort((a, b) => periodOrder(a) - periodOrder(b));
      const total = (snapshot: Record<string, FileLeaf>) => Object.values(snapshot).reduce<number>(
        (sum, leaf) => sum + fileValueForBasis(leaf, triangle.triangle_type),
        0,
      );
      const candidateDates = [...new Set([date, orderedDates[observableIndex]].filter(Boolean))];
      let selected: Record<string, FileLeaf> | null = null;
      let selectedError = Number.POSITIVE_INFINITY;
      for (const candidateDate of candidateDates) {
        const raw = byDate[candidateDate];
        if (!raw) continue;
        const normalizedRaw: Record<string, FileLeaf> = Object.fromEntries(
          Object.entries(raw).map(([file, leaf]) => [file, { p: filePaid(leaf), o: fileOs(leaf) }]),
        );
        const candidates = [normalizedRaw];
        if (Object.keys(previous).length > 0) {
          const accumulated: Record<string, FileLeaf> = {};
          for (const file of new Set([...Object.keys(previous), ...Object.keys(raw)])) {
            accumulated[file] = {
              p: filePaid(previous[file]) + filePaid(raw[file]),
              o: fileOs(raw[file]),
            };
          }
          candidates.push(accumulated);
        }
        for (const candidate of candidates) {
          const error = Math.abs(total(candidate) - triangleValue);
          if (error + 0.5 < selectedError) {
            selected = candidate;
            selectedError = error;
          }
        }
      }
      if (!selected) continue;
      out[origin][date] = selected;
      previous = selected;
    }
  }
  return out;
}
