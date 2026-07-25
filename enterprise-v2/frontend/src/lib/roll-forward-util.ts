/**
 * Roll-forward yardımcıları — yeni diagonalin dosya (DOSYA_NO) kırılımını, üçgenin
 * her origin'i için doğru gelişim dönemi etiketine yerleştirir.
 *
 * FileData şekli: origin → gelişim dönemi etiketi → { dosya_no: tutar }.
 */

import type { Triangle, FileData } from "@/types/triangle";

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
 * Sonuç bu dönemin verisidir: {p: dönem içi (artımsal) ödeme, o: güncel muallak}.
 * KÜMÜLE ETMEZ — File analizi Statistics'i "bu dönemde ne varsa" onu göstermeli
 * (ör. Q2'yi Q1'den roll-forward etsek de Q2'nin kendi verisi görünür).
 * Eski backend sayı (paid-only) dönerse o=0 kabul edilir.
 */
export function newDiagonalToFileData(
  triangle: Triangle,
  newDiagonalFiles: Record<string, Record<string, number | { p: number; o: number }>>,
): FileData {
  const fd: FileData = {};
  for (const [origin, files] of Object.entries(newDiagonalFiles)) {
    if (!files || Object.keys(files).length === 0) continue;
    const d = lastDate(origin, triangle);
    if (!d) continue;
    const cell: Record<string, { p: number; o: number }> = {};
    for (const [dosya, mv] of Object.entries(files)) {
      cell[dosya] = typeof mv === "number" ? { p: mv, o: 0 } : { p: mv.p, o: mv.o };
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
