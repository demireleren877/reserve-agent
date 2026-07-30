"use client";

/**
 * Import wizard: Yükle → Sheet Seç → Sütun Eşleştir → Preview → İçeri Aktar
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchOracleObject,
  inspectDataFile,
  importDataFile,
  listOracleObjects,
  previewOracleObject,
  type DataInspectResult,
  type DataImportResult,
  type OracleObject,
  type OraclePreviewResult,
} from "@/lib/api";
import { uniqueBranchNames } from "@/lib/branch-identity";

// ─── Sabitler ─────────────────────────────────────────────────────────────────

export const REQUIRED_FIELDS: { key: string; label: string; hint: string }[] = [
  { key: "dosya_no",       label: "Claim No",        hint: "Claim file / policy number" },
  { key: "brans",          label: "Branch",           hint: "Line of business (Motor, MTPL…)" },
  { key: "hasar_tarihi",   label: "Loss Date",        hint: "Date the loss occurred" },
  { key: "gelisim_tarihi", label: "Development Date",  hint: "Reporting / valuation date" },
  { key: "odeme",          label: "Paid",             hint: "Paid amount" },
  { key: "muallak",        label: "Outstanding",      hint: "Case reserve" },
];

type WizardStep = "source" | "upload" | "oracle" | "sheet" | "mapping" | "preview" | "importing";

interface WizardState {
  file: File;
  inspect: DataInspectResult;
  selectedSheet: string | null;
  mapping: Record<string, string>; // field → column header
}

// ─── Yardımcı ─────────────────────────────────────────────────────────────────

/**
 * inspect nesnesinden belirli bir sheet'in header'larını güvenli şekilde döndürür.
 * Python None anahtarı JSON'da "null" string'e dönüşür; bunu ve gerçek sheet adını dener.
 */
function resolveHeaders(inspect: DataInspectResult, sheet: string | null): string[] {
  if (sheet !== null) {
    return inspect.headers[sheet] ?? [];
  }
  // CSV: Python None → JSON "null"
  return inspect.headers["null"] ?? Object.values(inspect.headers)[0] ?? [];
}

function resolvePreview(inspect: DataInspectResult, sheet: string | null): string[][] {
  if (sheet !== null) {
    return inspect.preview[sheet] ?? [];
  }
  return inspect.preview["null"] ?? Object.values(inspect.preview)[0] ?? [];
}

function resolveSuggested(inspect: DataInspectResult, sheet: string | null): Record<string, string> {
  if (sheet !== null) {
    return inspect.suggested_mapping[sheet] ?? {};
  }
  return inspect.suggested_mapping["null"] ?? Object.values(inspect.suggested_mapping)[0] ?? {};
}

// ─── Adım göstergesi ──────────────────────────────────────────────────────────

const STEP_LABELS: Record<WizardStep, string> = {
  source:    "Source",
  upload:    "Upload",
  oracle:    "Oracle",
  sheet:     "Sheet",
  mapping:   "Columns",
  preview:   "Preview",
  importing: "Preview",
};

