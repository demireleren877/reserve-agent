"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  AreaChart, Area, LineChart, Line, CartesianGrid, Legend,
  ReferenceLine,
} from "recharts";
import { useProject } from "@/lib/project-store";
import { computeBranchSummary } from "@/lib/reserve-pipeline";
import {
  defaultDiscountConfig,
  discountWithStandard,
  SEDDK_FLAT_RATE_2025,
  type CurveNode,
  type DiscountConfig,
  type DiscountResult,
  type RaMethod,
  type RateMode,
  type ReportingStandard,
  type StandardDiscountResult,
} from "@/lib/discount-engine";
import { formatNumber } from "@/lib/api";
import { useModelLock } from "@/lib/use-model-lock";
import { ModelLockBanner } from "@/components/ModelLockBanner";
import type { Branch, Period } from "@/types/project";

// ─── Types ────────────────────────────────────────────────────────────────────

type MainTab = "summary" | "cashflow" | "sensitivity" | "comparison";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return formatNumber(n) ?? n.toLocaleString("tr-TR", { maximumFractionDigits: 0 });
}

function pct(n: number, decimals = 1): string {
  return (n * 100).toFixed(decimals) + "%";
}

// Discount% → renk: düşük = mavi, yüksek = turuncu
function discountColor(pctValue: number): string {
  // 0% = mavi, 30%+ = turuncu
  const t = Math.min(pctValue / 0.3, 1);
  const r = Math.round(59 + t * (234 - 59));
  const g = Math.round(130 - t * (130 - 88));
  const b = Math.round(246 - t * (246 - 12));
  return `rgb(${r},${g},${b})`;
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function BarTooltip({ active, payload, label }: {
  active?: boolean; payload?: { name: string; value: number; fill: string }[]; label?: string;
}) {
  if (!active || !payload?.length) return null;
  const unpaidPaid = payload.find((p) => p.name === "Discounted Unpaid");
  const discount = payload.find((p) => p.name === "Discount Amount");
  const total = (unpaidPaid?.value ?? 0) + (discount?.value ?? 0);
  return (
    <div
      className="rounded-lg shadow-lg text-xs p-3 space-y-1.5"
      style={{ background: "var(--surface)", border: "1px solid var(--border)", minWidth: 180 }}
    >
      <div className="font-semibold text-[color:var(--foreground)] mb-2">{label}</div>
      <div className="flex justify-between gap-4">
        <span style={{ color: "var(--muted-strong)" }}>Unpaid Liability</span>
        <span className="font-mono font-medium">{fmt(total)}</span>
      </div>
      {unpaidPaid && (
        <div className="flex justify-between gap-4">
          <span style={{ color: unpaidPaid.fill }}>Discounted Unpaid</span>
          <span className="font-mono">{fmt(unpaidPaid.value)}</span>
        </div>
      )}
      {discount && (
        <div className="flex justify-between gap-4">
          <span style={{ color: discount.fill }}>Discount</span>
          <span className="font-mono">{fmt(discount.value)}</span>
        </div>
      )}
      {total > 0 && (
        <div className="flex justify-between gap-4 pt-1 border-t" style={{ borderColor: "var(--border)" }}>
          <span style={{ color: "var(--muted-strong)" }}>Discount %</span>
          <span className="font-mono">{pct((discount?.value ?? 0) / total)}</span>
        </div>
      )}
    </div>
  );
}

// ─── Summary Panel ─────────────────────────────────────────────────────────────

function SummaryPanel({ result }: { result: DiscountResult }) {
  const maxDiscount = Math.max(...result.origins.map((o) => o.discountPct));

  const barData = result.origins.map((o) => ({
    origin: o.origin,
    "Discounted Unpaid": Math.round(o.bel),
    "Discount Amount": Math.round(o.unpaid - o.bel),
  }));

  return (
    <div className="space-y-6">
      {/* Stacked bar chart */}
      <div
        className="rounded-xl p-4"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <div className="text-xs font-semibold text-[color:var(--foreground)] mb-1">
          Unpaid Liability — Composition
        </div>
        <div className="text-xs text-[color:var(--muted)] mb-4">
          Discounted reserve (blue) + discount gain (orange) = Unpaid Liability
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={barData} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
            <XAxis dataKey="origin" tick={{ fontSize: 11, fill: "var(--muted-strong)" }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontSize: 10, fill: "var(--muted)" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) =>
                v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` :
                v >= 1_000 ? `${(v / 1_000).toFixed(0)}K` : String(v)
              }
              width={52}
            />
            <Tooltip content={<BarTooltip />} cursor={{ fill: "var(--surface-alt)" }} />
            <Bar dataKey="Discounted Unpaid" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} />
            <Bar dataKey="Discount Amount" stackId="a" fill="#f97316" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Table with inline bars */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ border: "1px solid var(--border)" }}
      >
        <table className="w-full text-xs">
          <thead>
            <tr style={{ background: "var(--surface-alt)" }}>
              <th className="px-4 py-2.5 text-left font-medium text-[color:var(--muted-strong)]">Accident Period</th>
              <th className="px-4 py-2.5 text-right font-medium text-[color:var(--muted-strong)]">Unpaid Liability</th>
              <th className="px-4 py-2.5 text-right font-medium text-[color:var(--muted-strong)]">Discounted Unpaid</th>
              <th className="px-4 py-2.5 text-right font-medium text-[color:var(--muted-strong)]">Discount Amount</th>
              <th className="px-4 py-2.5 text-right font-medium text-[color:var(--muted-strong)]">Compl. Month</th>
              <th className="px-4 py-2.5 font-medium text-[color:var(--muted-strong)] min-w-[140px]">Discount %</th>
            </tr>
          </thead>
          <tbody>
            {result.origins.map((o, i) => (
              <tr
                key={o.origin}
                className="border-t"
                style={{ borderColor: "var(--border)", background: i % 2 === 0 ? "var(--surface)" : "var(--surface-alt)" }}
              >
                <td className="px-4 py-2 font-mono font-medium">{o.origin}</td>
                <td className="px-4 py-2 text-right font-mono">{fmt(o.unpaid)}</td>
                <td className="px-4 py-2 text-right font-mono">{fmt(o.bel)}</td>
                <td className="px-4 py-2 text-right font-mono">{fmt(o.unpaid - o.bel)}</td>
                <td className="px-4 py-2 text-right font-mono">{o.duration}</td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full" style={{ background: "var(--border)" }}>
                      <div
                        className="h-1.5 rounded-full transition-all"
                        style={{
                          width: `${maxDiscount > 0 ? (o.discountPct / maxDiscount) * 100 : 0}%`,
                          background: discountColor(o.discountPct),
                        }}
                      />
                    </div>
                    <span className="font-mono w-12 text-right" style={{ color: discountColor(o.discountPct) }}>
                      {pct(o.discountPct)}
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 font-semibold" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              <td className="px-4 py-3">Total</td>
              <td className="px-4 py-3 text-right font-mono">{fmt(result.totals.unpaid)}</td>
              <td className="px-4 py-3 text-right font-mono">{fmt(result.totals.bel)}</td>
              <td className="px-4 py-3 text-right font-mono">{fmt(result.totals.unpaid - result.totals.bel)}</td>
              <td className="px-4 py-3 text-right font-mono">{result.totals.duration}</td>
              <td className="px-4 py-3 font-mono" style={{ color: discountColor(result.totals.discountPct) }}>
                {pct(result.totals.discountPct)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ─── Cashflow Panel ────────────────────────────────────────────────────────────

function CashflowPanel({ result }: { result: DiscountResult }) {
  const [selectedOrigin, setSelectedOrigin] = useState<string>(result.origins[0]?.origin ?? "");
  const [view, setView] = useState<"single" | "cumulative">("single");

  const origin = result.origins.find((o) => o.origin === selectedOrigin) ?? result.origins[0];

  const singleData = useMemo(() =>
    (origin?.cashFlows ?? []).map((cf) => ({
      month: cf.month,
      "Nominal": Math.round(cf.amount),
      "Discounted": Math.round(cf.discounted),
    })),
    [origin],
  );

  const cumulativeData = useMemo(() => {
    let cumNominal = 0;
    let cumDiscounted = 0;
    return (origin?.cashFlows ?? []).map((cf) => {
      cumNominal += cf.amount;
      cumDiscounted += cf.discounted;
      return {
        month: cf.month,
        "Nominal (cumulative)": Math.round(cumNominal),
        "Discounted (cumulative)": Math.round(cumDiscounted),
      };
    });
  }, [origin]);

  type ChartRow = { month: number; A: number; B: number };
  const chartData: ChartRow[] = view === "single"
    ? singleData.map((d) => ({ month: d.month, A: d["Nominal"], B: d["Discounted"] }))
    : cumulativeData.map((d) => ({ month: d.month, A: d["Nominal (cumulative)"], B: d["Discounted (cumulative)"] }));
  const labelA = view === "single" ? "Nominal" : "Nominal (cumulative)";
  const labelB = view === "single" ? "Discounted" : "Discounted (cumulative)";

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[color:var(--muted-strong)]">Accident year:</span>
          <select
            value={selectedOrigin}
            onChange={(e) => setSelectedOrigin(e.target.value)}
            className="text-xs border border-[color:var(--border)] rounded-md px-2 py-1.5 bg-[color:var(--surface)] text-[color:var(--foreground)]"
          >
            {result.origins.map((o) => (
              <option key={o.origin} value={o.origin}>{o.origin}</option>
            ))}
          </select>
        </div>
        <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: "var(--border)" }}>
          {([["single", "Monthly"], ["cumulative", "Cumulative"]] as [string, string][]).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setView(k as "single" | "cumulative")}
              className="px-3 py-1.5 text-xs font-medium transition"
              style={{
                background: view === k ? "var(--primary)" : "var(--surface)",
                color: view === k ? "#fff" : "var(--muted-strong)",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Stat pills */}
      {origin && (
        <div className="flex gap-3 flex-wrap">
          {[
            { label: "Unpaid Liability", value: fmt(origin.unpaid), color: "#6366f1" },
            { label: "Discounted Unpaid", value: fmt(origin.bel), color: "#3b82f6" },
            { label: "Discount", value: fmt(origin.unpaid - origin.bel), color: "#f97316" },
            { label: "Discount %", value: pct(origin.discountPct), color: discountColor(origin.discountPct) },
            { label: "Completion Month", value: `Month ${origin.duration}`, color: "var(--muted-strong)" },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-lg px-3 py-2"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            >
              <div className="text-[10px] text-[color:var(--muted)]">{s.label}</div>
              <div className="text-sm font-semibold font-mono mt-0.5" style={{ color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Chart */}
      <div
        className="rounded-xl p-4"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
            <defs>
              <linearGradient id="nominalGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="discountedGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.5} />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 10, fill: "var(--muted)" }}
              axisLine={false} tickLine={false}
              label={{ value: "Ay", position: "insideBottomRight", offset: -4, fontSize: 10, fill: "var(--muted)" }}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "var(--muted)" }}
              axisLine={false} tickLine={false}
              tickFormatter={(v: number) =>
                v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` :
                v >= 1_000 ? `${(v / 1_000).toFixed(0)}K` : String(v)
              }
              width={52}
            />
            <Tooltip
              contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", fontSize: 11, borderRadius: 8 }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any) => fmt(value as number) as any}
              labelFormatter={(v) => `Ay ${v}`}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Area dataKey="A" name={labelA} stroke="#6366f1" fill="url(#nominalGrad)" strokeWidth={1.5} dot={false} />
            <Area dataKey="B" name={labelB} stroke="#3b82f6" fill="url(#discountedGrad)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
        <p className="text-xs text-[color:var(--muted)] mt-2 text-center">
          Area between the two curves = discount amount
        </p>
      </div>
    </div>
  );
}

