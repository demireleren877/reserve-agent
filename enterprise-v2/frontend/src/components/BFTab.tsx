"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Triangle } from "@/types/triangle";
import { formatNumber } from "@/lib/api";
import { cumulativeFactors } from "@/lib/ldf";
import { LoadPrimsFromDataStore } from "@/components/LoadPrimsFromDataStore";

const DEFAULT_LR = 0.7;

interface Props {
  triangle: Triangle | null;
  selectedLDFs: number[];
  premiums: Record<string, number>;
  elrPerOrigin: Record<string, number>;
  lrInputPerOrigin: Record<string, string>;
  lrErrors: Record<string, string>;
  correctionPerOrigin: Record<string, number>;
  onPremiumChange: (origin: string, value: number) => void;
  onPremiumsBulk: (premiums: Record<string, number>) => void;
  onLRInputChange: (origin: string, expr: string) => void;
  onCorrectionChange: (origin: string, value: number | null) => void;
}

export function BFTab(props: Props) {
  const {
    triangle,
    selectedLDFs,
    premiums,
    elrPerOrigin,
    lrInputPerOrigin,
    lrErrors,
    correctionPerOrigin,
    onPremiumChange,
    onPremiumsBulk,
    onLRInputChange,
    onCorrectionChange,
  } = props;

  const [loadMsg, setLoadMsg] = useState<string | null>(null);
  const [showLoadPrims, setShowLoadPrims] = useState(false);

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
      const exposureAnnual = premium * correction;
      const clUlt = latestVal * cdf;
      const pctDeveloped = clUlt > 0 ? latestVal / clUlt : null;
      // Pattern ratio: yıllık exposure üzerinden — diğer mature yıllarla
      // kıyaslanabilir olsun diye.
      const patternRatio =
        exposureAnnual > 0 ? clUlt / exposureAnnual : null;
      const userLR = elrPerOrigin[o];
      const lrInput = lrInputPerOrigin[o] ?? "";
      const lrError = lrErrors[o] ?? null;
      const hasInput = lrInput.trim().length > 0;
      const selectedLR =
        userLR !== undefined
          ? userLR
          : patternRatio !== null
          ? patternRatio
          : DEFAULT_LR;
      const isDefaulted = userLR === undefined;
      const unreported = 1 - (pctDeveloped ?? 1);
      // Annual ult: yıllık exposure ile BF
      const newUltimateAnnual =
        latestVal + selectedLR * exposureAnnual * unreported;
      // Partial ult (kısmi dönem): yıllık ulttan correction'a bölünür
      const newUltimate = newUltimateAnnual / correction;
      return {
        origin: o,
        latest: latestVal,
        premium,
        correction,
        exposureAnnual,
        pctDeveloped,
        patternRatio,
        selectedLR,
        isDefaulted,
        lrInput,
        lrError,
        hasInput,
        newUltimateAnnual,
        newUltimate,
        ibnr: newUltimate - latestVal,
      };
    });
  }, [
    triangle,
    selectedLDFs,
    premiums,
    elrPerOrigin,
    lrInputPerOrigin,
    lrErrors,
    correctionPerOrigin,
  ]);

  const totals = rows.reduce(
    (a, r) => ({
      latest: a.latest + r.latest,
      premium: a.premium + r.premium,
      newUltimate: a.newUltimate + r.newUltimate,
      ibnr: a.ibnr + r.ibnr,
    }),
    { latest: 0, premium: 0, newUltimate: 0, ibnr: 0 },
  );

  if (!triangle) {
    return (
      <div className="card p-10 text-center text-sm text-[color:var(--muted)]">
        Önce Veri sekmesinden bir üçgen yükleyin.
      </div>
    );
  }

  return (
    <>
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Toplam Exposure" value={formatNumber(totals.premium)} />
        <Stat label="Toplam New Ultimate" value={formatNumber(totals.newUltimate)} />
        <Stat label="Toplam IBNR" value={formatNumber(totals.ibnr)} accent />
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-[color:var(--surface-alt)] gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold">
              BF — Selected Loss Ratio Yöntemi
            </h2>
            <span className="text-xs text-[color:var(--muted)]">
              Selected LR: sayı (0.7, 70%) veya formül (avg, vw, sum_cl/sum_exp)
            </span>
          </div>
          <div className="flex items-center gap-2">
            {loadMsg && (
              <span className="text-xs text-[color:var(--success)]">{loadMsg}</span>
            )}
            <button
              type="button"
              onClick={() => setShowLoadPrims(true)}
              className="btn text-xs"
              disabled={!triangle}
              title="Veri modülünden prim verisi yükle"
            >
              Veri Modülünden Yükle
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="text-sm w-full tabular">
            <thead>
              <tr className="text-[color:var(--muted-strong)] text-[11px] uppercase tracking-wide bg-[color:var(--surface-alt)]">
                <th className="text-left px-3 py-2 font-semibold">Kaza Yılı</th>
                <th className="text-right px-3 py-2 font-semibold">Latest</th>
                <th className="text-right px-3 py-2 font-semibold">Exposure</th>
                <th
                  className="text-right px-3 py-2 font-semibold"
                  title="Çeyreklik modelde kaza yılı tamamlanmamış origin için annualization katsayısı (Q1: 4, Q1+Q2: 2, vb.). 1 = düzeltme yok."
                >
                  Correction
                </th>
                <th className="text-right px-3 py-2 font-semibold">% Developed</th>
                <th className="text-right px-3 py-2 font-semibold">Pattern Ratio</th>
                <th className="text-right px-3 py-2 font-semibold">
                  Selected Loss Ratio
                </th>
                <th className="text-right px-3 py-2 font-semibold">New Ultimate</th>
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
                  <td className="px-1 py-0.5 w-[140px]">
                    <EditableNumber
                      value={r.premium || null}
                      placeholder="exposure gir"
                      format={(v) => formatNumber(v)}
                      onCommit={(v) => onPremiumChange(r.origin, v)}
                    />
                  </td>
                  <td className="px-1 py-0.5 w-[110px]">
                    <EditableNumber
                      value={r.correction === 1 ? null : r.correction}
                      placeholder="1"
                      step={0.25}
                      format={(v) => `×${v}`}
                      onCommit={(v) =>
                        onCorrectionChange(r.origin, v && v !== 1 ? v : null)
                      }
                    />
                  </td>
                  <td className="text-right px-3 py-1.5 text-[color:var(--muted-strong)]">
                    {r.pctDeveloped != null
                      ? `${(r.pctDeveloped * 100).toFixed(1)}%`
                      : "—"}
                  </td>
                  <td className="text-right px-3 py-1.5 text-[color:var(--muted-strong)]">
                    {r.patternRatio != null
                      ? `${(r.patternRatio * 100).toFixed(1)}%`
                      : "—"}
                  </td>
                  <td className="px-1 py-0.5 min-w-[200px]">
                    <EditableFormula
                      rawInput={r.lrInput}
                      evaluated={r.selectedLR}
                      isDefaulted={r.isDefaulted}
                      error={r.lrError}
                      onCommit={(expr) => onLRInputChange(r.origin, expr)}
                    />
                  </td>
                  <td className="text-right px-3 py-1.5 font-semibold text-[color:var(--success)]">
                    {formatNumber(r.newUltimate)}
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
                <td />
                <td />
                <td />
                <td />
                <td className="text-right px-3 py-2 text-[color:var(--success)]">
                  {formatNumber(totals.newUltimate)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="card p-3 text-xs text-[color:var(--muted-strong)] leading-relaxed space-y-2">
        <div>
          <strong>Formül söz dizimi (Selected Loss Ratio hücrelerinde):</strong>
        </div>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 pl-4 list-disc">
          <li>
            <code className="font-mono">0.75</code> veya{" "}
            <code className="font-mono">75%</code> — sabit değer
          </li>
          <li>
            <code className="font-mono">avg(2020, 2021, 2022)</code> — pattern
            ratio ortalaması
          </li>
          <li>
            <code className="font-mono">avg(2020:2022)</code> — aynı, aralık
            olarak
          </li>
          <li>
            <code className="font-mono">vw(2020:2022)</code> — volume-weighted =
            ΣCL / ΣExp
          </li>
          <li>
            <code className="font-mono">
              sum_cl(2020:2022) / sum_exp(2020:2022)
            </code>{" "}
            — açık yazılımı
          </li>
          <li>
            <code className="font-mono">avg(2020:2022) * 1.1</code> — artırılmış
            ortalama
          </li>
          <li>
            Çeyreklik: <code className="font-mono">avg(2020Q1:2021Q4)</code>
          </li>
        </ul>
      </div>
    </div>

    {showLoadPrims && triangle && (
      <LoadPrimsFromDataStore
        originPeriods={triangle.origin_periods}
        onLoad={(premiums) => {
          onPremiumsBulk(premiums);
          setLoadMsg(`${Object.keys(premiums).length} origin için exposure yüklendi.`);
          setTimeout(() => setLoadMsg(null), 4000);
        }}
        onClose={() => setShowLoadPrims(false)}
      />
    )}
    </>
  );
}