function StepIndicator({ current, hasSheet, oracle }: { current: WizardStep; hasSheet: boolean; oracle: boolean }) {
  const steps: WizardStep[] = oracle
    ? ["source", "oracle", "mapping", "preview"]
    : hasSheet
    ? ["source", "upload", "sheet", "mapping", "preview"]
    : ["source", "upload", "mapping", "preview"];

  const idx = steps.indexOf(current === "importing" ? "preview" : current);

  return (
    <div className="flex items-center gap-0 px-6 py-4 border-b flex-shrink-0" style={{ borderColor: "var(--border)" }}>
      {steps.map((s, i) => (
        <div key={s} className="flex items-center">
          <div className="flex items-center gap-2">
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0"
              style={{
                background: i < idx ? "var(--primary)" : i === idx ? "var(--primary)" : "var(--surface-alt)",
                color: i <= idx ? "#fff" : "var(--muted)",
                border: i > idx ? "1px solid var(--border)" : "none",
              }}
            >
              {i < idx ? "✓" : i + 1}
            </div>
            <span
              className="text-[12.5px] whitespace-nowrap"
              style={{
                color: i === idx ? "var(--primary)" : i < idx ? "var(--foreground)" : "var(--muted)",
                fontWeight: i === idx ? 600 : 400,
              }}
            >
              {STEP_LABELS[s]}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              className="w-8 h-px mx-3 flex-shrink-0"
              style={{ background: i < idx ? "var(--primary)" : "var(--border)" }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function SourceStep({ onOracle, onFile }: { onOracle: () => void; onFile: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-8">
      <div className="w-full max-w-xl">
        <h2 className="text-[17px] font-semibold">Select source</h2>
        <p className="mt-1 text-[12.5px]" style={{ color: "var(--muted-strong)" }}>Choose where this dataset should be loaded from.</p>
        <div className="mt-5 overflow-hidden rounded-lg border" style={{ borderColor: "var(--border)" }}>
          <button onClick={onOracle} className="flex w-full items-center gap-3 border-b px-4 py-4 text-left transition hover:bg-[color:var(--surface-alt)]" style={{ borderColor: "var(--border)" }}><span className="flex h-8 w-8 items-center justify-center rounded-md" style={{ background: "var(--primary-soft)", color: "var(--primary)" }}><DatabaseIcon /></span><span className="flex-1"><span className="block text-[13px] font-semibold">Oracle</span><span className="mt-0.5 block text-[11.5px]" style={{ color: "var(--muted-strong)" }}>Browse tables and views from the active connection.</span></span><span className="text-[13px]" style={{ color: "var(--muted)" }}>›</span></button>
          <button onClick={onFile} className="flex w-full items-center gap-3 px-4 py-4 text-left transition hover:bg-[color:var(--surface-alt)]"><span className="flex h-8 w-8 items-center justify-center rounded-md" style={{ background: "var(--surface-alt)", color: "var(--muted-strong)" }}><UploadIcon /></span><span className="flex-1"><span className="block text-[13px] font-semibold">File upload</span><span className="mt-0.5 block text-[11.5px]" style={{ color: "var(--muted-strong)" }}>CSV or Excel workbook.</span></span><span className="text-[13px]" style={{ color: "var(--muted)" }}>›</span></button>
        </div>
      </div>
    </div>
  );
}

function OracleStep({ onSelected, onBack }: { onSelected: (object: OracleObject, preview: OraclePreviewResult) => void; onBack: () => void }) {
  const [objects, setObjects] = useState<OracleObject[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<OracleObject | null>(null);
  const [preview, setPreview] = useState<OraclePreviewResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stale = false;
    setLoading(true);
    const timer = window.setTimeout(() => {
      listOracleObjects(query).then((items) => { if (!stale) setObjects(items); }).catch((e) => { if (!stale) setError(e instanceof Error ? e.message : "Could not load Oracle objects"); }).finally(() => { if (!stale) setLoading(false); });
    }, query ? 220 : 0);
    return () => { stale = true; window.clearTimeout(timer); };
  }, [query]);

  async function choose(object: OracleObject) {
    setSelected(object); setPreview(null); setError(null); setPreviewing(true);
    try { setPreview(await previewOracleObject(object.qualified)); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not preview the selected object"); }
    finally { setPreviewing(false); }
  }

  return <div className="flex min-h-0 flex-1 flex-col">
    <div className="border-b px-6 py-5" style={{ borderColor: "var(--border)" }}>
      <div className="flex items-start justify-between gap-4"><div><h2 className="text-[17px] font-bold">Oracle source</h2><p className="mt-1 text-[12.5px]" style={{ color: "var(--muted-strong)" }}>Select a table or view available to the active desktop connection.</p></div><button onClick={onBack} className="btn min-h-10">← Back</button></div>
      <label className="relative mt-4 block"><span className="sr-only">Search Oracle objects</span><input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search owner, table or view…" className="input-base h-11 pl-10"/><span className="pointer-events-none absolute left-3 top-3" style={{ color: "var(--muted)" }}><SearchIcon /></span></label>
    </div>
    <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(260px,.8fr)_minmax(0,1.2fr)]">
      <div className="min-h-0 overflow-auto border-r p-3" style={{ borderColor: "var(--border)" }}>
        {loading ? <div className="p-5 text-center text-[12px]" style={{ color: "var(--muted)" }}>Loading Oracle objects…</div> : objects.length === 0 ? <div className="p-5 text-center text-[12px]" style={{ color: "var(--muted)" }}>No table or view matches this search.</div> : objects.map((object) => <button key={object.qualified} onClick={() => choose(object)} className="mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition" style={{ background: selected?.qualified === object.qualified ? "var(--primary-soft)" : "transparent", color: "var(--foreground)" }}><span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: selected?.qualified === object.qualified ? "#fff" : "var(--surface-alt)", color: "var(--primary)" }}><DatabaseIcon /></span><span className="min-w-0 flex-1"><span className="block truncate text-[12.5px] font-semibold">{object.name}</span><span className="block truncate text-[10.5px]" style={{ color: "var(--muted)" }}>{object.owner} · {object.type.toLowerCase()}</span></span></button>)}</div>
      <div className="min-h-0 overflow-auto p-5">{!selected ? <div className="flex h-full flex-col items-center justify-center text-center"><span className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: "var(--surface-alt)", color: "var(--muted)" }}><DatabaseIcon /></span><p className="mt-3 text-[13px] font-semibold">Choose an Oracle object</p><p className="mt-1 max-w-xs text-[12px]" style={{ color: "var(--muted)" }}>Its columns and a sample of rows will appear here.</p></div> : previewing ? <div className="flex h-full items-center justify-center gap-3 text-[12px]" style={{ color: "var(--muted)" }}><Spinner small /> Loading preview…</div> : preview ? <div><div className="flex items-start justify-between gap-3"><div><span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--primary)" }}>{selected.type}</span><h3 className="mt-1 text-[15px] font-bold">{selected.qualified}</h3><p className="mt-1 text-[11px]" style={{ color: "var(--muted)" }}>{preview.columns.length} columns · {preview.row_count} preview rows</p></div><button onClick={() => onSelected(selected, preview)} className="btn btn-primary min-h-10">Use this source →</button></div><div className="mt-5 overflow-auto rounded-xl border" style={{ borderColor: "var(--border)", maxHeight: 340 }}><table className="w-full border-collapse text-left text-[11px]"><thead><tr style={{ background: "var(--surface-alt)" }}>{preview.columns.map((c) => <th key={c} className="whitespace-nowrap border-b px-3 py-2 font-semibold" style={{ borderColor: "var(--border)", color: "var(--muted-strong)" }}>{c}</th>)}</tr></thead><tbody>{preview.rows.map((row, i) => <tr key={i}>{row.map((value, j) => <td key={j} className="max-w-[180px] truncate border-b px-3 py-2" style={{ borderColor: "var(--border)" }}>{String(value ?? "—")}</td>)}</tr>)}</tbody></table></div></div> : null}{error && <ErrorBox message={error} className="mt-4" />}</div>
    </div>
  </div>;
}

// ─── Adım 1: Yükle ────────────────────────────────────────────────────────────

function UploadStep({
  onFile,
  loading,
  error,
}: {
  onFile: (f: File) => void;
  loading: boolean;
  error: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer.files[0];
      if (f) onFile(f);
    },
    [onFile],
  );

  return (
    <div className="flex flex-col items-center justify-center flex-1 px-8 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-6 text-center">
          <h2 className="text-[18px] font-bold mb-2" style={{ color: "var(--foreground)" }}>
            Choose file
          </h2>
          <p className="text-[13px]" style={{ color: "var(--muted-strong)" }}>
            CSV or Excel (.xlsx / .xls) — max. 50 MB
          </p>
        </div>

        <div
          onClick={() => !loading && inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className="rounded-2xl border-2 border-dashed p-12 flex flex-col items-center gap-4 cursor-pointer transition-colors"
          style={{
            borderColor: dragging ? "var(--primary)" : "var(--border)",
            background: dragging ? "var(--primary-soft)" : "var(--surface)",
          }}
        >
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ background: "var(--primary-soft)" }}
          >
            <UploadIcon />
          </div>
          {loading ? (
            <div className="flex flex-col items-center gap-2">
              <Spinner />
              <span className="text-[13px]" style={{ color: "var(--muted-strong)" }}>
                Inspecting file…
              </span>
            </div>
          ) : (
            <div className="text-center">
              <div className="text-[14px] font-semibold mb-1" style={{ color: "var(--foreground)" }}>
                Drag or click a file
              </div>
              <div className="text-[12px]" style={{ color: "var(--muted)" }}>
                CSV, TXT, XLSX or XLS
              </div>
            </div>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls,.txt"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = "";
          }}
        />

        {error && <ErrorBox message={error} className="mt-4" />}
      </div>
    </div>
  );
}

