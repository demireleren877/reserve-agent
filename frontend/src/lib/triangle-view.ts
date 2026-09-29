import type { Triangle, Granularity } from "@/types/triangle";

/**
 * Üçgen "görünüm" dönüşümleri — veriyi DEĞİŞTİRMEZ, sadece nasıl gösterileceğini
 * hesaplar. Granülarite (yukarı toplama), kümülatif/artımsal, gelişim/takvim,
 * transpoze ve ondalık kontrolü buradan geçer.
 *
 * Temel kural: sadece daha kaba (coarser) görünüme çıkılabilir; stored (yüklenen)
 * granülaritenin altına inilemez. Toplama DAİMA artımsal değerler üzerinden yapılır
 * (kümülatifi düz toplamak yanlış olur), sonra tekrar kümülatif kurulur.
 */

export type ViewMode = "development" | "calendar";

export interface ViewOptions {
  cumulative: boolean;
  transposed: boolean;
  view: ViewMode;
  originLenMonths: number;
  devLenMonths: number;
  decimals: number;
}

export interface DisplayMatrix {
  corner: string;
  columns: string[];
  rows: { header: string; cells: (number | null)[] }[];
  totals: (number | null)[];
}

const MONTHS: Record<Granularity, number> = { yearly: 12, quarterly: 3 };

export function granMonths(g: Granularity): number {
  return MONTHS[g];
}

/** "2000" → çeyrek-seq (yıl*4+1); "2000Q3" → yıl*4+3. */
function originToQuarterSeq(label: string): number {
  const q = /^(\d{4})Q([1-4])$/i.exec(label);
  if (q) return parseInt(q[1], 10) * 4 + parseInt(q[2], 10);
  const y = /^(\d{4})$/.exec(label);
  if (y) return parseInt(y[1], 10) * 4 + 1;
  return 1;
}

/** çeyrek-seq → "YYYYQq" (yearlyBucket ise sadece "YYYY"). */
function quarterSeqToLabel(seq: number, yearlyBucket: boolean): string {
  const y = Math.floor((seq - 1) / 4);
  const q = ((seq - 1) % 4) + 1;
  return yearlyBucket ? `${y}` : `${y}Q${q}`;
}

/** Kümülatif satır → artımsal (row-wise diff). */
function rowToIncremental(row: (number | null)[]): (number | null)[] {
  return row.map((v, j) => {
    if (v == null) return null;
    if (j === 0) return v;
    const prev = row[j - 1];
    return prev != null ? v - prev : null;
  });
}

/** Artımsal satır → kümülatif (soldan sağa koşan toplam; tail null'lar korunur). */
function rowToCumulative(row: (number | null)[]): (number | null)[] {
  let run = 0;
  return row.map((v) => {
    if (v == null) return null;
    run += v;
    return run;
  });
}

function toIncremental(values: (number | null)[][]): (number | null)[][] {
  return values.map(rowToIncremental);
}

/** null-aware toplam: hiç değer yoksa null. */
function sumCells(cells: (number | null)[]): number | null {
  let s = 0;
  let any = false;
  for (const c of cells) {
    if (c != null) {
      s += c;
      any = true;
    }
  }
  return any ? s : null;
}

/** Ardışık k sütunu artımsal olarak birleştir (grup başına toplam). */
function aggregateColumns(inc: (number | null)[][], k: number): (number | null)[][] {
  if (k <= 1) return inc.map((r) => [...r]);
  return inc.map((row) => {
    const out: (number | null)[] = [];
    for (let start = 0; start < row.length; start += k) {
      out.push(sumCells(row.slice(start, start + k)));
    }
    return out;
  });
}

/** Ardışık k satırı (dev-lag hizalı) artımsal olarak birleştir. */
function aggregateRows(inc: (number | null)[][], k: number): (number | null)[][] {
  if (k <= 1) return inc.map((r) => [...r]);
  const out: (number | null)[][] = [];
  for (let start = 0; start < inc.length; start += k) {
    const group = inc.slice(start, start + k);
    const width = Math.max(...group.map((r) => r.length));
    const merged: (number | null)[] = [];
    for (let j = 0; j < width; j++) {
      merged.push(sumCells(group.map((r) => r[j] ?? null)));
    }
    out.push(merged);
  }
  return out;
}

/** Origin gruplama sonrası etiketler: tek → aynı, çok → "ilk–son". */
function groupedOriginLabels(origins: string[], k: number): string[] {
  if (k <= 1) return [...origins];
  const out: string[] = [];
  for (let start = 0; start < origins.length; start += k) {
    const grp = origins.slice(start, start + k);
    out.push(grp.length === 1 ? grp[0] : `${grp[0]}–${grp[grp.length - 1]}`);
  }
  return out;
}

/** Her sütun için (satırlar boyunca) toplam. */
function columnTotals(rows: { cells: (number | null)[] }[], nCols: number): (number | null)[] {
  const totals: (number | null)[] = [];
  for (let c = 0; c < nCols; c++) {
    totals.push(sumCells(rows.map((r) => r.cells[c] ?? null)));
  }
  return totals;
}

