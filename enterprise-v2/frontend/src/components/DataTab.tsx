"use client";

import { useState, useMemo, useEffect } from "react";
import type { Triangle } from "@/types/triangle";
import { TriangleGrid } from "@/components/TriangleGrid";
import { formatNumber } from "@/lib/api";
import { LoadFromDataStore } from "@/components/LoadFromDataStore";
import {
  buildDisplayMatrix,
  originLengthOptions,
  devLengthOptions,
  granMonths,
  type ViewMode,
} from "@/lib/triangle-view";

type TriType = "paid" | "muallak" | "incurred";

const TYPE_TABS: { id: TriType; label: string }[] = [
  { id: "paid", label: "Ödeme" },
  { id: "muallak", label: "Muallak" },
  { id: "incurred", label: "Gerçekleşen" },
];

interface Props {
  paidTriangle: Triangle | null;
  incurredTriangle: Triangle | null;
}

function toMuallak(paid: Triangle, incurred: Triangle): Triangle | null {
  if (
    paid.origin_periods.length !== incurred.origin_periods.length ||
    paid.development_periods.length !== incurred.development_periods.length
  )
    return null;
  const values = incurred.values.map((row, i) =>
    row.map((inc, j) => {
      const p = paid.values[i]?.[j];
      return inc != null && p != null ? inc - p : null;
    }),
  );
  return { ...incurred, values };
}

function lenLabel(months: number): string {
  if (months === 3) return "Çeyreklik";
  if (months === 12) return "Yıllık";
  if (months % 12 === 0) return `${months / 12} yıllık`;
  return `${months} ay`;
}

function granLabel(g: "yearly" | "quarterly"): string {
  return g === "quarterly" ? "Çeyreklik" : "Yıllık";
}

