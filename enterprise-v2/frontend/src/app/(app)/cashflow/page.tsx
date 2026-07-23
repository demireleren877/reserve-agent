"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import Link from "next/link";
import { downloadFile } from "@/lib/download";
import { useUserPlan } from "@/lib/auth/user-plan-context";
import { useProject } from "@/lib/project-store";
import { useModelLock } from "@/lib/use-model-lock";
import { ModelLockBanner } from "@/components/ModelLockBanner";
import type { Branch, Period } from "@/types/project";
import type { Triangle } from "@/types/triangle";
import { LDFTab } from "@/components/LDFTab";
import { CurveTab } from "@/components/CurveTab";
import {
  type Window,
  developmentRatios,
  aggregateLDFs,
  cumulativeFactors,
  cascadeCDFs,
  ldfAt,
  MODEL_LABELS,
} from "@/lib/ldf";
import {
  fitExponential,
  fitInversePower,
  fitPower,
  fitWeibull,
  type TailFit,
} from "@/lib/tail-fit";
import {
  type CashflowComputeResult,
  computeCashflow,
  computeCashflowFromTriangle,
  computePatternFromCdf,
  formatNumber,
  uploadCashflowFile,
} from "@/lib/api";
import { TriangleGrid } from "@/components/TriangleGrid";

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "data" | "ldf" | "curve" | "pattern" | "monthly";
type NavLevel = "root" | "period" | "branch";

type PeriodWithPaid = Period & { paidBranches: Branch[] };

const TABS: { key: Tab; label: string; sub: string }[] = [
  { key: "data",    label: "Data",          sub: "Paid triangle" },
  { key: "ldf",     label: "LDF",           sub: "Development factors" },
  { key: "curve",   label: "Curve",         sub: "CDF curve" },
  { key: "pattern", label: "CF Pattern",    sub: "Quarterly" },
  { key: "monthly", label: "Monthly Pattern", sub: "180 months" },
];

const EMPTY_FIT: TailFit = { ok: false, cdfs: [], params: {}, r2: undefined };

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TR6 = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 6, maximumFractionDigits: 6 });
function fmt6(n: number) { return TR6.format(n); }

