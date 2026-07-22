"use client";

import { useRef, useState } from "react";
import {
  DATA_TYPES,
  isTriangleType,
  useDataStore,
  type DataPeriod,
  type DataTypeDef,
  type Dataset,
} from "@/lib/data-store";
import { DataImportWizard, type ImportWizardResult } from "@/components/DataImportWizard";
import { PrimImportWizard, type PrimWizardResult } from "@/components/PrimImportWizard";
import { TriangleImportWizard, type TriangleWizardResult } from "@/components/TriangleImportWizard";
import { TriangleGrid } from "@/components/TriangleGrid";
import { importPrimFile } from "@/lib/api";
import type { PrimRecord, TriangleRecord } from "@/lib/data-store";
import { useProvisionModels } from "@/lib/provision-models";

// ─── Yardımcı ─────────────────────────────────────────────────────────────────

const TR2 = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const TR0 = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
function fmt(n: number) { return TR2.format(n); }
function fmt0(n: number) { return TR0.format(n); }
function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ─── Dönem ekleme formu ───────────────────────────────────────────────────────

const PERIOD_RE = /^\d{4}Q[1-4]$/;

function AddPeriodForm({ onAdd }: { onAdd: (label: string) => void }) {
  const [value, setValue] = useState("");
  const [touched, setTouched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isValid = PERIOD_RE.test(value.trim());
  const showError = touched && value.trim().length > 0 && !isValid;

  function submit() {
    setTouched(true);
    if (!isValid) return;
    onAdd(value.trim());
    setValue("");
    setTouched(false);
  }

  return (
    <div className="px-3 pb-3 space-y-1.5">
      <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
        Dönem Ekle
      </div>
      <div
        className="flex items-center gap-0 rounded-lg border overflow-hidden transition"
        style={{
          borderColor: showError ? "var(--danger)" : isValid && touched ? "var(--primary)" : "var(--border)",
          background: "var(--surface)",
        }}
      >
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => { setValue(e.target.value); setTouched(true); }}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="2025Q1"
          maxLength={7}
          className="flex-1 text-[12.5px] px-2.5 py-2 outline-none bg-transparent"
          style={{ color: "var(--foreground)" }}
        />
        <button
          onClick={submit}
          disabled={!isValid}
          className="px-3 py-2 text-[12px] font-semibold transition disabled:opacity-30 border-l"
          style={{
            background: isValid ? "var(--primary)" : "var(--surface-alt)",
            color: isValid ? "#fff" : "var(--muted)",
            borderColor: "var(--border)",
          }}
        >
          Ekle
        </button>
      </div>
      {showError && (
        <div className="text-[10.5px]" style={{ color: "var(--danger)" }}>
          Format: 2025Q1 (yıl + Q + çeyrek)
        </div>
      )}
    </div>
  );
}

// ─── Dönem listesi (sol panel) ────────────────────────────────────────────────