export function DataTab({ paidTriangle, incurredTriangle }: Props) {
  const [type, setType] = useState<TriType>("paid");
  const [showLoadDialog, setShowLoadDialog] = useState(false);

  // Görünüm seçenekleri
  const [cumulative, setCumulative] = useState(true);
  const [transposed, setTransposed] = useState(false);
  const [view, setView] = useState<ViewMode>("development");
  const [originLen, setOriginLen] = useState(12);
  const [devLen, setDevLen] = useState(12);
  const [decimals, setDecimals] = useState(0);

  const muallakTriangle = useMemo(
    () =>
      paidTriangle && incurredTriangle
        ? toMuallak(paidTriangle, incurredTriangle)
        : null,
    [paidTriangle, incurredTriangle],
  );

  const anyLoaded = paidTriangle || incurredTriangle;
  const primaryTri = paidTriangle ?? incurredTriangle;

  const originOpts = useMemo(
    () => (primaryTri ? originLengthOptions(primaryTri) : [12]),
    [primaryTri],
  );
  const devOpts = useMemo(
    () => (primaryTri ? devLengthOptions(primaryTri) : [12]),
    [primaryTri],
  );

  // Üçgen değişince (granülarite) uzunlukları min'e çek
  useEffect(() => {
    setOriginLen(originOpts[0]);
    setDevLen(devOpts[0]);
  }, [originOpts, devOpts]);

  const baseByType: Record<TriType, Triangle | null> = {
    paid: paidTriangle,
    muallak: muallakTriangle,
    incurred: incurredTriangle,
  };
  const base = baseByType[type];

  const missingByType: Record<TriType, string> = {
    paid: "Ödeme üçgeni yüklenmedi.",
    muallak: "Muallak için hem Ödeme hem Gerçekleşen üçgeni yüklenmeli.",
    incurred: "Gerçekleşen üçgeni yüklenmedi.",
  };

  const safeOriginLen = originOpts.includes(originLen) ? originLen : originOpts[0];
  const safeDevLen = devOpts.includes(devLen) ? devLen : devOpts[0];

  const matrix = useMemo(
    () =>
      base
        ? buildDisplayMatrix(base, {
            cumulative,
            transposed,
            view,
            originLenMonths: safeOriginLen,
            devLenMonths: safeDevLen,
            decimals,
          })
        : null,
    [base, cumulative, transposed, view, safeOriginLen, safeDevLen, decimals],
  );

  if (!anyLoaded || !primaryTri) {
    return (
      <>
        <div className="card p-12 text-center">
          <div className="text-sm text-[color:var(--muted)] max-w-sm mx-auto space-y-4">
            <p>Üçgen verisi henüz yüklenmedi.</p>
            <div className="flex flex-col gap-2 items-center">
              <button
                onClick={() => setShowLoadDialog(true)}
                className="px-5 py-2.5 text-sm font-medium rounded-md bg-[color:var(--primary)] text-white hover:opacity-90 transition"
              >
                Veri Modülünden Yükle
              </button>
            </div>
          </div>
        </div>
        {showLoadDialog && (
          <LoadFromDataStore
            onClose={() => setShowLoadDialog(false)}
            onLoaded={() => setShowLoadDialog(false)}
          />
        )}
      </>
    );
  }

  const originStored = granLabel(primaryTri.origin_granularity);
  const devStored = granLabel(primaryTri.development_granularity);
  const canAggOrigin = originOpts.length > 1;
  const canAggDev = devOpts.length > 1;

  return (
    <div className="space-y-4">
      <SummaryStrip
        triangle={primaryTri}
        hasPaid={!!paidTriangle}
        hasIncurred={!!incurredTriangle}
      />

      <div className="card p-0 overflow-hidden">
        {/* Tür sekmeleri */}
        <div className="flex items-center justify-between px-3 py-2 border-b bg-[color:var(--surface-alt)]">
          <div className="flex gap-1">
            {TYPE_TABS.map((t) => {
              const available = baseByType[t.id] != null;
              return (
                <button
                  key={t.id}
                  onClick={() => available && setType(t.id)}
                  disabled={!available}
                  className={
                    "px-3 py-1 rounded text-xs font-medium transition " +
                    (type === t.id
                      ? "bg-[color:var(--primary)] text-white"
                      : available
                      ? "bg-[color:var(--surface)] text-[color:var(--muted-strong)] hover:bg-[color:var(--border)]"
                      : "bg-[color:var(--surface)] text-[color:var(--muted)] opacity-50 cursor-not-allowed")
                  }
                >
                  {t.label}
                </button>
              );
            })}
          </div>
          <span className="text-xs text-[color:var(--muted)] tabular">
            {matrix
              ? `${matrix.rows.length}×${matrix.columns.length}`
              : "—"}
          </span>
        </div>

        {/* Kontrol şeridi */}
        <div className="flex flex-wrap items-end gap-x-5 gap-y-3 px-3 py-2.5 border-b bg-[color:var(--surface)]">
          <Toggle
            label="Kümülatif"
            checked={cumulative}
            onChange={setCumulative}
          />
          <Toggle
            label="Transpoze"
            checked={transposed}
            onChange={setTransposed}
          />

          <Divider />

          <Segmented
            label="Sütun"
            value={view}
            options={[
              { value: "development", label: "Gelişim" },
              { value: "calendar", label: "Takvim" },
            ]}
            onChange={(v) => setView(v as ViewMode)}
          />

          <Divider />

          <Stepper
            label="Kaza uzunluğu"
            hint={`kayıt: ${originStored}`}
            value={safeOriginLen}
            options={originOpts}
            disabled={!canAggOrigin}
            display={lenLabel}
            onChange={setOriginLen}
          />
          <Stepper
            label="Gelişim uzunluğu"
            hint={`kayıt: ${devStored}`}
            value={safeDevLen}
            options={devOpts}
            disabled={!canAggDev}
            display={lenLabel}
            onChange={setDevLen}
          />
          {(canAggOrigin || canAggDev) && (
            <button
              onClick={() => {
                setOriginLen(originOpts[originOpts.length - 1]);
                setDevLen(devOpts[devOpts.length - 1]);
              }}
              className="btn text-[11px] py-1 px-2.5"
              title="En kaba (tam toplanmış) görünüme geç"
            >
              Max
            </button>
          )}

          <Divider />

          <Stepper
            label="Ondalık"
            value={decimals}
            options={[0, 1, 2, 3, 4]}
            display={(v) => `${v}`}
            onChange={setDecimals}
          />
        </div>

        {/* İçerik */}
        {matrix ? (
          <div className="p-2">
            <TriangleGrid matrix={matrix} decimals={decimals} />
          </div>
        ) : (
          <div className="p-10 text-center text-sm text-[color:var(--muted)]">
            {missingByType[type]}
          </div>
        )}
      </div>
    </div>
  );
}

