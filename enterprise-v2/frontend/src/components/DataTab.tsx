"use client";

import { useState, useMemo, useEffect, type ReactNode } from "react";
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
        <div className="flex flex-wrap items-start gap-x-4 gap-y-3 px-3.5 py-3 border-b bg-[color:var(--surface-alt)]/40">
          <Field label="Değer">
            <Segmented
              value={cumulative ? "cum" : "inc"}
              options={[
                { value: "cum", label: "Kümülatif" },
                { value: "inc", label: "Artımsal" },
              ]}
              onChange={(v) => setCumulative(v === "cum")}
            />
          </Field>

          <Field label="Ondalık">
            <Stepper
              value={decimals}
              options={[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}
              display={(v) => `${v}`}
              onChange={setDecimals}
              width="min-w-[34px]"
            />
          </Field>

          <VDivider />

          <Field label="Sütun">
            <Segmented
              value={view}
              options={[
                { value: "development", label: "Gelişim" },
                { value: "calendar", label: "Takvim" },
              ]}
              onChange={(v) => setView(v as ViewMode)}
            />
          </Field>

          <Field label="Düzen">
            <TransposeToggle
              active={transposed}
              onClick={() => setTransposed((v) => !v)}
            />
          </Field>

          <VDivider />

          <Field label="Kaza dönemi" hint={`kayıt: ${originStored}`}>
            <Stepper
              value={safeOriginLen}
              options={originOpts}
              disabled={!canAggOrigin}
              display={lenLabel}
              onChange={setOriginLen}
            />
          </Field>
          <Field label="Gelişim dönemi" hint={`kayıt: ${devStored}`}>
            <Stepper
              value={safeDevLen}
              options={devOpts}
              disabled={!canAggDev}
              display={lenLabel}
              onChange={setDevLen}
            />
          </Field>
          {(canAggOrigin || canAggDev) && (
            <div className="self-start pt-[14px]">
              <button
                onClick={() => {
                  setOriginLen(originOpts[originOpts.length - 1]);
                  setDevLen(devOpts[devOpts.length - 1]);
                }}
                className="h-8 px-3 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] text-[11px] font-semibold text-[color:var(--muted-strong)] hover:border-[color:var(--border-strong)] hover:bg-[color:var(--surface-alt)] transition"
                title="En kaba (tam toplanmış) görünüme geç"
              >
                Max
              </button>
            </div>
          )}
        </div>

        {/* İçerik */}
        {matrix ? (
          <div className="p-3">
            <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mb-2 px-0.5 text-[11px]">
              <span className="font-semibold text-[color:var(--muted-strong)]">
                {TYPE_TABS.find((t) => t.id === type)?.label}
              </span>
              <ViewChip>{cumulative ? "Kümülatif" : "Artımsal"}</ViewChip>
              <ViewChip>
                {view === "development" ? "Gelişim" : "Takvim"}
              </ViewChip>
              <ViewChip>Kaza {lenLabel(safeOriginLen)}</ViewChip>
              <ViewChip>Gelişim {lenLabel(safeDevLen)}</ViewChip>
              {transposed && <ViewChip>Transpoze</ViewChip>}
            </div>
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

function VDivider() {
  return (
    <div className="self-start mt-[14px] w-px h-8 bg-[color:var(--border)] mx-1" />
  );
}

function ViewChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-[color:var(--surface-alt)] text-[color:var(--muted-strong)] font-medium tabular">
      {children}
    </span>
  );
}

/** Etiketli alan sarmalayıcı — tüm kontroller aynı dikey ritimde. */
function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide font-semibold text-[color:var(--muted)] leading-none">
        {label}
      </span>
      {children}
      {hint ? (
        <span className="text-[9px] text-[color:var(--muted)] leading-none">
          {hint}
        </span>
      ) : (
        <span className="text-[9px] leading-none">&nbsp;</span>
      )}
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex h-8 p-0.5 rounded-lg bg-[color:var(--surface-alt)] border border-[color:var(--border)]">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={
              "px-3 rounded-md text-[12px] font-medium transition " +
              (active
                ? "bg-[color:var(--surface)] text-[color:var(--primary)] shadow-sm"
                : "text-[color:var(--muted-strong)] hover:text-[color:var(--foreground)]")
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function TransposeToggle({
  active,
  onClick,
}: {
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      title="Eksenleri takas et"
      className={
        "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-medium border transition " +
        (active
          ? "bg-[color:var(--primary-soft)] text-[color:var(--primary)] border-[color:var(--primary-border)]"
          : "bg-[color:var(--surface)] text-[color:var(--muted-strong)] border-[color:var(--border)] hover:border-[color:var(--border-strong)] hover:bg-[color:var(--surface-alt)]")
      }
    >
      <span className="text-[13px] leading-none">⇄</span>
      Transpoze
    </button>
  );
}

function Stepper<T extends number>({
  value,
  options,
  disabled,
  display,
  onChange,
  width = "min-w-[70px]",
}: {
  value: T;
  options: T[];
  disabled?: boolean;
  display: (v: T) => string;
  onChange: (v: T) => void;
  width?: string;
}) {
  const idx = options.indexOf(value);
  const canDown = !disabled && idx > 0;
  const canUp = !disabled && idx >= 0 && idx < options.length - 1;
  const chevron =
    "flex items-center justify-center w-7 h-full text-[15px] text-[color:var(--muted-strong)] hover:bg-[color:var(--surface-alt)] hover:text-[color:var(--foreground)] disabled:opacity-25 disabled:cursor-not-allowed disabled:hover:bg-transparent transition";
  return (
    <div
      className={
        "inline-flex items-stretch h-8 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] overflow-hidden " +
        (disabled ? "opacity-60" : "")
      }
    >
      <button
        onClick={() => canDown && onChange(options[idx - 1])}
        disabled={!canDown}
        className={chevron}
        aria-label="azalt"
      >
        −
      </button>
      <span
        className={
          "flex items-center justify-center px-2 text-[12px] font-semibold tabular text-center border-x border-[color:var(--border)] " +
          width
        }
      >
        {display(value)}
      </span>
      <button
        onClick={() => canUp && onChange(options[idx + 1])}
        disabled={!canUp}
        className={chevron}
        aria-label="artır"
      >
        +
      </button>
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
