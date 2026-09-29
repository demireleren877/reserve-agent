import type { FileData, FileLeaf, Triangle } from "@/types/triangle";
import { fileOs, filePaid } from "@/types/triangle";
import { reconcileFileDataSnapshots } from "@/lib/roll-forward-util";

export type FileMetric = "inc" | "p" | "o";

export interface FileValue {
  p: number;
  o: number;
  inc: number;
}

export type FileSnapshot = Record<string, Record<string, FileValue>>;

export type ClaimChangeTag =
  | "new"
  | "removed"
  | "closed"
  | "reopened"
  | "up"
  | "down"
  | "same";

export interface ClaimComparisonRow {
  dosya: string;
  orig: string;
  curr: number;
  comp: number;
  delta: number;
  tag: ClaimChangeTag;
}

export function fileMetricValue(value: FileValue, metric: FileMetric): number {
  return metric === "p" ? value.p : metric === "o" ? value.o : value.inc;
}

/**
 * Returns the latest reconciled cumulative claim snapshot for each origin.
 * Reconciliation is important for legacy roll-forward data where the last paid
 * cell may have been persisted as an incremental movement.
 */
export function latestFileSnapshots(triangle: Triangle, fileData: FileData): FileSnapshot {
  const reconciled = reconcileFileDataSnapshots(triangle, fileData);
  const out: FileSnapshot = {};
  for (const origin of triangle.origin_periods) {
    const dates = Object.keys(reconciled[origin] ?? {});
    const latest = dates.length ? reconciled[origin][dates[dates.length - 1]] : {};
    out[origin] = Object.fromEntries(
      Object.entries(latest as Record<string, FileLeaf>).map(([claim, leaf]) => {
        const p = filePaid(leaf);
        const o = fileOs(leaf);
        return [claim, { p, o, inc: p + o }];
      }),
    );
  }
  return out;
}

export function originSnapshotTotals(snapshot: FileSnapshot, metric: FileMetric): Record<string, number> {
  return Object.fromEntries(
    Object.entries(snapshot).map(([origin, files]) => [
      origin,
      Object.values(files).reduce((sum, value) => sum + fileMetricValue(value, metric), 0),
    ]),
  );
}

function classifyClaimChange(
  current: FileValue | undefined,
  comparison: FileValue | undefined,
  delta: number,
): ClaimChangeTag {
  if (!comparison && current) return "new";
  if (comparison && !current) return "removed";
  if (comparison && current && comparison.o !== 0 && current.o === 0) return "closed";
  if (comparison && current && comparison.o === 0 && current.o !== 0) return "reopened";
  return delta > 0 ? "up" : delta < 0 ? "down" : "same";
}

export function buildClaimComparison(
  current: FileSnapshot,
  comparison: FileSnapshot,
  metric: FileMetric,
): ClaimComparisonRow[] {
  const out: ClaimComparisonRow[] = [];
  const origins = new Set([...Object.keys(current), ...Object.keys(comparison)]);
  for (const orig of origins) {
    const currentFiles = current[orig] ?? {};
    const comparisonFiles = comparison[orig] ?? {};
    const claims = new Set([...Object.keys(currentFiles), ...Object.keys(comparisonFiles)]);
    for (const dosya of claims) {
      const currentValue = currentFiles[dosya];
      const comparisonValue = comparisonFiles[dosya];
      const curr = currentValue ? fileMetricValue(currentValue, metric) : 0;
      const comp = comparisonValue ? fileMetricValue(comparisonValue, metric) : 0;
      if (curr === 0 && comp === 0 && !currentValue && !comparisonValue) continue;
      const delta = curr - comp;
      out.push({
        dosya,
        orig,
        curr,
        comp,
        delta,
        tag: classifyClaimChange(currentValue, comparisonValue, delta),
      });
    }
  }
  return out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

// ─── Agent özeti ──────────────────────────────────────────────────────────────

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
  metric: FileMetric;
  origin_count: number;
  n_files: number;
  grand_total: number;
  per_origin: FileSummaryOriginRow[];
  largest: FileSummaryLargest[];
}

/**
 * Son diagonal'deki dosya bazlı kırılımın agent özeti (get_file_summary okur).
 *
 * Bu alan doldurulmadığında agent, branşta DOSYA_NO verisi olsa bile
 * "bu branşta dosya kırılımı yok" diyordu. Metrik varsayılan olarak `inc`
 * (ödeme + muallak): rezerv üçgeni incurred bazlı, tutarlı kalsın.
 */