// ─── Sensitivity Panel ─────────────────────────────────────────────────────────

function shockedConfig(config: DiscountConfig, shock: number): DiscountConfig {
  if (config.rateMode === "flat") {
    return { ...config, flatRate: Math.max(0.001, config.flatRate + shock) };
  }
  return {
    ...config,
    curveNodes: config.curveNodes.map((n) => ({
      ...n,
      rate: Math.max(0.001, n.rate + shock),
    })),
  };
}

function SensitivityPanel({
  rows,
  config,
  monthlyPattern,
}: {
  rows: { origin: string; unpaid: number }[];
  config: DiscountConfig;
  monthlyPattern: Record<string, { month: number; weight: number }[]>;
}) {
  const isIfrs17 = config.standard === "ifrs17";
  const baseRate = config.flatRate;
  const rateMode = config.rateMode;

  // 11 nokta: baz ± 500bp, 100bp adım
  const lineData = useMemo(() => {
    const points: { rate: string; "Discounted Unpaid": number; "Discount Amount": number }[] = [];
    for (let bps = -500; bps <= 500; bps += 100) {
      const r = discountWithStandard(rows, monthlyPattern, shockedConfig(config, bps / 10000));
      points.push({
        rate: bps === 0 ? "Baz" : `${bps > 0 ? "+" : ""}${bps}bp`,
        "Discounted Unpaid": Math.round(r.base.totals.bel),
        "Discount Amount": Math.round(r.base.totals.unpaid - r.base.totals.bel),
      });
    }
    return points;
  }, [config, rows, monthlyPattern]);

  // Tablo için 5 senaryo
  const tableScenarios = useMemo(() => {
    return [-0.02, -0.01, 0, 0.01, 0.02].map((shock) => ({
      shock,
      result: discountWithStandard(rows, monthlyPattern, shockedConfig(config, shock)),
    }));
  }, [config, rows, monthlyPattern]);

  const baseResult = tableScenarios.find((s) => s.shock === 0)?.result;

  return (
    <div className="space-y-6">
      {/* Line chart */}
      <div
        className="rounded-xl p-4"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <div className="text-xs font-semibold mb-1">Interest Sensitivity</div>
        <div className="text-xs text-[color:var(--muted)] mb-4">
          Discounted Unpaid and Discount Amount by interest change
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={lineData} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.5} />
            <XAxis dataKey="rate" tick={{ fontSize: 10, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontSize: 10, fill: "var(--muted)" }}
              axisLine={false} tickLine={false}
              tickFormatter={(v: number) =>
                v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` :
                v >= 1_000 ? `${(v / 1_000).toFixed(0)}K` : String(v)
              }
              width={52}
            />
            <Tooltip
              contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", fontSize: 11, borderRadius: 8 }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any) => fmt(value as number) as any}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine x="Baz" stroke="var(--muted)" strokeDasharray="4 2" label={{ value: "Baz", fontSize: 10, fill: "var(--muted)" }} />
            <Line dataKey="Discounted Unpaid" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3, fill: "#3b82f6" }} />
            <Line dataKey="Discount Amount" stroke="#f97316" strokeWidth={2} dot={{ r: 3, fill: "#f97316" }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Scenario table */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ border: "1px solid var(--border)" }}
      >
        <table className="w-full text-xs">
          <thead>
            <tr style={{ background: "var(--surface-alt)" }}>
              <th className="px-4 py-2.5 text-left font-medium text-[color:var(--muted-strong)]">Senaryo</th>
              <th className="px-4 py-2.5 text-right font-medium text-[color:var(--muted-strong)]">Faiz</th>
              <th className="px-4 py-2.5 text-right font-medium text-[color:var(--muted-strong)]">Unpaid Liability</th>
              <th className="px-4 py-2.5 text-right font-medium text-[color:var(--muted-strong)]">{isIfrs17 ? "BEL" : "Discounted Unpaid"}</th>
              <th className="px-4 py-2.5 text-right font-medium text-[color:var(--muted-strong)]">Discount Amount</th>
              {isIfrs17 && <th className="px-4 py-2.5 text-right font-medium text-[color:var(--muted-strong)]">LIC</th>}
              <th className="px-4 py-2.5 text-right font-medium text-[color:var(--muted-strong)]">Discount %</th>
              <th className="px-4 py-2.5 text-right font-medium text-[color:var(--muted-strong)]">{isIfrs17 ? "Δ LIC" : "Δ Disc. Unpaid"}</th>
            </tr>
          </thead>
          <tbody>
            {tableScenarios.map(({ shock, result: r }, i) => {
              const isBase = shock === 0;
              const delta = baseResult
                ? isIfrs17
                  ? r.lic - baseResult.lic
                  : r.base.totals.bel - baseResult.base.totals.bel
                : 0;
              const effectiveRate = rateMode === "flat" ? baseRate + shock : null;
              return (
                <tr
                  key={shock}
                  className="border-t"
                  style={{
                    borderColor: "var(--border)",
                    background: isBase ? "var(--primary-soft, #eff6ff)" : i % 2 === 0 ? "var(--surface)" : "var(--surface-alt)",
                    fontWeight: isBase ? 600 : undefined,
                  }}
                >
                  <td className="px-4 py-2">
                    {shock === 0 ? "Baz senaryo" : `${shock > 0 ? "+" : ""}${(shock * 100).toFixed(0)}bp`}
                  </td>
                  <td className="px-4 py-2 text-right font-mono">
                    {effectiveRate !== null ? pct(effectiveRate, 1) : "—"}
                  </td>
                  <td className="px-4 py-2 text-right font-mono">{fmt(r.base.totals.unpaid)}</td>
                  <td className="px-4 py-2 text-right font-mono">{fmt(r.base.totals.bel)}</td>
                  <td className="px-4 py-2 text-right font-mono">{fmt(r.base.totals.unpaid - r.base.totals.bel)}</td>
                  {isIfrs17 && <td className="px-4 py-2 text-right font-mono">{fmt(r.lic)}</td>}
                  <td className="px-4 py-2 text-right font-mono" style={{ color: discountColor(r.base.totals.discountPct) }}>
                    {pct(r.base.totals.discountPct)}
                  </td>
                  <td
                    className="px-4 py-2 text-right font-mono"
                    style={{ color: isBase ? undefined : delta > 0 ? "#22c55e" : "#ef4444" }}
                  >
                    {isBase ? "—" : `${delta > 0 ? "+" : ""}${fmt(delta)}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Comparison Panel (IFRS 4 vs IFRS 17) ─────────────────────────────────────

function ComparisonPanel({
  comparison,
  configs,
}: {
  comparison: Record<ReportingStandard, StandardDiscountResult>;
  configs: Record<ReportingStandard, DiscountConfig>;
}) {
  const r4 = comparison.ifrs4;
  const r17 = comparison.ifrs17;
  const raLabel =
    configs.ifrs17.riskAdjustment.method === "pct_of_bel"
      ? `BEL × %${(configs.ifrs17.riskAdjustment.pctOfBel * 100).toFixed(1)}`
      : configs.ifrs17.riskAdjustment.method === "cost_of_capital"
      ? `CoC %${(configs.ifrs17.riskAdjustment.cocRate * 100).toFixed(1)}`
      : "None";
  const rate4 =
    configs.ifrs4.rateMode === "none"
      ? "Nominal (iskontosuz)"
      : configs.ifrs4.rateMode === "flat"
      ? `Sabit %${(configs.ifrs4.flatRate * 100).toFixed(1)}`
      : `Curve (${configs.ifrs4.curveNodes.length} nodes)`;
  const rate17 =
    (configs.ifrs17.rateMode === "flat"
      ? `Sabit %${(configs.ifrs17.flatRate * 100).toFixed(1)}`
      : `Curve (${configs.ifrs17.curveNodes.length} nodes)`) +
    ` + ${configs.ifrs17.illiquidityPremiumBps}bp illikidite`;

  const carried4 = r4.base.totals.bel; // IFRS 4 bilanço karşılığı
  const carried17 = r17.lic; // IFRS 17 LIC
  const delta = carried17 - carried4;

  const rows: { label: string; v4: string; v17: string }[] = [
    { label: "Discount approach", v4: rate4, v17: rate17 },
    { label: "Unpaid Liability (nominal)", v4: fmt(r4.base.totals.unpaid), v17: fmt(r17.base.totals.unpaid) },
    { label: "Discounted reserve / BEL", v4: fmt(r4.base.totals.bel), v17: fmt(r17.base.totals.bel) },
    { label: "Discount amount", v4: fmt(r4.base.totals.unpaid - r4.base.totals.bel), v17: fmt(r17.base.totals.unpaid - r17.base.totals.bel) },
    { label: `Risk Adjustment (${raLabel})`, v4: "—", v17: fmt(r17.riskAdjustment.total) },
    { label: "Balance-sheet provision", v4: fmt(carried4), v17: `${fmt(carried17)} (LIC)` },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
        <table className="w-full text-xs">
          <thead>
            <tr style={{ background: "var(--surface-alt)" }}>
              <th className="px-4 py-2.5 text-left font-medium text-[color:var(--muted-strong)]" />
              <th className="px-4 py-2.5 text-right font-medium text-[color:var(--muted-strong)]">IFRS 4</th>
              <th className="px-4 py-2.5 text-right font-medium text-[color:var(--muted-strong)]">IFRS 17</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.label}
                className="border-t"
                style={{ borderColor: "var(--border)", background: i % 2 === 0 ? "var(--surface)" : "var(--surface-alt)" }}
              >
                <td className="px-4 py-2.5 font-medium text-[color:var(--muted-strong)]">{row.label}</td>
                <td className="px-4 py-2.5 text-right font-mono">{row.v4}</td>
                <td className="px-4 py-2.5 text-right font-mono">{row.v17}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 font-semibold" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              <td className="px-4 py-3">Difference (IFRS 17 − IFRS 4)</td>
              <td className="px-4 py-3" />
              <td className="px-4 py-3 text-right font-mono" style={{ color: delta > 0 ? "#ef4444" : "#22c55e" }}>
                {delta > 0 ? "+" : ""}{fmt(delta)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-[color:var(--muted)] leading-relaxed">
        The IFRS 4 provision is the reserve after regulatory discounting; IFRS 17 LIC
        adds a Risk Adjustment for non-financial risk on top of the BEL discounted with
        the bottom-up curve. Parameters can be edited while the relevant standard is
        selected in the left panel — this table compares the current state of both
        configurations.
      </p>
    </div>
  );
}

// ─── Curve node editor ────────────────────────────────────────────────────────

function CurveEditor({ nodes, onChange }: { nodes: CurveNode[]; onChange: (nodes: CurveNode[]) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[color:var(--muted-strong)]">Discount Curve</span>
        <button
          onClick={() => {
            const lastMonth = nodes[nodes.length - 1]?.month ?? 0;
            onChange([...nodes, { month: lastMonth + 12, rate: 0.05 }]);
          }}
          className="text-xs px-2 py-1 rounded border border-[color:var(--border)] text-[color:var(--muted-strong)] hover:text-[color:var(--foreground)] transition"
        >
          + Row
        </button>
      </div>
      {nodes.length === 0 ? (
        <p className="text-xs text-[color:var(--muted)]">No curve nodes added.</p>
      ) : (
        <>
          <div className="grid grid-cols-[1fr_1fr_auto] gap-1 text-[10px] font-medium text-[color:var(--muted)] px-1">
            <span>Ay</span><span>Faiz (%)</span><span />
          </div>
          {nodes.map((n, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-1 items-center">
              <input
                type="number" min={1} step={1} value={n.month}
                onChange={(e) => onChange(nodes.map((x, j) => j === i ? { ...x, month: Number(e.target.value) } : x))}
                className="text-xs border border-[color:var(--border)] rounded px-2 py-1 bg-[color:var(--surface)] text-[color:var(--foreground)] w-full"
              />
              <input
                type="number" min={0} step={0.01} value={(n.rate * 100).toFixed(2)}
                onChange={(e) => onChange(nodes.map((x, j) => j === i ? { ...x, rate: Number(e.target.value) / 100 } : x))}
                className="text-xs border border-[color:var(--border)] rounded px-2 py-1 bg-[color:var(--surface)] text-[color:var(--foreground)] w-full"
              />
              <button onClick={() => onChange(nodes.filter((_, j) => j !== i))} className="text-[color:var(--muted)] hover:text-red-500 px-1 text-base leading-none">×</button>
            </div>
          ))}
          <p className="text-[10px] text-[color:var(--muted)]">Beyond the last node is flat extrapolation.</p>
        </>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DiscountPage() {
  const { project, setReadOnly } = useProject();

  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [standard, setStandard] = useState<ReportingStandard>("ifrs4");
  // Her standardın konfigürasyonu ayrı tutulur — toggle ile kullanıcı
  // düzenlemeleri kaybolmaz.
  const [configs, setConfigs] = useState<Record<ReportingStandard, DiscountConfig>>({
    ifrs4: defaultDiscountConfig("ifrs4"),
    ifrs17: defaultDiscountConfig("ifrs17"),
  });
  const config = configs[standard];
  const patchConfig = (patch: Partial<DiscountConfig>) =>
    setConfigs((prev) => ({ ...prev, [standard]: { ...prev[standard], ...patch } }));
  const [mainTab, setMainTab] = useState<MainTab>("summary");
  // Nominal modda sensitivite anlamsız — sekme gizlenir, açıksa özete dön
  const effectiveTab: MainTab =
    mainTab === "sensitivity" && config.rateMode === "none" ? "summary" : mainTab;
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const allBranches = useMemo(() => {
    const result: { branch: Branch; period: Period }[] = [];
    for (const p of project.periods) {
      for (const b of p.branches) {
        if (b.paidTriangle || b.triangle) result.push({ branch: b, period: p });
      }
    }
    return result;
  }, [project.periods]);

  const selectedEntry = allBranches.find((e) => e.branch.id === selectedBranchId) ?? allBranches[0] ?? null;
  const activeBranch = selectedEntry?.branch ?? null;

  const lockKey = selectedEntry
    ? `discount:${selectedEntry.period.id}/${activeBranch!.id}`
    : null;
  const { state: lockState, forceAcquire } = useModelLock(lockKey);

  // Kilit "mine" olana kadar store yazımlarını bloke et (acquire penceresi dahil);
  // backend hatasında bloklamayız.
  useEffect(() => {
    const ro = !!lockKey && lockState.status !== "mine" && lockState.status !== "error";
    setReadOnly(ro);
    return () => setReadOnly(false);
  }, [lockKey, lockState.status, setReadOnly]);

  const reserveRows = useMemo<{ origin: string; unpaid: number }[]>(() => {
    if (!activeBranch) return [];
    return computeBranchSummary(activeBranch).rows.map((r) => ({
      origin: r.origin,
      unpaid: r.latest + r.ibnr,
    }));
  }, [activeBranch]);

  const monthlyPattern = (activeBranch?.cashflowMonthlyPattern ?? {}) as Record<string, { month: number; weight: number }[]>;
  const hasPattern = Object.keys(monthlyPattern).length > 0;

  const standardResult = useMemo<StandardDiscountResult | null>(() => {
    if (!hasPattern || reserveRows.length === 0) return null;
    return discountWithStandard(reserveRows, monthlyPattern, config);
  }, [reserveRows, monthlyPattern, config, hasPattern]);
  const discountResult: DiscountResult | null = standardResult?.base ?? null;

  // Karşılaştırma sekmesi: her iki standardın güncel konfigürasyonu ile hesap
  const comparison = useMemo<Record<ReportingStandard, StandardDiscountResult> | null>(() => {
    if (!hasPattern || reserveRows.length === 0) return null;
    return {
      ifrs4: discountWithStandard(reserveRows, monthlyPattern, configs.ifrs4),
      ifrs17: discountWithStandard(reserveRows, monthlyPattern, configs.ifrs17),
    };
  }, [reserveRows, monthlyPattern, configs, hasPattern]);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <ModelLockBanner state={lockState} onForceAcquire={forceAcquire} />
      <div className="flex flex-1 overflow-hidden">
      {/* Left panel */}
      <div
        className="shrink-0 border-r bg-[color:var(--surface)] flex flex-col overflow-y-auto transition-[width] duration-150"
        style={{ borderColor: "var(--border)", width: sidebarOpen ? 220 : 40 }}
      >
        {/* Header + toggle */}
        <div className="border-b flex items-center justify-between px-3 py-3" style={{ borderColor: "var(--border)" }}>
          {sidebarOpen && (
            <div>
              <h1 className="text-xs font-semibold">Discount</h1>
              <p className="text-[10px] text-[color:var(--muted)]">Discounted reserve</p>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="ml-auto p-1 rounded hover:bg-[color:var(--surface-alt)] transition text-[color:var(--muted-strong)]"
            title={sidebarOpen ? "Collapse" : "Expand"}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {sidebarOpen ? <path d="M15 18l-6-6 6-6" /> : <path d="M9 18l6-6-6-6" />}
            </svg>
          </button>
        </div>

        {sidebarOpen && (
          <div className="px-3 py-3 space-y-4 flex-1">
            <div>
              <label className="block text-[10px] font-medium text-[color:var(--muted-strong)] mb-1">Branch</label>
              {allBranches.length === 0 ? (
                <p className="text-xs text-[color:var(--muted)]">Create a branch in the Reserve module.</p>
              ) : (
                <select
                  value={selectedEntry?.branch.id ?? ""}
                  onChange={(e) => setSelectedBranchId(e.target.value)}
                  className="w-full text-xs border border-[color:var(--border)] rounded-md px-2 py-1.5 bg-[color:var(--surface)] text-[color:var(--foreground)]"
                >
                  {allBranches.map(({ branch, period }) => (
                    <option key={branch.id} value={branch.id}>{period.label} / {branch.name}</option>
                  ))}
                </select>
              )}
            </div>

            {activeBranch && !hasPattern && (
              <div className="text-[10px] rounded-lg px-2.5 py-2 leading-relaxed" style={{ background: "#fffbeb", border: "1px solid #f59e0b44", color: "#b45309" }}>
                No cashflow pattern. Run it in the Cashflow module.
              </div>
            )}

            {/* Standart seçimi */}
            <div>
              <label className="block text-[10px] font-medium text-[color:var(--muted-strong)] mb-1.5">Reporting Standard</label>
              <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: "var(--border)" }}>
                {(["ifrs4", "ifrs17"] as ReportingStandard[]).map((s) => (
                  <button key={s} onClick={() => setStandard(s)} className="flex-1 py-1.5 text-[10px] font-semibold transition"
                    style={{ background: standard === s ? "var(--primary)" : "var(--surface)", color: standard === s ? "#fff" : "var(--muted-strong)" }}>
                    {s === "ifrs4" ? "IFRS 4" : "IFRS 17"}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-[color:var(--muted)] mt-1 leading-relaxed">
                {standard === "ifrs4"
                  ? "Regulatory discount (SEDDK) or nominal. No Risk Adjustment."
                  : "Bottom-up curve (risk-free + illiquidity premium) + Risk Adjustment → LIC."}
              </p>
            </div>

            <div>
              <label className="block text-[10px] font-medium text-[color:var(--muted-strong)] mb-1.5">Discount Method</label>
              <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: "var(--border)" }}>
                {(standard === "ifrs4"
                  ? (["none", "flat", "curve"] as RateMode[])
                  : (["flat", "curve"] as RateMode[])
                ).map((m) => (
                  <button key={m} onClick={() => patchConfig({ rateMode: m })} className="flex-1 py-1.5 text-[10px] font-medium transition"
                    style={{ background: config.rateMode === m ? "var(--primary)" : "var(--surface)", color: config.rateMode === m ? "#fff" : "var(--muted-strong)" }}>
                    {m === "none" ? "Nominal" : m === "flat" ? "Flat" : "Curve"}
                  </button>
                ))}
              </div>
            </div>

            {config.rateMode === "flat" && (
              <div>
                <label className="block text-[10px] font-medium text-[color:var(--muted-strong)] mb-1">
                  {standard === "ifrs17" ? "Risk-Free Rate (%)" : "Annual Rate (%)"}
                </label>
                <input
                  type="number" min={0} max={200} step={0.1}
                  value={(config.flatRate * 100).toFixed(1)}
                  onChange={(e) => patchConfig({ flatRate: Number(e.target.value) / 100 })}
                  className="w-full text-xs border border-[color:var(--border)] rounded-md px-2 py-1.5 bg-[color:var(--surface)] text-[color:var(--foreground)]"
                />
                {standard === "ifrs4" && (
                  <p className="text-[10px] text-[color:var(--muted)] mt-1">SEDDK 2025: %{(SEDDK_FLAT_RATE_2025 * 100).toFixed(0)}</p>
                )}
              </div>
            )}

            {config.rateMode === "curve" && (
              <CurveEditor
                nodes={config.curveNodes}
                onChange={(nodes: CurveNode[]) => patchConfig({ curveNodes: nodes })}
              />
            )}

            {/* IFRS 17 parametreleri */}
            {standard === "ifrs17" && (
              <>
                <div>
                  <label className="block text-[10px] font-medium text-[color:var(--muted-strong)] mb-1">Illiquidity Premium (bps)</label>
                  <input
                    type="number" min={0} max={1000} step={5}
                    value={config.illiquidityPremiumBps}
                    onChange={(e) => patchConfig({ illiquidityPremiumBps: Number(e.target.value) })}
                    className="w-full text-xs border border-[color:var(--border)] rounded-md px-2 py-1.5 bg-[color:var(--surface)] text-[color:var(--foreground)]"
                  />
                  <p className="text-[10px] text-[color:var(--muted)] mt-1">Added on top of the risk-free curve (bottom-up).</p>
                </div>

                <div>
                  <label className="block text-[10px] font-medium text-[color:var(--muted-strong)] mb-1">Risk Adjustment</label>
                  <select
                    value={config.riskAdjustment.method}
                    onChange={(e) =>
                      patchConfig({
                        riskAdjustment: { ...config.riskAdjustment, method: e.target.value as RaMethod },
                      })
                    }
                    className="w-full text-xs border border-[color:var(--border)] rounded-md px-2 py-1.5 bg-[color:var(--surface)] text-[color:var(--foreground)]"
                  >
                    <option value="pct_of_bel">% of BEL</option>
                    <option value="cost_of_capital">Cost of Capital</option>
                    <option value="none">None</option>
                  </select>
                </div>

                {config.riskAdjustment.method === "pct_of_bel" && (
                  <div>
                    <label className="block text-[10px] font-medium text-[color:var(--muted-strong)] mb-1">RA — % of BEL (%)</label>
                    <input
                      type="number" min={0} max={100} step={0.5}
                      value={(config.riskAdjustment.pctOfBel * 100).toFixed(1)}
                      onChange={(e) =>
                        patchConfig({
                          riskAdjustment: { ...config.riskAdjustment, pctOfBel: Number(e.target.value) / 100 },
                        })
                      }
                      className="w-full text-xs border border-[color:var(--border)] rounded-md px-2 py-1.5 bg-[color:var(--surface)] text-[color:var(--foreground)]"
                    />
                  </div>
                )}

                {config.riskAdjustment.method === "cost_of_capital" && (
                  <div className="space-y-2">
                    <div>
                      <label className="block text-[10px] font-medium text-[color:var(--muted-strong)] mb-1">CoC Rate (%)</label>
                      <input
                        type="number" min={0} max={50} step={0.5}
                        value={(config.riskAdjustment.cocRate * 100).toFixed(1)}
                        onChange={(e) =>
                          patchConfig({
                            riskAdjustment: { ...config.riskAdjustment, cocRate: Number(e.target.value) / 100 },
                          })
                        }
                        className="w-full text-xs border border-[color:var(--border)] rounded-md px-2 py-1.5 bg-[color:var(--surface)] text-[color:var(--foreground)]"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-[color:var(--muted-strong)] mb-1">Capital Rate (%)</label>
                      <input
                        type="number" min={0} max={100} step={1}
                        value={(config.riskAdjustment.capitalRatio * 100).toFixed(0)}
                        onChange={(e) =>
                          patchConfig({
                            riskAdjustment: { ...config.riskAdjustment, capitalRatio: Number(e.target.value) / 100 },
                          })
                        }
                        className="w-full text-xs border border-[color:var(--border)] rounded-md px-2 py-1.5 bg-[color:var(--surface)] text-[color:var(--foreground)]"
                      />
                      <p className="text-[10px] text-[color:var(--muted)] mt-1">SCR proxy = remaining liability × this rate.</p>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Tab bar */}
        <div className="shrink-0 border-b px-6 flex items-end gap-1" style={{ borderColor: "var(--border)" }}>
          {([
            { key: "summary", label: "Summary" },
            { key: "cashflow", label: "Cashflow" },
            ...(config.rateMode !== "none"
              ? [{ key: "sensitivity" as MainTab, label: "Sensitivite" }]
              : []),
            { key: "comparison", label: "IFRS 4 / IFRS 17" },
          ] as { key: MainTab; label: string }[]).map((t) => (
            <button key={t.key} onClick={() => setMainTab(t.key)}
              className={"px-4 py-2.5 text-xs font-medium border-b-2 transition " +
                (effectiveTab === t.key ? "border-[color:var(--primary)] text-[color:var(--primary)]" : "border-transparent text-[color:var(--muted-strong)] hover:text-[color:var(--foreground)]")}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {!activeBranch ? (
            <div className="h-full flex items-center justify-center">
              <p className="text-sm text-[color:var(--muted)]">Select a branch from the left panel.</p>
            </div>
          ) : !hasPattern ? (
            <div className="h-full flex items-center justify-center text-center">
              <div className="space-y-2">
                <p className="text-sm text-[color:var(--muted)]">No cashflow pattern found.</p>
                <p className="text-xs text-[color:var(--muted)]">Compute this branch in the Cashflow module.</p>
              </div>
            </div>
          ) : !discountResult ? (
            <div className="h-full flex items-center justify-center">
              <p className="text-sm text-[color:var(--muted)]">Calculating…</p>
            </div>
          ) : (
            <>
              {/* KPI strip */}
              <div className={`grid gap-3 mb-6 ${standard === "ifrs17" ? "grid-cols-5" : "grid-cols-4"}`}>
                {(standard === "ifrs17" && standardResult
                  ? [
                      { label: "Unpaid Liability", value: fmt(discountResult.totals.unpaid), color: "#6366f1" },
                      { label: "BEL", value: fmt(discountResult.totals.bel), color: "#3b82f6" },
                      { label: "Risk Adjustment", value: fmt(standardResult.riskAdjustment.total), color: "#a855f7" },
                      { label: "LIC", value: fmt(standardResult.lic), color: "#0ea5e9" },
                      { label: "Discount %", value: pct(discountResult.totals.discountPct), color: discountColor(discountResult.totals.discountPct) },
                    ]
                  : [
                      { label: "Unpaid Liability", value: fmt(discountResult.totals.unpaid), color: "#6366f1" },
                      { label: "Discounted Unpaid", value: fmt(discountResult.totals.bel), color: "#3b82f6" },
                      { label: "Discount Amount", value: fmt(discountResult.totals.unpaid - discountResult.totals.bel), color: "#f97316" },
                      { label: "Discount %", value: pct(discountResult.totals.discountPct), color: discountColor(discountResult.totals.discountPct) },
                    ]
                ).map((kpi) => (
                  <div key={kpi.label} className="rounded-xl px-4 py-3" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                    <div className="text-[10px] uppercase tracking-wide text-[color:var(--muted)] mb-1">{kpi.label}</div>
                    <div className="text-xl font-bold font-mono" style={{ color: kpi.color }}>{kpi.value}</div>
                  </div>
                ))}
              </div>

              {effectiveTab === "summary" && <SummaryPanel result={discountResult} />}
              {effectiveTab === "cashflow" && <CashflowPanel result={discountResult} />}
              {effectiveTab === "sensitivity" && config.rateMode !== "none" && (
                <SensitivityPanel
                  rows={reserveRows}
                  config={config}
                  monthlyPattern={monthlyPattern}
                />
              )}
              {effectiveTab === "comparison" && comparison && (
                <ComparisonPanel comparison={comparison} configs={configs} />
              )}
            </>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
