"use client";

/**
 * Import wizard: Yükle → Sheet Seç → Sütun Eşleştir → Önizle → İçeri Aktar
 */

import { useCallback, useRef, useState } from "react";
import {
  inspectDataFile,
  importDataFile,
  type DataInspectResult,
  type DataImportResult,
} from "@/lib/api";

// ─── Sabitler ─────────────────────────────────────────────────────────────────

export const REQUIRED_FIELDS: { key: string; label: string; hint: string }[] = [
  { key: "dosya_no",       label: "Dosya No",        hint: "Hasar dosya / poliçe numarası" },
  { key: "brans",          label: "Branş",            hint: "Sigorta branşı (Kasko, Trafik…)" },
  { key: "hasar_tarihi",   label: "Hasar Tarihi",     hint: "Hasarın oluş tarihi" },
  { key: "gelisim_tarihi", label: "Gelişim Tarihi",   hint: "Raporlama / değerleme tarihi" },
  { key: "odeme",          label: "Ödeme",            hint: "Gerçekleşen ödeme tutarı" },
  { key: "muallak",        label: "Muallak",          hint: "Bilanço karşılığı (case reserve)" },
];

type WizardStep = "upload" | "sheet" | "mapping" | "preview" | "importing";

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
  upload:    "Yükle",
  sheet:     "Sayfa",
  mapping:   "Sütunlar",
  preview:   "Önizle",
  importing: "Önizle",
};

function StepIndicator({ current, hasSheet }: { current: WizardStep; hasSheet: boolean }) {
  const steps: WizardStep[] = hasSheet
    ? ["upload", "sheet", "mapping", "preview"]
    : ["upload", "mapping", "preview"];

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
            Dosya seç
          </h2>
          <p className="text-[13px]" style={{ color: "var(--muted-strong)" }}>
            CSV veya Excel (.xlsx / .xls) — maks. 50 MB
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
                Dosya inceleniyor…
              </span>
            </div>
          ) : (
            <div className="text-center">
              <div className="text-[14px] font-semibold mb-1" style={{ color: "var(--foreground)" }}>
                Dosyayı sürükle veya tıkla
              </div>
              <div className="text-[12px]" style={{ color: "var(--muted)" }}>
                CSV, TXT, XLSX veya XLS
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
          Excel sayfası seç
        </h2>
        <p className="text-[13px] text-center mb-6" style={{ color: "var(--muted-strong)" }}>
          Dosyada {sheets.length} sayfa bulundu. Veriyi içeren sayfayı seç.
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
                  Seçili
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
          Sütun eşleştirme
        </h2>
        <p className="text-[13px] mb-6" style={{ color: "var(--muted-strong)" }}>
          Her alan için dosyadaki karşılık gelen sütunu seç.
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
                  <option value="">— seçiniz —</option>
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
              Dosya önizlemesi (ilk {preview.length} satır)
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
          ← Geri
        </button>
        <button
          onClick={onNext}
          disabled={!allMapped}
          className="px-6 py-2.5 rounded-xl text-[13.5px] font-semibold transition disabled:opacity-40"
          style={{ background: "var(--primary)", color: "#fff" }}
        >
          Önizle →
        </button>
      </div>
    </div>
  );
}

// ─── Adım 4: Önizle & İçeri Aktar ────────────────────────────────────────────