export function buildFileSummary(
  triangle: Triangle | null | undefined,
  fileData: FileData | null | undefined,
  topN = 15,
  metric: FileMetric = "inc",
): FileSummary | null {
  if (!triangle || !fileData || Object.keys(fileData).length === 0) return null;

  const snapshot = latestFileSnapshots(triangle, fileData);
  const perOrigin: FileSummaryOriginRow[] = [];
  const all: FileSummaryLargest[] = [];

  for (const origin of triangle.origin_periods) {
    const files = Object.entries(snapshot[origin] ?? {})
      .map(([dosya, v]) => [dosya, fileMetricValue(v, metric)] as const)
      .filter(([, amount]) => amount > 0)
      .sort((a, b) => b[1] - a[1]);
    if (!files.length) continue;

    const total = files.reduce((s, [, v]) => s + v, 0);
    const top3 = files.slice(0, 3).reduce((s, [, v]) => s + v, 0);
    perOrigin.push({
      origin,
      n_files: files.length,
      total: Math.round(total),
      top1_share: total > 0 ? files[0][1] / total : 0,
      top3_share: total > 0 ? top3 / total : 0,
    });
    for (const [dosya, amount] of files) {
      all.push({
        origin,
        dosya_no: dosya,
        amount: Math.round(amount),
        share_of_origin: total > 0 ? amount / total : 0,
      });
    }
  }

  if (!perOrigin.length) return null;
  all.sort((a, b) => b.amount - a.amount);

  return {
    has_file_data: true,
    metric,
    origin_count: perOrigin.length,
    n_files: all.length,
    grand_total: perOrigin.reduce((s, o) => s + o.total, 0),
    per_origin: perOrigin,
    largest: all.slice(0, topN),
  };
}

// ─── LDF geçişinin dosya bazlı hareketi ───────────────────────────────────────

export interface ClaimMovementRow {
  dosya_no: string;
  p_delta: number;
  o_delta: number;
  inc_delta: number;
  tag: ClaimChangeTag;
}

export interface ClaimMovementCell {
  origin: string;
  step: number;
  from: string;
  to: string;
  n_claims: number;
  paid_delta: number;
  os_delta: number;
  inc_delta: number;
  new_claims: number;
  closed: number;
  reopened: number;
  top: ClaimMovementRow[];
}

export type ClaimMovement = Record<string, Record<string, ClaimMovementCell>>;

/**
 * Bir LDF geçişini (d → d+1) dosya bazında açar: hangi dosya ödemeye döndü,
 * hangi muallak kapandı, aykırı LDF'i hangi tek dosya taşıyor.
 *
 * `get_file_summary` yalnızca son diagonal'i gösterdiği için "2021 step 2 LDF
 * neden 1.8?" sorusuna cevap veremiyordu; bu yapı o soruyu cevaplar.
 *
 * Ağırlık dengesi: her hücrede yalnızca |inc_delta| en büyük `topN` dosya
 * taşınır, gerisi toplamlarda kalır. Tüm dosyaları taşımak session_state'i
 * üçgenin kendisinden büyük yapardı.
 */
export function buildClaimMovement(
  triangle: Triangle | null | undefined,
  fileData: FileData | null | undefined,
  topN = 8,
): ClaimMovement | null {
  if (!triangle || !fileData || Object.keys(fileData).length === 0) return null;

  const reconciled = reconcileFileDataSnapshots(triangle, fileData);
  const out: ClaimMovement = {};

  for (const origin of triangle.origin_periods) {
    const byDate = reconciled[origin] ?? {};
    const dates = Object.keys(byDate);
    if (dates.length < 2) continue;

    for (let step = 0; step < dates.length - 1; step += 1) {
      const prev = (byDate[dates[step]] ?? {}) as Record<string, FileLeaf>;
      const next = (byDate[dates[step + 1]] ?? {}) as Record<string, FileLeaf>;
      const claims = new Set([...Object.keys(prev), ...Object.keys(next)]);
      if (!claims.size) continue;

      const rows: ClaimMovementRow[] = [];
      let paidDelta = 0;
      let osDelta = 0;
      let newClaims = 0;
      let closed = 0;
      let reopened = 0;

      for (const dosya of claims) {
        const a = prev[dosya];
        const b = next[dosya];
        const ap = a ? filePaid(a) : 0;
        const ao = a ? fileOs(a) : 0;
        const bp = b ? filePaid(b) : 0;
        const bo = b ? fileOs(b) : 0;
        const dp = bp - ap;
        const do_ = bo - ao;
        if (dp === 0 && do_ === 0) continue;

        paidDelta += dp;
        osDelta += do_;
        if (!a && b) newClaims += 1;
        if (ao > 0 && bo === 0) closed += 1;
        if (ao === 0 && bo > 0 && a) reopened += 1;

        rows.push({
          dosya_no: dosya,
          p_delta: Math.round(dp),
          o_delta: Math.round(do_),
          inc_delta: Math.round(dp + do_),
          tag: classifyClaimChange(
            b ? { p: bp, o: bo, inc: bp + bo } : undefined,
            a ? { p: ap, o: ao, inc: ap + ao } : undefined,
            dp + do_,
          ),
        });
      }

      if (!rows.length) continue;
      rows.sort((x, y) => Math.abs(y.inc_delta) - Math.abs(x.inc_delta));

      (out[origin] ??= {})[String(step)] = {
        origin,
        step,
        from: dates[step],
        to: dates[step + 1],
        n_claims: rows.length,
        paid_delta: Math.round(paidDelta),
        os_delta: Math.round(osDelta),
        inc_delta: Math.round(paidDelta + osDelta),
        new_claims: newClaims,
        closed,
        reopened,
        top: rows.slice(0, topN),
      };
    }
  }

  return Object.keys(out).length ? out : null;
}