function assemble(
  rowHeaders: string[],
  colHeaders: string[],
  values: (number | null)[][],
  rowAxis: string,
  colAxis: string,
  transposed: boolean,
): DisplayMatrix {
  if (transposed) {
    const nCols = rowHeaders.length;
    const tVals: (number | null)[][] = colHeaders.map((_, c) =>
      rowHeaders.map((_, r) => values[r]?.[c] ?? null),
    );
    const rows = colHeaders.map((h, i) => ({ header: h, cells: tVals[i] }));
    return {
      corner: colAxis,
      columns: rowHeaders,
      rows,
      totals: columnTotals(rows, nCols),
    };
  }
  const rows = rowHeaders.map((h, i) => ({ header: h, cells: values[i] ?? [] }));
  return {
    corner: rowAxis,
    columns: colHeaders,
    rows,
    totals: columnTotals(rows, colHeaders.length),
  };
}

/**
 * Üçgeni verilen görünüm seçeneklerine göre gösterim matrisine dönüştürür.
 * base: kümülatif üçgen (paid/incurred/muallak — hepsi kümülatif seviye).
 */
export function buildDisplayMatrix(base: Triangle, opts: ViewOptions): DisplayMatrix {
  const originStored = granMonths(base.origin_granularity);
  const devStored = granMonths(base.development_granularity);
  const rowK = Math.max(1, Math.round(opts.originLenMonths / originStored));
  const devK = Math.max(1, Math.round(opts.devLenMonths / devStored));

  const inc0 = toIncremental(base.values);

  if (opts.view === "development") {
    const aggCols = aggregateColumns(inc0, devK);
    const aggInc = aggregateRows(aggCols, rowK);
    const values = opts.cumulative ? aggInc.map(rowToCumulative) : aggInc;
    const origins = groupedOriginLabels(base.origin_periods, rowK);
    const nCols = Math.max(0, ...values.map((r) => r.length));
    const columns = Array.from({ length: nCols }, (_, i) => `${i + 1}`);
    // satırları eşit uzunluğa getir (transpoze güvenliği)
    const padded = values.map((r) => {
      const c = [...r];
      while (c.length < nCols) c.push(null);
      return c;
    });
    return assemble(origins, columns, padded, "Accident", "Development", opts.transposed);
  }

  // ── Takvim (calendar) görünümü ──
  // Önce origin gruplama, sonra köşegenleri takvim sütununa yerleştir.
  const rowAgg = aggregateRows(inc0, rowK);
  const origins = groupedOriginLabels(base.origin_periods, rowK);
  // her gruplanmış satırın başlangıcı (stored-dev birimi): i * originLenMonths/devStored
  const ratio = Math.max(1, Math.round(opts.originLenMonths / devStored));
  // Son takvim sütunu = RAPOR DÖNEMİ: sadece DOLU hücrelere göre (boş gelecek
  // dönemler eklenmez). En son köşegen değerlendirme tarihini verir.
  let maxCal = 0;
  rowAgg.forEach((row, i) => {
    row.forEach((v, j) => {
      if (v != null) {
        const idx = i * ratio + j;
        if (idx > maxCal) maxCal = idx;
      }
    });
  });
  // stored-dev biriminde takvim matrisi (artımsal)
  const calStored: (number | null)[][] = rowAgg.map((row, i) => {
    const line: (number | null)[] = new Array(maxCal + 1).fill(null);
    row.forEach((v, j) => {
      if (v != null) line[i * ratio + j] = v;
    });
    return line;
  });
  // takvim sütunlarını devK ile grupla (ör. çeyreklik→yıllık takvim)
  const calAgg = aggregateColumns(calStored, devK);
  const values = opts.cumulative ? calAgg.map(rowToCumulative) : calAgg;

  // takvim sütun etiketleri
  const baseQ = originToQuarterSeq(base.origin_periods[0] ?? "0");
  const quartersPerDevUnit = Math.max(1, Math.round(devStored / 3));
  const yearlyBucket = opts.devLenMonths >= 12;
  const nCols = calAgg[0]?.length ?? 0;
  const columns = Array.from({ length: nCols }, (_, b) => {
    const startStoredIdx = b * devK; // stored-dev birimi
    const startQ = baseQ + startStoredIdx * quartersPerDevUnit;
    return quarterSeqToLabel(startQ, yearlyBucket);
  });

  return assemble(origins, columns, values, "Accident", "Calendar", opts.transposed);
}

/** origin ekseni için geçerli uzunluk (ay) seçenekleri. */
export function originLengthOptions(base: Triangle): number[] {
  const stored = granMonths(base.origin_granularity);
  const spanMonths = base.origin_periods.length * stored;
  const opts: number[] = [];
  for (let v = stored; v <= 12; v += stored) opts.push(v);
  if (!opts.includes(12) && spanMonths >= 12) opts.push(12);
  for (let v = 12; v <= spanMonths; v += 12) if (!opts.includes(v)) opts.push(v);
  return opts.filter((v) => v <= Math.max(spanMonths, stored)).sort((a, b) => a - b);
}

/** gelişim ekseni için geçerli uzunluk (ay) seçenekleri — tavan 1 yıl. */
export function devLengthOptions(base: Triangle): number[] {
  const stored = granMonths(base.development_granularity);
  const opts: number[] = [];
  for (let v = stored; v <= 12; v += stored) opts.push(v);
  if (opts.length === 0) opts.push(stored);
  return opts;
}
