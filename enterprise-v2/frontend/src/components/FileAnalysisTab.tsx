"use client";

import { useState, useMemo } from "react";
import type { Triangle, FileData, FileLeaf } from "@/types/triangle";
import { filePaid, fileOs } from "@/types/triangle";
import type { Branch, Period } from "@/types/project";
import { formatNumber } from "@/lib/api";
import { useProject } from "@/lib/project-store";
import { sameBranchName } from "@/lib/branch-identity";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, Cell,
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

const PAID_COLOR = "var(--primary)";
const OS_COLOR = "#f59e0b"; // muallak (outstanding)

// ── Metric (ödeme / muallak / hasar) ──────────────────────────────────────────
type Metric = "inc" | "p" | "o";
const METRIC_LABEL: Record<Metric, string> = { inc: "Incurred", p: "Paid", o: "Outstanding" };
function metricOf(v: FileVal, m: Metric): number {
  return m === "p" ? v.p : m === "o" ? v.o : v.inc;
}

// ── Dev-dönemi sıralama (fd anahtarları: "2023" | "2023Q2") ────────────────────
function devSeq(label: string): number {
  const m = label.match(/^(\d{4})(?:[Qq]?(\d))?/);
  return m ? parseInt(m[1], 10) * 4 + (m[2] ? parseInt(m[2], 10) : 0) : -1;
}

interface FileVal { p: number; o: number; inc: number }

/**
 * Her origin için GÜNCEL dosya durumu: fd'de o origin'in EN SON (max dev) hücresi.
 * Bu hücre kümülatif olduğundan o origin'de görülen TÜM dosyaları içerir — üçgenin
 * son köşegen tarihi fd'de anahtar olmayabildiği için `lastDate` yerine bunu kullan
 * (eski kod bazı dosyaları kaçırıyordu). Sadece-muallaklı (ödeme=0) dosyalar da gelir.
 */
function snapshotByOrigin(
  fd: FileData,
  origins: string[],
): Record<string, Record<string, FileVal>> {
  const out: Record<string, Record<string, FileVal>> = {};
  for (const orig of origins) {
    const byDate = fd[orig];
    if (!byDate) { out[orig] = {}; continue; }
    let bestKey = ""; let bestSeq = -Infinity;
    for (const d of Object.keys(byDate)) {
      const s = devSeq(d);
      if (s >= bestSeq) { bestSeq = s; bestKey = d; }
    }
    const cell = byDate[bestKey] ?? {};
    const m: Record<string, FileVal> = {};
    for (const [dosya, leaf] of Object.entries(cell as Record<string, FileLeaf>)) {
      const p = filePaid(leaf); const o = fileOs(leaf);
      m[dosya] = { p, o, inc: p + o };
    }
    out[orig] = m;
  }
  return out;
}

function originTotals(snap: Record<string, Record<string, FileVal>>, m: Metric): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [orig, files] of Object.entries(snap)) {
    out[orig] = Object.values(files).reduce((s, v) => s + metricOf(v, m), 0);
  }
  return out;
}

// ── İstatistik yardımcıları ───────────────────────────────────────────────────
function quantile(sortedAsc: number[], q: number): number {
  if (!sortedAsc.length) return 0;
  const pos = (sortedAsc.length - 1) * q;
  const lo = Math.floor(pos); const hi = Math.ceil(pos);
  return lo === hi ? sortedAsc[lo] : sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (pos - lo);
}
function coefVar(vals: number[]): number {
  if (vals.length < 2) return 0;
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  if (mean <= 0) return 0;
  const varc = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
  return Math.sqrt(varc) / mean;
}
/** Gini konsantrasyon katsayısı (0 = eşit, 1 = tek dosyada toplanmış). */
function gini(vals: number[]): number {
  const x = vals.filter(v => v > 0).sort((a, b) => a - b);
  const n = x.length;
  if (n < 2) return 0;
  const total = x.reduce((s, v) => s + v, 0);
  if (total <= 0) return 0;
  let idxSum = 0;
  for (let i = 0; i < n; i++) idxSum += (i + 1) * x[i];
  return (2 * idxSum) / (n * total) - (n + 1) / n;
}

