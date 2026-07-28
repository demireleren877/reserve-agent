"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useProject } from "@/lib/project-store";
import { useDataStore } from "@/lib/data-store";
import { formatNumber } from "@/lib/api";
import { loadDataLargeForModel, loadDataPremiumsForModel } from "@/lib/provision-models";
import type { Branch } from "@/types/project";
import {
  buildDevelopmentSeries,
  developmentBranchKey,
  listDevelopmentBranches,
  type DevelopmentPoint,
} from "@/lib/branch-development";

const MONEY_SERIES = [
  { key: "paid", label: "Paid", color: "#2563eb" },
  { key: "outstanding", label: "Outstanding", color: "#d97706" },
  { key: "ibnr", label: "Attritional IBNR", color: "#7c3aed" },
  { key: "ultimate", label: "Attritional Ultimate", color: "#0f766e" },
] as const;

function money(value: number): string {
  return formatNumber(value);
}

function percent(value: number | null): string {
  return value == null || !Number.isFinite(value) ? "—" : `%${(value * 100).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}`;
}

function change(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null || previous === 0) return null;
  return current / previous - 1;
}

function axisMoney(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} Mr`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} Mn`;
  if (abs >= 1_000) return `${(value / 1_000).toLocaleString("tr-TR", { maximumFractionDigits: 0 })} B`;
  return value.toLocaleString("tr-TR", { maximumFractionDigits: 0 });
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string; dataKey: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-48 rounded-lg border bg-[color:var(--surface)] p-3 text-xs shadow-lg">
      <div className="mb-2 font-semibold">{label}</div>
      <div className="space-y-1.5">
        {payload.map((item) => (
          <div key={item.dataKey} className="flex items-center justify-between gap-5">
            <span className="flex items-center gap-2 text-[color:var(--muted-strong)]">
              <span className="h-2 w-2 rounded-full" style={{ background: item.color }} />{item.name}
            </span>
            <span className="font-mono font-medium">{item.dataKey === "ulr" ? percent(item.value) : money(item.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value, delta, hint }: { label: string; value: string; delta?: number | null; hint?: string }) {
  const color = delta == null ? "var(--muted)" : delta > 0 ? "var(--danger)" : delta < 0 ? "var(--success)" : "var(--muted)";
  return (
    <div className="min-w-0 px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted)]">{label}</div>
      <div className="mt-1 truncate text-xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-[11px]" style={{ color }}>
        {delta == null ? (hint ?? "No prior-period comparison") : `${delta > 0 ? "+" : ""}${(delta * 100).toLocaleString("en-US", { maximumFractionDigits: 1 })}% vs. prior period`}
      </div>
    </div>
  );
}

export default function DevelopmentPage() {
  const { project, activeBranch } = useProject();
  const { periods: dataPeriods, loadDatasetRecords } = useDataStore();
  const options = useMemo(() => listDevelopmentBranches(project.periods), [project.periods]);
  const activeKey = activeBranch ? developmentBranchKey(activeBranch) : "";
  const [selectedKey, setSelectedKey] = useState("");
  const [visible, setVisible] = useState<Record<string, boolean>>({ paid: true, outstanding: true, ibnr: true, ultimate: true });
  const [resolvedBranches, setResolvedBranches] = useState<Record<string, Branch>>({});
  const [resolvedFor, setResolvedFor] = useState("");
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    if (selectedKey && options.some((option) => option.key === selectedKey)) return;
    setSelectedKey(options.some((option) => option.key === activeKey) ? activeKey : (options[0]?.key ?? ""));
  }, [activeKey, options, selectedKey]);

  useEffect(() => {
    if (!selectedKey) {
      setResolvedBranches({});
      setResolvedFor("");
      return;
    }
    let cancelled = false;
    setResolving(true);
    setResolvedFor("");
    (async () => {
      const entries = await Promise.all(project.periods.flatMap((period) => {
        const branch = period.branches.find((candidate) => developmentBranchKey(candidate) === selectedKey);
        if (!branch) return [];
        return [(async (): Promise<[string, Branch]> => {
          const triangle = branch.triangle;
          const origins = triangle?.origin_periods ?? [];
          const dataPremiums = await loadDataPremiumsForModel(
            period.label,
            branch.name,
            origins,
            dataPeriods,
            loadDatasetRecords,
          );
          const large = triangle
            ? await loadDataLargeForModel(
                period.label,
                branch.name,
                triangle.origin_granularity,
                triangle.development_granularity,
                dataPeriods,
                loadDatasetRecords,
              )
            : null;
          return [`${period.id}\u0000${branch.id}`, {
            ...branch,
            premiums: { ...dataPremiums, ...(branch.premiums ?? {}) },
            largePaidTriangle: large?.paid ?? branch.largePaidTriangle,
            largeIncurredTriangle: large?.incurred ?? branch.largeIncurredTriangle,
            largeFileData: large?.fileData ?? branch.largeFileData,
          }];
        })()];
      }));
      if (cancelled) return;
      setResolvedBranches(Object.fromEntries(entries));
      setResolvedFor(selectedKey);
      setResolving(false);
    })().catch(() => {
      if (cancelled) return;
      setResolvedBranches({});
      setResolvedFor(selectedKey);
      setResolving(false);
    });
    return () => { cancelled = true; };
  }, [selectedKey, project.periods, dataPeriods, loadDatasetRecords]);

  const selected = options.find((option) => option.key === selectedKey);
  const resolvedPeriods = useMemo(() => project.periods.map((period) => ({
    ...period,
    branches: period.branches.map((branch) =>
      resolvedBranches[`${period.id}\u0000${branch.id}`] ?? branch,
    ),
  })), [project.periods, resolvedBranches]);
  const data = useMemo(
    () => resolvedFor === selectedKey ? buildDevelopmentSeries(resolvedPeriods, selectedKey) : [],
    [resolvedFor, resolvedPeriods, selectedKey],
  );
  const latest = data.at(-1);
  const previous = data.at(-2);

  return (
    <main className="min-w-0 flex-1 overflow-auto bg-[color:var(--background)] p-4 sm:p-6">
      <div className="mx-auto max-w-[1500px] space-y-4">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Branch Period Development</h1>
            <p className="mt-1 text-sm text-[color:var(--muted-strong)]">Track gross incurred claims and the attritional reserve model across valuation periods.</p>
          </div>
          <label className="block min-w-64">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted)]">Branch</span>
            <select value={selectedKey} onChange={(event) => setSelectedKey(event.target.value)} className="h-9 w-full rounded-md border bg-[color:var(--surface)] px-3 text-sm outline-none focus:border-[color:var(--primary)]">
              {options.map((option) => <option key={option.key} value={option.key}>{option.name} · {option.frequency === "yearly" ? "Yearly" : "Quarterly"} ({option.periodCount} periods)</option>)}
            </select>
          </label>
        </header>

        {resolving || (selectedKey && resolvedFor !== selectedKey) ? (
          <div className="rounded-xl border bg-[color:var(--surface)] p-10 text-center">
            <div className="font-medium">Calculating period metrics…</div>
            <p className="mt-1 text-sm text-[color:var(--muted)]">Matching premium, Large, and reserve model sources.</p>
          </div>
        ) : !latest ? (
          <div className="rounded-xl border bg-[color:var(--surface)] p-10 text-center">
            <div className="font-medium">No comparable branch data</div>
            <p className="mt-1 text-sm text-[color:var(--muted)]">At least one period must contain triangle and model data for this dashboard.</p>
          </div>
        ) : (
          <>
            <section className="overflow-hidden rounded-xl border bg-[color:var(--surface)]">
              <div className="border-b px-4 py-2.5 text-xs text-[color:var(--muted-strong)]"><span className="font-semibold text-[color:var(--foreground)]">{selected?.name}</span> · Latest valuation period: {latest.period}</div>
              <div className="grid divide-y sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-6">
                <Metric label="Paid" value={money(latest.paid)} delta={change(latest.paid, previous?.paid ?? null)} />
                <Metric label="Outstanding" value={money(latest.outstanding)} delta={change(latest.outstanding, previous?.outstanding ?? null)} />
                <Metric label="Attritional IBNR" value={money(latest.ibnr)} delta={change(latest.ibnr, previous?.ibnr ?? null)} />
                <Metric label="Attritional Ultimate" value={money(latest.ultimate)} delta={change(latest.ultimate, previous?.ultimate ?? null)} />
                <Metric label="EP" value={money(latest.ep)} delta={change(latest.ep, previous?.ep ?? null)} />
                <Metric label="ULR" value={percent(latest.ulr)} delta={change(latest.ulr, previous?.ulr ?? null)} hint="Ultimate / EP" />
              </div>
            </section>

            <section className="rounded-xl border bg-[color:var(--surface)] p-4">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div><h2 className="text-sm font-semibold">Claims and reserve development</h2><p className="mt-0.5 text-xs text-[color:var(--muted)]">Period movement by amount; choose visible series on the right.</p></div>
                <div className="flex flex-wrap gap-1.5">
                  {MONEY_SERIES.map((series) => <button key={series.key} onClick={() => setVisible((current) => ({ ...current, [series.key]: !current[series.key] }))} className="rounded-md border px-2.5 py-1 text-xs transition" style={{ color: visible[series.key] ? series.color : "var(--muted)", background: visible[series.key] ? `${series.color}10` : "transparent", borderColor: visible[series.key] ? `${series.color}55` : "var(--border)" }}><span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: visible[series.key] ? series.color : "var(--border-strong)" }} />{series.label}</button>)}
                </div>
              </div>
              <div className="overflow-x-auto">
                <div className="h-[330px] min-w-[680px]"><ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
                    <CartesianGrid stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="period" tick={{ fontSize: 11, fill: "var(--muted-strong)" }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={axisMoney} tick={{ fontSize: 11, fill: "var(--muted-strong)" }} axisLine={false} tickLine={false} width={72} />
                    <Tooltip content={<ChartTooltip />} />
                    <ReferenceLine y={0} stroke="var(--border-strong)" />
                    {MONEY_SERIES.map((series) => visible[series.key] ? <Line key={series.key} type="monotone" dataKey={series.key} name={series.label} stroke={series.color} strokeWidth={2} dot={{ r: 3, fill: series.color, strokeWidth: 0 }} activeDot={{ r: 5 }} /> : null)}
                  </ComposedChart>
                </ResponsiveContainer></div>
              </div>
            </section>

            <section className="rounded-xl border bg-[color:var(--surface)] p-4">
              <div className="mb-4"><h2 className="text-sm font-semibold">Premium adequacy and ULR</h2><p className="mt-0.5 text-xs text-[color:var(--muted)]">EP amount and Attritional Ultimate / EP on the same time axis.</p></div>
              <div className="overflow-x-auto">
                <div className="h-[280px] min-w-[680px]"><ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                    <CartesianGrid stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="period" tick={{ fontSize: 11, fill: "var(--muted-strong)" }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="money" tickFormatter={axisMoney} tick={{ fontSize: 11, fill: "var(--muted-strong)" }} axisLine={false} tickLine={false} width={72} />
                    <YAxis yAxisId="ratio" orientation="right" tickFormatter={(value) => `%${Math.round(value * 100)}`} tick={{ fontSize: 11, fill: "var(--muted-strong)" }} axisLine={false} tickLine={false} width={48} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Area yAxisId="money" type="monotone" dataKey="ep" name="EP" stroke="#64748b" fill="#64748b18" strokeWidth={1.5} />
                    <Line yAxisId="ratio" type="monotone" dataKey="ulr" name="ULR" stroke="#dc2626" strokeWidth={2.5} dot={{ r: 3, fill: "#dc2626", strokeWidth: 0 }} connectNulls />
                  </ComposedChart>
                </ResponsiveContainer></div>
              </div>
            </section>

            <section className="overflow-hidden rounded-xl border bg-[color:var(--surface)]">
              <div className="border-b px-4 py-3"><h2 className="text-sm font-semibold">Period detail</h2><p className="mt-0.5 text-xs text-[color:var(--muted)]">A verifiable table view of chart amounts.</p></div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1050px] table-fixed text-xs">
                  <thead className="bg-[color:var(--surface-alt)] text-[11px] uppercase tracking-wide text-[color:var(--muted-strong)]"><tr>{["Period", "Paid", "Incurred", "Outstanding", "Attr. IBNR", "Attr. Ultimate", "EP", "Attr. ULR"].map((label) => <th key={label} className="border-b px-3 py-2.5 text-right first:text-left">{label}</th>)}</tr></thead>
                  <tbody>{[...data].reverse().map((row) => <PeriodRow key={row.periodId} row={row} />)}</tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function PeriodRow({ row }: { row: DevelopmentPoint }) {
  return <tr className="border-b last:border-b-0 hover:bg-[color:var(--surface-alt)]"><td className="px-3 py-3 font-semibold">{row.period}</td>{[row.paid, row.incurred, row.outstanding, row.ibnr, row.ultimate, row.ep].map((value, index) => <td key={index} className="px-3 py-3 text-right font-mono tabular-nums">{money(value)}</td>)}<td className="px-3 py-3 text-right font-mono font-semibold tabular-nums">{percent(row.ulr)}</td></tr>;
}