function timeAgo(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m} min ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} hr ago`;
    return `${Math.floor(h / 24)} days ago`;
  } catch { return ""; }
}

function Sep() {
  return <span className="text-[color:var(--muted)] px-0.5">/</span>;
}

/** "2026Q1" → "2026-03-31", "2026Q3" → "2026-09-30", "2026" → "2026-12-31" */
function periodLabelToReportDate(label: string): string | undefined {
  const upper = label.trim().toUpperCase();
  const qMatch = upper.match(/^(\d{4})Q([1-4])$/);
  if (qMatch) {
    const year = parseInt(qMatch[1]);
    const q = parseInt(qMatch[2]);
    const qEnd: [number, number][] = [[3, 31], [6, 30], [9, 30], [12, 31]];
    const [month, day] = qEnd[q - 1];
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  const yMatch = upper.match(/^(\d{4})$/);
  if (yMatch) return `${yMatch[1]}-12-31`;
  return undefined;
}

function Spinner() {
  return (
    <div className="w-6 h-6 rounded-full border-2 animate-spin"
      style={{ borderColor: "var(--border)", borderTopColor: "var(--primary)" }} />
  );
}

// ─── Excel export helpers ──────────────────────────────────────────────────────

function _xlsxDownload(wb: XLSX.WorkBook, filename: string) {
  // Masaüstü (pywebview) native kaydet köprüsü + tarayıcı fallback için ortak helper.
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  downloadFile(buf, filename).catch((e) => {
    alert("Download error: " + (e instanceof Error ? e.message : String(e)));
  });
}

function exportTriangleXlsx(triangle: Triangle, branchLabel: string) {
  const devLabels = triangle.development_periods.map(String);
  const header = ["Accident Period", ...devLabels];

  const cumRows = triangle.origin_periods.map((o, i) => [o, ...triangle.values[i].map(v => v ?? "")]);

  const incValues = triangle.values.map(row =>
    row.map((v, j) => {
      if (v == null) return null;
      const prev = j > 0 ? row[j - 1] : null;
      return prev != null ? v - prev : v;
    })
  );
  const incRows = triangle.origin_periods.map((o, i) => [o, ...incValues[i].map(v => v ?? "")]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...cumRows]), "Cumulative");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...incRows]), "Incremental");
  _xlsxDownload(wb, `${branchLabel}_triangle.xlsx`);
}

function exportLDFXlsx(
  triangle: Triangle,
  excludedCells: Set<string>,
  window: Window,
  cdfs: number[],
  branchLabel: string,
) {
  const ratios = developmentRatios(triangle, excludedCells);
  const n = triangle.development_periods.length - 1;
  const stepLabels = Array.from({ length: n }, (_, i) => `${triangle.development_periods[i]}→${triangle.development_periods[i + 1]}`);
  const header = ["Accident Period", ...stepLabels];

  const ratioRows = triangle.origin_periods.map((o, i) => [
    o,
    ...Array.from({ length: n }, (_, j) => {
      const cell = ratios[i]?.[j];
      return cell != null ? (cell.excluded ? "(excluded)" : (cell.value ?? "")) : "";
    }),
  ]);

  const selectedLDFs = aggregateLDFs(triangle, ratios, window, "volume_weighted");
  const ldfRow = ["Selected LDF", ...selectedLDFs.map(v => v)];
  const cdfRow = ["CDF (to ult)", ...cdfs.map(v => v)];

  const ws = XLSX.utils.aoa_to_sheet([header, ...ratioRows, [], ldfRow, cdfRow]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "LDF");
  _xlsxDownload(wb, `${branchLabel}_ldf.xlsx`);
}

function exportCurveXlsx(
  triangle: Triangle,
  selectedLDFs: number[],
  initialCDFs: number[],
  tailFits: { exp: TailFit; invPower: TailFit; power: TailFit; weibull: TailFit },
  cdfModelPerPeriod: Record<string, 1 | 2 | 3 | 4 | 5 | 6>,
  cdfInitial: Record<string, number>,
  curveIncludePerPeriod: Record<string, boolean>,
  effectiveCdfs: number[],
  effLDFs: number[],
  branchLabel: string,
) {
  const devs = triangle.development_periods;
  const header = [
    "Dev.", "Include",
    "Initial LDF", "Exp.Decay LDF", "Inv.Power LDF", "Power LDF", "Weibull LDF",
    "User Value CDF", "Model", "Selected LDF",
    "Cumul CDF", "Cumul%", "Incr%",
  ];

  const rows = devs.map((d, i) => {
    const key = String(d);
    const model = cdfModelPerPeriod[key] ?? 1;
    const initLDF = selectedLDFs[i] ?? null;
    const autoExcluded = initLDF !== null && initLDF <= 1;
    const included = !autoExcluded && curveIncludePerPeriod[key] !== false;

    const expLDF = tailFits.exp.ok ? ldfAt(tailFits.exp.cdfs, i) : null;
    const ipLDF  = tailFits.invPower.ok ? ldfAt(tailFits.invPower.cdfs, i) : null;
    const pwLDF  = tailFits.power.ok ? ldfAt(tailFits.power.cdfs, i) : null;
    const wbLDF  = tailFits.weibull.ok ? ldfAt(tailFits.weibull.cdfs, i) : null;
    const userCDF = cdfInitial[key] ?? null;

    const selectedLdf =
      model === 2 ? expLDF
      : model === 3 ? ipLDF
      : model === 4 ? pwLDF
      : model === 5 ? wbLDF
      : model === 6 ? (userCDF ?? 1)
      : initLDF;

    const cumul = effectiveCdfs[i] ?? 1;
    const cumPct = cumul > 0 ? 100 / cumul : 0;
    const incrPct = i === 0 ? cumPct : cumPct - (effectiveCdfs[i - 1] > 0 ? 100 / effectiveCdfs[i - 1] : 0);

    return [
      i + 1,
      included ? "Yes" : "No",
      initLDF ?? "",
      expLDF ?? "",
      ipLDF ?? "",
      pwLDF ?? "",
      wbLDF ?? "",
      userCDF ?? "",
      MODEL_LABELS[model] ?? "Initial",
      selectedLdf ?? "",
      cumul,
      cumPct / 100,
      incrPct / 100,
    ];
  });

  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  // Apply percentage format to Cumul% (col 11) and Incr% (col 12)
  for (let r = 1; r <= rows.length; r++) {
    const cumAddr = XLSX.utils.encode_cell({ r, c: 11 });
    const incrAddr = XLSX.utils.encode_cell({ r, c: 12 });
    if (ws[cumAddr]) ws[cumAddr].z = "0.00%";
    if (ws[incrAddr]) ws[incrAddr].z = "0.00%";
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Curve");
  _xlsxDownload(wb, `${branchLabel}_curve.xlsx`);
}

function exportPatternXlsx(result: CashflowComputeResult, mode: "quarterly" | "monthly", branchLabel: string) {
  const source = mode === "quarterly" ? result.quarterly_pattern : result.monthly_pattern;
  const periodLabel = mode === "quarterly" ? "Period (Quarter)" : "Month";
  const header = ["Accident Year", periodLabel, "Normalized Weight"];
  const rows: (string | number)[][] = [];
  for (const year of result.origin_years) {
    for (const entry of source[String(year)] ?? []) {
      const period = (entry as { period?: number; month?: number }).period
        ?? (entry as { period?: number; month?: number }).month ?? 0;
      rows.push([year, period, entry.weight]);
    }
  }
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, mode === "quarterly" ? "CF Pattern" : "Monthly Pattern");
  _xlsxDownload(wb, `${branchLabel}_${mode}_pattern.xlsx`);
}

function DownloadXlsxButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Download Excel"
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium border transition hover:bg-[color:var(--surface-alt)]"
      style={{ borderColor: "var(--border)", color: "var(--muted-strong)" }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      Excel
    </button>
  );
}

function FolderIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

function Pill({ children, ok }: { children: React.ReactNode; ok?: boolean }) {
  return (
    <span className={
      "inline-flex items-center rounded-full px-1.5 py-0 text-[10px] font-medium " +
      (ok
        ? "bg-[color:var(--success-soft)] text-[color:var(--success)]"
        : "bg-[color:var(--surface-alt)] text-[color:var(--muted-strong)]")
    }>{children}</span>
  );
}

// ─── Folder tile components ───────────────────────────────────────────────────

function HeaderRow({ title, subtitle, count }: { title: string; subtitle?: string; count?: number }) {
  return (
    <div className="flex items-baseline justify-between mb-6">
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        {subtitle && <p className="text-sm text-[color:var(--muted)] mt-0.5">{subtitle}</p>}
      </div>
      {count !== undefined && (
        <span className="text-xs text-[color:var(--muted)] tabular">{count} adet</span>
      )}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{children}</div>;
}

function PeriodTile({ period, onOpen }: { period: PeriodWithPaid; onOpen: () => void }) {
  return (
    <div onClick={onOpen}
      className="group card p-5 cursor-pointer transition hover:border-[color:var(--primary)] hover:shadow-md flex flex-col gap-3">
      <div className="h-10 w-10 rounded-lg bg-[color:var(--primary-soft)] text-[color:var(--primary)] grid place-items-center">
        <FolderIcon />
      </div>
      <div>
        <div className="text-base font-semibold">{period.label}</div>
        <div className="text-xs text-[color:var(--muted)] mt-1 tabular">
          {period.paidBranches.length} branches
        </div>
      </div>
      <div className="text-[11px] text-[color:var(--muted)] tabular">
        Created: {new Date(period.createdAt).toLocaleDateString("en-GB")}
      </div>
    </div>
  );
}

function BranchTile({ branch, onOpen }: { branch: Branch; onOpen: () => void }) {
  const nOrigins = branch.paidTriangle?.origin_periods.length ?? 0;
  const freq = branch.frequency === "quarterly" ? "Quarterly" : "Yearly";
  return (
    <div onClick={onOpen}
      className="group card p-5 cursor-pointer transition hover:border-[color:var(--primary)] hover:shadow-md flex flex-col gap-3">
      <div className="h-10 w-10 rounded-lg bg-[color:var(--success-soft)] text-[color:var(--success)] grid place-items-center">
        <FolderIcon />
      </div>
      <div>
        <div className="text-base font-semibold">{branch.name}</div>
        <div className="text-xs text-[color:var(--muted)] mt-1 flex items-center gap-2">
          <Pill ok>paid triangle loaded</Pill>
          <span className="tabular">{nOrigins} origin</span>
          <span>{freq}</span>
        </div>
      </div>
      <div className="text-[11px] text-[color:var(--muted)] tabular">
        {timeAgo(branch.updatedAt)}
      </div>
    </div>
  );
}

// ─── Root view ────────────────────────────────────────────────────────────────

function RootView({ periods, onOpen }: { periods: PeriodWithPaid[]; onOpen: (id: string) => void }) {
  return (
    <main className="p-6 max-w-[1400px] mx-auto">
      <HeaderRow
        title="Periods"
        subtitle="Periods with a paid triangle loaded. Click a period to see its branches."
        count={periods.length}
      />
      {periods.length === 0 ? (
        <div className="text-center py-20 text-sm text-[color:var(--muted)]">
          <p className="mb-3">No branch with a paid triangle found.</p>
          <Link href="/reserve" className="underline" style={{ color: "var(--primary)" }}>
            Go to Reserve module →
          </Link>
        </div>
      ) : (
        <Grid>
          {periods.map((p) => (
            <PeriodTile key={p.id} period={p} onOpen={() => onOpen(p.id)} />
          ))}
        </Grid>
      )}
    </main>
  );
}

// ─── Period view ──────────────────────────────────────────────────────────────

function PeriodView({
  period,
  onOpen,
  loading,
  computingBranchId,
}: {
  period: PeriodWithPaid;
  onOpen: (id: string) => void;
  loading: boolean;
  computingBranchId: string | null;
}) {
  return (
    <main className="p-6 max-w-[1400px] mx-auto">
      <HeaderRow
        title={period.label}
        subtitle="Select the branch you want to run cashflow analysis on."
        count={period.paidBranches.length}
      />
      <Grid>
        {period.paidBranches.map((b) => (
          <div key={b.id} className="relative">
            <BranchTile branch={b} onOpen={() => !loading && onOpen(b.id)} />
            {loading && computingBranchId === b.id && (
              <div className="absolute inset-0 rounded-xl bg-white/60 dark:bg-black/40 flex items-center justify-center">
                <Spinner />
              </div>
            )}
          </div>
        ))}
      </Grid>
    </main>
  );
}

// ─── Cashflow data tab (paid_cum / paid_inc) ──────────────────────────────────

function toIncremental(tri: Triangle): Triangle {
  return {
    ...tri,
    values: tri.values.map((row) =>
      row.map((v, j) => {
        if (v == null) return null;
        if (j === 0) return v;
        const prev = row[j - 1];
        return prev != null ? v - prev : null;
      })
    ),
  };
}

function CashflowDataTab({ triangle }: { triangle: Triangle }) {
  const [mode, setMode] = useState<"cum" | "inc">("cum");
  const incrementalTri = useMemo(() => toIncremental(triangle), [triangle]);
  const shown = mode === "cum" ? triangle : incrementalTri;

  const latestSum = triangle.values.reduce((s, row) => {
    let latest = 0;
    for (const v of row) if (v != null) latest = v;
    return s + latest;
  }, 0);

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Triangle",     value: `${triangle.origin_periods.length}×${triangle.development_periods.length}` },
          { label: "Origin Range", value: `${triangle.origin_periods[0]} — ${triangle.origin_periods.at(-1)}`,
            sub: `accident ${triangle.origin_granularity === "quarterly" ? "quarterly" : "yearly"}` },
          { label: "Development",  value: triangle.development_granularity === "quarterly" ? "Quarterly" : "Yearly",
            sub: `${triangle.development_periods.length} periods` },
          { label: "Total Current", value: formatNumber(latestSum), sub: "paid cumulative" },
        ].map(({ label, value, sub }) => (
          <div key={label} className="card p-3">
            <div className="text-[10px] uppercase tracking-wide font-semibold text-[color:var(--muted-strong)] mb-0.5">{label}</div>
            <div className="text-lg font-semibold tabular">{value}</div>
            {sub && <div className="text-[11px] text-[color:var(--muted)] mt-0.5">{sub}</div>}
          </div>
        ))}
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-[color:var(--surface-alt)]">
          <div className="flex gap-1">
            {[
              { id: "cum" as const, label: "Cumulative Paid" },
              { id: "inc" as const, label: "Incremental Paid" },
            ].map((t) => (
              <button key={t.id} onClick={() => setMode(t.id)}
                className={"px-3 py-1 rounded text-xs font-medium transition " +
                  (mode === t.id
                    ? "bg-[color:var(--primary)] text-white"
                    : "bg-[color:var(--surface)] text-[color:var(--muted-strong)] hover:bg-[color:var(--border)]")}>
                {t.label}
              </button>
            ))}
          </div>
          <span className="text-xs text-[color:var(--muted)] tabular">
            {shown.origin_periods.length}×{shown.development_periods.length}
          </span>
        </div>
        <div className="p-2">
          <div className="text-[10px] text-[color:var(--muted-strong)] px-1 pb-1 font-semibold uppercase tracking-wide">
            {mode === "cum" ? "Cumulative Paid" : "Incremental Paid"}
          </div>
          <TriangleGrid triangle={shown} />
        </div>
      </div>
    </div>
  );
}

// ─── Pattern table ────────────────────────────────────────────────────────────

function entryPeriod(e: { period?: number; month?: number }): number {
  return e.period ?? e.month ?? 0;
}

function PatternTable({ result, mode }: { result: CashflowComputeResult; mode: "quarterly" | "monthly" }) {
  const years = result.origin_years;
  const source = mode === "quarterly" ? result.quarterly_pattern : result.monthly_pattern;
  const periodLabel = mode === "quarterly" ? "Period (Quarter)" : "Month";
  const [transposed, setTransposed] = useState(true);

  // Matris: kaza yılı satır, period sütun. Tüm period'ların birleşimi (sıralı).
  const periods = useMemo(() => {
    const set = new Set<number>();
    for (const y of years) for (const e of source[String(y)] ?? []) set.add(entryPeriod(e));
    return [...set].sort((a, b) => a - b);
  }, [years, source]);

  const wmap = useMemo(() => {
    const m: Record<string, Record<number, number>> = {};
    for (const y of years) {
      m[String(y)] = {};
      for (const e of source[String(y)] ?? []) m[String(y)][entryPeriod(e)] = e.weight;
    }
    return m;
  }, [years, source]);

  const thBase = {
    borderBottom: "2px solid var(--border)",
    color: "var(--muted-strong)",
    background: "var(--surface)",
  } as const;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: "var(--muted)" }}>
          View
        </span>
        <div className="inline-flex h-7 p-0.5 rounded-lg" style={{ background: "var(--surface-alt)", border: "1px solid var(--border)" }}>
          {([["matrix", "Matris"], ["list", "Liste"]] as const).map(([val, lbl]) => {
            const active = (val === "matrix") === transposed;
            return (
              <button
                key={val}
                onClick={() => setTransposed(val === "matrix")}
                className="px-2.5 rounded-md text-[11px] font-medium transition"
                style={
                  active
                    ? { background: "var(--surface)", color: "var(--primary)", boxShadow: "0 1px 2px rgba(0,0,0,0.06)" }
                    : { color: "var(--muted-strong)" }
                }
              >
                {lbl}
              </button>
            );
          })}
        </div>
      </div>

      {transposed ? (
        <div className="overflow-auto">
          <table className="text-[12px] border-collapse">
            <thead className="sticky top-0" style={{ zIndex: 2 }}>
              <tr>
                <th className="px-3 py-2 text-left font-semibold whitespace-nowrap sticky left-0"
                  style={{ ...thBase, zIndex: 3 }}>
                  Accident Year
                </th>
                {periods.map((p) => (
                  <th key={p} className="px-3 py-2 text-right font-semibold tabular-nums whitespace-nowrap" style={thBase}>
                    {p}
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-semibold whitespace-nowrap" style={thBase}>Σ</th>
              </tr>
            </thead>
            <tbody>
              {years.map((year) => {
                const rowSum = periods.reduce((s, p) => s + (wmap[String(year)]?.[p] ?? 0), 0);
                return (
                  <tr key={year} className="hover:bg-[color:var(--surface-alt)]">
                    <td className="px-3 py-1 font-medium tabular-nums whitespace-nowrap sticky left-0"
                      style={{ borderBottom: "1px solid var(--border)", color: "var(--foreground)", background: "var(--surface)" }}>
                      {year}
                    </td>
                    {periods.map((p) => {
                      const w = wmap[String(year)]?.[p];
                      return (
                        <td key={p} className="px-3 py-1 text-right tabular-nums"
                          style={{ borderBottom: "1px solid var(--border)", color: w == null || w === 0 ? "var(--muted)" : "var(--foreground)" }}>
                          {w == null || w === 0 ? "—" : fmt6(w)}
                        </td>
                      );
                    })}
                    <td className="px-3 py-1 text-right tabular-nums font-medium"
                      style={{ borderBottom: "1px solid var(--border)", color: "var(--muted-strong)" }}>
                      {fmt6(rowSum)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-auto">
          <table className="text-[12px] border-collapse w-full">
            <thead className="sticky top-0" style={{ background: "var(--surface)", zIndex: 1 }}>
              <tr>
                {["Accident Year", periodLabel, "Normalized Weight"].map((h) => (
                  <th key={h} className="px-4 py-2 text-left font-semibold whitespace-nowrap" style={thBase}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {years.flatMap((year) =>
                (source[String(year)] ?? []).map((entry) => {
                  const w = entry.weight;
                  const period = entryPeriod(entry);
                  return (
                    <tr key={`${year}-${period}`} className="hover:bg-[color:var(--surface-alt)]">
                      <td className="px-4 py-1 tabular-nums" style={{ borderBottom: "1px solid var(--border)", color: "var(--foreground)" }}>{year}</td>
                      <td className="px-4 py-1 tabular-nums" style={{ borderBottom: "1px solid var(--border)", color: "var(--foreground)" }}>{period}</td>
                      <td className="px-4 py-1 tabular-nums" style={{ borderBottom: "1px solid var(--border)", color: w === 0 ? "var(--muted)" : "var(--foreground)" }}>
                        {w === 0 ? 0 : fmt6(w)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CashflowPage() {
  const plan = useUserPlan();
  const { project, actions } = useProject();
  const fileRef = useRef<HTMLInputElement>(null);

  const [navLevel, setNavLevel] = useState<NavLevel>("root");
  const [activePeriodId, setActivePeriodId] = useState<string | null>(null);
  const [activeBranchId, setActiveBranchId] = useState<string | null>(null);

  const lockKey =
    navLevel === "branch" && activePeriodId && activeBranchId
      ? `cashflow:${activePeriodId}/${activeBranchId}`
      : null;
  const { state: lockState, forceAcquire } = useModelLock(lockKey);
  // Kilit "mine" olana kadar salt-okunur (acquire penceresi dahil); backend hatasında bloklamayız.
  const isReadOnly = !!lockKey && lockState.status !== "mine" && lockState.status !== "error";

  const [result, setResult] = useState<CashflowComputeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [computingBranchId, setComputingBranchId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("data");

  // LDF tab state — project store aracılığıyla D1'e persist edilir
  const [ldfWindow, setLdfWindowRaw] = useState<Window>("all");
  const [excludedCells, setExcludedCells] = useState<Set<string>>(new Set());

  function saveLdfToStore(branchId: string, window: Window, cells: Set<string>) {
    if (isReadOnly) return;
    actions.updateBranch(
      branchId,
      () => ({
        cashflowLdfWindow: window,
        cashflowLdfExcludedCells: Array.from(cells),
      }),
      "cashflow_ldf_updated",
      { window, excludedCount: cells.size },
      "user",
    );
    // Eski localStorage key'lerini temizle
    try { localStorage.removeItem(`cf_ldf_${branchId}`); } catch { /* ignore */ }
  }

  function setLdfWindow(w: Window) {
    setLdfWindowRaw(w);
    if (activeBranchId) saveLdfToStore(activeBranchId, w, excludedCells);
  }

  function toggleCell(origin: string, step: number) {
    const key = `${origin}|${step}`;
    const next = new Set(excludedCells);
    if (next.has(key)) next.delete(key); else next.add(key);
    setExcludedCells(next);
    if (activeBranchId) saveLdfToStore(activeBranchId, ldfWindow, next);
  }

  function clearCells() {
    const empty = new Set<string>();
    setExcludedCells(empty);
    if (activeBranchId) saveLdfToStore(activeBranchId, ldfWindow, empty);
  }

  function setCfKarmaWindow(step: string, w: Window) {
    if (isReadOnly || !activeBranchId) return;
    actions.updateBranch(
      activeBranchId,
      (prev) => ({ cashflowKarmaWindowPerStep: { ...(prev.cashflowKarmaWindowPerStep ?? {}), [step]: w } }),
      "cashflow_karma_window_set",
      { step, window: w },
      "user",
    );
  }

  function initCfKarma(stepCount: number, globalWindow: Window) {
    if (isReadOnly || !activeBranchId) return;
    const initial: Record<string, Window> = {};
    for (let j = 0; j < stepCount; j++) initial[String(j)] = globalWindow;
    actions.updateBranch(
      activeBranchId,
      () => ({ cashflowKarmaWindowPerStep: initial }),
      "cashflow_karma_initialized",
      { stepCount, globalWindow },
      "user",
    );
  }

  function clearCfKarma() {
    if (isReadOnly || !activeBranchId) return;
    actions.updateBranch(
      activeBranchId,
      () => ({ cashflowKarmaWindowPerStep: {} }),
      "cashflow_karma_cleared",
      {},
      "user",
    );
  }

  // Branş değişince project store'dan yükle
  useEffect(() => {
    if (!activeBranchId) return;
    // activeBranch henüz hesaplanmamış olabilir, project üzerinden bul
    const branch = project.periods
      .flatMap((p) => p.branches)
      .find((b) => b.id === activeBranchId);
    setLdfWindowRaw(branch?.cashflowLdfWindow ?? "all");
    setExcludedCells(new Set(branch?.cashflowLdfExcludedCells ?? []));
  }, [activeBranchId]); // eslint-disable-line react-hooks/exhaustive-deps

  const periodsWithPaid = useMemo(() =>
    (project.periods as Period[])
      .map((p) => ({ ...p, paidBranches: p.branches.filter((b) => b.paidTriangle != null) }))
      .filter((p) => (p as PeriodWithPaid).paidBranches.length > 0) as PeriodWithPaid[],
    [project],
  );

  const activePeriod = periodsWithPaid.find((p) => p.id === activePeriodId) ?? null;
  const activeBranch = activePeriod?.paidBranches.find((b) => b.id === activeBranchId) ?? null;

  // Cashflow Curve tab state — useMemo ile stabilize edilmiş (her render'da yeni {} üretmemek için)
  const cfCdfModel = useMemo(
    () => (activeBranch?.cashflowCdfModelPerPeriod ?? {}) as Record<string, 1 | 2 | 3 | 4 | 5 | 6>,
    [activeBranch],
  );
  const cfCurveInclude = useMemo(
    () => activeBranch?.cashflowCurveIncludePerPeriod ?? {},
    [activeBranch],
  );
  const cfCdfInitial = useMemo(
    () => activeBranch?.cashflowCdfInitial ?? {},
    [activeBranch],
  );

  // Karma Volume state — useMemo ile stabilize edilmiş
  const cfKarmaWindowPerStep = useMemo(
    () => activeBranch?.cashflowKarmaWindowPerStep ?? {},
    [activeBranch],
  );
  const isCfKarmaActive = Object.keys(cfKarmaWindowPerStep).length > 0;

  // selectedLDFs (LDF tabından, curve ve pattern hesabı için)
  const selectedLDFs = useMemo(() => {
    const tri = activeBranch?.paidTriangle ?? null;
    if (!tri) return [];
    const ratios = developmentRatios(tri, excludedCells);
    const karmaMap = Object.keys(cfKarmaWindowPerStep).length > 0 ? cfKarmaWindowPerStep : undefined;
    return aggregateLDFs(tri, ratios, ldfWindow, "volume_weighted", karmaMap);
  }, [activeBranch, excludedCells, ldfWindow]);

  // Ham CDFs (LDF tabı export için)
  const ldfExportCdfs = useMemo(() => cumulativeFactors(selectedLDFs), [selectedLDFs]);

  // Tail curve fits — activeBranch bağımlılığı: include değişimleri activeBranch'i günceller
  const tailFits = useMemo(() => {
    const tri = activeBranch?.paidTriangle ?? null;
    if (!tri || !selectedLDFs.length)
      return { exp: EMPTY_FIT, invPower: EMPTY_FIT, power: EMPTY_FIT, weibull: EMPTY_FIT };
    const curveInclude = activeBranch?.cashflowCurveIncludePerPeriod ?? {};
    const include = tri.development_periods.map((d, i) =>
      (i >= selectedLDFs.length || selectedLDFs[i] > 1) && curveInclude[String(d)] !== false,
    );
    return {
      exp: fitExponential(selectedLDFs, include),
      invPower: fitInversePower(selectedLDFs, include),
      power: fitPower(selectedLDFs, include),
      weibull: fitWeibull(selectedLDFs, include),
    };
  }, [activeBranch, selectedLDFs]);

  // Cascade: model seçimlerini CDF'e uygular
  // activeBranch bağımlılığı: model/curveInclude/cdfInitial değişimleri activeBranch'i günceller
  const cascade = useMemo(() => {
    const tri = activeBranch?.paidTriangle ?? null;
    if (!tri)
      return { effective: [] as number[], initial: [] as number[], effLDFs: [] as number[] };
    const model = (activeBranch?.cashflowCdfModelPerPeriod ?? {}) as Record<string, 1 | 2 | 3 | 4 | 5 | 6>;
    const cdfInit = activeBranch?.cashflowCdfInitial ?? {};
    return cascadeCDFs(
      tri.development_periods,
      selectedLDFs,
      {},
      cdfInit,
      {
        model,
        fitCDFs: {
          exp: tailFits.exp.cdfs,
          invPower: tailFits.invPower.cdfs,
          power: tailFits.power.cdfs,
          weibull: tailFits.weibull.cdfs,
        },
      },
    );
  }, [activeBranch, selectedLDFs, tailFits]);

  // Curve seçimleri uygulanmış CDFs — cascade useMemo'sından referans alır (stable)
  const effectiveCdfs = cascade.effective.length ? cascade.effective : ldfExportCdfs;
  const initialCDFs = cascade.initial.length ? cascade.initial : ldfExportCdfs;

  // result gelince veya CDF seçimi değişince pattern yeniden hesaplanmalı.
  // report_date + origin_years kombinasyonu: yeni branş açıldığında değişir,
  // ama setResult ile sadece pattern güncellenince değişmez → döngü olmaz.
  const resultKey = result ? `${result.report_date}|${result.origin_years.join(",")}` : null;
  // Referans kararlılığı: useMemo'lar activeBranch değişince yeni dizi üretir (aynı değerler).
  // join ile değer bazlı karşılaştırma yaparak pattern effect'in gereksiz ateşlenmesini önle.
  const effectiveCdfsKey = effectiveCdfs.join(",");

  // Curve setters — project store üzerinden D1'e persist edilir
  function setCfCdfModel(devPeriod: string, model: 1 | 2 | 3 | 4 | 5 | 6) {
    if (isReadOnly || !activeBranchId) return;
    actions.updateBranch(
      activeBranchId,
      (b) => ({ cashflowCdfModelPerPeriod: { ...(b.cashflowCdfModelPerPeriod ?? {}), [devPeriod]: model } }),
      "cashflow_curve_model_set", { devPeriod, model }, "user",
    );
  }

  function setCfCurveInclude(devPeriod: string, include: boolean) {
    if (isReadOnly || !activeBranchId) return;
    actions.updateBranch(
      activeBranchId,
      (b) => ({ cashflowCurveIncludePerPeriod: { ...(b.cashflowCurveIncludePerPeriod ?? {}), [devPeriod]: include } }),
      "cashflow_curve_include_set", { devPeriod, include }, "user",
    );
  }

  function setCfCdfInitial(devPeriod: string, value: number) {
    if (isReadOnly || !activeBranchId) return;
    actions.updateBranch(
      activeBranchId,
      (b) => ({ cashflowCdfInitial: { ...(b.cashflowCdfInitial ?? {}), [devPeriod]: value } }),
      "cashflow_curve_user_value_set", { devPeriod, value }, "user",
    );
  }

  function resetCfCurve() {
    if (isReadOnly || !activeBranchId) return;
    actions.updateBranch(
      activeBranchId,
      () => ({ cashflowCdfModelPerPeriod: {}, cashflowCurveIncludePerPeriod: {}, cashflowCdfInitial: {} }),
      "cashflow_curve_reset", undefined, "user",
    );
  }

  // Curve/LDF seçimleri değişince veya yeni branş yüklenince pattern'i yeniden hesapla.
  // resultKey: report_date+origin_years — yeni branşta değişir, sadece pattern
  // güncellenince değişmez → döngü olmaz.
  useEffect(() => {
    if (!result || !resultKey || effectiveCdfs.length === 0) return;
    const reportDate = result.report_date;
    const originYears = result.origin_years;
    // Backend CDF'leri gerçek quarter period indeksine (yıllık=3,7,11...; çeyreklik=0,1,2...)
    // göre saklar; effectiveCdfs[i]'yi dev_factors[i].period pozisyonuna yerleştir.
    const devFactors = result.dev_factors;
    let cdfsForPattern: number[];
    if (devFactors.length > 0) {
      const maxPeriod = Math.max(...devFactors.map(f => f.period)) + 1;
      cdfsForPattern = new Array(maxPeriod).fill(0);
      devFactors.forEach((f, i) => {
        if (i < effectiveCdfs.length) cdfsForPattern[f.period] = effectiveCdfs[i];
      });
    } else {
      cdfsForPattern = effectiveCdfs;
    }
    computePatternFromCdf(originYears, reportDate, cdfsForPattern)
      .then((p) => {
        setResult((prev) => prev ? {
          ...prev,
          quarterly_pattern: p.quarterly_pattern,
          monthly_pattern: p.monthly_pattern,
        } : prev);
        if (activeBranchId && p.monthly_pattern) {
          actions.updateBranch(
            activeBranchId,
            () => ({ cashflowMonthlyPattern: p.monthly_pattern }),
            "cashflow_pattern_computed", undefined, "user",
          );
        }
      })
      .catch(() => {/* sessizce geç */});
  }, [effectiveCdfsKey, resultKey]); // eslint-disable-line react-hooks/exhaustive-deps

  function goRoot() {
    setNavLevel("root");
    setActivePeriodId(null);
    setActiveBranchId(null);
    setResult(null);
    setError(null);
  }

  function goToPeriod(id: string) {
    setNavLevel("period");
    setActivePeriodId(id);
    setActiveBranchId(null);
    setResult(null);
    setError(null);
  }

  async function goToBranch(branchId: string) {
    const period = periodsWithPaid.find((p) => p.id === activePeriodId);
    const branch = period?.paidBranches.find((b) => b.id === branchId);
    if (!branch?.paidTriangle) return;

    setActiveBranchId(branchId);
    setNavLevel("branch");
    setComputingBranchId(branchId);
    setLoading(true);
    setError(null);
    setResult(null);
    // LDF state useEffect ile localStorage'dan yükleniyor
    try {
      const reportDate = period?.label ? periodLabelToReportDate(period.label) : undefined;
      const r = await computeCashflowFromTriangle(branch.paidTriangle, 5, reportDate);
      setResult(r);
      setActiveTab("data");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Calculation error");
    } finally {
      setLoading(false);
      setComputingBranchId(null);
    }
  }

  async function handleFile(file: File) {
    setError(null);
    setLoading(true);
    setResult(null);
    setNavLevel("branch");
    setActivePeriodId(null);
    setActiveBranchId(null);
    try {
      const uploaded = await uploadCashflowFile(file);
      const computed = await computeCashflow(uploaded.records);
      setResult(computed);
      setActiveTab("data");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bilinmeyen hata");
    } finally {
      setLoading(false);
    }
  }

  if (plan !== "pro") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-56px)] px-6">
        <div className="w-full max-w-md text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-6"
            style={{ background: "linear-gradient(135deg,#7c3aed22,#4f46e522)", border: "1px solid #ddd6fe" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6d28d9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h1 className="text-[20px] font-bold mb-2" style={{ color: "var(--foreground)" }}>Pro membership required</h1>
          <p className="text-[13.5px] leading-relaxed mb-8" style={{ color: "var(--muted-strong)" }}>The Cashflow module is included in the Pro plan.</p>
          <Link href="/onboarding/plan" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-[14px] font-semibold text-white"
            style={{ background: "linear-gradient(135deg,#6d28d9,#4f46e5)" }}>
            Upgrade to Pro
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <ModelLockBanner state={lockState} onForceAcquire={forceAcquire} />
      {/* Header */}
      <header className="border-b bg-[color:var(--surface)] px-6 h-14 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-md bg-[color:var(--primary)] grid place-items-center text-white text-[11px] font-bold">
              N
            </div>
            <h1 className="text-sm font-semibold">Cashflow</h1>
          </div>
          <span className="text-[11px] text-[color:var(--muted)] hidden sm:inline">
            Period → Branch → Analysis
          </span>
        </div>
      </header>

      {/* Breadcrumb */}
      <div className="bg-[color:var(--surface)] border-b px-6 h-10 flex items-center gap-1 text-sm sticky top-14 z-30">
        <button onClick={goRoot}
          className={"px-2 py-1 rounded-md transition flex items-center gap-1 " +
            (navLevel === "root"
              ? "font-semibold text-[color:var(--foreground)]"
              : "text-[color:var(--muted)] hover:text-[color:var(--foreground)] hover:bg-[color:var(--surface-alt)]")}>
          <FolderIcon size={14} />
          Periods
        </button>
        {activePeriod && (
          <>
            <Sep />
            <button onClick={() => goToPeriod(activePeriod.id)}
              className={"px-2 py-1 rounded-md transition " +
                (navLevel === "period"
                  ? "font-semibold text-[color:var(--foreground)]"
                  : "text-[color:var(--muted)] hover:text-[color:var(--foreground)] hover:bg-[color:var(--surface-alt)]")}>
              {activePeriod.label}
            </button>
          </>
        )}
        {activeBranch && (
          <>
            <Sep />
            <span className="px-2 py-1 font-semibold text-[color:var(--foreground)]">
              {activeBranch.name}
            </span>
          </>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => fileRef.current?.click()} disabled={loading}
            className="text-xs text-[color:var(--muted-strong)] hover:text-[color:var(--foreground)] border border-[color:var(--border)] rounded-md px-2.5 py-1 transition hover:bg-[color:var(--surface-alt)] disabled:opacity-50">
            Load from file
          </button>
          <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx,.xls" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          {navLevel !== "root" && (
            <button
              onClick={navLevel === "branch" ? () => goToPeriod(activePeriodId!) : goRoot}
              className="text-xs text-[color:var(--muted)] hover:text-[color:var(--foreground)]">
              ↑ Up
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {navLevel === "root" && (
        <RootView periods={periodsWithPaid} onOpen={goToPeriod} />
      )}

      {navLevel === "period" && activePeriod && (
        <PeriodView
          period={activePeriod}
          onOpen={goToBranch}
          loading={loading}
          computingBranchId={computingBranchId}
        />
      )}

      {navLevel === "branch" && (
        <>
          {loading && (
            <div className="flex items-center justify-center py-32">
              <Spinner />
            </div>
          )}

          {!loading && error && (
            <div className="p-6">
              <div className="max-w-md mx-auto rounded-xl px-4 py-3 text-[13px]"
                style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" }}>
                {error}
              </div>
            </div>
          )}

          {!loading && result && (
            <>
              {/* Tab bar — birebir rezerv modülü */}
              <div className="border-b bg-[color:var(--surface)] sticky top-[calc(3.5rem+2.5rem)] z-20">
                <div className="flex items-stretch">
                  <nav className="flex px-4 overflow-x-auto flex-1" role="tablist">
                    {TABS.map((t, i) => {
                      const active = t.key === activeTab;
                      return (
                        <button key={t.key} role="tab" aria-selected={active}
                          onClick={() => setActiveTab(t.key)}
                          className={"relative px-4 py-2.5 text-sm border-b-2 transition flex flex-col items-start shrink-0 " +
                            (active
                              ? "border-[color:var(--primary)] text-[color:var(--foreground)]"
                              : "border-transparent text-[color:var(--muted-strong)] hover:text-[color:var(--foreground)]")}>
                          <span className="flex items-center gap-2">
                            <span className={"inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold " +
                              (active ? "bg-[color:var(--primary)] text-white" : "bg-[color:var(--surface-alt)] text-[color:var(--muted-strong)]")}>
                              {i + 1}
                            </span>
                            <span className="font-medium">{t.label}</span>
                          </span>
                          <span className="text-[10px] text-[color:var(--muted)] ml-7 -mt-0.5">{t.sub}</span>
                        </button>
                      );
                    })}
                  </nav>
                  <div className="flex items-center px-3 gap-2 shrink-0">
                    <span className="text-[11px] text-[color:var(--muted)]">
                      Report: {result.report_date} · {result.origin_years.length} accident years
                    </span>
                  </div>
                </div>
              </div>

              {/* Tab content */}
              <main className="p-5 max-w-[1600px] w-full mx-auto">
                {activeTab === "data" && activeBranch?.paidTriangle && (
                  <div className="space-y-3">
                    <div className="flex justify-end">
                      <DownloadXlsxButton onClick={() =>
                        exportTriangleXlsx(activeBranch.paidTriangle!, activeBranch.name)
                      } />
                    </div>
                    <CashflowDataTab triangle={activeBranch.paidTriangle} />
                  </div>
                )}

                {activeTab === "ldf" && (
                  <div className="space-y-3">
                    {activeBranch?.paidTriangle && (
                      <div className="flex justify-end">
                        <DownloadXlsxButton onClick={() =>
                          exportLDFXlsx(activeBranch.paidTriangle!, excludedCells, ldfWindow, ldfExportCdfs, activeBranch.name)
                        } />
                      </div>
                    )}
                    <LDFTab
                      triangle={activeBranch?.paidTriangle ?? null}
                      window={ldfWindow}
                      excludedCells={excludedCells}
                      karmaWindowPerStep={cfKarmaWindowPerStep}
                      onWindowChange={setLdfWindow}
                      onToggleCell={toggleCell}
                      onClearCells={clearCells}
                      onSetKarmaWindow={setCfKarmaWindow}
                      onInitKarma={initCfKarma}
                      onClearKarma={clearCfKarma}
                    />
                  </div>
                )}

                {activeTab === "curve" && (
                  <div className="space-y-3">
                    {activeBranch?.paidTriangle && (
                      <div className="flex justify-end">
                        <DownloadXlsxButton onClick={() =>
                          exportCurveXlsx(
                            activeBranch.paidTriangle!,
                            selectedLDFs,
                            initialCDFs,
                            tailFits,
                            cfCdfModel,
                            cfCdfInitial,
                            cfCurveInclude,
                            effectiveCdfs,
                            cascade.effLDFs,
                            activeBranch.name,
                          )
                        } />
                      </div>
                    )}
                  <CurveTab
                    triangle={activeBranch?.paidTriangle ?? null}
                    initialCDFs={initialCDFs}
                    effectiveCdfs={effectiveCdfs}
                    selectedLDFs={selectedLDFs}
                    cdfInitial={cfCdfInitial}
                    cdfModelPerPeriod={cfCdfModel}
                    curveIncludePerPeriod={cfCurveInclude}
                    tailFits={tailFits}
                    onSetUserValue={setCfCdfInitial}
                    onSetModel={setCfCdfModel}
                    onToggleInclude={setCfCurveInclude}
                    onReset={resetCfCurve}
                  />
                  </div>
                )}

                {activeTab === "pattern" && (
                  <div className="rounded-2xl overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                    <div className="px-5 py-3 border-b flex items-center justify-between"
                      style={{ borderColor: "var(--border)" }}>
                      <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                        Quarterly Cashflow Pattern
                      </span>
                      <DownloadXlsxButton onClick={() =>
                        exportPatternXlsx(result!, "quarterly", activeBranch?.name ?? "cashflow")
                      } />
                    </div>
                    <div className="p-5">
                      <PatternTable result={result} mode="quarterly" />
                    </div>
                  </div>
                )}

                {activeTab === "monthly" && (
                  <div className="rounded-2xl overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                    <div className="px-5 py-3 border-b flex items-center justify-between"
                      style={{ borderColor: "var(--border)" }}>
                      <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                        Monthly Cashflow Pattern (180 months)
                      </span>
                      <DownloadXlsxButton onClick={() =>
                        exportPatternXlsx(result!, "monthly", activeBranch?.name ?? "cashflow")
                      } />
                    </div>
                    <div className="p-5">
                      <PatternTable result={result} mode="monthly" />
                    </div>
                  </div>
                )}
              </main>
            </>
          )}
        </>
      )}
    </div>
  );
}
