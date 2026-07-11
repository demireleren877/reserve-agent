/**
 * Dosya (DOSYA_NO) bazlı son-diagonal analizi — Rezerv "Dosya" sekmesi ve
 * agent `get_file_summary` tool'u ortak bu mantığı kullanır.
 *
 * FileData şekli: origin → gelişim dönemi etiketi → { dosya_no: tutar }.
 * Üçgenin son diagonali her origin için en güncel gözlem dönemidir; dosya
 * kırılımı o diagonalden alınır.
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

/** Her origin'in son diagonalindeki { dosya_no: tutar } kırılımı. */
export function lastDiagFiles(
  tri: Triangle,
  fd: FileData,
): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = {};
  for (const orig of tri.origin_periods) {
    const d = lastDate(orig, tri);
    if (d) result[orig] = fd[orig]?.[d] ?? {};
  }
  return result;
}

/** Origin bazında son-diagonal toplamları. */
export function lastDiagTotals(
  tri: Triangle,
  fd: FileData,
): Record<string, number> {
  const diagFiles = lastDiagFiles(tri, fd);
  const result: Record<string, number> = {};
  for (const [orig, files] of Object.entries(diagFiles)) {
    result[orig] = Object.values(files).reduce((s, v) => s + v, 0);
  }
  return result;
}

/**
 * Roll-forward yeni diagonalinin dosya kırılımını ({origin: {dosya: tutar}})
 * FileData şekline ({origin: {devLabel: {dosya: tutar}}}) çevirir. devLabel,
 * yeni üçgende o origin'in son gözlem dönemidir (lastDate). Böylece Dosya
 * sekmesi bu dönemin hareketini doğru diagonalde gösterir.
 */
export function newDiagonalToFileData(
  triangle: Triangle,
  newDiagonalFiles: Record<string, Record<string, number>>,
): FileData {
  const fd: FileData = {};
  for (const [origin, files] of Object.entries(newDiagonalFiles)) {
    if (!files || Object.keys(files).length === 0) continue;
    const d = lastDate(origin, triangle);
    if (d) fd[origin] = { [d]: { ...files } };
  }
  return fd;
}

export interface FileSummaryOriginRow {
  origin: string;
  n_files: number;
  total: number;
  top1_share: number;
  top3_share: number;
}

export interface FileSummaryLargest {
  origin: string;
  dosya_no: string;
  amount: number;
  share_of_origin: number;
}

export interface FileSummary {
  has_file_data: true;
  n_files: number;
  total_last_diagonal: number;
  per_origin: FileSummaryOriginRow[];
  /** Tüm portföydeki en büyük dosyalar (yoğunlaşma/anomali için). */
  largest_files: FileSummaryLargest[];
  note: string;
}

/**
 * Agent'a (ve özet panellere) gidecek dosya bazlı özet. Ham üçgen değil,
 * yalnızca son-diagonal kırılımı ve yoğunlaşma metrikleri döner.
 */
export function buildFileSummary(
  triangle: Triangle | null | undefined,
  fileData: FileData | null | undefined,
  topN = 15,
): FileSummary | null {
  if (!triangle || !fileData || Object.keys(fileData).length === 0) return null;

  const diagFiles = lastDiagFiles(triangle, fileData);
  const perOrigin: FileSummaryOriginRow[] = [];
  const allFiles: FileSummaryLargest[] = [];

  for (const origin of triangle.origin_periods) {
    const files = Object.entries(diagFiles[origin] ?? {})
      .filter(([, v]) => v > 0)
      .sort(([, a], [, b]) => b - a);
    if (files.length === 0) continue;
    const total = files.reduce((s, [, v]) => s + v, 0);
    const top1 = files[0]?.[1] ?? 0;
    const top3 = files.slice(0, 3).reduce((s, [, v]) => s + v, 0);
    perOrigin.push({
      origin,
      n_files: files.length,
      total: Math.round(total),
      top1_share: total > 0 ? top1 / total : 0,
      top3_share: total > 0 ? top3 / total : 0,
    });
    for (const [dosya, amount] of files) {
      allFiles.push({
        origin,
        dosya_no: dosya,
        amount: Math.round(amount),
        share_of_origin: total > 0 ? amount / total : 0,
      });
    }
  }

  if (perOrigin.length === 0) return null;

  allFiles.sort((a, b) => b.amount - a.amount);
  const totalDiag = perOrigin.reduce((s, o) => s + o.total, 0);
  const nFiles = allFiles.length;

  return {
    has_file_data: true,
    n_files: nFiles,
    total_last_diagonal: Math.round(totalDiag),
    per_origin: perOrigin,
    largest_files: allFiles.slice(0, topN),
    note:
      "Son diagonal (her kaza yılının en güncel gözlemi) dosya bazlı kırılımı. " +
      "top1_share/top3_share yoğunlaşmayı, largest_files en büyük tek dosyaları gösterir.",
  };
}
