"use client";

import { useEffect, useMemo, useState } from "react";
import type { Triangle } from "@/types/triangle";
import { formatNumber } from "@/lib/api";
import { cumulativeFactors } from "@/lib/ldf";

const DEFAULT_LR = 0.7;

type Basis = "cl" | "bf";

interface Props {
  triangle: Triangle | null;
  selectedLDFs: number[];
  premiums: Record<string, number>;
  elrPerOrigin: Record<string, number>;
  basisPerOrigin: Record<string, Basis>;
  correctionPerOrigin: Record<string, number>;
  onBasisChange: (origin: string, basis: Basis) => void;
}

export function UltimateTab(props: Props) {
  const {
    triangle,
    selectedLDFs,
    premiums,
    elrPerOrigin,
    basisPerOrigin,
    correctionPerOrigin,
    onBasisChange,
  } = props;

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

  const rows = useMemo(() => {
    if (!triangle) return [];
    const cdfs = cumulativeFactors(selectedLDFs);
    return triangle.origin_periods.map((o, i) => {
      let latest: number | null = null;
      let latestIdx = -1;
      for (let j = 0; j < triangle.values[i].length; j++) {
        const v = triangle.values[i][j];
        if (v != null) {
          latest = v;
          latestIdx = j;
        }
      }
      const cdf =
        latestIdx >= 0 && latestIdx < cdfs.length ? cdfs[latestIdx] : 1;
      const latestVal = latest ?? 0;
      const premium = premiums[o] ?? 0;
      const correction =
        correctionPerOrigin[o] && correctionPerOrigin[o] > 0
          ? correctionPerOrigin[o]
          : 1;
      const premiumAnnual = premium * correction;
      const clUlt = latestVal * cdf;
      const patternRatio = premiumAnnual > 0 ? clUlt / premiumAnnual : null;
      const userSelectedLR = elrPerOrigin[o];
      const selectedLR =
        userSelectedLR !== undefined
          ? userSelectedLR
          : patternRatio !== null
          ? patternRatio
          : DEFAULT_LR;
      const pctDeveloped = clUlt > 0 ? latestVal / clUlt : 1;
      // Annual BF ult → kısmi ulta bölerek indir
      const bfUltAnnual =
        latestVal + selectedLR * premiumAnnual * (1 - pctDeveloped);
      const bfUlt = bfUltAnnual / correction;
      const basis = basisPerOrigin[o] ?? "cl";
      const selectedUlt = basis === "cl" ? clUlt : bfUlt;
      const ibnr = selectedUlt - latestVal;
      // ULR partial dönem bazında: hem clUlt hem bfUlt zaten partial period
      // (bfUlt = bfUltAnnual/k). Bu yüzden ham premium ile bölmek doğru.
      // (Eski versiyonda bfUlt/premiumAnnual k'ya iki kez bölüyordu.)
      const ulr = premium > 0 ? selectedUlt / premium : null;
      return {
        origin: o,
        latest: latestVal,
        premium,
        premiumAnnual,
        correction,
        clUlt,
        bfUlt,
        basis,
        selectedUlt,
        ibnr,
        ulr,
      };
    });
  }, [triangle, selectedLDFs, premiums, elrPerOrigin, basisPerOrigin, correctionPerOrigin]);

  const totals = rows.reduce(
    (a, r) => ({
      latest: a.latest + r.latest,
      premium: a.premium + r.premium,
      premiumAnnual: a.premiumAnnual + r.premiumAnnual,
      clUlt: a.clUlt + r.clUlt,
      bfUlt: a.bfUlt + r.bfUlt,
      selectedUlt: a.selectedUlt + r.selectedUlt,
      ibnr: a.ibnr + r.ibnr,
    }),
    {
      latest: 0,
      premium: 0,
      premiumAnnual: 0,
      clUlt: 0,
      bfUlt: 0,
      selectedUlt: 0,
      ibnr: 0,
    },
  );

  if (!triangle) {
    return (
      <div className="card p-10 text-center text-sm text-[color:var(--muted)]">
        Önce Veri sekmesinden bir üçgen yükleyin.
      </div>
    );
  }

  const totalULR =
    totals.premium > 0 ? totals.selectedUlt / totals.premium : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Stat
          label="Toplam Seçili Ultimate"
          value={formatNumber(totals.selectedUlt)}
        />
        <Stat label="Toplam IBNR" value={formatNumber(totals.ibnr)} accent />
        <Stat
          label="Toplam ULR"
          value={totalULR != null ? `${(totalULR * 100).toFixed(1)}%` : "—"}
        />
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-[color:var(--surface-alt)]">
          <h2 className="text-sm font-semibold">Ultimate / IBNR — Origin Bazında</h2>
          <span className="text-xs text-[color:var(--muted)]">
            CL veya BF Ultimate hücresine tıkla · sürükleyerek birden fazla satır seç
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="text-sm w-full tabular">
            <thead>
              <tr className="text-[color:var(--muted-strong)] text-[11px] uppercase tracking-wide bg-[color:var(--surface-alt)]">
                <th className="text-left px-3 py-2 font-semibold">Kaza Yılı</th>
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
                <td className="px-3 py-2">Toplam</td>
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
      title={selected ? "Seçili temel" : "Tıkla / sürükleyerek seç"}
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
