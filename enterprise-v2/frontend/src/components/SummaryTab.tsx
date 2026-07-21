"use client";

import { useMemo } from "react";
import type { Triangle } from "@/types/triangle";
import { formatFactor, formatNumber } from "@/lib/api";
import { type Window } from "@/lib/ldf";

interface PerOriginRow {
  origin: string;
  latest: number;
  premium: number;
  premiumAnnual: number;
  correction: number;
  cdf: number;
  clUltimate: number;
  bfUltimate: number;
  selectedUltimate: number;
  ibnr: number;
  ulr: number | null;
  basis: "cl" | "bf";
  selectedLR: number;
  selectedLRInput: string | null;
  pctDeveloped: number | null;
}

interface ExclusionImpact {
  origin: string;
  step: number;
  ldfValue: number | null;
  median: number | null;
  deviationPct: number | null;
  /** IBNR farkı: bu eleme uygulanmasaydı toplam IBNR ne kadar değişirdi.
   *  Pozitif → eleme IBNR'yi düşürmüş (riski tutucu indirmişiz).
   *  Negatif → eleme IBNR'yi yükseltmiş. */
  ibnrImpact: number;
}

interface Props {
  triangle: Triangle | null;
  branchName: string;
  frequency: "yearly" | "quarterly";
  periodLabel: string;
  window: Window;
  selectedLDFs: number[];
  effectiveCDFs: number[];
  initialCDFs: number[];
  excludedCells: Set<string>;
  rows: PerOriginRow[];
  totals: {
    latest: number;
    exposure: number;
    selectedUltimate: number;
    ibnr: number;
  };
  curveOverrides: { devPeriod: string; userValue: number }[];
  correctionEntries: { origin: string; value: number }[];
  manualLRCount: number;
  bfBasisCount: number;
  exclusionImpacts: ExclusionImpact[];
}

const DEFAULT_WINDOW: Window = "all";

