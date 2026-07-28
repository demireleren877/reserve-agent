import type { Triangle } from "@/types/triangle";
import { cellKey, type RatioCell } from "@/lib/ldf";

export type LDFDiagnosticKind =
  | "outlier_low_impact"
  | "outlier_material";

export interface LDFDiagnostic {
  key: string;
  origin: string;
  step: number;
  kind: LDFDiagnosticKind;
  ldfValue: number | null;
  median: number | null;
  robustZ: number | null;
  volumeShare: number | null;
  ibnrImpact: number | null;
  reason: string;
  priority: number;
}

interface DiagnosticOptions {
  baseIbnr: number;
  totalLatest: number;
  /** Hücre elenirse yeni IBNR − mevcut IBNR. */
  impactByCell: Map<string, number>;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Açıklanabilir LDF eleme önerileri. Bu fonksiyon karar vermez ve hücre elemez;
 * yalnızca istatistiksel olarak aykırı hücreleri kullanıcıya sunar.
 */
export function analyzeLDFDiagnostics(
  triangle: Triangle,
  ratios: RatioCell[][],
  excludedCells: Set<string>,
  options: DiagnosticOptions,
): LDFDiagnostic[] {
  const steps = triangle.development_periods.length - 1;
  const stats = Array.from({ length: steps }, (_, j) => {
    const values = ratios
      .map((row) => row[j])
      .filter((cell): cell is RatioCell & { value: number } =>
        !!cell && cell.value != null && Number.isFinite(cell.value) && !cell.excluded)
      .map((cell) => cell.value);
    const med = median(values);
    const mad = med == null ? null : median(values.map((v) => Math.abs(v - med)));
    const denominator = triangle.values.reduce((sum, row, i) => {
      const key = cellKey(triangle.origin_periods[i], j);
      const a = row[j];
      return excludedCells.has(key) || a == null ? sum : sum + Math.abs(a);
    }, 0);
    return { count: values.length, median: med, mad, denominator };
  });

  const materialFloor = Math.max(
    Math.abs(options.baseIbnr) * 0.01,
    Math.abs(options.totalLatest) * 0.001,
    1,
  );
  const out: LDFDiagnostic[] = [];

  for (let i = 0; i < triangle.origin_periods.length; i++) {
    const origin = triangle.origin_periods[i];
    for (let j = 0; j < steps; j++) {
      const key = cellKey(origin, j);
      if (excludedCells.has(key)) continue;
      const a = triangle.values[i]?.[j];
      const b = triangle.values[i]?.[j + 1];
      if (a == null || b == null) continue;

      const value = a !== 0 ? b / a : null;
      const stat = stats[j];
      const volumeShare = stat.denominator > 0 ? Math.abs(a) / stat.denominator : null;
      const impact = options.impactByCell.get(key) ?? null;

      // Arayüz tam sayı finansal değer gösteriyor. Ultimate/IBNR etkisi ekranda 0'a
      // yuvarlanan bir sinyal aksiyon üretmediği için öneri listesine alınmaz.
      if (impact == null || Math.round(Math.abs(impact)) === 0) continue;

      if (value == null || stat.median == null || stat.count < 4) continue;
      const scale = stat.mad != null ? stat.mad * 1.4826 : 0;
      const robustZ = scale > 1e-12 ? (value - stat.median) / scale : null;
      const relativeDeviation = stat.median !== 0
        ? Math.abs(value - stat.median) / Math.abs(stat.median)
        : 0;
      const isOutlier = Math.abs(robustZ ?? 0) >= 3 || (scale <= 1e-12 && relativeDeviation >= 0.25);
      const isMaterial = impact != null && Math.abs(impact) >= materialFloor;

      if (!isOutlier) continue;
      const kind: LDFDiagnosticKind = isMaterial ? "outlier_material" : "outlier_low_impact";

      const deviationPct = relativeDeviation * 100;
      const reason = kind === "outlier_material"
        ? `${deviationPct.toFixed(1)}% away from the column median and materially impacts IBNR.`
        : `${deviationPct.toFixed(1)}% away from the column median; IBNR impact is limited.`;
      const priority =
        (kind === "outlier_material" ? 3_000 : 1_000) +
        Math.abs(impact ?? 0) / materialFloor + Math.abs(robustZ ?? 0) + (volumeShare ?? 0);
      out.push({
        key, origin, step: j, kind, ldfValue: value, median: stat.median,
        robustZ, volumeShare, ibnrImpact: impact, reason, priority,
      });
    }
  }

  return out.sort((a, b) => b.priority - a.priority);
}