function pct(n: number, d = 1) { return (n * 100).toFixed(d) + "%"; }
function shortNum(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (a >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (a >= 1e3) return Math.round(n / 1e3) + "k";
  return Math.round(n).toString();
}

// ── Legacy helpers (Development / Runoff tab'ları — paid davranışını korur) ─────
function lastDiagTotals(tri: Triangle, fd: FileData): Record<string, number> {
  const snap = snapshotByOrigin(fd, tri.origin_periods);
  return originTotals(snap, "p");
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function FileAnalysisTab({ triangle, fileData }: Props) {
  const [tab, setTab] = useState<"stats" | "largeloss" | "devt" | "compare">("stats");
  const { project, activePeriod, activeBranch } = useProject();

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
    for (const period of [...prevPeriods].reverse()) {
      for (const branch of period.branches) {
        if (branch.frequency === activeBranch?.frequency && branch.fileData && branch.triangle) {
          result.push({ period, branch });
        }
      }
    }
    return result;
  }, [project.periods, activePeriod, activeBranch?.frequency]);

  if (!fileData || !triangle) {
    return (
      <div className="card p-8 text-center text-sm text-[color:var(--muted)]">
        This branch has no file-level breakdown data. Upload an Excel file with a CLAIM_NO column.
      </div>
    );
  }

  const TABS = [
    { id: "stats", label: "Statistics" },
    { id: "largeloss", label: "Large Loss" },
    { id: "devt", label: "File Development" },
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
  const [metric, setMetric] = useState<Metric>("inc");
  const snap = useMemo(() => snapshotByOrigin(fileData, triangle.origin_periods), [fileData, triangle.origin_periods]);

  // Origin bazında paid/os/incurred + severity istatistikleri (seçili metrik).
  const stats = useMemo(() => triangle.origin_periods.map(orig => {
    const files = Object.values(snap[orig] ?? {});
    const nFiles = files.length;
    const paid = files.reduce((s, v) => s + v.p, 0);
    const os = files.reduce((s, v) => s + v.o, 0);
    const inc = paid + os;
    const mVals = files.map(v => metricOf(v, metric)).filter(v => v > 0).sort((a, b) => a - b);
    const total = mVals.reduce((s, v) => s + v, 0);
    const n = mVals.length;
    const avg = n ? total / n : 0;
    const top1 = mVals[n - 1] ?? 0;
    const top5 = mVals.slice(Math.max(0, n - 5)).reduce((s, v) => s + v, 0);
    return {
      orig, nFiles, paid, os, inc, total,
      pctPaid: inc > 0 ? paid / inc : 0,
      avg, median: quantile(mVals, 0.5), p90: quantile(mVals, 0.9),
      cov: coefVar(mVals),
      top1Pct: total > 0 ? top1 / total : 0,
      top5Pct: total > 0 ? top5 / total : 0,
    };
  }).filter(s => s.nFiles > 0), [triangle.origin_periods, snap, metric]);

  // Portföy geneli
  const allFiles = useMemo(() => Object.values(snap).flatMap(f => Object.values(f)), [snap]);
  const totPaid = allFiles.reduce((s, v) => s + v.p, 0);
  const totOs = allFiles.reduce((s, v) => s + v.o, 0);
  const totInc = totPaid + totOs;
  const totalFiles = allFiles.length;
  const metricVals = allFiles.map(v => metricOf(v, metric)).filter(v => v > 0);
  const g = gini(metricVals);

  // Grafik 1: kaza yılı bazında Ödeme vs Muallak (kırılım)
  const splitData = stats.map(s => ({
    name: s.orig,
    Paid: Math.round(s.paid / 1000),
    Outstanding: Math.round(s.os / 1000),
  }));

  // Grafik 2: severity dağılımı (log-binned) — seçili metrik
  const hist = useMemo(() => histogram(metricVals, 8), [metricVals]);

  return (
    <div className="space-y-4">
      {/* Metrik seçici */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-[color:var(--muted-strong)] font-medium">Severity metric:</span>
        <div className="flex rounded-md overflow-hidden border border-[color:var(--border)]">
          {(["inc", "p", "o"] as Metric[]).map(m => (
            <button key={m} onClick={() => setMetric(m)}
              className={`px-2.5 py-1 text-[11px] font-medium transition ${metric === m ? "bg-[color:var(--primary)] text-white" : "bg-[color:var(--surface)] text-[color:var(--muted-strong)]"}`}
            >{METRIC_LABEL[m]}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <KpiCard label="Total Incurred" value={formatNumber(totInc)} sub={`Paid ${pct(totInc > 0 ? totPaid / totInc : 0, 0)}`} />
        <KpiCard label="Outstanding" value={formatNumber(totOs)} sub="reserve (muallak)" />
        <KpiCard label="Total Files" value={String(totalFiles)} sub="incl. reserve-only" />
        <KpiCard label="Concentration (Gini)" value={g.toFixed(2)} sub={METRIC_LABEL[metric]} accent={g > 0.7} />
      </div>

      <div className="card p-4">
        <div className="text-xs font-semibold mb-3">Paid vs Outstanding by Accident Year (000s)</div>
        <ResponsiveContainer width="100%" height={210}>
          <BarChart data={splitData} margin={{ top: 4, right: 8, left: 0, bottom: 20 }}>
            <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" interval={0} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${v}k`} />
            <Tooltip formatter={(v: unknown, n: unknown) => [`${Number(v ?? 0).toLocaleString("tr-TR")}k TL`, String(n)]} contentStyle={TOOLTIP_STYLE} />
            <Legend iconSize={10} wrapperStyle={{ fontSize: 10 }} />
            <Bar dataKey="Paid" stackId="a" fill={PAID_COLOR} />
            <Bar dataKey="Outstanding" stackId="a" fill={OS_COLOR} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="card p-4">
        <div className="text-xs font-semibold mb-1">Severity Distribution — {METRIC_LABEL[metric]} per Claim</div>
        <div className="text-[10px] text-[color:var(--muted)] mb-2">Log-scaled buckets; how many claims fall in each size band.</div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={hist} margin={{ top: 4, right: 8, left: 0, bottom: 24 }}>
            <XAxis dataKey="range" tick={{ fontSize: 9 }} angle={-30} textAnchor="end" interval={0} />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
            <Tooltip formatter={(v: unknown) => [`${Number(v ?? 0)} claims`]} contentStyle={TOOLTIP_STYLE} />
            <Bar dataKey="count" fill={metric === "o" ? OS_COLOR : PAID_COLOR} radius={[3, 3, 0, 0]}>
              {hist.map((_, i) => <Cell key={i} fill={i >= hist.length - 2 ? "#ef4444" : (metric === "o" ? OS_COLOR : PAID_COLOR)} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-2.5 border-b bg-[color:var(--surface-alt)] text-xs font-semibold">
          Per Accident Year — Paid/Outstanding split & {METRIC_LABEL[metric]} severity
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs tabular">
            <thead>
              <tr className="border-b text-[10px] uppercase tracking-wide text-[color:var(--muted-strong)] bg-[color:var(--surface-alt)]">
                <th className="text-left px-3 py-2">Accident Year</th>
                <th className="text-right px-3 py-2">Files</th>
                <th className="text-right px-3 py-2">Paid</th>
                <th className="text-right px-3 py-2">Outstanding</th>
                <th className="text-right px-3 py-2">% Paid</th>
                <th className="text-right px-3 py-2">Mean</th>
                <th className="text-right px-3 py-2">Median</th>
                <th className="text-right px-3 py-2">P90</th>
                <th className="text-right px-3 py-2">CoV</th>
                <th className="text-right px-3 py-2">Top-1</th>
                <th className="text-right px-3 py-2">Top-5</th>
              </tr>
            </thead>
            <tbody>
              {stats.map(s => (
                <tr key={s.orig} className="border-t hover:bg-[color:var(--surface-alt)]/40">
                  <td className="px-3 py-1.5 font-medium">{s.orig}</td>
                  <td className="text-right px-3 py-1.5 text-[color:var(--muted)]">{s.nFiles}</td>
                  <td className="text-right px-3 py-1.5">{formatNumber(s.paid)}</td>
                  <td className="text-right px-3 py-1.5 text-[color:var(--warning,#f59e0b)]">{formatNumber(s.os)}</td>
                  <td className="text-right px-3 py-1.5 text-[color:var(--muted)]">{pct(s.pctPaid, 0)}</td>
                  <td className="text-right px-3 py-1.5">{formatNumber(s.avg)}</td>
                  <td className="text-right px-3 py-1.5 text-[color:var(--muted)]">{formatNumber(s.median)}</td>
                  <td className="text-right px-3 py-1.5 text-[color:var(--muted)]">{formatNumber(s.p90)}</td>
                  <td className={`text-right px-3 py-1.5 font-medium ${s.cov > 1.5 ? "text-[color:var(--danger)]" : s.cov > 1 ? "text-[color:var(--warning,#f59e0b)]" : "text-[color:var(--muted)]"}`}>
                    {s.cov.toFixed(2)}
                  </td>
                  <td className={`text-right px-3 py-1.5 font-medium ${s.top1Pct > 0.5 ? "text-[color:var(--danger)]" : s.top1Pct > 0.3 ? "text-[color:var(--warning,#f59e0b)]" : ""}`}>
                    {pct(s.top1Pct)}
                  </td>
                  <td className="text-right px-3 py-1.5 text-[color:var(--muted)]">{pct(s.top5Pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/** Pozitif değerlerden log-ölçekli histogram kovaları. */
function histogram(vals: number[], nbins = 8): { range: string; count: number }[] {
  const pos = vals.filter(v => v > 0);
  if (!pos.length) return [];
  const min = Math.min(...pos); const max = Math.max(...pos);
  if (min === max) return [{ range: shortNum(min), count: pos.length }];
  const lo = Math.log10(min); const hi = Math.log10(max);
  const edges = Array.from({ length: nbins + 1 }, (_, i) => 10 ** (lo + (hi - lo) * i / nbins));
  const bins = new Array(nbins).fill(0);
  for (const v of pos) {
    let idx = Math.floor((Math.log10(v) - lo) / (hi - lo) * nbins);
    if (idx >= nbins) idx = nbins - 1; if (idx < 0) idx = 0;
    bins[idx]++;
  }
  return bins.map((c, i) => ({ range: `${shortNum(edges[i])}–${shortNum(edges[i + 1])}`, count: c }));
}

// ── 2. Büyük Hasar ────────────────────────────────────────────────────────────

function LargeLossTab({ triangle, fileData }: { triangle: Triangle; fileData: FileData }) {
  const [topN, setTopN] = useState(20);
  const snap = useMemo(() => snapshotByOrigin(fileData, triangle.origin_periods), [fileData, triangle.origin_periods]);

  // Büyük hasar analizinde metrik = INCURRED (toplam hasar boyutu).
  const allFiles = useMemo(() => {
    const result: { orig: string; dosya: string; inc: number; p: number; o: number; originTotal: number }[] = [];
    for (const orig of triangle.origin_periods) {
      const files = snap[orig] ?? {};
      const originTotal = Object.values(files).reduce((s, v) => s + v.inc, 0);
      for (const [dosya, v] of Object.entries(files)) {
        if (v.inc > 0) result.push({ orig, dosya, inc: v.inc, p: v.p, o: v.o, originTotal });
      }
    }
    return result.sort((a, b) => b.inc - a.inc);
  }, [triangle.origin_periods, snap]);

  const portfolioTotal = allFiles.reduce((s, f) => s + f.inc, 0);
  const largeFiles = allFiles.slice(0, topN);
  const largeTotal = largeFiles.reduce((s, f) => s + f.inc, 0);

  const byOrigin = useMemo(() => triangle.origin_periods.map(orig => {
    const vals = Object.values(snap[orig] ?? {}).map(v => v.inc).filter(v => v > 0).sort((a, b) => b - a);
    const total = vals.reduce((s, v) => s + v, 0);
    if (!total) return null;
    const largeCount = Math.max(1, Math.ceil(vals.length * 0.1));
    const large = vals.slice(0, largeCount).reduce((s, v) => s + v, 0);
    return { name: orig, "Large Loss": Math.round(large / 1000), "Other": Math.round((total - large) / 1000) };
  }).filter(Boolean), [triangle.origin_periods, snap]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="Largest Claim (incurred)" value={formatNumber(allFiles[0]?.inc ?? 0)} sub={allFiles[0]?.orig} />
        <KpiCard
          label={`Top ${topN} Total`}
          value={formatNumber(largeTotal)}
          sub={portfolioTotal > 0 ? `${pct(largeTotal / portfolioTotal)} of portfolio` : undefined}
        />
        <KpiCard label="Total Claims" value={String(allFiles.length)} />
      </div>

      <div className="card p-4">
        <div className="text-xs font-semibold mb-3">By Accident Year — Top 10% vs Other (incurred, 000s)</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={byOrigin} margin={{ top: 4, right: 8, left: 0, bottom: 20 }}>
            <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" interval={0} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${v}k`} />
            <Tooltip formatter={(v: unknown) => [`${Number(v ?? 0).toLocaleString("tr-TR")}k TL`]} contentStyle={TOOLTIP_STYLE} />
            <Legend iconSize={10} wrapperStyle={{ fontSize: 10 }} />
            <Bar dataKey="Large Loss" stackId="a" fill="#ef4444" />
            <Bar dataKey="Other" stackId="a" fill="#d1d5db" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-2.5 border-b bg-[color:var(--surface-alt)] text-xs font-semibold flex items-center gap-3">
          <span>Largest Claims (incurred)</span>
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
                <th className="text-left px-3 py-2">Claim No</th>
                <th className="text-left px-3 py-2">Accident Year</th>
                <th className="text-right px-3 py-2">Incurred</th>
                <th className="text-right px-3 py-2">Paid</th>
                <th className="text-right px-3 py-2">Outstanding</th>
                <th className="text-right px-3 py-2">Acc. Year Share</th>
              </tr>
            </thead>
            <tbody>
              {largeFiles.map((f, i) => (
                <tr key={`${f.orig}-${f.dosya}-${i}`} className="border-t hover:bg-[color:var(--surface-alt)]/40">
                  <td className="text-right px-3 py-1.5 text-[color:var(--muted)]">{i + 1}</td>
                  <td className="px-3 py-1.5 font-mono">{f.dosya}</td>
                  <td className="px-3 py-1.5 text-[color:var(--muted)]">{f.orig}</td>
                  <td className="text-right px-3 py-1.5 font-medium">{formatNumber(f.inc)}</td>
                  <td className="text-right px-3 py-1.5 text-[color:var(--muted)]">{formatNumber(f.p)}</td>
                  <td className="text-right px-3 py-1.5 text-[color:var(--warning,#f59e0b)]">{formatNumber(f.o)}</td>
                  <td className={`text-right px-3 py-1.5 font-medium ${f.originTotal > 0 && f.inc / f.originTotal > 0.5 ? "text-[color:var(--danger)]" : f.originTotal > 0 && f.inc / f.originTotal > 0.3 ? "text-[color:var(--warning,#f59e0b)]" : "text-[color:var(--muted)]"}`}>
                    {f.originTotal > 0 ? pct(f.inc / f.originTotal) : "—"}
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

function DevelopmentTab({ triangle }: { triangle: Triangle; fileData: FileData }) {
  const { project, activeBranch } = useProject();
  const origins = triangle.origin_periods;
  const [showTopN, setShowTopN] = useState(5);

  const parsePeriodLabel = (s: string): number => {
    const m = s.match(/^(\d{4})(?:[Qq](\d))?/);
    return m ? parseInt(m[1], 10) * 4 + (m[2] ? parseInt(m[2], 10) : 0) : 0;
  };

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

  const byPeriod = useMemo(() =>
    periodSnapshots.map(snap => ({
      label: snap.label,
      totals: lastDiagTotals(snap.triangle, snap.fileData),
    })),
    [periodSnapshots]
  );

  const latestTotals = byPeriod[byPeriod.length - 1]?.totals ?? {};
  const topOrigins = useMemo(() =>
    [...origins]
      .filter(o => latestTotals[o] > 0)
      .sort((a, b) => (latestTotals[b] ?? 0) - (latestTotals[a] ?? 0))
      .slice(0, showTopN),
    [origins, latestTotals, showTopN]
  );

  const chartData = byPeriod.map(snap => {
    const row: Record<string, number | string> = { date: snap.label };
    for (const orig of topOrigins) {
      const v = snap.totals[orig];
      if (v != null && v > 0) row[orig] = Math.round(v / 1000);
    }
    return row;
  });

  const tableOrigins = origins.filter(o => byPeriod.some(snap => (snap.totals[o] ?? 0) > 0));

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="text-xs font-semibold">Paid Development by Accident Year (000s)</div>
          <div className="flex items-center gap-1.5 ml-auto text-[10px] text-[color:var(--muted)]">
            Show:
            {[3, 5, 8, 10].map(n => (
              <button key={n} onClick={() => setShowTopN(n)}
                className={`px-2 py-0.5 rounded font-medium ${showTopN === n ? "bg-[color:var(--primary)] text-white" : "bg-[color:var(--surface-alt)] text-[color:var(--muted-strong)]"}`}
              >Top {n}</button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 20 }}>
            <XAxis dataKey="date" tick={{ fontSize: 9 }} angle={-45} textAnchor="end"
              interval={Math.max(0, Math.floor(chartData.length / 16) - 1)} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${v}k`} />
            <Tooltip formatter={(v: unknown, name: unknown) => [`${Number(v ?? 0).toLocaleString("tr-TR")}k TL`, String(name)]} contentStyle={TOOLTIP_STYLE} />
            <Legend iconSize={10} wrapperStyle={{ fontSize: 10 }} />
            {topOrigins.map((orig, i) => (
              <Line key={orig} type="monotone" dataKey={orig} stroke={DEV_COLORS[i % DEV_COLORS.length]}
                strokeWidth={1.5} dot={false} connectNulls={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-2.5 border-b bg-[color:var(--surface-alt)] text-xs font-semibold">
          Reporting Period × Accident Year — Latest Paid Total
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs tabular">
            <thead>
              <tr className="border-b text-[10px] uppercase tracking-wide text-[color:var(--muted-strong)] bg-[color:var(--surface-alt)]">
                <th className="text-left px-3 py-2 sticky left-0 bg-[color:var(--surface-alt)]">Accident Year</th>
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
  const defaultId = useMemo(() => {
    const sameName = prevPeriodBranches.find(x => sameBranchName(x.branch.name, activeBranchName));
    return (sameName ?? prevPeriodBranches[0])?.branch.id ?? "";
  }, [prevPeriodBranches, activeBranchName]);

  const [compareId, setCompareId] = useState(defaultId);
  const [mode, setMode] = useState<"origin" | "file">("origin");
  const [cmpMetric, setCmpMetric] = useState<Metric>("inc");
  const [search, setSearch] = useState("");
  const effectiveId = prevPeriodBranches.some(x => x.branch.id === compareId) ? compareId : defaultId;
  const compareEntry = prevPeriodBranches.find(x => x.branch.id === effectiveId);
  const compareBranch = compareEntry?.branch;

  const currSnap = useMemo(() => snapshotByOrigin(fileData, triangle.origin_periods), [fileData, triangle.origin_periods]);
  const compSnap = useMemo(() =>
    compareBranch?.triangle && compareBranch.fileData
      ? snapshotByOrigin(compareBranch.fileData, compareBranch.triangle.origin_periods)
      : {},
    [compareBranch]
  );

  const rows = useMemo(() => {
    const allOrigins = [...new Set([...Object.keys(currSnap), ...Object.keys(compSnap)])].sort();
    return allOrigins.map(orig => {
      const cf = currSnap[orig] ?? {};
      const pf = compSnap[orig] ?? {};
      const curr = Object.values(cf).reduce((s, v) => s + v.p, 0);
      const comp = Object.values(pf).reduce((s, v) => s + v.p, 0);
      const delta = curr - comp;
      const deltaPct = comp > 0 ? delta / comp : null;
      const currSet = new Set(Object.keys(cf));
      const compSet = new Set(Object.keys(pf));
      const newFiles = [...currSet].filter(k => !compSet.has(k)).length;
      const closedFiles = [...compSet].filter(k => !currSet.has(k)).length;
      return { orig, curr, comp, delta, deltaPct, currN: currSet.size, compN: compSet.size, newFiles, closedFiles };
    });
  }, [currSnap, compSnap]);

  // Dosya bazlı: her hasarın iki dönem arasındaki değişimi (seçili metrik).
  const fileRows = useMemo(() => {
    const out: { dosya: string; orig: string; curr: number; comp: number; delta: number; tag: "new" | "closed" | "up" | "down" | "same" }[] = [];
    const origins = new Set([...Object.keys(currSnap), ...Object.keys(compSnap)]);
    for (const orig of origins) {
      const cf = currSnap[orig] ?? {};
      const pf = compSnap[orig] ?? {};
      const dosyas = new Set([...Object.keys(cf), ...Object.keys(pf)]);
      for (const d of dosyas) {
        const curr = cf[d] ? metricOf(cf[d], cmpMetric) : 0;
        const comp = pf[d] ? metricOf(pf[d], cmpMetric) : 0;
        if (curr === 0 && comp === 0) continue;
        const delta = curr - comp;
        const tag = !pf[d] ? "new" : !cf[d] ? "closed" : delta > 0 ? "up" : delta < 0 ? "down" : "same";
        out.push({ dosya: d, orig, curr, comp, delta, tag });
      }
    }
    return out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }, [currSnap, compSnap, cmpMetric]);

  const visibleFileRows = useMemo(() => {
    const q = search.trim();
    const filtered = q ? fileRows.filter(r => r.dosya.includes(q) || r.orig.includes(q)) : fileRows;
    return filtered.slice(0, 300);
  }, [fileRows, search]);

  const fileTotals = useMemo(() => fileRows.reduce(
    (a, r) => ({ curr: a.curr + r.curr, comp: a.comp + r.comp,
      newN: a.newN + (r.tag === "new" ? 1 : 0), closedN: a.closedN + (r.tag === "closed" ? 1 : 0) }),
    { curr: 0, comp: 0, newN: 0, closedN: 0 },
  ), [fileRows]);

  const totalCurr = rows.reduce((s, r) => s + r.curr, 0);
  const totalComp = rows.reduce((s, r) => s + r.comp, 0);
  const totalDelta = totalCurr - totalComp;

  const barData = rows
    .filter(r => r.curr > 0 || r.comp > 0)
    .map(r => ({ name: r.orig, "Current": Math.round(r.curr / 1000), "Comparison": Math.round(r.comp / 1000) }));

  if (!prevPeriodBranches.length) {
    return (
      <div className="card p-8 text-center text-xs text-[color:var(--muted)]">
        No branch with a file-level Excel loaded at the same frequency in a previous period.
        For example, if you load a file-level Excel into a branch in 2025Q4, it will appear as an automatic comparison option from 2026Q1 onward.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="label">Comparison Branch</div>
        <select value={effectiveId} onChange={e => setCompareId(e.target.value)} className="input-base">
          {prevPeriodBranches.map(({ period, branch }) => (
            <option key={branch.id} value={branch.id}>
              {period.label} — {branch.name}{branch.triangleFileName ? ` (${branch.triangleFileName})` : ""}
            </option>
          ))}
        </select>
        <div className="ml-auto flex rounded-md overflow-hidden border border-[color:var(--border)]">
          {([["origin", "By accident year"], ["file", "By file"]] as const).map(([val, lbl]) => (
            <button key={val} onClick={() => setMode(val)}
              className={`px-2.5 py-1 text-[11px] font-medium transition ${mode === val ? "bg-[color:var(--primary)] text-white" : "bg-[color:var(--surface)] text-[color:var(--muted-strong)]"}`}
            >{lbl}</button>
          ))}
        </div>
      </div>

      {mode === "origin" && (<>
      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="Current Paid" value={formatNumber(totalCurr)} />
        <KpiCard label="Comparison Paid" value={formatNumber(totalComp)} sub={compareBranch?.name} />
        <KpiCard
          label="Total Change"
          value={(totalDelta >= 0 ? "+" : "") + formatNumber(totalDelta)}
          sub={totalComp > 0 ? pct(totalDelta / totalComp) : ""}
          accent={totalComp > 0 && Math.abs(totalDelta / totalComp) > 0.1}
        />
      </div>

      {barData.length > 0 && (
        <div className="card p-4">
          <div className="text-xs font-semibold mb-3">Accident Year Comparison — Paid (000s)</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={barData} margin={{ top: 4, right: 8, left: 0, bottom: 20 }}>
              <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" interval={0} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${v}k`} />
              <Tooltip formatter={(v: unknown) => [`${Number(v ?? 0).toLocaleString("tr-TR")}k TL`]} contentStyle={TOOLTIP_STYLE} />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="Current" fill="var(--primary)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Comparison" fill="#d1d5db" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs tabular">
            <thead>
              <tr className="border-b text-[10px] uppercase tracking-wide text-[color:var(--muted-strong)] bg-[color:var(--surface-alt)]">
                <th className="text-left px-3 py-2">Accident Year</th>
                <th className="text-right px-3 py-2">Current</th>
                <th className="text-right px-3 py-2">Comparison</th>
                <th className="text-right px-3 py-2">Δ</th>
                <th className="text-right px-3 py-2">Δ%</th>
                <th className="text-right px-3 py-2">Cur. Files</th>
                <th className="text-right px-3 py-2">Comp. Files</th>
                <th className="text-right px-3 py-2">New</th>
                <th className="text-right px-3 py-2">Closed</th>
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
                <td className="px-3 py-1.5 text-[color:var(--primary)]">Total</td>
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
      </>)}

      {mode === "file" && (<>
        <div className="grid grid-cols-4 gap-3">
          <KpiCard label={`Current ${METRIC_LABEL[cmpMetric]}`} value={formatNumber(fileTotals.curr)} />
          <KpiCard label={`Comparison ${METRIC_LABEL[cmpMetric]}`} value={formatNumber(fileTotals.comp)} sub={compareBranch?.name} />
          <KpiCard label="New claims" value={`+${fileTotals.newN}`} />
          <KpiCard label="Closed claims" value={`-${fileTotals.closedN}`} />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-[color:var(--muted-strong)] font-medium">Metric:</span>
          <div className="flex rounded-md overflow-hidden border border-[color:var(--border)]">
            {(["inc", "p", "o"] as Metric[]).map(m => (
              <button key={m} onClick={() => setCmpMetric(m)}
                className={`px-2.5 py-1 text-[11px] font-medium transition ${cmpMetric === m ? "bg-[color:var(--primary)] text-white" : "bg-[color:var(--surface)] text-[color:var(--muted-strong)]"}`}
              >{METRIC_LABEL[m]}</button>
            ))}
          </div>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search claim / accident year…"
            className="ml-auto text-xs border border-[color:var(--border)] rounded-md px-2.5 py-1 bg-[color:var(--surface)] text-[color:var(--foreground)] w-56"
          />
        </div>

        <div className="card p-0 overflow-hidden">
          <div className="px-4 py-2.5 border-b bg-[color:var(--surface-alt)] text-xs font-semibold flex items-center gap-2">
            <span>Per-claim change (current vs comparison, {METRIC_LABEL[cmpMetric]})</span>
            <span className="text-[10px] font-normal text-[color:var(--muted)]">
              {visibleFileRows.length} of {fileRows.length} claims{fileRows.length > 300 && !search ? " (top 300 by |Δ|)" : ""}
            </span>
          </div>
          <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
            <table className="w-full text-xs tabular">
              <thead className="sticky top-0 z-10">
                <tr className="border-b text-[10px] uppercase tracking-wide text-[color:var(--muted-strong)] bg-[color:var(--surface-alt)]">
                  <th className="text-left px-3 py-2">Claim No</th>
                  <th className="text-left px-3 py-2">Accident Year</th>
                  <th className="text-right px-3 py-2">Current</th>
                  <th className="text-right px-3 py-2">Comparison</th>
                  <th className="text-right px-3 py-2">Δ</th>
                  <th className="text-center px-3 py-2">Change</th>
                </tr>
              </thead>
              <tbody>
                {visibleFileRows.length === 0 ? (
                  <tr><td colSpan={6} className="px-3 py-6 text-center text-[color:var(--muted)]">No claims.</td></tr>
                ) : visibleFileRows.map(r => (
                  <tr key={`${r.orig}-${r.dosya}`} className="border-t hover:bg-[color:var(--surface-alt)]/40">
                    <td className="px-3 py-1.5 font-mono">{r.dosya}</td>
                    <td className="px-3 py-1.5 text-[color:var(--muted)]">{r.orig}</td>
                    <td className="text-right px-3 py-1.5">{r.curr > 0 ? formatNumber(r.curr) : "—"}</td>
                    <td className="text-right px-3 py-1.5 text-[color:var(--muted)]">{r.comp > 0 ? formatNumber(r.comp) : "—"}</td>
                    <td className={`text-right px-3 py-1.5 font-medium ${r.delta > 0 ? "text-[color:var(--danger)]" : r.delta < 0 ? "text-green-600" : "text-[color:var(--muted)]"}`}>
                      {r.delta !== 0 ? (r.delta > 0 ? "+" : "") + formatNumber(r.delta) : "—"}
                    </td>
                    <td className="text-center px-3 py-1.5"><ChangeTag tag={r.tag} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </>)}
    </div>
  );
}

function ChangeTag({ tag }: { tag: "new" | "closed" | "up" | "down" | "same" }) {
  const map = {
    new: ["New", "bg-[color:var(--success-soft)] text-[color:var(--success)]"],
    closed: ["Closed", "bg-[color:var(--surface-alt)] text-[color:var(--muted-strong)]"],
    up: ["↑ Increased", "bg-[color:var(--danger-soft)] text-[color:var(--danger)]"],
    down: ["↓ Decreased", "bg-green-500/10 text-green-600"],
    same: ["No change", "text-[color:var(--muted)]"],
  } as const;
  const [label, cls] = map[tag];
  return <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9.5px] font-medium ${cls}`}>{label}</span>;
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