interface EditableNumberProps {
  value: number | null;
  placeholder?: string;
  format: (v: number) => string;
  step?: number;
  onCommit: (v: number) => void;
}

function EditableNumber({
  value,
  placeholder,
  format,
  step,
  onCommit,
}: EditableNumberProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value != null ? String(value) : "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value != null ? String(value) : "");
  }, [value, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        step={step ?? 1}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const num = Number(draft);
          onCommit(Number.isFinite(num) ? num : 0);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            setDraft(value != null ? String(value) : "");
            setEditing(false);
          }
        }}
        className="w-full text-right text-sm tabular bg-[color:var(--primary-soft)] border-0 outline-none px-3 py-1.5 rounded-sm"
      />
    );
  }

  const empty = value == null;
  return (
    <button
      onClick={() => setEditing(true)}
      className={
        "w-full text-right px-3 py-1.5 text-sm tabular transition cursor-text " +
        "hover:bg-[color:var(--primary-soft)]/40 " +
        (empty ? "text-[color:var(--muted)]" : "")
      }
    >
      {empty ? placeholder ?? "—" : format(value as number)}
    </button>
  );
}

interface EditableFormulaProps {
  rawInput: string;
  evaluated: number;
  isDefaulted: boolean;
  error: string | null;
  onCommit: (expr: string) => void;
}

