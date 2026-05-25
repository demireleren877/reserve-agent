"use client";

import { useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  AreaChart, Area, LineChart, Line, CartesianGrid, Legend,
  ReferenceLine,
} from "recharts";
import { useProject } from "@/lib/project-store";
import { useModelLock } from "@/lib/use-model-lock";
import { ModelLockBanner } from "@/components/ModelLockBanner";
import { computeBranchSummary } from "@/lib/reserve-pipeline";
import {
  buildFlatRateFn,
  buildCurveFn,
  discountBranch,
  type CurveNode,
  type DiscountResult,
} from "@/lib/discount-engine";
import { formatNumber } from "@/lib/api";
import type { Branch, Period } from "@/types/project";

// ─── Types ────────────────────────────────────────────────────────────────────

type RateMode = "flat" | "curve";
type MainTab = "summary" | "cashflow" | "sensitivity";

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
  const unpaidPaid = payload.find((p) => p.name === "İskontolu Unpaid");
  const discount = payload.find((p) => p.name === "İskonto Tutarı");
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
          <span style={{ color: unpaidPaid.fill }}>İskontolu Unpaid</span>
          <span className="font-mono">{fmt(unpaidPaid.value)}</span>
        </div>
      )}
      {discount && (
        <div className="flex justify-between gap-4">
          <span style={{ color: discount.fill }}>İskonto</span>
          <span className="font-mono">{fmt(discount.value)}</span>
        </div>
      )}
      {total > 0 && (
        <div className="flex justify-between gap-4 pt-1 border-t" style={{ borderColor: "var(--border)" }}>
          <span style={{ color: "var(--muted-strong)" }}>İskonto %</span>
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
    "İskontolu Unpaid": Math.round(o.bel),
    "İskonto Tutarı": Math.round(o.unpaid - o.bel),
  }));

  return (
    <div className="space-y-6">
      {/* Stacked bar chart */}
      <div
        className="rounded-xl p-4"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <div className="text-xs font-semibold text-[color:var(--foreground)] mb-1">
          Unpaid Liability — Bileşim
        </div>
        <div className="text-xs text-[color:var(--muted)] mb-4">
          İskontolanmış rezerv (mavi) + iskonto kazancı (turuncu) = Unpaid Liability
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
            <Bar dataKey="İskontolu Unpaid" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} />
            <Bar dataKey="İskonto Tutarı" stackId="a" fill="#f97316" radius={[4, 4, 0, 0]} />
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
              <th className="px-4 py-2.5 text-left font-medium text-[color:var(--muted-strong)]">Kaza Dönemi</th>
              <th className="px-4 py-2.5 text-right font-medium text-[color:var(--muted-strong)]">Unpaid Liability</th>
              <th className="px-4 py-2.5 text-right font-medium text-[color:var(--muted-strong)]">İskontolu Unpaid</th>
              <th className="px-4 py-2.5 text-right font-medium text-[color:var(--muted-strong)]">İskonto Tutarı</th>
              <th className="px-4 py-2.5 text-right font-medium text-[color:var(--muted-strong)]">Tam. Ayı</th>
              <th className="px-4 py-2.5 font-medium text-[color:var(--muted-strong)] min-w-[140px]">İskonto %</th>
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
              <td className="px-4 py-3">Toplam</td>
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
      "İskontolanmış": Math.round(cf.discounted),
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
        "Nominal (kümülatif)": Math.round(cumNominal),
        "İskontolanmış (kümülatif)": Math.round(cumDiscounted),
      };
    });
  }, [origin]);

  type ChartRow = { month: number; A: number; B: number };
  const chartData: ChartRow[] = view === "single"
    ? singleData.map((d) => ({ month: d.month, A: d["Nominal"], B: d["İskontolanmış"] }))
    : cumulativeData.map((d) => ({ month: d.month, A: d["Nominal (kümülatif)"], B: d["İskontolanmış (kümülatif)"] }));
  const labelA = view === "single" ? "Nominal" : "Nominal (kümülatif)";
  const labelB = view === "single" ? "İskontolanmış" : "İskontolanmış (kümülatif)";

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[color:var(--muted-strong)]">Kaza yılı:</span>
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
          {([["single", "Aylık"], ["cumulative", "Kümülatif"]] as [string, string][]).map(([k, label]) => (
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
            { label: "İskontolu Unpaid", value: fmt(origin.bel), color: "#3b82f6" },
            { label: "İskonto", value: fmt(origin.unpaid - origin.bel), color: "#f97316" },
            { label: "İskonto %", value: pct(origin.discountPct), color: discountColor(origin.discountPct) },
            { label: "Tamamlanma Ayı", value: `${origin.duration}. ay`, color: "var(--muted-strong)" },
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
          İki eğri arasındaki alan = iskonto tutarı
        </p>
      </div>
    </div>
  );
}

// ─── Sensitivity Panel ─────────────────────────────────────────────────────────

function SensitivityPanel({
  rows,
  rateMode,
  baseRate,
  curveNodes,
  monthlyPattern,
}: {
  rows: { origin: string; unpaid: number }[];
  rateMode: RateMode;
  baseRate: number;
  curveNodes: CurveNode[];
  monthlyPattern: Record<string, { month: number; weight: number }[]>;
}) {
  // 11 nokta: baseRate ± %5, 1'er bp adım
  const lineData = useMemo(() => {
    const points: { rate: string; "İskontolu Unpaid": number; "İskonto Tutarı": number }[] = [];
    for (let bps = -500; bps <= 500; bps += 100) {
      const shock = bps / 10000;
      let getRateFn: (month: number) => number;
      if (rateMode === "flat") {
        getRateFn = buildFlatRateFn(Math.max(0.001, baseRate + shock));
      } else {
        const shifted = curveNodes.map((n) => ({ ...n, rate: Math.max(0.001, n.rate + shock) }));
        getRateFn = buildCurveFn(shifted);
      }
      const r = discountBranch(rows, monthlyPattern, getRateFn);
      points.push({
        rate: bps === 0 ? "Baz" : `${bps > 0 ? "+" : ""}${bps}bp`,
        "İskontolu Unpaid": Math.round(r.totals.bel),
        "İskonto Tutarı": Math.round(r.totals.unpaid - r.totals.bel),
      });
    }
    return points;
  }, [rateMode, baseRate, curveNodes, rows, monthlyPattern]);

  // Tablo için 5 senaryo
  const tableScenarios = useMemo(() => {
    return [-0.02, -0.01, 0, 0.01, 0.02].map((shock) => {
      let getRateFn: (month: number) => number;
      if (rateMode === "flat") {
        getRateFn = buildFlatRateFn(Math.max(0.001, baseRate + shock));
      } else {
        const shifted = curveNodes.map((n) => ({ ...n, rate: Math.max(0.001, n.rate + shock) }));
        getRateFn = buildCurveFn(shifted);
      }
      const r = discountBranch(rows, monthlyPattern, getRateFn);
      return { shock, result: r };
    });
  }, [rateMode, baseRate, curveNodes, rows, monthlyPattern]);

  const baseResult = tableScenarios.find((s) => s.shock === 0)?.result;

  return (
    <div className="space-y-6">
      {/* Line chart */}
      <div
        className="rounded-xl p-4"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <div className="text-xs font-semibold mb-1">Faiz Duyarlılığı</div>
        <div className="text-xs text-[color:var(--muted)] mb-4">
          Faiz değişimine göre İskontolu Unpaid ve İskonto Tutarı
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
            <Line dataKey="İskontolu Unpaid" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3, fill: "#3b82f6" }} />
            <Line dataKey="İskonto Tutarı" stroke="#f97316" strokeWidth={2} dot={{ r: 3, fill: "#f97316" }} />
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
              <th className="px-4 py-2.5 text-right font-medium text-[color:var(--muted-strong)]">İskontolu Unpaid</th>
              <th className="px-4 py-2.5 text-right font-medium text-[color:var(--muted-strong)]">İskonto Tutarı</th>
              <th className="px-4 py-2.5 text-right font-medium text-[color:var(--muted-strong)]">İskonto %</th>
              <th className="px-4 py-2.5 text-right font-medium text-[color:var(--muted-strong)]">Δ İsk. Unpaid</th>
            </tr>
          </thead>
          <tbody>
            {tableScenarios.map(({ shock, result: r }, i) => {
              const isBase = shock === 0;
              const delta = baseResult ? r.totals.bel - baseResult.totals.bel : 0;
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
                  <td className="px-4 py-2 text-right font-mono">{fmt(r.totals.unpaid)}</td>
                  <td className="px-4 py-2 text-right font-mono">{fmt(r.totals.bel)}</td>
                  <td className="px-4 py-2 text-right font-mono">{fmt(r.totals.unpaid - r.totals.bel)}</td>
                  <td className="px-4 py-2 text-right font-mono" style={{ color: discountColor(r.totals.discountPct) }}>
                    {pct(r.totals.discountPct)}
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

// ─── Curve node editor ────────────────────────────────────────────────────────

function CurveEditor({ nodes, onChange }: { nodes: CurveNode[]; onChange: (nodes: CurveNode[]) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[color:var(--muted-strong)]">İskonto Eğrisi</span>
        <button
          onClick={() => {
            const lastMonth = nodes[nodes.length - 1]?.month ?? 0;
            onChange([...nodes, { month: lastMonth + 12, rate: 0.05 }]);
          }}
          className="text-xs px-2 py-1 rounded border border-[color:var(--border)] text-[color:var(--muted-strong)] hover:text-[color:var(--foreground)] transition"
        >
          + Satır
        </button>
      </div>
      {nodes.length === 0 ? (
        <p className="text-xs text-[color:var(--muted)]">Eğri noktası eklenmemiş.</p>
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
          <p className="text-[10px] text-[color:var(--muted)]">Son noktanın ötesi flat extrapolasyon.</p>
        </>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DiscountPage() {
  const { project } = useProject();

  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [rateMode, setRateMode] = useState<RateMode>("flat");
  const [flatRate, setFlatRate] = useState<number>(0.3);
  const [curveNodes, setCurveNodes] = useState<CurveNode[]>([
    { month: 12, rate: 0.28 },
    { month: 36, rate: 0.25 },
    { month: 60, rate: 0.22 },
    { month: 120, rate: 0.20 },
  ]);
  const [mainTab, setMainTab] = useState<MainTab>("summary");
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
  const { state: lockState } = useModelLock(lockKey);

  const reserveRows = useMemo<{ origin: string; unpaid: number }[]>(() => {
    if (!activeBranch) return [];
    // Hasar üçgeni yoksa paid üçgenini fallback olarak kullan
    const branchForSummary =
      activeBranch.triangle
        ? activeBranch
        : activeBranch.paidTriangle
        ? { ...activeBranch, triangle: activeBranch.paidTriangle }
        : activeBranch;
    return computeBranchSummary(branchForSummary).rows.map((r) => ({
      origin: r.origin,
      unpaid: r.latest + r.ibnr,
    }));
  }, [activeBranch]);

  const monthlyPattern = (activeBranch?.cashflowMonthlyPattern ?? {}) as Record<string, { month: number; weight: number }[]>;
  const hasPattern = Object.keys(monthlyPattern).length > 0;

  const getRateFn = useMemo(() => {
    if (rateMode === "flat") return buildFlatRateFn(flatRate);
    return buildCurveFn(curveNodes);
  }, [rateMode, flatRate, curveNodes]);

  const discountResult = useMemo<DiscountResult | null>(() => {
    if (!hasPattern || reserveRows.length === 0) return null;
    return discountBranch(reserveRows, monthlyPattern, getRateFn);
  }, [reserveRows, monthlyPattern, getRateFn, hasPattern]);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <ModelLockBanner state={lockState} />
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
              <h1 className="text-xs font-semibold">İskonto</h1>
              <p className="text-[10px] text-[color:var(--muted)]">İskontolanmış rezerv</p>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="ml-auto p-1 rounded hover:bg-[color:var(--surface-alt)] transition text-[color:var(--muted-strong)]"
            title={sidebarOpen ? "Daralt" : "Genişlet"}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {sidebarOpen ? <path d="M15 18l-6-6 6-6" /> : <path d="M9 18l6-6-6-6" />}
            </svg>
          </button>
        </div>

        {sidebarOpen && (
          <div className="px-3 py-3 space-y-4 flex-1">
            <div>
              <label className="block text-[10px] font-medium text-[color:var(--muted-strong)] mb-1">Branş</label>
              {allBranches.length === 0 ? (
                <p className="text-xs text-[color:var(--muted)]">Rezerv modülünde branş oluşturun.</p>
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
                Nakit akışı pattern yok. Nakit Akışı modülünde çalıştırın.
              </div>
            )}

            <div>
              <label className="block text-[10px] font-medium text-[color:var(--muted-strong)] mb-1.5">İskonto Yöntemi</label>
              <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: "var(--border)" }}>
                {(["flat", "curve"] as RateMode[]).map((m) => (
                  <button key={m} onClick={() => setRateMode(m)} className="flex-1 py-1.5 text-[10px] font-medium transition"
                    style={{ background: rateMode === m ? "var(--primary)" : "var(--surface)", color: rateMode === m ? "#fff" : "var(--muted-strong)" }}>
                    {m === "flat" ? "Sabit" : "Eğri"}
                  </button>
                ))}
              </div>
            </div>

            {rateMode === "flat" && (
              <div>
                <label className="block text-[10px] font-medium text-[color:var(--muted-strong)] mb-1">Yıllık Faiz (%)</label>
                <input
                  type="number" min={0} max={200} step={0.1}
                  value={(flatRate * 100).toFixed(1)}
                  onChange={(e) => setFlatRate(Number(e.target.value) / 100)}
                  className="w-full text-xs border border-[color:var(--border)] rounded-md px-2 py-1.5 bg-[color:var(--surface)] text-[color:var(--foreground)]"
                />
                <p className="text-[10px] text-[color:var(--muted)] mt-1">SEDDK 2025: %30</p>
              </div>
            )}

            {rateMode === "curve" && <CurveEditor nodes={curveNodes} onChange={setCurveNodes} />}
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Tab bar */}
        <div className="shrink-0 border-b px-6 flex items-end gap-1" style={{ borderColor: "var(--border)" }}>
          {([
            { key: "summary", label: "Özet" },
            { key: "cashflow", label: "Nakit Akışı" },
            { key: "sensitivity", label: "Sensitivite" },
          ] as { key: MainTab; label: string }[]).map((t) => (
            <button key={t.key} onClick={() => setMainTab(t.key)}
              className={"px-4 py-2.5 text-xs font-medium border-b-2 transition " +
                (mainTab === t.key ? "border-[color:var(--primary)] text-[color:var(--primary)]" : "border-transparent text-[color:var(--muted-strong)] hover:text-[color:var(--foreground)]")}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {!activeBranch ? (
            <div className="h-full flex items-center justify-center">
              <p className="text-sm text-[color:var(--muted)]">Sol panelden bir branş seçin.</p>
            </div>
          ) : !hasPattern ? (
            <div className="h-full flex items-center justify-center text-center">
              <div className="space-y-2">
                <p className="text-sm text-[color:var(--muted)]">Nakit akışı pattern bulunamadı.</p>
                <p className="text-xs text-[color:var(--muted)]">Nakit Akışı modülünde bu branşı hesaplayın.</p>
              </div>
            </div>
          ) : !discountResult ? (
            <div className="h-full flex items-center justify-center text-center">
              <div className="space-y-2">
                <p className="text-sm text-[color:var(--muted)]">Rezerv verisi hesaplanamadı.</p>
                <p className="text-xs text-[color:var(--muted)]">Branşa bir üçgen yüklendiğinden emin olun.</p>
              </div>
            </div>
          ) : (
            <>
              {/* KPI strip */}
              <div className="grid grid-cols-4 gap-3 mb-6">
                {[
                  { label: "Unpaid Liability", value: fmt(discountResult.totals.unpaid), color: "#6366f1" },
                  { label: "İskontolu Unpaid", value: fmt(discountResult.totals.bel), color: "#3b82f6" },
                  { label: "İskonto Tutarı", value: fmt(discountResult.totals.unpaid - discountResult.totals.bel), color: "#f97316" },
                  { label: "İskonto %", value: pct(discountResult.totals.discountPct), color: discountColor(discountResult.totals.discountPct) },
                ].map((kpi) => (
                  <div key={kpi.label} className="rounded-xl px-4 py-3" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                    <div className="text-[10px] uppercase tracking-wide text-[color:var(--muted)] mb-1">{kpi.label}</div>
                    <div className="text-xl font-bold font-mono" style={{ color: kpi.color }}>{kpi.value}</div>
                  </div>
                ))}
              </div>

              {mainTab === "summary" && <SummaryPanel result={discountResult} />}
              {mainTab === "cashflow" && <CashflowPanel result={discountResult} />}
              {mainTab === "sensitivity" && (
                <SensitivityPanel
                  rows={reserveRows}
                  rateMode={rateMode}
                  baseRate={flatRate}
                  curveNodes={curveNodes}
                  monthlyPattern={monthlyPattern}
                />
              )}
            </>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
