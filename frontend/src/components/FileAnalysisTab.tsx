"use client";

import { useState, useMemo } from "react";
import type { Triangle, FileData } from "@/types/triangle";
import type { Branch, Period } from "@/types/project";
import { formatNumber } from "@/lib/api";
import { useProject } from "@/lib/project-store";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend,
} from "recharts";

interface Props {
  triangle: Triangle | null;
  fileData: FileData | null | undefined;
  excludedCells: Set<string>;
}

const TOOLTIP_STYLE = {
  backgroundColor: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  fontSize: 11,
  color: "var(--foreground)",
};

function devDate(origin: string, step: number, tri: Triangle): string {
  const age = tri.development_periods[step];
  if (tri.origin_granularity === "yearly") {
    const oy = parseInt(origin, 10);
    if (tri.development_granularity === "quarterly") {
      const q = oy * 4 + age;
      return `${Math.floor(q / 4)}Q${(q % 4) + 1}`;
    }
    return String(oy + age);
  }
  const [yr, qt] = origin.split("Q");
  const oq = parseInt(yr, 10) * 4 + parseInt(qt || "1", 10) - 1;
  if (tri.development_granularity === "quarterly") {
    const q = oq + age;
    return `${Math.floor(q / 4)}Q${(q % 4) + 1}`;
  }
  return String(parseInt(yr, 10) + age);
}

function lastDate(orig: string, tri: Triangle): string {
  const idx = tri.origin_periods.indexOf(orig);
  for (let s = tri.development_periods.length - 1; s >= 0; s--) {
    if (tri.values[idx]?.[s] != null) return devDate(orig, s, tri);
  }
  return "";
}

function lastDiagFiles(tri: Triangle, fd: FileData): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = {};
  for (const orig of tri.origin_periods) {
    const d = lastDate(orig, tri);
    if (d) result[orig] = fd[orig]?.[d] ?? {};
  }
  return result;
}

function lastDiagTotals(tri: Triangle, fd: FileData): Record<string, number> {
  const diagFiles = lastDiagFiles(tri, fd);
  const result: Record<string, number> = {};
  for (const [orig, files] of Object.entries(diagFiles)) {
    result[orig] = Object.values(files).reduce((s, v) => s + v, 0);
  }
  return result;
}