function PeriodList({
  periods,
  activeId,
  onSelect,
  onAdd,
  onDelete,
}: {
  periods: DataPeriod[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onAdd: (label: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div
      className="flex flex-col border-r flex-shrink-0"
      style={{ width: 200, borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <div
        className="px-3 py-3 border-b"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
          Dönemler
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-1.5">
        {periods.length === 0 && (
          <div className="px-3 py-4 text-[12px] text-center" style={{ color: "var(--muted)" }}>
            Henüz dönem yok
          </div>
        )}
        {periods.map((p) => {
          const active = p.id === activeId;
          const datasetCount = Object.keys(p.datasets).length;
          return (
            <div
              key={p.id}
              onClick={() => onSelect(p.id)}
              className="group flex items-center gap-1 mx-1.5 px-2.5 py-2 rounded-lg cursor-pointer transition"
              style={{
                background: active ? "var(--primary-soft)" : "transparent",
              }}
            >
              <div className="flex-1 min-w-0">
                <div
                  className="text-[13px] font-medium truncate"
                  style={{ color: active ? "var(--primary)" : "var(--foreground)" }}
                >
                  {p.label}
                </div>
                {datasetCount > 0 && (
                  <div className="text-[10.5px]" style={{ color: "var(--muted)" }}>
                    {datasetCount} veri seti
                  </div>
                )}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(p.id); }}
                className="opacity-0 group-hover:opacity-100 transition p-0.5 rounded hover:bg-red-100"
                style={{ color: "#dc2626" }}
                title="Dönemi sil"
              >
                <TrashIcon />
              </button>
            </div>
          );
        })}
      </div>

      <div className="border-t" style={{ borderColor: "var(--border)" }}>
        <AddPeriodForm onAdd={onAdd} />
      </div>
    </div>
  );
}

// ─── Veri türü kartı ──────────────────────────────────────────────────────────

function DataTypeCard({
  def,
  datasets,
  onImport,
  onView,
  onRemove,
}: {
  def: DataTypeDef;
  datasets: Dataset[];
  onImport: () => void;
  onView: (datasetId: string) => void;
  onRemove: (datasetId: string) => void;
}) {
  return (
    <div
      className="rounded-xl border p-4 flex flex-col gap-3"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{ background: datasets.length > 0 ? "var(--primary-soft)" : "var(--surface-alt)" }}
        >
          <TableIcon color={datasets.length > 0 ? "var(--primary)" : "var(--muted)"} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13.5px] font-semibold" style={{ color: "var(--foreground)" }}>
              {def.label}
            </span>
            {datasets.length > 0 && (
              <span
                className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full"
                style={{ background: "#dcfce7", color: "#15803d" }}
              >
                {datasets.length} veri seti
              </span>
            )}
          </div>
          <div className="text-[12px] mt-0.5" style={{ color: "var(--muted-strong)" }}>
            {def.description}
          </div>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {def.columns.map((c) => (
              <span
                key={c}
                className="text-[10.5px] px-1.5 py-0.5 rounded-md font-mono"
                style={{ background: "var(--surface-alt)", color: "var(--muted-strong)", border: "1px solid var(--border)" }}
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      </div>

      {datasets.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {datasets.map((ds) => (
            <div
              key={ds.datasetId}
              className="rounded-lg px-3 py-2 text-[12px] flex items-center gap-2"
              style={{ background: "var(--surface-alt)" }}
            >
              <div className="flex-1 min-w-0 grid grid-cols-3 gap-2">
                <div>
                  <div style={{ color: "var(--muted)" }}>Kayıt</div>
                  <div className="font-semibold" style={{ color: "var(--foreground)" }}>
                    {fmt0(ds.meta.record_count)}
                  </div>
                </div>
                <div>
                  <div style={{ color: "var(--muted)" }}>Dosya</div>
                  <div className="font-semibold truncate" style={{ color: "var(--foreground)" }}>
                    {ds.meta.filename}
                  </div>
                </div>
                <div>
                  <div style={{ color: "var(--muted)" }}>Yüklenme</div>
                  <div className="font-semibold" style={{ color: "var(--foreground)" }}>
                    {new Date(ds.meta.uploadedAt).toLocaleDateString("tr-TR")}
                  </div>
                </div>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button
                  onClick={() => onView(ds.datasetId)}
                  className="px-2.5 py-1 rounded-lg text-[11.5px] border transition"
                  style={{ borderColor: "var(--border)", color: "var(--muted-strong)" }}
                >
                  Görüntüle
                </button>
                <button
                  onClick={() => onRemove(ds.datasetId)}
                  className="px-2.5 py-1 rounded-lg text-[11.5px] border transition hover:bg-red-50"
                  style={{ borderColor: "var(--border)", color: "#dc2626" }}
                >
                  Sil
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={onImport}
        className="py-1.5 rounded-lg text-[12.5px] font-semibold border transition"
        style={{
          borderColor: "var(--primary)",
          background: datasets.length > 0 ? "transparent" : "var(--primary)",
          color: datasets.length > 0 ? "var(--primary)" : "#fff",
        }}
      >
        {datasets.length > 0 ? "+ Yeni ekle" : "Veri yükle"}
      </button>
    </div>
  );
}

// ─── Dataset önizleme (modal benzeri) ─────────────────────────────────────────

function DatasetViewer({
  dataset,
  periodLabel,
  typeLabel,
  onClose,
}: {
  dataset: Dataset;
  periodLabel: string;
  typeLabel: string;
  onClose: () => void;
}) {
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;
  const records = dataset.records;
  const total = records.length;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const slice = records.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="flex flex-col h-full">
      <div
        className="h-12 border-b flex items-center px-4 gap-3 flex-shrink-0"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <button
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-[color:var(--surface-alt)] transition"
          style={{ color: "var(--muted-strong)" }}
        >
          ← Geri
        </button>
        <div className="text-[13px] font-semibold" style={{ color: "var(--foreground)" }}>
          {periodLabel} · {typeLabel}
        </div>
        <div className="ml-auto text-[12px]" style={{ color: "var(--muted)" }}>
          {fmt0(total)} kayıt · {dataset.meta.filename}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {isTriangleType(dataset.typeId) && (dataset.records as TriangleRecord[]).length > 0 && (
          <div className="p-4">
            {(dataset.records as TriangleRecord[]).map((rec, i) => (
              <div key={i} className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[12px] font-semibold" style={{ color: "var(--foreground)" }}>
                    {rec.brans}
                  </span>
                  <span className="text-[10.5px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: "var(--primary-soft)", color: "var(--primary)" }}>
                    {rec.triangle_type === "paid" ? "Paid" : "Incurred"}
                  </span>
                  <span className="text-[10.5px]" style={{ color: "var(--muted)" }}>
                    {rec.origin_granularity === "yearly" ? "Yıllık" : "Çeyreklik"} kaza · {rec.development_granularity === "yearly" ? "Yıllık" : "Çeyreklik"} gelişim
                  </span>
                </div>
                <div className="rounded-lg border overflow-auto" style={{ borderColor: "var(--border)" }}>
                  <TriangleGrid triangle={{
                    origin_periods: rec.origin_periods,
                    development_periods: rec.development_periods,
                    values: rec.values,
                    triangle_type: rec.triangle_type,
                    origin_granularity: rec.origin_granularity,
                    development_granularity: rec.development_granularity,
                  }} />
                </div>
              </div>
            ))}
          </div>
        )}
        {!isTriangleType(dataset.typeId) && (
        <table className="w-full text-[12.5px] border-collapse">
          {dataset.typeId === "prim" ? (
            <>
              <thead>
                <tr style={{ background: "var(--surface-alt)" }}>
                  {["Branş", "Dönem", "EP"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left font-semibold border-b whitespace-nowrap" style={{ borderColor: "var(--border)", color: "var(--muted-strong)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(slice as PrimRecord[]).map((r, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--border)" }} className="hover:bg-[color:var(--surface-alt)]">
                    <td className="px-4 py-2">{r.brans}</td>
                    <td className="px-4 py-2 font-mono">{r.donem}</td>
                    <td className="px-4 py-2 text-right font-mono">{fmt(r.ep)}</td>
                  </tr>
                ))}
              </tbody>
            </>
          ) : (
            <>
              <thead>
                <tr style={{ background: "var(--surface-alt)" }}>
                  {["Dosya No", "Branş", "Hasar Tarihi", "Gelişim Tarihi", "Ödeme", "Muallak"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left font-semibold border-b whitespace-nowrap" style={{ borderColor: "var(--border)", color: "var(--muted-strong)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(slice as import("@/lib/data-store").ClaimRecord[]).map((r, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--border)" }} className="hover:bg-[color:var(--surface-alt)]">
                    <td className="px-4 py-2 font-mono">{r.dosya_no}</td>
                    <td className="px-4 py-2">{r.brans}</td>
                    <td className="px-4 py-2 font-mono">{r.hasar_tarihi}</td>
                    <td className="px-4 py-2 font-mono">{r.gelisim_tarihi}</td>
                    <td className="px-4 py-2 text-right font-mono">{fmt(r.odeme)}</td>
                    <td className="px-4 py-2 text-right font-mono">{fmt(r.muallak)}</td>
                  </tr>
                ))}
              </tbody>
            </>
          )}
        </table>
        )}
      </div>

      {totalPages > 1 && !isTriangleType(dataset.typeId) && (
        <div className="flex items-center gap-3 px-4 py-3 border-t flex-shrink-0" style={{ borderColor: "var(--border)" }}>
          <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1 rounded-lg text-[12px] border disabled:opacity-40" style={{ borderColor: "var(--border)" }}>
            ‹
          </button>
          <span className="text-[12px]" style={{ color: "var(--muted-strong)" }}>{page + 1} / {totalPages}</span>
          <button disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1 rounded-lg text-[12px] border disabled:opacity-40" style={{ borderColor: "var(--border)" }}>
            ›
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Dönem detay paneli ───────────────────────────────────────────────────────

type RightView =
  | { kind: "overview" }
  | { kind: "wizard"; typeId: string }
  | { kind: "viewer"; datasetId: string; typeId: string };

function PeriodDetail({ period }: { period: DataPeriod }) {
  const { setDataset, removeDataset, loadDatasetRecords, periods } = useDataStore();
  const provision = useProvisionModels();
  // Roll-forward tabanı: large'ı olan DİĞER (önceki) dönem etiketleri.
  const largeBaseOptions = periods
    .filter((p) => p.id !== period.id && Object.values(p.datasets).some(
      (d) => d.typeId === "large" || d.typeId === "large_ucgen",
    ))
    .map((p) => p.label);
  const [view, setView] = useState<RightView>({ kind: "overview" });
  const [showPrimWizard, setShowPrimWizard] = useState(false);
  const [showTriangleWizard, setShowTriangleWizard] = useState(false);
  const [triangleWizardType, setTriangleWizardType] = useState<"ucgen" | "large_ucgen">("ucgen");
  const [viewerDataset, setViewerDataset] = useState<Dataset | null>(null);
  const [viewerLoading, setViewerLoading] = useState(false);

  // Hasar wizard tamamlandığında
  async function handleImportDone(typeId: string, result: ImportWizardResult) {
    const ds: Dataset = {
      datasetId: newId(),
      typeId,
      meta: {
        filename: result.filename,
        uploadedAt: new Date().toISOString(),
        record_count: result.result.record_count,
        brans_list: result.result.brans_list,
        hasar_tarihi_min: result.result.hasar_tarihi_min,
        hasar_tarihi_max: result.result.hasar_tarihi_max,
        gelisim_tarihi_min: result.result.gelisim_tarihi_min,
        gelisim_tarihi_max: result.result.gelisim_tarihi_max,
        total_odeme: result.result.total_odeme,
        total_muallak: result.result.total_muallak,
        ...(typeId === "large"
          ? { largeMethod: result.largeMethod ?? "direct", largeBasePeriodLabel: result.largeBasePeriodLabel }
          : {}),
      },
      records: result.result.records,
    };
    // setDataset optimistic update'i hemen uygular; remote hata verse de overview'a dön
    setDataset(period.id, ds).catch(() => {});
    // Rezervde SADECE model iskeleti oluştur (dönem + branş). Veriyi bağlamayı
    // kullanıcı rezervde seçer. Large ayrı üçgen değil, aynı isimli modele bağlanır.
    provision.provisionShells(period.label, result.result.brans_list, result.frequency);
    setView({ kind: "overview" });
  }

  // Prim wizard tamamlandığında
  async function handlePrimImportDone(result: PrimWizardResult) {
    const r = result.importResult;
    const ds: Dataset = {
      datasetId: newId(),
      typeId: "prim",
      meta: {
        filename: result.filename,
        uploadedAt: new Date().toISOString(),
        record_count: r.record_count,
        brans_list: r.brans_list,
        donem_list: r.donem_list,
        total_ep: r.total_ep,
      },
      records: r.records,
    };
    setDataset(period.id, ds).catch(() => {});
    // Prim yalnızca veri; model iskeleti oluşturmaz. Exposure'ı rezervde (BF) kullanıcı bağlar.
    setView({ kind: "overview" });
  }

  // Üçgen wizard tamamlandığında
  async function handleTriangleImportDone(result: TriangleWizardResult) {
    const recs = result.records; // [paid, incurred]
    const ds: Dataset = {
      datasetId: newId(),
      typeId: triangleWizardType,
      meta: {
        filename: result.filename,
        uploadedAt: new Date().toISOString(),
        record_count: recs[0]?.origin_periods.length ?? 0,
        brans_list: recs[0] ? [recs[0].brans] : [],
      },
      records: recs,
    };
    setDataset(period.id, ds).catch(() => {});
    // Hazır üçgen: rezervde yalnız model iskeleti (branş) oluştur; veriyi kullanıcı bağlar.
    if (recs[0]) provision.provisionShells(period.label, [recs[0].brans], recs[0].origin_granularity);
    setShowTriangleWizard(false);
  }

  // Viewer açılışında records lazy-load
  async function openViewer(datasetId: string) {
    const typeId = period.datasets[datasetId]?.typeId ?? "";
    setViewerLoading(true);
    setView({ kind: "viewer", datasetId, typeId });
    const ds = await loadDatasetRecords(period.id, datasetId);
    setViewerDataset(ds);
    setViewerLoading(false);
  }

  if (view.kind === "wizard") {
    const typeDef = DATA_TYPES.find((d) => d.id === view.typeId)!;
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <div
          className="h-12 border-b flex items-center px-4 gap-3 flex-shrink-0"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <button
            onClick={() => setView({ kind: "overview" })}
            className="p-1 rounded-lg hover:bg-[color:var(--surface-alt)] transition"
            style={{ color: "var(--muted-strong)" }}
          >
            ← Geri
          </button>
          <div className="text-[13px] font-semibold" style={{ color: "var(--foreground)" }}>
            {period.label} · {typeDef.label}
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          <DataImportWizard
            onDone={(r) => handleImportDone(view.typeId, r)}
            largeMode={view.typeId === "large"}
            basePeriodOptions={largeBaseOptions}
          />
        </div>
      </div>
    );
  }

  if (view.kind === "viewer") {
    const typeDef = DATA_TYPES.find((d) => d.id === view.typeId);
    if (viewerLoading || !viewerDataset) {
      return (
        <div className="flex-1 flex items-center justify-center" style={{ color: "var(--muted)" }}>
          <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--primary) transparent transparent transparent" }} />
        </div>
      );
    }
    return (
      <DatasetViewer
        dataset={viewerDataset}
        periodLabel={period.label}
        typeLabel={typeDef?.label ?? view.typeId}
        onClose={() => setView({ kind: "overview" })}
      />
    );
  }

  // Overview
  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="mb-5">
        <div className="text-[18px] font-bold" style={{ color: "var(--foreground)" }}>{period.label}</div>
        <div className="text-[12.5px] mt-0.5" style={{ color: "var(--muted)" }}>
          Oluşturulma: {new Date(period.createdAt).toLocaleDateString("tr-TR")}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {DATA_TYPES.map((def) => {
          const typeDatasets = Object.values(period.datasets).filter((d) => d.typeId === def.id);
          return (
            <DataTypeCard
              key={def.id}
              def={def}
              datasets={typeDatasets}
              onImport={() =>
                def.id === "prim"
                  ? setShowPrimWizard(true)
                  : isTriangleType(def.id)
                  ? (setTriangleWizardType(def.id as "ucgen" | "large_ucgen"),
                    setShowTriangleWizard(true))
                  : setView({ kind: "wizard", typeId: def.id })
              }
              onView={(dsId) => openViewer(dsId)}
              onRemove={(dsId) => removeDataset(period.id, dsId)}
            />
          );
        })}
      </div>

      {showPrimWizard && (
        <PrimImportWizard
          onDone={(r) => { setShowPrimWizard(false); handlePrimImportDone(r); }}
          onCancel={() => setShowPrimWizard(false)}
        />
      )}

      {showTriangleWizard && (
        <TriangleImportWizard
          onDone={handleTriangleImportDone}
          onCancel={() => setShowTriangleWizard(false)}
        />
      )}
    </div>
  );
}

// ─── Boş ekran ────────────────────────────────────────────────────────────────

function EmptyState({ hasPeriods }: { hasPeriods: boolean }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8 text-center" style={{ color: "var(--muted)" }}>
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
        style={{ background: "var(--surface-alt)" }}
      >
        <TableIcon color="var(--muted)" />
      </div>
      <div className="text-[14px] font-semibold mb-1" style={{ color: "var(--muted-strong)" }}>
        {hasPeriods ? "Bir dönem seç" : "Dönem oluştur"}
      </div>
      <div className="text-[12.5px]">
        {hasPeriods
          ? "Sol panelden bir dönem seçerek verilerini yönet."
          : "Sol panelden yeni bir dönem ekleyerek başla."}
      </div>
    </div>
  );
}

// ─── Ana sayfa ────────────────────────────────────────────────────────────────

export default function DataPage() {
  const { periods, activePeriodId, activePeriod, addPeriod, deletePeriod, setActivePeriod } =
    useDataStore();

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sol: dönem listesi */}
      <PeriodList
        periods={periods}
        activeId={activePeriodId}
        onSelect={setActivePeriod}
        onAdd={addPeriod}
        onDelete={deletePeriod}
      />

      {/* Sağ: içerik */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Header */}
        <div
          className="h-14 border-b flex items-center px-6 flex-shrink-0"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <div>
            <div className="text-[14px] font-semibold" style={{ color: "var(--foreground)" }}>Veri</div>
            <div className="text-[11.5px]" style={{ color: "var(--muted)" }}>
              Dönem bazlı veri yönetimi
            </div>
          </div>
        </div>

        {/* İçerik */}
        {activePeriod ? (
          <PeriodDetail key={activePeriod.id} period={activePeriod} />
        ) : (
          <EmptyState hasPeriods={periods.length > 0} />
        )}
      </div>
    </div>
  );
}

// ─── İkonlar ──────────────────────────────────────────────────────────────────

function TableIcon({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M3 15h18M9 3v18" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}