// ─── Adım 2: Sheet seç ───────────────────────────────────────────────────────

function SheetStep({
  sheets,
  selected,
  onSelect,
  onNext,
}: {
  sheets: string[];
  selected: string | null;
  onSelect: (s: string) => void;
  onNext: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 px-8 py-10">
      <div className="w-full max-w-sm">
        <h2 className="text-[18px] font-bold mb-2 text-center" style={{ color: "var(--foreground)" }}>
          Select Excel sheet
        </h2>
        <p className="text-[13px] text-center mb-6" style={{ color: "var(--muted-strong)" }}>
          Found {sheets.length} sheets. Select the sheet containing the data.
        </p>

        <div className="space-y-2 mb-8">
          {sheets.map((s) => (
            <button
              key={s}
              onClick={() => onSelect(s)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition"
              style={{
                borderColor: selected === s ? "var(--primary)" : "var(--border)",
                background: selected === s ? "var(--primary-soft)" : "var(--surface)",
                color: "var(--foreground)",
              }}
            >
              <SheetIcon active={selected === s} />
              <span className="text-[13.5px] font-medium">{s}</span>
              {selected === s && (
                <span className="ml-auto text-[11px] font-semibold" style={{ color: "var(--primary)" }}>
                  Selected
                </span>
              )}
            </button>
          ))}
        </div>

        <button
          onClick={onNext}
          disabled={!selected}
          className="w-full py-2.5 rounded-xl text-[13.5px] font-semibold transition disabled:opacity-40"
          style={{ background: "var(--primary)", color: "#fff" }}
        >
          Devam →
        </button>
      </div>
    </div>
  );
}

// ─── Adım 3: Sütun eşleştirme ─────────────────────────────────────────────────

function MappingStep({
  headers,
  mapping,
  preview,
  onMapping,
  onNext,
  onBack,
}: {
  headers: string[];
  mapping: Record<string, string>;
  preview: string[][];
  onMapping: (m: Record<string, string>) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const allMapped = REQUIRED_FIELDS.every((f) => mapping[f.key]);

  function setField(fieldKey: string, colName: string) {
    onMapping({ ...mapping, [fieldKey]: colName });
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex-1 overflow-auto px-6 py-6">
        <h2 className="text-[17px] font-bold mb-1" style={{ color: "var(--foreground)" }}>
          Column mapping
        </h2>
        <p className="text-[13px] mb-6" style={{ color: "var(--muted-strong)" }}>
          Select the matching column in the file for each field.
        </p>

        {/* Eşleştirme tablosu */}
        <div className="grid gap-3 mb-8">
          {REQUIRED_FIELDS.map((f) => {
            const val = mapping[f.key] ?? "";
            const missing = !val;
            return (
              <div
                key={f.key}
                className="flex items-center gap-4 p-3 rounded-xl border"
                style={{
                  borderColor: missing ? "#fca5a5" : "var(--border)",
                  background: missing ? "#fef2f2" : "var(--surface)",
                }}
              >
                {/* Alan etiketi */}
                <div className="w-36 flex-shrink-0">
                  <div className="text-[13px] font-semibold" style={{ color: "var(--foreground)" }}>
                    {f.label}
                  </div>
                  <div className="text-[11px]" style={{ color: "var(--muted)" }}>{f.hint}</div>
                </div>

                {/* Ok */}
                <div className="text-[14px]" style={{ color: "var(--muted)" }}>→</div>

                {/* Sütun seçici */}
                <select
                  value={val}
                  onChange={(e) => setField(f.key, e.target.value)}
                  className="flex-1 text-[13px] rounded-lg px-3 py-2 border appearance-none"
                  style={{
                    background: "var(--surface)",
                    borderColor: missing ? "#fca5a5" : "var(--border)",
                    color: val ? "var(--foreground)" : "var(--muted)",
                  }}
                >
                  <option value="">— select —</option>
                  {headers
                    .filter((h) => h.trim() !== "")
                    .map((h, i) => (
                      <option key={`${i}:${h}`} value={h}>{h}</option>
                    ))}
                </select>

                {/* Değer önizlemesi */}
                {val && preview[0] && (
                  <div
                    className="text-[11.5px] font-mono px-2 py-1 rounded-md whitespace-nowrap max-w-[120px] truncate flex-shrink-0"
                    style={{ background: "var(--surface-alt)", color: "var(--muted-strong)" }}
                    title={preview[0][headers.indexOf(val)] ?? ""}
                  >
                    {preview[0][headers.indexOf(val)] ?? "—"}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Dosya önizlemesi */}
        {preview.length > 0 && (
          <div>
            <div className="text-[12px] font-semibold mb-2" style={{ color: "var(--muted-strong)" }}>
              File preview (first {preview.length} rows)
            </div>
            <div
              className="rounded-xl border overflow-auto"
              style={{ borderColor: "var(--border)", maxHeight: 200 }}
            >
              <table className="text-[11.5px] border-collapse w-full">
                <thead>
                  <tr style={{ background: "var(--surface-alt)" }}>
                    {headers.map((h, i) => {
                      const mappedField = REQUIRED_FIELDS.find((f) => mapping[f.key] === h);
                      return (
                        <th
                          key={`${i}:${h}`}
                          className="px-3 py-2 text-left font-semibold border-b whitespace-nowrap"
                          style={{
                            borderColor: "var(--border)",
                            color: mappedField ? "var(--primary)" : "var(--muted-strong)",
                          }}
                        >
                          {h}
                          {mappedField && (
                            <span className="ml-1 text-[10px] font-normal opacity-70">
                              ({mappedField.label})
                            </span>
                          )}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                      {headers.map((h, j) => (
                        <td key={j} className="px-3 py-1.5 whitespace-nowrap">
                          {row[j] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Alt butonlar */}
      <div
        className="flex items-center justify-between px-6 py-4 border-t flex-shrink-0"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <button
          onClick={onBack}
          className="px-4 py-2 rounded-xl text-[13px] border transition"
          style={{ borderColor: "var(--border)", color: "var(--muted-strong)" }}
        >
          ← Back
        </button>
        <button
          onClick={onNext}
          disabled={!allMapped}
          className="px-6 py-2.5 rounded-xl text-[13.5px] font-semibold transition disabled:opacity-40"
          style={{ background: "var(--primary)", color: "#fff" }}
        >
          Preview →
        </button>
      </div>
    </div>
  );
}

// ─── Adım 4: Önizle & İçeri Aktar ────────────────────────────────────────────

function PreviewStep({
  sourceName,
  sourceDetail,
  mapping,
  onImport,
  onBack,
  importing,
  error,
  frequency,
  onFrequency,
  largeMode,
  basePeriodOptions,
  largeMethod,
  onLargeMethod,
  largeBase,
  onLargeBase,
}: {
  sourceName: string;
  sourceDetail: string;
  mapping: Record<string, string>;
  onImport: () => void;
  onBack: () => void;
  importing: boolean;
  error: string | null;
  frequency: "yearly" | "quarterly";
  onFrequency: (g: "yearly" | "quarterly") => void;
  largeMode: boolean;
  basePeriodOptions: string[];
  largeMethod: "direct" | "rollforward";
  onLargeMethod: (m: "direct" | "rollforward") => void;
  largeBase: string;
  onLargeBase: (b: string) => void;
}) {
  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex-1 overflow-auto px-6 py-6">
        <h2 className="text-[17px] font-bold mb-1" style={{ color: "var(--foreground)" }}>
          Mapping summary
        </h2>
        <p className="text-[13px] mb-5" style={{ color: "var(--muted-strong)" }}>
          You will import your data with the mapping below.
        </p>

        {/* Dosya bilgisi */}
        <div
          className="flex items-center gap-3 p-3 rounded-xl border mb-5"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <FileIcon />
          <div>
            <div className="text-[13px] font-semibold" style={{ color: "var(--foreground)" }}>{sourceName}</div>
            <div className="text-[11.5px]" style={{ color: "var(--muted)" }}>{sourceDetail}</div>
          </div>
        </div>

        {/* Mapping summary */}
        <div
          className="rounded-xl border overflow-hidden mb-5"
          style={{ borderColor: "var(--border)" }}
        >
          <div
            className="px-4 py-2.5 border-b text-[12px] font-semibold"
            style={{ borderColor: "var(--border)", background: "var(--surface-alt)", color: "var(--muted-strong)" }}
          >
            Column mapping
          </div>
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {REQUIRED_FIELDS.map((f) => (
              <div key={f.key} className="flex items-center px-4 py-2.5 gap-4">
                <span className="text-[13px] font-medium w-36 flex-shrink-0" style={{ color: "var(--foreground)" }}>
                  {f.label}
                </span>
                <span className="text-[12px]" style={{ color: "var(--muted)" }}>←</span>
                <span
                  className="text-[12.5px] font-mono px-2 py-0.5 rounded-md"
                  style={{ background: "var(--surface-alt)", color: "var(--foreground)" }}
                >
                  {mapping[f.key]}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Model iskeleti: rezervde her branş için (boş) model bu frekansla oluşturulur.
            Veriyi modele bağlama ve granülarite seçimi sonraki adımda (rezerv) yapılır. */}
        <div
          className="rounded-xl border overflow-hidden mb-5"
          style={{ borderColor: "var(--border)" }}
        >
          <div
            className="px-4 py-2.5 border-b text-[12px] font-semibold"
            style={{ borderColor: "var(--border)", background: "var(--surface-alt)", color: "var(--muted-strong)" }}
          >
            Model skeleton · frequency
          </div>
          <div className="px-4 py-3">
            <label className="block max-w-[240px]">
              <span className="block text-[11.5px] font-medium mb-1" style={{ color: "var(--muted-strong)" }}>
                Accident Period (model frequency)
              </span>
              <select
                value={frequency}
                onChange={(e) => onFrequency(e.target.value as "yearly" | "quarterly")}
                className="w-full text-[13px] border rounded-lg px-3 py-2 bg-[color:var(--surface)]"
                style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
              >
                <option value="yearly">Yearly</option>
                <option value="quarterly">Quarterly</option>
              </select>
            </label>
          </div>
          <div className="px-4 pb-3 text-[11px]" style={{ color: "var(--muted)" }}>
            On import, an empty model is created for each branch in the Reserve module. You choose
            how to bind data (build triangle / roll-forward) there.
          </div>
        </div>

        {/* Large yöntemi: modele DİNAMİK uygulanır (EP gibi) */}
        {largeMode && (
          <div className="rounded-xl border overflow-hidden mb-5" style={{ borderColor: "var(--border)" }}>
            <div
              className="px-4 py-2.5 border-b text-[12px] font-semibold"
              style={{ borderColor: "var(--border)", background: "var(--surface-alt)", color: "var(--muted-strong)" }}
            >
              Large method
            </div>
            <div className="px-4 py-3 space-y-3">
              <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: "var(--border)" }}>
                {([["direct", "Direct"], ["rollforward", "Roll-forward"]] as const).map(([val, lbl]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => onLargeMethod(val)}
                    className="flex-1 py-2 text-[12px] font-medium transition"
                    style={{
                      background: largeMethod === val ? "var(--primary)" : "var(--surface)",
                      color: largeMethod === val ? "#fff" : "var(--muted-strong)",
                    }}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
              {largeMethod === "rollforward" && (
                <label className="block">
                  <span className="block text-[11.5px] font-medium mb-1" style={{ color: "var(--muted-strong)" }}>
                    Base (previous) period
                  </span>
                  {basePeriodOptions.length === 0 ? (
                    <span className="text-[11px]" style={{ color: "var(--muted)" }}>
                      No previous period has large — load large into a period first, or choose Direct.
                    </span>
                  ) : (
                    <select
                      value={largeBase}
                      onChange={(e) => onLargeBase(e.target.value)}
                      className="w-full text-[13px] border rounded-lg px-3 py-2 bg-[color:var(--surface)]"
                      style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
                    >
                      <option value="">— select period —</option>
                      {basePeriodOptions.map((lbl) => (
                        <option key={lbl} value={lbl}>{lbl}</option>
                      ))}
                    </select>
                  )}
                </label>
              )}
            </div>
            <div className="px-4 pb-3 text-[11px]" style={{ color: "var(--muted)" }}>
              Direct: cumulative triangle from all large records. Roll-forward: this period's movement
              is carried over the base period's large. The model reflects this large automatically.
            </div>
          </div>
        )}

        {error && <ErrorBox message={error} className="mb-4" />}
      </div>

      <div
        className="flex items-center justify-between px-6 py-4 border-t flex-shrink-0"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <button
          onClick={onBack}
          disabled={importing}
          className="px-4 py-2 rounded-xl text-[13px] border transition disabled:opacity-40"
          style={{ borderColor: "var(--border)", color: "var(--muted-strong)" }}
        >
          ← Back
        </button>
        <button
          onClick={onImport}
          disabled={importing}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-[13.5px] font-semibold transition disabled:opacity-60"
          style={{ background: "var(--primary)", color: "#fff" }}
        >
          {importing && <Spinner small />}
          {importing ? "Importing…" : "Import"}
        </button>
      </div>
    </div>
  );
}

// ─── Ana wizard ───────────────────────────────────────────────────────────────

export interface ImportWizardResult {
  filename: string;
  result: import("@/lib/api").DataImportResult;
  /** Rezervde otomatik oluşacak model iskeletinin frekansı (kaza dönemi). Veri
   *  bağlama/granülarite sonraki adımda (rezerv) kullanıcı tarafından seçilir. */
  frequency: "yearly" | "quarterly";
  /** Large verisi ise: modele dinamik uygulanacak yöntem + roll-forward tabanı. */
  largeMethod?: "direct" | "rollforward";
  largeBasePeriodLabel?: string;
}

export function DataImportWizard({
  onDone,
  largeMode = false,
  basePeriodOptions = [],
}: {
  onDone: (r: ImportWizardResult) => void;
  /** Large verisi mi yükleniyor → yöntem (doğrudan/roll-forward) sorulur. */
  largeMode?: boolean;
  /** Roll-forward tabanı için seçilebilecek önceki dönem etiketleri. */
  basePeriodOptions?: string[];
}) {
  const [step, setStep] = useState<WizardStep>("source");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<WizardState | null>(null);
  const [oracle, setOracle] = useState<{ object: OracleObject; preview: OraclePreviewResult; mapping: Record<string, string> } | null>(null);
  // Rezervde otomatik oluşacak model iskeletinin frekansı (kaza dönemi).
  const [frequency, setFrequency] = useState<"yearly" | "quarterly">("yearly");
  // Large yöntemi (yalnız largeMode): doğrudan / roll-forward + taban dönem.
  const [largeMethod, setLargeMethod] = useState<"direct" | "rollforward">("direct");
  const [largeBase, setLargeBase] = useState<string>("");

  const isExcelMultiSheet =
    state !== null &&
    state.inspect.sheets.length > 1 &&
    state.inspect.sheets[0] !== null;

  const isOracle = oracle !== null;

  // Yükle
  async function handleFile(file: File) {
    setError(null);
    setLoading(true);
    try {
      const inspect = await inspectDataFile(file);
      const multiSheet = inspect.sheets.length > 1 && inspect.sheets[0] !== null;
      // CSV veya tek sayfalı Excel → ilk (ve tek) sayfayı otomatik seç
      const initialSheet = multiSheet ? null : (inspect.sheets[0] ?? null);
      setState({
        file,
        inspect,
        selectedSheet: initialSheet,
        mapping: resolveSuggested(inspect, initialSheet),
      });
      setOracle(null);
      setStep(multiSheet ? "sheet" : "mapping");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read file");
    } finally {
      setLoading(false);
    }
  }

  // Sheet seç
  function handleSheetSelect(s: string) {
    if (!state) return;
    setState({
      ...state,
      selectedSheet: s,
      mapping: resolveSuggested(state.inspect, s),
    });
  }

  // Mapping güncelle
  function handleMapping(m: Record<string, string>) {
    if (oracle) { setOracle({ ...oracle, mapping: m }); return; }
    if (state) setState({ ...state, mapping: m });
  }

  // Import
  async function handleImport() {
    if (!state && !oracle) return;
    setError(null);
    setLoading(true);
    setStep("importing");
    try {
      let result: DataImportResult;
      let filename: string;
      if (oracle) {
        const fetched = await fetchOracleObject(oracle.object.qualified);
        const rows = fetched.records.map((record) => ({
          dosya_no: String(record[oracle.mapping.dosya_no] ?? "").trim(),
          brans: String(record[oracle.mapping.brans] ?? "").trim(),
          hasar_tarihi: String(record[oracle.mapping.hasar_tarihi] ?? "").slice(0, 10),
          gelisim_tarihi: String(record[oracle.mapping.gelisim_tarihi] ?? "").slice(0, 10),
          odeme: Number(record[oracle.mapping.odeme] ?? 0),
          muallak: Number(record[oracle.mapping.muallak] ?? 0),
        }));
        if (rows.some((r) => !r.dosya_no || !r.brans || !r.hasar_tarihi || !r.gelisim_tarihi || !Number.isFinite(r.odeme) || !Number.isFinite(r.muallak))) {
          throw new Error("Oracle source has empty or invalid values in one or more mapped required columns.");
        }
        const dates = rows.map((r) => r.hasar_tarihi);
        const developments = rows.map((r) => r.gelisim_tarihi);
        result = { record_count: rows.length, brans_list: uniqueBranchNames(rows.map((r) => r.brans)).sort(), hasar_tarihi_min: dates.sort()[0] ?? "", hasar_tarihi_max: dates.sort().at(-1) ?? "", gelisim_tarihi_min: developments.sort()[0] ?? "", gelisim_tarihi_max: developments.sort().at(-1) ?? "", total_odeme: rows.reduce((sum, r) => sum + r.odeme, 0), total_muallak: rows.reduce((sum, r) => sum + r.muallak, 0), records: rows };
        filename = `Oracle · ${oracle.object.qualified}`;
      } else {
        result = await importDataFile(state!.file, state!.selectedSheet, state!.mapping);
        filename = state!.file.name;
      }
      onDone({
        filename,
        result,
        frequency,
        ...(largeMode
          ? {
              largeMethod,
              largeBasePeriodLabel: largeMethod === "rollforward" ? largeBase || undefined : undefined,
            }
          : {}),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import error");
      setStep("preview");
    } finally {
      setLoading(false);
    }
  }

  function currentHeaders(): string[] {
    if (oracle) return oracle.preview.columns;
    if (!state) return [];
    return resolveHeaders(state.inspect, state.selectedSheet);
  }

  function currentPreview(): string[][] {
    if (oracle) return oracle.preview.rows.map((row) => row.map((value) => String(value ?? "")));
    if (!state) return [];
    return resolvePreview(state.inspect, state.selectedSheet);
  }

  return (
    <div className="flex flex-col h-full">
      <StepIndicator current={step} hasSheet={isExcelMultiSheet} oracle={isOracle} />

      {step === "source" && <SourceStep onOracle={() => setStep("oracle")} onFile={() => { setOracle(null); setStep("upload"); }} />}

      {step === "upload" && (
        <UploadStep onFile={handleFile} loading={loading} error={error} />
      )}

      {step === "oracle" && <OracleStep onBack={() => setStep("source")} onSelected={(object, preview) => { setOracle({ object, preview, mapping: {} }); setState(null); setStep("mapping"); }} />}

      {step === "sheet" && state && (
        <SheetStep
          sheets={state.inspect.sheets.filter((s): s is string => s !== null)}
          selected={state.selectedSheet}
          onSelect={handleSheetSelect}
          onNext={() => setStep("mapping")}
        />
      )}

      {step === "mapping" && (state || oracle) && (
        <MappingStep
          headers={currentHeaders()}
          mapping={oracle?.mapping ?? state!.mapping}
          preview={currentPreview()}
          onMapping={handleMapping}
          onNext={() => setStep("preview")}
          onBack={() => setStep(oracle ? "oracle" : isExcelMultiSheet ? "sheet" : "upload")}
        />
      )}

      {(step === "preview" || step === "importing") && (state || oracle) && (
        <PreviewStep
          sourceName={oracle ? oracle.object.qualified : state!.file.name}
          sourceDetail={oracle ? `Oracle ${oracle.object.type.toLowerCase()} · ${oracle.preview.row_count} preview rows` : `${(state!.file.size / 1024).toFixed(0)} KB${state!.selectedSheet ? ` · Sheet: ${state!.selectedSheet}` : ""}`}
          mapping={oracle?.mapping ?? state!.mapping}
          onImport={handleImport}
          onBack={() => setStep("mapping")}
          importing={step === "importing"}
          error={error}
          frequency={frequency}
          onFrequency={setFrequency}
          largeMode={largeMode}
          basePeriodOptions={basePeriodOptions}
          largeMethod={largeMethod}
          onLargeMethod={setLargeMethod}
          largeBase={largeBase}
          onLargeBase={setLargeBase}
        />
      )}
    </div>
  );
}

// ─── Küçük yardımcı bileşenler ────────────────────────────────────────────────

function ErrorBox({ message, className = "" }: { message: string; className?: string }) {
  return (
    <div
      className={`rounded-xl px-4 py-3 text-[13px] ${className}`}
      style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" }}
    >
      {message}
    </div>
  );
}

function Spinner({ small }: { small?: boolean }) {
  const size = small ? "w-4 h-4" : "w-7 h-7";
  return (
    <div
      className={`${size} rounded-full border-2 border-t-transparent animate-spin flex-shrink-0`}
      style={{ borderColor: "var(--primary) transparent transparent transparent" }}
    />
  );
}

function UploadIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--primary)" }}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function SheetIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: active ? "var(--primary)" : "var(--muted)", flexShrink: 0 }}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M3 15h18M9 3v18" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--primary)", flexShrink: 0 }}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function DatabaseIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5" /><path d="M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7" /></svg>;
}

function SearchIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>;
}