function pct(n: number, d = 1) {
  return (n * 100).toFixed(d) + "%";
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function FileAnalysisTab({ triangle, fileData }: Props) {
  const [tab, setTab] = useState<"stats" | "largeloss" | "devt" | "compare">("stats");
  const { project, activePeriod, activeBranch } = useProject();

  if (!fileData || !triangle) {
    return (
      <div className="card p-8 text-center text-sm text-[color:var(--muted)]">
        Bu branş dosya kırılımlı veri içermiyor. DOSYA_NO kolonu içeren Excel yükleyin.
      </div>
    );
  }

  // Previous periods (chronologically before active period) that have matching branches with fileData
  const prevPeriodBranches = useMemo((): { period: Period; branch: Branch }[] => {
    if (!activePeriod) return [];
    const periodOrder = (label: string): number => {
      const m = label.match(/^(\d{4})(?:[Qq](\d))?/);
      if (!m) return 0;
      return parseInt(m[1], 10) * 4 + (m[2] ? parseInt(m[2], 10) : 0);
    };
    const sorted = [...project.periods].sort((a, b) => periodOrder(a.label) - periodOrder(b.label));
    const activeIdx = sorted.findIndex(p => p.id === activePeriod.id);
    if (activeIdx <= 0) return [];
    const prevPeriods = sorted.slice(0, activeIdx);
    const result: { period: Period; branch: Branch }[] = [];
    for (const period of [...prevPeriods].reverse()) { // most recent first
      for (const branch of period.branches) {
        if (branch.frequency === activeBranch?.frequency && branch.fileData && branch.triangle) {
          result.push({ period, branch });
        }
      }
    }
    return result;
  }, [project.periods, activePeriod, activeBranch?.frequency]);

  const TABS = [
    { id: "stats", label: "İstatistikler" },
    { id: "largeloss", label: "Büyük Hasar" },
    { id: "devt", label: "Dosya Gelişimi" },
    { id: "compare", label: `Runoff${prevPeriodBranches.length ? ` (${prevPeriodBranches.length})` : ""}` },
  ] as const;

  return (
    <div className="space-y-4">
      <div className="flex gap-1 flex-wrap">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={
              "px-3 py-1.5 rounded-md text-xs font-medium transition " +
              (tab === t.id
                ? "bg-[color:var(--primary)] text-white"
                : "bg-[color:var(--surface-alt)] text-[color:var(--muted-strong)] hover:text-[color:var(--foreground)]")
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "stats" && <StatsTab triangle={triangle} fileData={fileData} />}
      {tab === "largeloss" && <LargeLossTab triangle={triangle} fileData={fileData} />}
      {tab === "devt" && <DevelopmentTab triangle={triangle} fileData={fileData} />}
      {tab === "compare" && (
        <CompareTab
          triangle={triangle}
          fileData={fileData}
          activeBranchName={activeBranch?.name ?? ""}
          prevPeriodBranches={prevPeriodBranches}
        />
      )}
    </div>
  );
}

// ── 1. İstatistikler ──────────────────────────────────────────────────────────

function StatsTab({ triangle, fileData }: { triangle: Triangle; fileData: FileData }) {
  const diagFiles = useMemo(() => lastDiagFiles(triangle, fileData), [triangle, fileData]);

  const stats = useMemo(() => triangle.origin_periods.map(orig => {
    const files = Object.entries(diagFiles[orig] ?? {}).sort(([, a], [, b]) => b - a);
    const vals = files.map(([, v]) => v).filter(v => v > 0);
    const total = vals.reduce((s, v) => s + v, 0);
    const avg = vals.length ? total / vals.length : 0;
    const sorted = [...vals].sort((a, b) => a - b);
    const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
    const stddev = vals.length > 1
      ? Math.sqrt(vals.reduce((s, v) => s + (v - avg) ** 2, 0) / vals.length)
      : 0;
    const cov = avg > 0 ? stddev / avg : 0;
    const top1 = files[0]?.[1] ?? 0;
    const top3 = files.slice(0, 3).reduce((s, [, v]) => s + v, 0);
    return {
      orig, total, nFiles: vals.length, avg, median, cov,
      top1Pct: total > 0 ? top1 / total : 0,
      top3Pct: total > 0 ? top3 / total : 0,
    };
  }).filter(s => s.nFiles > 0), [triangle.origin_periods, diagFiles]);

  const portfolio = stats.reduce((s, o) => s + o.total, 0);
  const totalFiles = stats.reduce((s, o) => s + o.nFiles, 0);
  const maxTop1 = Math.max(0, ...stats.map(o => o.top1Pct));

  const barData = stats.map(s => ({ name: s.orig, total: Math.round(s.total / 1000) }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="Toplam Portföy" value={formatNumber(portfolio)} sub="son diagonal" />
        <KpiCard label="Toplam Dosya" value={String(totalFiles)} sub="son diagonal" />
        <KpiCard label="En Yüksek Top-1 Payı" value={pct(maxTop1)} accent={maxTop1 > 0.5} />
      </div>

      <div className="card p-4">
        <div className="text-xs font-semibold mb-3">Son Diagonal — Kaza Yılı (bin TL)</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={barData} margin={{ top: 4, right: 8, left: 0, bottom: 20 }}>
            <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" interval={0} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${v}k`} />
            <Tooltip
              formatter={(v: unknown) => [`${Number(v ?? 0).toLocaleString("tr-TR")}k TL`]}
              contentStyle={TOOLTIP_STYLE}
            />
            <Bar dataKey="total" fill="var(--primary)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs tabular">
            <thead>
              <tr className="border-b text-[10px] uppercase tracking-wide text-[color:var(--muted-strong)] bg-[color:var(--surface-alt)]">
                <th className="text-left px-3 py-2">Kaza Yılı</th>
                <th className="text-right px-3 py-2">Toplam</th>
                <th className="text-right px-3 py-2">Dosya</th>
                <th className="text-right px-3 py-2">Ortalama</th>
                <th className="text-right px-3 py-2">Medyan</th>
                <th className="text-right px-3 py-2">CoV</th>
                <th className="text-right px-3 py-2">Top-1 Payı</th>
                <th className="text-right px-3 py-2">Top-3 Payı</th>
              </tr>
            </thead>
            <tbody>
              {stats.map(s => (
                <tr key={s.orig} className="border-t hover:bg-[color:var(--surface-alt)]/40">
                  <td className="px-3 py-1.5 font-medium">{s.orig}</td>
                  <td className="text-right px-3 py-1.5">{formatNumber(s.total)}</td>
                  <td className="text-right px-3 py-1.5 text-[color:var(--muted)]">{s.nFiles}</td>
                  <td className="text-right px-3 py-1.5">{formatNumber(s.avg)}</td>
                  <td className="text-right px-3 py-1.5 text-[color:var(--muted)]">{formatNumber(s.median)}</td>
                  <td className={`text-right px-3 py-1.5 font-medium ${s.cov > 1.5 ? "text-[color:var(--danger)]" : s.cov > 1 ? "text-[color:var(--warning,#f59e0b)]" : "text-[color:var(--muted)]"}`}>
                    {s.cov.toFixed(2)}
                  </td>
                  <td className={`text-right px-3 py-1.5 font-medium ${s.top1Pct > 0.5 ? "text-[color:var(--danger)]" : s.top1Pct > 0.3 ? "text-[color:var(--warning,#f59e0b)]" : ""}`}>
                    {pct(s.top1Pct)}
                  </td>
                  <td className="text-right px-3 py-1.5 text-[color:var(--muted)]">{pct(s.top3Pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── 2. Büyük Hasar ────────────────────────────────────────────────────────────

function LargeLossTab({ triangle, fileData }: { triangle: Triangle; fileData: FileData }) {
  const [topN, setTopN] = useState(20);
  const diagFiles = useMemo(() => lastDiagFiles(triangle, fileData), [triangle, fileData]);

  const allFiles = useMemo(() => {
    const result: { orig: string; dosya: string; val: number; originTotal: number }[] = [];
    for (const orig of triangle.origin_periods) {
      const files = diagFiles[orig] ?? {};
      const originTotal = Object.values(files).reduce((s, v) => s + v, 0);
      for (const [dosya, val] of Object.entries(files)) {
        if (val > 0) result.push({ orig, dosya, val, originTotal });
      }
    }
    return result.sort((a, b) => b.val - a.val);
  }, [triangle.origin_periods, diagFiles]);

  const portfolioTotal = allFiles.reduce((s, f) => s + f.val, 0);
  const largeFiles = allFiles.slice(0, topN);
  const largeTotal = largeFiles.reduce((s, f) => s + f.val, 0);

  // Per-origin: large (top 10% of files) vs rest
  const byOrigin = useMemo(() => triangle.origin_periods.map(orig => {
    const vals = Object.values(diagFiles[orig] ?? {}).filter(v => v > 0).sort((a, b) => b - a);
    const total = vals.reduce((s, v) => s + v, 0);
    if (!total) return null;
    const largeCount = Math.max(1, Math.ceil(vals.length * 0.1));
    const large = vals.slice(0, largeCount).reduce((s, v) => s + v, 0);
    return { name: orig, "Büyük Hasar": Math.round(large / 1000), "Diğer": Math.round((total - large) / 1000) };
  }).filter(Boolean), [triangle.origin_periods, diagFiles]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="En Büyük Dosya" value={formatNumber(allFiles[0]?.val ?? 0)} sub={allFiles[0]?.orig} />
        <KpiCard
          label={`Top ${topN} Toplam`}
          value={formatNumber(largeTotal)}
          sub={portfolioTotal > 0 ? `Portföyün ${pct(largeTotal / portfolioTotal)}'si` : undefined}
        />
        <KpiCard label="Toplam Dosya" value={String(allFiles.length)} />
      </div>

      <div className="card p-4">
        <div className="text-xs font-semibold mb-3">Kaza Yılı Bazlı — En Büyük %10 vs Diğer (bin TL)</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={byOrigin} margin={{ top: 4, right: 8, left: 0, bottom: 20 }}>
            <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" interval={0} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${v}k`} />
            <Tooltip
              formatter={(v: unknown) => [`${Number(v ?? 0).toLocaleString("tr-TR")}k TL`]}
              contentStyle={TOOLTIP_STYLE}
            />
            <Legend iconSize={10} wrapperStyle={{ fontSize: 10 }} />
            <Bar dataKey="Büyük Hasar" stackId="a" fill="#ef4444" />
            <Bar dataKey="Diğer" stackId="a" fill="#d1d5db" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-2.5 border-b bg-[color:var(--surface-alt)] text-xs font-semibold flex items-center gap-3">
          <span>En Büyük Dosyalar</span>
          <div className="flex items-center gap-1.5 ml-auto">
            {[10, 20, 50].map(n => (
              <button key={n} onClick={() => setTopN(n)}
                className={`px-2 py-0.5 rounded text-[10px] font-medium ${topN === n ? "bg-[color:var(--primary)] text-white" : "bg-[color:var(--surface)] text-[color:var(--muted-strong)]"}`}
              >{n}</button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs tabular">
            <thead>
              <tr className="border-b text-[10px] uppercase tracking-wide text-[color:var(--muted-strong)] bg-[color:var(--surface-alt)]">
                <th className="text-right px-3 py-2">#</th>
                <th className="text-left px-3 py-2">Dosya No</th>
                <th className="text-left px-3 py-2">Kaza Yılı</th>
                <th className="text-right px-3 py-2">Değer</th>
                <th className="text-right px-3 py-2">Portföy Payı</th>
                <th className="text-right px-3 py-2">Kaza Yılı Payı</th>
              </tr>
            </thead>
            <tbody>
              {largeFiles.map((f, i) => (
                <tr key={`${f.orig}-${f.dosya}-${i}`} className="border-t hover:bg-[color:var(--surface-alt)]/40">
                  <td className="text-right px-3 py-1.5 text-[color:var(--muted)]">{i + 1}</td>
                  <td className="px-3 py-1.5 font-mono">{f.dosya}</td>
                  <td className="px-3 py-1.5 text-[color:var(--muted)]">{f.orig}</td>
                  <td className="text-right px-3 py-1.5 font-medium">{formatNumber(f.val)}</td>
                  <td className="text-right px-3 py-1.5">{portfolioTotal > 0 ? pct(f.val / portfolioTotal) : "—"}</td>
                  <td className={`text-right px-3 py-1.5 font-medium ${f.originTotal > 0 && f.val / f.originTotal > 0.5 ? "text-[color:var(--danger)]" : f.originTotal > 0 && f.val / f.originTotal > 0.3 ? "text-[color:var(--warning,#f59e0b)]" : "text-[color:var(--muted)]"}`}>
                    {f.originTotal > 0 ? pct(f.val / f.originTotal) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── 3. Dosya Gelişimi ─────────────────────────────────────────────────────────

const DEV_COLORS = [
  "var(--primary)", "#10b981", "#f59e0b", "#ef4444",
  "#8b5cf6", "#06b6d4", "#f97316", "#84cc16", "#ec4899", "#14b8a6",
];

function DevelopmentTab({ triangle, fileData }: { triangle: Triangle; fileData: FileData }) {
  const { project, activeBranch } = useProject();
  const origins = triangle.origin_periods;
  const [showTopN, setShowTopN] = useState(5);

  const parsePeriodLabel = (s: string): number => {
    const m = s.match(/^(\d{4})(?:[Qq](\d))?/);
    return m ? parseInt(m[1], 10) * 4 + (m[2] ? parseInt(m[2], 10) : 0) : 0;
  };

  // All periods sorted by label, each with the matching branch (same frequency + fileData)
  const periodSnapshots = useMemo(() => {
    const freq = activeBranch?.frequency;
    return [...project.periods]
      .sort((a, b) => parsePeriodLabel(a.label) - parsePeriodLabel(b.label))
      .flatMap(period => {
        const branch = period.branches.find(
          b => b.frequency === freq && b.fileData && b.triangle
        );
        if (!branch) return [];
        return [{ label: period.label, triangle: branch.triangle!, fileData: branch.fileData! }];
      });
  }, [project.periods, activeBranch?.frequency]);

  // For each period snapshot, get last diagonal total per origin
  const byPeriod = useMemo(() =>
    periodSnapshots.map(snap => {
      const totals = lastDiagTotals(snap.triangle, snap.fileData);
      const files = lastDiagFiles(snap.triangle, snap.fileData);
      return { label: snap.label, totals, files };
    }),
    [periodSnapshots]
  );

  // Which origins to show in chart — top N by latest period total
  const latestTotals = byPeriod[byPeriod.length - 1]?.totals ?? {};
  const topOrigins = useMemo(() =>
    [...origins]
      .filter(o => latestTotals[o] > 0)
      .sort((a, b) => (latestTotals[b] ?? 0) - (latestTotals[a] ?? 0))
      .slice(0, showTopN),
    [origins, latestTotals, showTopN]
  );

  // Chart data: one row per period
  const chartData = byPeriod.map(snap => {
    const row: Record<string, number | string> = { date: snap.label };
    for (const orig of topOrigins) {
      const v = snap.totals[orig];
      if (v != null && v > 0) row[orig] = Math.round(v / 1000);
    }
    return row;
  });

  // Table: all origins that have any data across periods
  const tableOrigins = origins.filter(o => byPeriod.some(snap => (snap.totals[o] ?? 0) > 0));

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="text-xs font-semibold">Kaza Yılı Bazlı Gelişim (bin TL)</div>
          <div className="flex items-center gap-1.5 ml-auto text-[10px] text-[color:var(--muted)]">
            Göster:
            {[3, 5, 8, 10].map(n => (
              <button key={n} onClick={() => setShowTopN(n)}
                className={`px-2 py-0.5 rounded font-medium ${showTopN === n ? "bg-[color:var(--primary)] text-white" : "bg-[color:var(--surface-alt)] text-[color:var(--muted-strong)]"}`}
              >Top {n}</button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 20 }}>
            <XAxis
              dataKey="date"
              tick={{ fontSize: 9 }}
              angle={-45}
              textAnchor="end"
              interval={Math.max(0, Math.floor(chartData.length / 16) - 1)}
            />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${v}k`} />
            <Tooltip
              formatter={(v: unknown, name: unknown) => [`${Number(v ?? 0).toLocaleString("tr-TR")}k TL`, String(name)]}
              contentStyle={TOOLTIP_STYLE}
            />
            <Legend iconSize={10} wrapperStyle={{ fontSize: 10 }} />
            {topOrigins.map((orig, i) => (
              <Line
                key={orig}
                type="monotone"
                dataKey={orig}
                stroke={DEV_COLORS[i % DEV_COLORS.length]}
                strokeWidth={1.5}
                dot={false}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-2.5 border-b bg-[color:var(--surface-alt)] text-xs font-semibold">
          Rapor Dönemi × Kaza Yılı — Son Diagonal Toplam
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs tabular">
            <thead>
              <tr className="border-b text-[10px] uppercase tracking-wide text-[color:var(--muted-strong)] bg-[color:var(--surface-alt)]">
                <th className="text-left px-3 py-2 sticky left-0 bg-[color:var(--surface-alt)]">Kaza Yılı</th>
                {byPeriod.map(snap => (
                  <th key={snap.label} className="text-right px-3 py-2">{snap.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableOrigins.map(o => (
                <tr key={o} className="border-t hover:bg-[color:var(--surface-alt)]/40">
                  <td className="px-3 py-1.5 font-medium sticky left-0 bg-[color:var(--surface)]">{o}</td>
                  {byPeriod.map(snap => {
                    const v = snap.totals[o];
                    return (
                      <td key={snap.label} className="text-right px-3 py-1.5 text-[color:var(--muted)]">
                        {v != null && v > 0 ? formatNumber(v) : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── 4. Runoff ─────────────────────────────────────────────────────────────────

function CompareTab({
  triangle, fileData, activeBranchName, prevPeriodBranches,
}: {
  triangle: Triangle;
  fileData: FileData;
  activeBranchName: string;
  prevPeriodBranches: { period: Period; branch: Branch }[];
}) {
  // Default: same-name branch from most recent previous period; fall back to first available
  const defaultId = useMemo(() => {
    const sameName = prevPeriodBranches.find(x => x.branch.name === activeBranchName);
    return (sameName ?? prevPeriodBranches[0])?.branch.id ?? "";
  }, [prevPeriodBranches, activeBranchName]);

  const [compareId, setCompareId] = useState(defaultId);
  // Sync default when it changes (e.g., navigating between branches)
  const effectiveId = prevPeriodBranches.some(x => x.branch.id === compareId) ? compareId : defaultId;
  const compareEntry = prevPeriodBranches.find(x => x.branch.id === effectiveId);
  const compareBranch = compareEntry?.branch;

  const currTotals = useMemo(() => lastDiagTotals(triangle, fileData), [triangle, fileData]);
  const currFiles = useMemo(() => lastDiagFiles(triangle, fileData), [triangle, fileData]);

  const compTotals = useMemo(() =>
    compareBranch?.triangle && compareBranch.fileData
      ? lastDiagTotals(compareBranch.triangle, compareBranch.fileData)
      : {},
    [compareBranch]
  );
  const compFiles = useMemo(() =>
    compareBranch?.triangle && compareBranch.fileData
      ? lastDiagFiles(compareBranch.triangle, compareBranch.fileData)
      : {},
    [compareBranch]
  );

  const rows = useMemo(() => {
    const allOrigins = [...new Set([...Object.keys(currTotals), ...Object.keys(compTotals)])].sort();
    return allOrigins.map(orig => {
      const curr = currTotals[orig] ?? 0;
      const comp = compTotals[orig] ?? 0;
      const delta = curr - comp;
      const deltaPct = comp > 0 ? delta / comp : null;
      const currN = Object.values(currFiles[orig] ?? {}).filter(v => v > 0).length;
      const compN = Object.values(compFiles[orig] ?? {}).filter(v => v > 0).length;
      const currSet = new Set(Object.keys(currFiles[orig] ?? {}));
      const compSet = new Set(Object.keys(compFiles[orig] ?? {}));
      const newFiles = [...currSet].filter(k => !compSet.has(k)).length;
      const closedFiles = [...compSet].filter(k => !currSet.has(k)).length;
      return { orig, curr, comp, delta, deltaPct, currN, compN, newFiles, closedFiles };
    });
  }, [currTotals, compTotals, currFiles, compFiles]);

  const totalCurr = rows.reduce((s, r) => s + r.curr, 0);
  const totalComp = rows.reduce((s, r) => s + r.comp, 0);
  const totalDelta = totalCurr - totalComp;

  const barData = rows
    .filter(r => r.curr > 0 || r.comp > 0)
    .map(r => ({
      name: r.orig,
      "Güncel": Math.round(r.curr / 1000),
      "Karşılaştırma": Math.round(r.comp / 1000),
    }));

  if (!prevPeriodBranches.length) {
    return (
      <div className="card p-8 text-center text-xs text-[color:var(--muted)]">
        Önceki dönemde aynı frekansta dosya bazlı Excel yüklenmiş branş bulunamadı.
        Örneğin 2025Q4 döneminde bir branşa dosya bazlı Excel yüklerseniz, 2026Q1&apos;den bu dönem otomatik karşılaştırma seçeneği olarak görünür.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="label">Karşılaştırma Branşı</div>
        <select value={effectiveId} onChange={e => setCompareId(e.target.value)} className="input-base">
          {prevPeriodBranches.map(({ period, branch }) => (
            <option key={branch.id} value={branch.id}>
              {period.label} — {branch.name}{branch.triangleFileName ? ` (${branch.triangleFileName})` : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="Güncel Toplam" value={formatNumber(totalCurr)} />
        <KpiCard label="Karşılaştırma Toplam" value={formatNumber(totalComp)} sub={compareBranch?.name} />
        <KpiCard
          label="Toplam Değişim"
          value={(totalDelta >= 0 ? "+" : "") + formatNumber(totalDelta)}
          sub={totalComp > 0 ? pct(totalDelta / totalComp) : ""}
          accent={totalComp > 0 && Math.abs(totalDelta / totalComp) > 0.1}
        />
      </div>

      {barData.length > 0 && (
        <div className="card p-4">
          <div className="text-xs font-semibold mb-3">Kaza Yılı Karşılaştırması (bin TL)</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={barData} margin={{ top: 4, right: 8, left: 0, bottom: 20 }}>
              <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" interval={0} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${v}k`} />
              <Tooltip
                formatter={(v: unknown) => [`${Number(v ?? 0).toLocaleString("tr-TR")}k TL`]}
                contentStyle={TOOLTIP_STYLE}
              />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="Güncel" fill="var(--primary)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Karşılaştırma" fill="#d1d5db" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs tabular">
            <thead>
              <tr className="border-b text-[10px] uppercase tracking-wide text-[color:var(--muted-strong)] bg-[color:var(--surface-alt)]">
                <th className="text-left px-3 py-2">Kaza Yılı</th>
                <th className="text-right px-3 py-2">Güncel</th>
                <th className="text-right px-3 py-2">Karşılaştırma</th>
                <th className="text-right px-3 py-2">Δ</th>
                <th className="text-right px-3 py-2">Δ%</th>
                <th className="text-right px-3 py-2">G. Dosya</th>
                <th className="text-right px-3 py-2">K. Dosya</th>
                <th className="text-right px-3 py-2">Yeni</th>
                <th className="text-right px-3 py-2">Kapanan</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const bigChange = r.deltaPct != null && Math.abs(r.deltaPct) > 0.1;
                return (
                  <tr key={r.orig} className={`border-t hover:bg-[color:var(--surface-alt)]/40 ${bigChange ? "bg-orange-50/20" : ""}`}>
                    <td className="px-3 py-1.5 font-medium">{r.orig}</td>
                    <td className="text-right px-3 py-1.5">{r.curr > 0 ? formatNumber(r.curr) : "—"}</td>
                    <td className="text-right px-3 py-1.5 text-[color:var(--muted)]">{r.comp > 0 ? formatNumber(r.comp) : "—"}</td>
                    <td className={`text-right px-3 py-1.5 font-medium ${r.delta > 0 ? "text-[color:var(--danger)]" : r.delta < 0 ? "text-green-600" : "text-[color:var(--muted)]"}`}>
                      {r.delta !== 0 ? (r.delta > 0 ? "+" : "") + formatNumber(r.delta) : "—"}
                    </td>
                    <td className={`text-right px-3 py-1.5 font-medium ${bigChange ? (r.delta > 0 ? "text-[color:var(--danger)]" : "text-green-600") : "text-[color:var(--muted)]"}`}>
                      {r.deltaPct != null ? (r.deltaPct > 0 ? "+" : "") + pct(r.deltaPct) : "—"}
                    </td>
                    <td className="text-right px-3 py-1.5 text-[color:var(--muted)]">{r.currN || "—"}</td>
                    <td className="text-right px-3 py-1.5 text-[color:var(--muted)]">{r.compN || "—"}</td>
                    <td className={`text-right px-3 py-1.5 ${r.newFiles > 0 ? "text-green-600 font-medium" : "text-[color:var(--muted)]"}`}>
                      {r.newFiles > 0 ? `+${r.newFiles}` : "—"}
                    </td>
                    <td className={`text-right px-3 py-1.5 ${r.closedFiles > 0 ? "text-[color:var(--muted-strong)]" : "text-[color:var(--muted)]"}`}>
                      {r.closedFiles > 0 ? `-${r.closedFiles}` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[color:var(--primary)] bg-[color:var(--primary-soft)] font-semibold">
                <td className="px-3 py-1.5 text-[color:var(--primary)]">Toplam</td>
                <td className="text-right px-3 py-1.5">{formatNumber(totalCurr)}</td>
                <td className="text-right px-3 py-1.5">{formatNumber(totalComp)}</td>
                <td className={`text-right px-3 py-1.5 ${totalDelta > 0 ? "text-[color:var(--danger)]" : totalDelta < 0 ? "text-green-600" : ""}`}>
                  {(totalDelta > 0 ? "+" : "") + formatNumber(totalDelta)}
                </td>
                <td className="text-right px-3 py-1.5">
                  {totalComp > 0 ? (totalDelta > 0 ? "+" : "") + pct(totalDelta / totalComp) : "—"}
                </td>
                <td colSpan={4} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Shared ────────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`card p-3 ${accent ? "border-[color:var(--danger)] border" : ""}`}>
      <div className="text-[10px] uppercase tracking-wide font-semibold text-[color:var(--muted-strong)] mb-0.5">{label}</div>
      <div className={`text-lg font-semibold tabular ${accent ? "text-[color:var(--danger)]" : ""}`}>{value}</div>
      {sub && <div className="text-[11px] text-[color:var(--muted)] mt-0.5">{sub}</div>}
    </div>
  );
}