export function SummaryTab(props: Props) {
  const {
    triangle,
    branchName,
    frequency,
    periodLabel,
    window,
    selectedLDFs,
    effectiveCDFs,
    excludedCells,
    rows,
    totals,
    curveOverrides,
    correctionEntries,
    manualLRCount,
    bfBasisCount,
    exclusionImpacts,
  } = props;

  const totalRawPremium = rows.reduce((s, r) => s + r.premium, 0);
  const totalULR =
    totalRawPremium > 0 ? totals.selectedUltimate / totalRawPremium : null;

  const triangleLabel =
    triangle?.triangle_type === "incurred" ? "Incurred" : "Paid";

  const interventions = useMemo(() => {
    const items: { label: string; value: string; tone?: "muted" | "accent" }[] = [];
    if (String(window) !== String(DEFAULT_WINDOW)) {
      items.push({ label: "Volume", value: `Son ${window}` });
    }
    if (excludedCells.size > 0) {
      items.push({
        label: "Hücre eleme",
        value: `${excludedCells.size} hücre`,
        tone: "accent",
      });
    }
    if (curveOverrides.length > 0) {
      items.push({
        label: "Curve override (tail truncation)",
        value: `${curveOverrides.length} period`,
        tone: "accent",
      });
    }
    if (correctionEntries.length > 0) {
      items.push({
        label: "BF Correction (annualization)",
        value: `${correctionEntries.length} origin`,
        tone: "accent",
      });
    }
    if (manualLRCount > 0) {
      items.push({
        label: "Manuel Selected LR",
        value: `${manualLRCount} origin`,
      });
    }
    if (bfBasisCount > 0) {
      items.push({
        label: "BF temelinde origin",
        value: `${bfBasisCount} origin`,
      });
    }
    return items;
  }, [
    window,
    excludedCells.size,
    curveOverrides.length,
    correctionEntries.length,
    manualLRCount,
    bfBasisCount,
  ]);

  if (!triangle) {
    return (
      <div className="card p-10 text-center text-sm text-[color:var(--muted)]">
        Önce Veri sekmesinden bir üçgen yükleyin.
      </div>
    );
  }

  const originRange =
    triangle.origin_periods.length > 0
      ? `${triangle.origin_periods[0]} – ${triangle.origin_periods[triangle.origin_periods.length - 1]}`
      : "—";

  const ibnrSavedByExclusions = exclusionImpacts.reduce(
    (s, e) => s + e.ibnrImpact,
    0,
  );

  return (
    <div className="space-y-4">
      {/* Başlık */}
      <div className="card p-4">
        <h2 className="text-base font-semibold">{branchName}</h2>
        <p className="text-xs text-[color:var(--muted-strong)] mt-0.5">
          {periodLabel} ·{" "}
          {frequency === "yearly" ? "Yıllık" : "Çeyreklik"} model ·{" "}
          {triangleLabel} üçgeni · {originRange} ({triangle.origin_periods.length}{" "}
          origin × {triangle.development_periods.length} dev period)
        </p>
      </div>

      {/* Final rakamlar */}
      <div className="grid grid-cols-5 gap-3">
        <Stat label={`Toplam ${triangleLabel}`} value={formatNumber(totals.latest)} />
        <Stat label="Toplam Exposure (yıllık)" value={formatNumber(totals.exposure)} />
        <Stat
          label="Seçili Ultimate"
          value={formatNumber(totals.selectedUltimate)}
        />
        <Stat label="Seçili IBNR" value={formatNumber(totals.ibnr)} accent />
        <Stat
          label="Selected ULR"
          value={totalULR != null ? `${(totalULR * 100).toFixed(1)}%` : "—"}
        />
      </div>

      {/* Aktüer müdahaleleri (default'tan sapan ne varsa) */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b bg-[color:var(--surface-alt)]">
          <h3 className="text-sm font-semibold">Aktüer Müdahaleleri</h3>
          <p className="text-[11px] text-[color:var(--muted)] mt-0.5">
            Default ayarlardan sapan tüm seçimler — ikinci hat inceleme için
            kapsama listesi.
          </p>
        </div>
        {interventions.length === 0 ? (
          <div className="p-4 text-sm text-[color:var(--muted-strong)]">
            Model tüm varsayılan ayarlarda. Hücre eleme, curve override, BF
            correction, manuel LR veya BF basis seçimi yok.
          </div>
        ) : (
          <ul className="divide-y">
            {interventions.map((it, i) => (
              <li
                key={i}
                className="px-4 py-2 flex items-center justify-between text-sm"
              >
                <span className="text-[color:var(--muted-strong)]">{it.label}</span>
                <span
                  className={
                    "tabular font-semibold text-[11px] px-2 py-0.5 rounded " +
                    (it.tone === "accent"
                      ? "bg-[color:var(--primary-soft)] text-[color:var(--primary)]"
                      : "bg-[color:var(--surface-alt)] text-[color:var(--muted-strong)]")
                  }
                >
                  {it.value}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Per-origin final */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b bg-[color:var(--surface-alt)]">
          <h3 className="text-sm font-semibold">Origin Bazında Final</h3>
          <p className="text-[11px] text-[color:var(--muted)] mt-0.5">
            Seçili Ultimate = origin başına seçilen temel (CL/BF). Correction
            yıllık exposure'a tamamlama katsayısı; IBNR kısmi dönem üzerinden.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="text-sm w-full tabular">
            <thead>
              <tr className="text-[color:var(--muted-strong)] text-[11px] uppercase tracking-wide bg-[color:var(--background)]">
                <th className="text-left px-3 py-2 font-semibold">Kaza</th>
                <th className="text-right px-3 py-2 font-semibold">Latest</th>
                <th className="text-right px-3 py-2 font-semibold">Exposure</th>
                <th className="text-right px-3 py-2 font-semibold">k</th>
                <th className="text-right px-3 py-2 font-semibold">CDF</th>
                <th className="text-right px-3 py-2 font-semibold">% Dev</th>
                <th className="text-left px-3 py-2 font-semibold">Temel</th>
                <th className="text-right px-3 py-2 font-semibold">Sel. LR</th>
                <th className="text-right px-3 py-2 font-semibold">
                  Seçili Ult
                </th>
                <th className="text-right px-3 py-2 font-semibold">IBNR</th>
                <th className="text-right px-3 py-2 font-semibold">ULR</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr
                  key={r.origin}
                  className={
                    "border-t hover:bg-[color:var(--surface-alt)]/40 " +
                    (idx % 2 === 1 ? "bg-[color:var(--surface-alt)]/20" : "")
                  }
                >
                  <td className="px-3 py-1.5 font-medium">{r.origin}</td>
                  <td className="text-right px-3 py-1.5">
                    {formatNumber(r.latest)}
                  </td>
                  <td className="text-right px-3 py-1.5">
                    {r.premium > 0 ? formatNumber(r.premium) : "—"}
                  </td>
                  <td
                    className={
                      "text-right px-3 py-1.5 " +
                      (r.correction !== 1
                        ? "text-[color:var(--primary)] font-medium"
                        : "text-[color:var(--muted)]")
                    }
                  >
                    {r.correction !== 1 ? `×${r.correction}` : "—"}
                  </td>
                  <td className="text-right px-3 py-1.5 text-[color:var(--muted-strong)]">
                    {formatFactor(r.cdf)}
                  </td>
                  <td className="text-right px-3 py-1.5 text-[color:var(--muted-strong)]">
                    {r.pctDeveloped != null
                      ? `${(r.pctDeveloped * 100).toFixed(1)}%`
                      : "—"}
                  </td>
                  <td className="px-3 py-1.5">
                    <span
                      className={
                        "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide " +
                        (r.basis === "bf"
                          ? "bg-[color:var(--primary-soft)] text-[color:var(--primary)]"
                          : "bg-[color:var(--surface-alt)] text-[color:var(--muted-strong)]")
                      }
                    >
                      {r.basis}
                    </span>
                  </td>
                  <td
                    className="text-right px-3 py-1.5 text-[color:var(--muted-strong)]"
                    title={r.selectedLRInput ?? undefined}
                  >
                    {`${(r.selectedLR * 100).toFixed(1)}%`}
                    {r.selectedLRInput && (
                      <span className="ml-1 text-[9px] font-semibold text-[color:var(--primary)]">
                        ƒ
                      </span>
                    )}
                  </td>
                  <td className="text-right px-3 py-1.5 font-semibold">
                    {formatNumber(r.selectedUltimate)}
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
                  {formatNumber(totals.exposure)}
                </td>
                <td colSpan={5} />
                <td className="text-right px-3 py-2">
                  {formatNumber(totals.selectedUltimate)}
                </td>
                <td className="text-right px-3 py-2 text-[color:var(--primary)]">
                  {formatNumber(totals.ibnr)}
                </td>
                <td className="text-right px-3 py-2">
                  {totalULR != null ? `${(totalULR * 100).toFixed(1)}%` : "—"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Eleme etkisi tablosu */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b bg-[color:var(--surface-alt)]">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-sm font-semibold">
                Eleme Etkisi {excludedCells.size > 0 && `(${excludedCells.size})`}
              </h3>
              <p className="text-[11px] text-[color:var(--muted)] mt-0.5">
                Her satır: o eleme uygulanmasaydı toplam IBNR ne kadar değişirdi
                (pozitif = eleme rezervi düşürmüş; negatif = yükseltmiş).
              </p>
            </div>
            {exclusionImpacts.length > 0 && (
              <div className="text-right">
                <div className="text-[10px] uppercase text-[color:var(--muted)]">
                  Elemelerin net IBNR etkisi
                </div>
                <div
                  className={
                    "text-base font-semibold tabular " +
                    (ibnrSavedByExclusions > 0
                      ? "text-[color:var(--success)]"
                      : ibnrSavedByExclusions < 0
                      ? "text-[color:var(--danger)]"
                      : "")
                  }
                >
                  {ibnrSavedByExclusions > 0 ? "+" : ""}
                  {formatNumber(ibnrSavedByExclusions)}
                </div>
              </div>
            )}
          </div>
        </div>
        {exclusionImpacts.length === 0 ? (
          <div className="p-6 text-center text-sm text-[color:var(--muted)]">
            Hiç hücre elenmemiş.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="text-sm w-full tabular">
              <thead>
                <tr className="text-[color:var(--muted-strong)] text-[11px] uppercase tracking-wide bg-[color:var(--background)]">
                  <th className="text-left px-3 py-2 font-semibold">Kaza</th>
                  <th className="text-left px-3 py-2 font-semibold">Adım</th>
                  <th className="text-right px-3 py-2 font-semibold">LDF</th>
                  <th className="text-right px-3 py-2 font-semibold">
                    Kolon medyanı
                  </th>
                  <th className="text-right px-3 py-2 font-semibold">Sapma</th>
                  <th className="text-right px-3 py-2 font-semibold">
                    IBNR'a etkisi
                  </th>
                </tr>
              </thead>
              <tbody>
                {exclusionImpacts.map((e, idx) => (
                  <tr
                    key={`${e.origin}|${e.step}`}
                    className={
                      "border-t hover:bg-[color:var(--surface-alt)]/50 " +
                      (idx % 2 === 1 ? "bg-[color:var(--surface-alt)]/20" : "")
                    }
                  >
                    <td className="px-3 py-1.5 font-medium">{e.origin}</td>
                    <td className="px-3 py-1.5 text-[color:var(--muted)]">
                      {e.step + 1}→{e.step + 2}
                    </td>
                    <td className="text-right px-3 py-1.5">
                      {e.ldfValue != null ? formatFactor(e.ldfValue) : "—"}
                    </td>
                    <td className="text-right px-3 py-1.5 text-[color:var(--muted-strong)]">
                      {e.median != null ? formatFactor(e.median) : "—"}
                    </td>
                    <td
                      className={
                        "text-right px-3 py-1.5 font-medium " +
                        (e.deviationPct == null
                          ? ""
                          : e.deviationPct > 0
                          ? "text-[color:var(--danger)]"
                          : "text-[color:var(--primary)]")
                      }
                    >
                      {e.deviationPct == null
                        ? "—"
                        : `${e.deviationPct > 0 ? "+" : ""}${e.deviationPct.toFixed(1)}%`}
                    </td>
                    <td
                      className={
                        "text-right px-3 py-1.5 font-semibold " +
                        (e.ibnrImpact > 0
                          ? "text-[color:var(--success)]"
                          : e.ibnrImpact < 0
                          ? "text-[color:var(--danger)]"
                          : "text-[color:var(--muted)]")
                      }
                    >
                      {e.ibnrImpact > 0 ? "+" : ""}
                      {formatNumber(e.ibnrImpact)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* LDF / CDF zinciri */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b bg-[color:var(--surface-alt)]">
          <h3 className="text-sm font-semibold">LDF & CDF Zinciri</h3>
          <p className="text-[11px] text-[color:var(--muted)] mt-0.5">
            Effective CDF, Curve sekmesindeki override'ları yansıtır.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="text-sm w-full tabular">
            <thead>
              <tr className="text-[color:var(--muted-strong)] text-[11px] uppercase tracking-wide bg-[color:var(--background)]">
                <th className="text-left px-3 py-2 font-semibold">Adım</th>
                <th className="text-right px-3 py-2 font-semibold">Selected LDF</th>
                <th className="text-right px-3 py-2 font-semibold">
                  Effective CDF (→ Ult)
                </th>
              </tr>
            </thead>
            <tbody>
              {selectedLDFs.map((ldf, i) => (
                <tr
                  key={i}
                  className={
                    "border-t " +
                    (i % 2 === 1 ? "bg-[color:var(--surface-alt)]/20" : "")
                  }
                >
                  <td className="px-3 py-1.5 text-[color:var(--muted-strong)]">
                    {i + 1}→{i + 2}
                  </td>
                  <td className="text-right px-3 py-1.5">{formatFactor(ldf)}</td>
                  <td className="text-right px-3 py-1.5 font-medium">
                    {formatFactor(effectiveCDFs[i] ?? 1)}
                  </td>
                </tr>
              ))}
              {effectiveCDFs.length > selectedLDFs.length && (
                <tr className="border-t">
                  <td className="px-3 py-1.5 text-[color:var(--muted-strong)]">
                    {selectedLDFs.length + 1} (tail)
                  </td>
                  <td className="text-right px-3 py-1.5 text-[color:var(--muted)]">—</td>
                  <td className="text-right px-3 py-1.5 font-medium">
                    {formatFactor(effectiveCDFs[selectedLDFs.length] ?? 1)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
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
          (accent
            ? "text-[color:var(--primary)]"
            : "text-[color:var(--muted-strong)]")
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
