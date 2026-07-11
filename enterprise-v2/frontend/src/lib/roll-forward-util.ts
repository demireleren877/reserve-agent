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

/** Roll-forward sonrası yeni diagonalin dosya kırılımını FileData'ya çevirir. */
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
