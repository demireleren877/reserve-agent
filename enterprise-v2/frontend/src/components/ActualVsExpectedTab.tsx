"use client";

import type { AvEResult } from "@/lib/actual-vs-expected";
import { formatNumber } from "@/lib/api";

interface Props {
  result: AvEResult | null;
  priorLabel: string | null;
  basis: string | null;
}

export function ActualVsExpectedTab({ result, priorLabel, basis }: Props) {
  if (!priorLabel) return <Empty text="No prior valuation model was found for this branch." />;
  if (!result || !result.rows.length) {
    return <Empty text="No comparable development step was found after the prior valuation." />;
  }

  const adverse = result.totals.variance > 0;
  const priorCumulative = result.rows.reduce((sum, row) => sum + row.priorCumulative, 0);
  const currentCumulative = result.rows.reduce((sum, row) => sum + row.currentCumulative, 0);

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <h2 className="text-sm font-semibold">Actual vs Expected</h2>
          <p className="mt-1 text-xs text-[color:var(--muted-strong)]">
            <b>{basis ?? "Active"}</b> model · Expected development is derived from selected LDFs at the <b>{priorLabel}</b> valuation.
          </p>
        </div>
        <span className={`rounded-md px-2.5 py-1 text-xs font-semibold ${adverse ? "bg-[color:var(--danger-soft)] text-[color:var(--danger)]" : "bg-[color:var(--success-soft)] text-[color:var(--success)]"}`}>
          {adverse ? "Adverse development" : "Favorable development"}
        </span>
      </div>

      <div className="grid gap-px overflow-hidden rounded-lg border border-[color:var(--border)] bg-[color:var(--border)] sm:grid-cols-3">
        <Metric label="Actual development" value={result.totals.actual} />
        <Metric label="Expected development" value={result.totals.expected} />
        <Metric label="Variance" value={result.totals.variance} pct={result.totals.variancePct} />
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[980px] text-xs">
          <thead className="bg-[color:var(--surface-alt)] text-[color:var(--muted-strong)]">
            <tr>
              <th className="p-3 text-left">Accident year</th>
              <th className="p-3 text-left">Development</th>
              <th className="p-3 text-right">Prior cumulative</th>
              <th className="p-3 text-right">Current cumulative</th>
              <th className="p-3 text-right">Actual</th>
              <th className="p-3 text-right">Expected</th>
              <th className="p-3 text-right">Variance</th>
              <th className="p-3 text-right">Variance %</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row) => (
              <tr key={row.origin} className="border-t">
                <td className="p-3 font-medium">{row.origin}</td>
                <td className="p-3 text-[color:var(--muted-strong)]">{row.development}</td>
                <td className="p-3 text-right tabular">{formatNumber(row.priorCumulative)}</td>
                <td className="p-3 text-right tabular">{formatNumber(row.currentCumulative)}</td>
                <td className="p-3 text-right tabular">{formatNumber(row.actual)}</td>
                <td className="p-3 text-right tabular">{formatNumber(row.expected)}</td>
                <td className={`p-3 text-right font-semibold tabular ${row.variance > 0 ? "text-[color:var(--danger)]" : "text-[color:var(--success)]"}`}>
                  {row.variance > 0 ? "+" : ""}{formatNumber(row.variance)}
                </td>
                <td className="p-3 text-right tabular">
                  {row.variancePct == null ? "—" : `%${(row.variancePct * 100).toFixed(1)}`}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-[color:var(--surface-alt)] font-semibold">
            <tr className="border-t-2 border-[color:var(--border-strong)]">
              <th scope="row" className="p-3 text-left">Total</th>
              <td className="p-3 text-[color:var(--muted-strong)]">{result.rows.length} comparable periods</td>
              <td className="p-3 text-right tabular">{formatNumber(priorCumulative)}</td>
              <td className="p-3 text-right tabular">{formatNumber(currentCumulative)}</td>
              <td className="p-3 text-right tabular">{formatNumber(result.totals.actual)}</td>
              <td className="p-3 text-right tabular">{formatNumber(result.totals.expected)}</td>
              <td className={`p-3 text-right tabular ${adverse ? "text-[color:var(--danger)]" : "text-[color:var(--success)]"}`}>
                {result.totals.variance > 0 ? "+" : ""}{formatNumber(result.totals.variance)}
              </td>
              <td className="p-3 text-right tabular">
                {result.totals.variancePct == null ? "—" : `%${(result.totals.variancePct * 100).toFixed(1)}`}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function Metric({ label, value, pct }: { label: string; value: number; pct?: number | null }) {
  return (
    <div className="bg-[color:var(--surface)] p-4">
      <div className="text-[11px] text-[color:var(--muted)]">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular">{formatNumber(value)}</div>
      {pct != null && <div className="mt-1 text-xs text-[color:var(--muted-strong)]">{(pct * 100).toFixed(1)}%</div>}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="card p-8 text-center text-sm text-[color:var(--muted-strong)]">{text}</div>;
}