function EditableFormula({
  rawInput,
  evaluated,
  isDefaulted,
  error,
  onCommit,
}: EditableFormulaProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(rawInput);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(rawInput);
  }, [rawInput, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        placeholder='örn. avg(2020:2022)'
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          onCommit(draft);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            setDraft(rawInput);
            setEditing(false);
          }
        }}
        className="w-full text-right text-sm font-mono bg-[color:var(--primary-soft)] border-0 outline-none px-3 py-1.5 rounded-sm"
      />
    );
  }

  const isFormula = rawInput.trim().length > 0 && !/^-?\d+(\.\d+)?%?$/.test(rawInput.trim());
  const pct = `${(evaluated * 100).toFixed(1)}%`;

  return (
    <button
      onClick={() => setEditing(true)}
      title={
        error
          ? `Hata: ${error}`
          : isFormula
          ? `Formül: ${rawInput}`
          : isDefaulted
          ? "Varsayılan (Pattern Ratio) — tıkla düzenle"
          : "Manuel değer — tıkla düzenle"
      }
      className={
        "w-full text-right px-3 py-1.5 text-sm tabular transition cursor-text " +
        "hover:bg-[color:var(--primary-soft)]/40 " +
        (error
          ? "text-[color:var(--danger)]"
          : isDefaulted
          ? "text-[color:var(--muted)]"
          : "")
      }
    >
      <span className="inline-flex items-center gap-1.5 justify-end w-full">
        {isFormula && !error && (
          <span
            className="text-[9px] font-semibold text-[color:var(--primary)] bg-[color:var(--primary-soft)] px-1 py-0.5 rounded"
            title={rawInput}
          >
            ƒ
          </span>
        )}
        {error ? "#ERR" : pct}
      </span>
    </button>
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
