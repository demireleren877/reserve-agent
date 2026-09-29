"use client";

import { useEffect, useState } from "react";
import { formatNumber } from "@/lib/api";

type Basis = "cl" | "bf";

/** SummaryTab ile TEK KAYNAK: reserve sayfasının runPipeline çıktısı (yapısal). */
interface UltimateSummary {
  rows: {
    origin: string;
    latest: number;
    premium: number;
    clUltimate: number;
    bfUltimate: number;
    selectedUltimate: number;
    ibnr: number;
    ulr: number | null;
    basis: Basis;
  }[];
}

interface Props {
  /** Özet (SummaryTab) ile aynı summary — birebir tutması garanti. */
  summary: UltimateSummary | null;
  onBasisChange: (origin: string, basis: Basis) => void;
}

export function UltimateTab({ summary, onBasisChange }: Props) {
  const [dragBasis, setDragBasis] = useState<Basis | null>(null);

  useEffect(() => {
    if (dragBasis === null) return;
    const end = () => setDragBasis(null);
    window.addEventListener("mouseup", end);
    window.addEventListener("dragend", end);
    return () => {
      window.removeEventListener("mouseup", end);
      window.removeEventListener("dragend", end);
    };
  }, [dragBasis]);

  if (!summary || summary.rows.length === 0) {
    return (
      <div className="card p-10 text-center text-sm text-[color:var(--muted)]">
        Load a triangle from the Data tab first.
      </div>
    );
  }

  // TEK KAYNAK: Özet sayfasıyla birebir aynı satırlar (runPipeline).
  const rows = summary.rows.map((r) => ({
    origin: r.origin,
    latest: r.latest,
    premium: r.premium,
    clUlt: r.clUltimate,
    bfUlt: r.bfUltimate,
    selectedUlt: r.selectedUltimate,
    basis: r.basis,
    ibnr: r.ibnr,
    ulr: r.ulr,
  }));
  const totals = rows.reduce(
    (a, r) => ({
      latest: a.latest + r.latest,
      premium: a.premium + r.premium,
      clUlt: a.clUlt + r.clUlt,
      bfUlt: a.bfUlt + r.bfUlt,
      selectedUlt: a.selectedUlt + r.selectedUlt,
      ibnr: a.ibnr + r.ibnr,
    }),
    { latest: 0, premium: 0, clUlt: 0, bfUlt: 0, selectedUlt: 0, ibnr: 0 },
  );
  const totalULR =
    totals.premium > 0 ? totals.selectedUlt / totals.premium : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Stat
          label="Total Selected Ultimate"
          value={formatNumber(totals.selectedUlt)}
        />
        <Stat label="Total IBNR" value={formatNumber(totals.ibnr)} accent />
        <Stat
          label="Total ULR"
          value={totalULR != null ? `${(totalULR * 100).toFixed(1)}%` : "—"}
        />
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-[color:var(--surface-alt)]">
          <h2 className="text-sm font-semibold">Ultimate / IBNR — By Origin</h2>
          <span className="text-xs text-[color:var(--muted)]">
            Click a CL or BF Ultimate cell · drag to select multiple rows
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="text-sm w-full tabular">
            <thead>
              <tr className="text-[color:var(--muted-strong)] text-[11px] uppercase tracking-wide bg-[color:var(--surface-alt)]">
                <th className="text-left px-3 py-2 font-semibold">Accident Year</th>
                <th className="text-right px-3 py-2 font-semibold">Latest</th>
                <th className="text-right px-3 py-2 font-semibold">Exposure</th>
                <th className="text-right px-3 py-2 font-semibold">CL Ultimate</th>
                <th className="text-right px-3 py-2 font-semibold">BF Ultimate</th>
                <th className="text-right px-3 py-2 font-semibold">IBNR</th>
                <th className="text-right px-3 py-2 font-semibold">Ult Loss Ratio</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.origin}
                  className="border-t hover:bg-[color:var(--surface-alt)]/40"
                >
                  <td className="px-3 py-1.5 font-medium">{r.origin}</td>
                  <td className="text-right px-3 py-1.5">
                    {formatNumber(r.latest)}
                  </td>
                  <td className="text-right px-3 py-1.5">
                    {formatNumber(r.premium)}
                  </td>
                  <td className="p-0">
                    <UltimateCell
                      value={r.clUlt}
                      selected={r.basis === "cl"}
                      onMouseDown={() => {
                        onBasisChange(r.origin, "cl");
                        setDragBasis("cl");
                      }}
                      onMouseEnter={() => {
                        if (dragBasis !== null) {
                          onBasisChange(r.origin, dragBasis);
                        }
                      }}
                    />
                  </td>
                  <td className="p-0">
                    <UltimateCell
                      value={r.bfUlt}
                      selected={r.basis === "bf"}
                      onMouseDown={() => {
                        onBasisChange(r.origin, "bf");
                        setDragBasis("bf");
                      }}
                      onMouseEnter={() => {
                        if (dragBasis !== null) {
                          onBasisChange(r.origin, dragBasis);
                        }
                      }}
                    />
                  </td>
                  <td className="text-right px-3 py-1.5 font-semibold text-[color:var(--primary)]">
                    {formatNumber(r.ibnr)}
                  </td>
                  <td className="text-right px-3 py-1.5 text-[color:var(--muted-strong)]">
                    {r.ulr != null ? `${(r.ulr * 100).toFixed(1)}%` : "—"}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-[color:var(--border-strong)] font-semibold bg-[color:var(--surface-alt)]">
                <td className="px-3 py-2">Total</td>
                <td className="text-right px-3 py-2">
                  {formatNumber(totals.latest)}
                </td>
                <td className="text-right px-3 py-2">
                  {formatNumber(totals.premium)}
                </td>
                <td className="text-right px-3 py-2 text-[color:var(--muted-strong)]">
                  {formatNumber(totals.clUlt)}
                </td>
                <td className="text-right px-3 py-2 text-[color:var(--muted-strong)]">
                  {formatNumber(totals.bfUlt)}
                </td>
                <td className="text-right px-3 py-2 text-[color:var(--primary)]">
                  {formatNumber(totals.ibnr)}
                </td>
                <td className="text-right px-3 py-2 text-[color:var(--muted-strong)]">
                  {totalULR != null
                    ? `${(totalULR * 100).toFixed(1)}%`
                    : "—"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function UltimateCell({
  value,
  selected,
  onMouseDown,
  onMouseEnter,
}: {
  value: number;
  selected: boolean;
  onMouseDown: () => void;
  onMouseEnter: () => void;
}) {
  return (
    <div
      onMouseDown={(e) => {
        e.preventDefault();
        onMouseDown();
      }}
      onMouseEnter={onMouseEnter}
      title={selected ? "Selected basis" : "Click / drag to select"}
      className={
        "w-full h-full text-right px-3 py-1.5 text-sm tabular transition cursor-pointer select-none " +
        (selected
          ? "bg-[color:var(--success-soft)] text-[color:var(--success)] font-semibold"
          : "text-[color:var(--muted-strong)] hover:bg-[color:var(--surface-alt)]")
      }
    >
      {formatNumber(value)}
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={
        "card p-4 " +
        (accent
          ? "border-[color:var(--primary-border)] bg-[color:var(--primary-soft)]"
          : "")
      }
    >
      <div
        className={
          "text-[10px] uppercase tracking-wide mb-1 font-semibold " +
          (accent ? "text-[color:var(--primary)]" : "text-[color:var(--muted-strong)]")
        }
      >
        {label}
      </div>
      <div
        className={
          "text-xl font-semibold tabular " +
          (accent ? "text-[color:var(--primary)]" : "")
        }
      >
        {value}
      </div>
    </div>
  );
}