function PreviewStep({
  file,
  sheetName,
  mapping,
  onImport,
  onBack,
  importing,
  error,
  originGran,
  devGran,
  onOriginGran,
  onDevGran,
}: {
  file: File;
  sheetName: string | null;
  mapping: Record<string, string>;
  onImport: () => void;
  onBack: () => void;
  importing: boolean;
  error: string | null;
  originGran: "yearly" | "quarterly";
  devGran: "yearly" | "quarterly";
  onOriginGran: (g: "yearly" | "quarterly") => void;
  onDevGran: (g: "yearly" | "quarterly") => void;
}) {
  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex-1 overflow-auto px-6 py-6">
        <h2 className="text-[17px] font-bold mb-1" style={{ color: "var(--foreground)" }}>
          Eşleştirme özeti
        </h2>
        <p className="text-[13px] mb-5" style={{ color: "var(--muted-strong)" }}>
          Aşağıdaki eşleştirme ile verinizi içeri aktaracaksınız.
        </p>

        {/* Dosya bilgisi */}
        <div
          className="flex items-center gap-3 p-3 rounded-xl border mb-5"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <FileIcon />
          <div>
            <div className="text-[13px] font-semibold" style={{ color: "var(--foreground)" }}>{file.name}</div>
            <div className="text-[11.5px]" style={{ color: "var(--muted)" }}>
              {(file.size / 1024).toFixed(0)} KB
              {sheetName && ` · Sayfa: ${sheetName}`}
            </div>
          </div>
        </div>

        {/* Eşleştirme özeti */}
        <div
          className="rounded-xl border overflow-hidden mb-5"
          style={{ borderColor: "var(--border)" }}
        >
          <div
            className="px-4 py-2.5 border-b text-[12px] font-semibold"
            style={{ borderColor: "var(--border)", background: "var(--surface-alt)", color: "var(--muted-strong)" }}
          >
            Sütun eşleştirmesi
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

        {/* Model kurulumu: rezervde otomatik oluşacak modelin üçgen granülaritesi */}
        <div
          className="rounded-xl border overflow-hidden mb-5"
          style={{ borderColor: "var(--border)" }}
        >
          <div
            className="px-4 py-2.5 border-b text-[12px] font-semibold"
            style={{ borderColor: "var(--border)", background: "var(--surface-alt)", color: "var(--muted-strong)" }}
          >
            Model kurulumu · üçgen granülaritesi
          </div>
          <div className="px-4 py-3 grid grid-cols-2 gap-4">
            <label className="block">
              <span className="block text-[11.5px] font-medium mb-1" style={{ color: "var(--muted-strong)" }}>
                Kaza Dönemi
              </span>
              <select
                value={originGran}
                onChange={(e) => onOriginGran(e.target.value as "yearly" | "quarterly")}
                className="w-full text-[13px] border rounded-lg px-3 py-2 bg-[color:var(--surface)]"
                style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
              >
                <option value="yearly">Yıllık</option>
                <option value="quarterly">Çeyreklik</option>
              </select>
            </label>
            <label className="block">
              <span className="block text-[11.5px] font-medium mb-1" style={{ color: "var(--muted-strong)" }}>
                Gelişim Dönemi
              </span>
              <select
                value={devGran}
                onChange={(e) => onDevGran(e.target.value as "yearly" | "quarterly")}
                className="w-full text-[13px] border rounded-lg px-3 py-2 bg-[color:var(--surface)]"
                style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
              >
                <option value="yearly">Yıllık</option>
                <option value="quarterly">Çeyreklik</option>
              </select>
            </label>
          </div>
          <div className="px-4 pb-3 text-[11px]" style={{ color: "var(--muted)" }}>
            İçe aktarınca rezerv modülünde her branş için model otomatik oluşturulur.
          </div>
        </div>

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
          ← Geri
        </button>
        <button
          onClick={onImport}
          disabled={importing}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-[13.5px] font-semibold transition disabled:opacity-60"
          style={{ background: "var(--primary)", color: "#fff" }}
        >
          {importing && <Spinner small />}
          {importing ? "İçeri aktarılıyor…" : "İçeri aktar"}
        </button>
      </div>
    </div>
  );
}

// ─── Ana wizard ───────────────────────────────────────────────────────────────

export interface ImportWizardResult {
  filename: string;
  result: import("@/lib/api").DataImportResult;
  /** Yüklenen hasar verisinden model kurulurken kullanılacak granülarite (rezerve otomatik model). */
  originGranularity: "yearly" | "quarterly";
  developmentGranularity: "yearly" | "quarterly";
}

export function DataImportWizard({
  onDone,
}: {
  onDone: (r: ImportWizardResult) => void;
}) {
  const [step, setStep] = useState<WizardStep>("upload");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<WizardState | null>(null);
  // Rezerve otomatik model kurarken kullanılacak granülarite (kaza / gelişim dönemi).
  const [originGran, setOriginGran] = useState<"yearly" | "quarterly">("yearly");
  const [devGran, setDevGran] = useState<"yearly" | "quarterly">("quarterly");

  const isExcelMultiSheet =
    state !== null &&
    state.inspect.sheets.length > 1 &&
    state.inspect.sheets[0] !== null;

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
      setStep(multiSheet ? "sheet" : "mapping");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Dosya okunamadı");
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
    if (!state) return;
    setState({ ...state, mapping: m });
  }

  // Import
  async function handleImport() {
    if (!state) return;
    setError(null);
    setLoading(true);
    setStep("importing");
    try {
      const result = await importDataFile(state.file, state.selectedSheet, state.mapping);
      onDone({
        filename: state.file.name,
        result,
        originGranularity: originGran,
        developmentGranularity: devGran,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "İçeri aktarma hatası");
      setStep("preview");
    } finally {
      setLoading(false);
    }
  }

  function currentHeaders(): string[] {
    if (!state) return [];
    return resolveHeaders(state.inspect, state.selectedSheet);
  }

  function currentPreview(): string[][] {
    if (!state) return [];
    return resolvePreview(state.inspect, state.selectedSheet);
  }

  return (
    <div className="flex flex-col h-full">
      <StepIndicator current={step} hasSheet={isExcelMultiSheet} />

      {step === "upload" && (
        <UploadStep onFile={handleFile} loading={loading} error={error} />
      )}

      {step === "sheet" && state && (
        <SheetStep
          sheets={state.inspect.sheets.filter((s): s is string => s !== null)}
          selected={state.selectedSheet}
          onSelect={handleSheetSelect}
          onNext={() => setStep("mapping")}
        />
      )}

      {step === "mapping" && state && (
        <MappingStep
          headers={currentHeaders()}
          mapping={state.mapping}
          preview={currentPreview()}
          onMapping={handleMapping}
          onNext={() => setStep("preview")}
          onBack={() => setStep(isExcelMultiSheet ? "sheet" : "upload")}
        />
      )}

      {(step === "preview" || step === "importing") && state && (
        <PreviewStep
          file={state.file}
          sheetName={state.selectedSheet}
          mapping={state.mapping}
          onImport={handleImport}
          onBack={() => setStep("mapping")}
          importing={step === "importing"}
          error={error}
          originGran={originGran}
          devGran={devGran}
          onOriginGran={setOriginGran}
          onDevGran={setDevGran}
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