function Divider() {
  return <div className="w-px h-8 bg-[color:var(--border)] self-center" />;
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex flex-col gap-1 cursor-pointer select-none">
      <span className="text-[10px] uppercase tracking-wide font-semibold text-[color:var(--muted)]">
        {label}
      </span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={
          "relative w-9 h-5 rounded-full transition " +
          (checked
            ? "bg-[color:var(--primary)]"
            : "bg-[color:var(--border-strong)]")
        }
        aria-pressed={checked}
      >
        <span
          className={
            "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform " +
            (checked ? "translate-x-4" : "")
          }
        />
      </button>
    </label>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide font-semibold text-[color:var(--muted)]">
        {label}
      </span>
      <div className="flex rounded-md border border-[color:var(--border)] overflow-hidden">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={
              "px-2.5 py-1 text-[11px] font-medium transition " +
              (value === o.value
                ? "bg-[color:var(--primary)] text-white"
                : "bg-[color:var(--surface)] text-[color:var(--muted-strong)] hover:bg-[color:var(--surface-alt)]")
            }
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Stepper<T extends number>({
  label,
  hint,
  value,
  options,
  disabled,
  display,
  onChange,
}: {
  label: string;
  hint?: string;
  value: T;
  options: T[];
  disabled?: boolean;
  display: (v: T) => string;
  onChange: (v: T) => void;
}) {
  const idx = options.indexOf(value);
  const canDown = !disabled && idx > 0;
  const canUp = !disabled && idx >= 0 && idx < options.length - 1;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide font-semibold text-[color:var(--muted)]">
        {label}
      </span>
      <div
        className={
          "flex items-center border border-[color:var(--border)] rounded-md overflow-hidden " +
          (disabled ? "opacity-50" : "")
        }
      >
        <button
          onClick={() => canDown && onChange(options[idx - 1])}
          disabled={!canDown}
          className="px-1.5 py-1 text-[color:var(--muted-strong)] hover:bg-[color:var(--surface-alt)] disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="azalt"
        >
          ‹
        </button>
        <span className="px-2 py-1 text-[11px] font-medium tabular min-w-[62px] text-center border-x border-[color:var(--border)]">
          {display(value)}
        </span>
        <button
          onClick={() => canUp && onChange(options[idx + 1])}
          disabled={!canUp}
          className="px-1.5 py-1 text-[color:var(--muted-strong)] hover:bg-[color:var(--surface-alt)] disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="artır"
        >
          ›
        </button>
      </div>
      {hint && (
        <span className="text-[9px] text-[color:var(--muted)] leading-none">
          {hint}
        </span>
      )}
    </div>
  );
}

function SummaryStrip({
  triangle,
  hasPaid,
  hasIncurred,
}: {
  triangle: Triangle;
  hasPaid: boolean;
  hasIncurred: boolean;
}) {
  const latestSum = triangle.values.reduce((s, row) => {
    let latest = 0;
    for (const v of row) if (v != null) latest = v;
    return s + latest;
  }, 0);
  const lastOrigin = triangle.origin_periods[triangle.origin_periods.length - 1];
  const oldestOrigin = triangle.origin_periods[0];
  const loaded = [hasPaid && "Paid", hasIncurred && "Incurred"]
    .filter(Boolean)
    .join(" + ");
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <Stat
        label="Üçgen"
        value={`${triangle.origin_periods.length}×${triangle.development_periods.length}`}
        sub={loaded}
      />
      <Stat
        label="Origin Aralığı"
        value={`${oldestOrigin} — ${lastOrigin}`}
        sub={`kaza ${granMonths(triangle.origin_granularity) === 3 ? "çeyreklik" : "yıllık"}`}
      />
      <Stat
        label="Gelişim"
        value={
          triangle.development_granularity === "quarterly"
            ? "Çeyreklik"
            : "Yıllık"
        }
        sub={`${triangle.development_periods.length} dönem`}
      />
      <Stat
        label="Toplam Güncel"
        value={formatNumber(latestSum)}
        sub={triangle.triangle_type}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="card p-3">
      <div className="text-[10px] uppercase tracking-wide font-semibold text-[color:var(--muted-strong)] mb-0.5">
        {label}
      </div>
      <div className="text-lg font-semibold tabular">{value}</div>
      {sub && (
        <div className="text-[11px] text-[color:var(--muted)] mt-0.5">{sub}</div>
      )}
    </div>
  );
}
