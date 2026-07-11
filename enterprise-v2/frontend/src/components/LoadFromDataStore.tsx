"use client";

import { useState, useEffect } from "react";
import { useDataStore, type TriangleRecord } from "@/lib/data-store";
import { buildTriangleFromRecords, rollForwardTriangle, type ClaimRecord } from "@/lib/api";
import { newDiagonalToFileData } from "@/lib/roll-forward-util";
import { useBranchSetters } from "@/lib/project-store";
import type { Triangle } from "@/types/triangle";

interface Props {
  onClose: () => void;
  onLoaded: () => void;
}

type Granularity = "yearly" | "quarterly";
type Source = "hasar" | "ucgen" | "rollforward";

export function LoadFromDataStore({ onClose, onLoaded }: Props) {
  const store = useDataStore();
  const setters = useBranchSetters("user");

  const [source, setSource] = useState<Source>("hasar");
  const [periodId, setPeriodId] = useState<string>(store.activePeriodId ?? "");
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>("");
  const [brans, setBrans] = useState<string>("");
  const [originGran, setOriginGran] = useState<Granularity>("yearly");
  const [devGran, setDevGran] = useState<Granularity>("yearly");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [bransList, setBransList] = useState<string[]>([]);

  // Roll-forward: önceki dönem temel üçgeni (ucgen dataset'lerinden)
  const [priorPeriodId, setPriorPeriodId] = useState<string>("");
  const [priorPaidId, setPriorPaidId] = useState<string>("");
  const [priorIncurredId, setPriorIncurredId] = useState<string>("");

  const selectedPeriod = store.periods.find((p) => p.id === periodId);
  const hasarDatasets = selectedPeriod
    ? Object.values(selectedPeriod.datasets).filter((d) => d.typeId === "hasar")
    : [];
  const ucgenDatasets = selectedPeriod
    ? Object.values(selectedPeriod.datasets).filter((d) => d.typeId === "ucgen")
    : [];
  // hasar ve rollforward güncel dönem hasar dataset'ini kullanır; ucgen → üçgen dataset'i
  const activeDatasets = source === "ucgen" ? ucgenDatasets : hasarDatasets;

  // Roll-forward temel üçgeni: seçilen önceki dönemin ucgen (üçgen) dataset'leri
  const priorPeriod = store.periods.find((p) => p.id === priorPeriodId);
  const priorUcgenDatasets = priorPeriod
    ? Object.values(priorPeriod.datasets).filter((d) => d.typeId === "ucgen")
    : [];

  // Seçili dönem/kaynak değişince dataset seçimini sıfırla
  useEffect(() => {
    const first = activeDatasets[0]?.datasetId ?? "";
    setSelectedDatasetId(first);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodId, source]);

  // Seçili dataset değişince branş listesini güncelle
  useEffect(() => {
    if (!periodId || !selectedDatasetId) { setBransList([]); return; }
    const period = store.periods.find((p) => p.id === periodId);

    if (source === "ucgen") {
      const ds = period?.datasets[selectedDatasetId];
      const list = ds?.meta.brans_list ?? [];
      setBransList(list);
      setBrans((b) => (list.includes(b) ? b : list[0] ?? ""));
      return;
    }

    // hasar
    const ds = period?.datasets[selectedDatasetId];
    if (ds?.meta.brans_list?.length) {
      setBransList(ds.meta.brans_list);
      setBrans((b) => (ds.meta.brans_list!.includes(b) ? b : ds.meta.brans_list![0] ?? ""));
    } else if (period && selectedDatasetId) {
      setLoadingRecords(true);
      store.loadDatasetRecords(periodId, selectedDatasetId)
        .then((loaded) => {
          const list = loaded?.meta.brans_list ?? [];
          setBransList(list);
          setBrans(list[0] ?? "");
        })
        .catch(() => setBransList([]))
        .finally(() => setLoadingRecords(false));
    }
  }, [periodId, selectedDatasetId, source, store]);

  async function handleBuildFromHasar() {
    if (!periodId || !brans || !selectedDatasetId) return;
    setError(null);
    setLoading(true);
    try {
      let ds = selectedPeriod?.datasets[selectedDatasetId] ?? null;
      if (!ds?.records?.length) {
        ds = await store.loadDatasetRecords(periodId, selectedDatasetId);
      }
      if (!ds?.records?.length) throw new Error("Kayıt bulunamadı");

      const { paidTriangle, incurredTriangle, countTriangle, fileData } = await buildTriangleFromRecords(
        ds.records as import("@/lib/api").ClaimRecord[],
        brans,
        originGran,
        devGran,
      );

      const fileName = `${selectedPeriod?.label ?? ""} – ${brans}`;
      setters.setBothTriangles(paidTriangle, incurredTriangle, fileName, fileData, countTriangle);
      onLoaded();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bilinmeyen hata");
    } finally {
      setLoading(false);
    }
  }

  async function handleLoadFromUcgen() {
    if (!periodId || !selectedDatasetId) return;
    setError(null);
    setLoading(true);
    try {
      let ds = selectedPeriod?.datasets[selectedDatasetId] ?? null;
      if (!ds?.records?.length) {
        ds = await store.loadDatasetRecords(periodId, selectedDatasetId);
      }
      if (!ds?.records?.length) throw new Error("Üçgen verisi bulunamadı");

      const rec = (ds.records as TriangleRecord[])[0];
      const triangle = {
        origin_periods: rec.origin_periods,
        development_periods: rec.development_periods,
        values: rec.values,
        triangle_type: rec.triangle_type,
        origin_granularity: rec.origin_granularity,
        development_granularity: rec.development_granularity,
      };
      const fileName = `${selectedPeriod?.label ?? ""} – ${rec.brans}`;
      const paid = rec.triangle_type === "paid" ? triangle : null;
      const incurred = rec.triangle_type === "incurred" ? triangle : null;
      setters.setBothTriangles(paid, incurred, fileName);
      onLoaded();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bilinmeyen hata");
    } finally {
      setLoading(false);
    }
  }

  async function loadUcgenTriangle(pId: string, dsId: string): Promise<Triangle | null> {
    if (!pId || !dsId) return null;
    const period = store.periods.find((p) => p.id === pId);
    let ds = period?.datasets[dsId] ?? null;
    if (!ds?.records?.length) ds = await store.loadDatasetRecords(pId, dsId);
    const rec = (ds?.records as TriangleRecord[] | undefined)?.[0];
    if (!rec) return null;
    return {
      origin_periods: rec.origin_periods,
      development_periods: rec.development_periods,
      values: rec.values,
      triangle_type: rec.triangle_type,
      origin_granularity: rec.origin_granularity,
      development_granularity: rec.development_granularity,
    };
  }

  async function handleRollForward() {
    if (!periodId || !selectedDatasetId || !brans || !priorPaidId) return;
    setError(null);
    setLoading(true);
    try {
      const priorPaid = await loadUcgenTriangle(priorPeriodId, priorPaidId);
      if (!priorPaid) throw new Error("Temel (ödeme) üçgeni yüklenemedi");
      const priorIncurred = priorIncurredId
        ? await loadUcgenTriangle(priorPeriodId, priorIncurredId)
        : null;

      // Güncel dönem artımsal hasar kayıtları
      let ds = selectedPeriod?.datasets[selectedDatasetId] ?? null;
      if (!ds?.records?.length) ds = await store.loadDatasetRecords(periodId, selectedDatasetId);
      if (!ds?.records?.length) throw new Error("Güncel dönem hasar kaydı bulunamadı");

      const og = priorPaid.origin_granularity as Granularity;
      const dg = priorPaid.development_granularity as Granularity;

      const { paidTriangle, incurredTriangle, newDiagonalFiles } = await rollForwardTriangle(
        priorPaid,
        priorIncurred,
        ds.records as ClaimRecord[],
        brans,
        og,
        dg,
      );

      const fileData = newDiagonalFiles
        ? newDiagonalToFileData(paidTriangle, newDiagonalFiles)
        : undefined;
      const fileName = `${selectedPeriod?.label ?? ""} – ${brans} (roll-forward)`;
      // incurred temel verilmediyse çalışma üçgeni olarak paid kullanılır
      setters.setBothTriangles(paidTriangle, incurredTriangle ?? paidTriangle, fileName, fileData);
      onLoaded();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bilinmeyen hata");
    } finally {
      setLoading(false);
    }
  }

  function handleBuild() {
    if (source === "ucgen") return handleLoadFromUcgen();
    if (source === "rollforward") return handleRollForward();
    return handleBuildFromHasar();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="card w-full max-w-md shadow-xl border border-[color:var(--border)]">
        <div className="p-5 border-b border-[color:var(--border)] flex items-center justify-between">
          <h2 className="text-sm font-semibold">Veri Modülünden Yükle</h2>
          <button
            onClick={onClose}
            className="text-[color:var(--muted)] hover:text-[color:var(--foreground)] text-lg leading-none px-1"
          >
            ×
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Kaynak seçimi */}
          <div className="flex rounded-lg overflow-hidden border border-[color:var(--border)]">
            {(["hasar", "ucgen", "rollforward"] as Source[]).map((s) => (
              <button
                key={s}
                onClick={() => setSource(s)}
                className="flex-1 py-2 text-[11px] font-medium transition"
                style={{
                  background: source === s ? "var(--primary)" : "var(--surface)",
                  color: source === s ? "#fff" : "var(--muted-strong)",
                }}
              >
                {s === "hasar" ? "Hasar verisi" : s === "ucgen" ? "Hazır üçgen" : "Roll-forward"}
              </button>
            ))}
          </div>

          {/* Roll-forward: önceki dönem temel üçgeni */}
          {source === "rollforward" && (
            <div className="rounded-lg p-3 space-y-3" style={{ background: "var(--surface-alt)", border: "1px solid var(--border)" }}>
              <p className="text-[11px] font-semibold" style={{ color: "var(--muted-strong)" }}>
                Temel üçgen (önceki dönem)
              </p>
              <div>
                <label className="block text-[11px] font-medium text-[color:var(--muted-strong)] mb-1">Önceki dönem</label>
                <select
                  value={priorPeriodId}
                  onChange={(e) => { setPriorPeriodId(e.target.value); setPriorPaidId(""); setPriorIncurredId(""); }}
                  className="w-full text-sm border border-[color:var(--border)] rounded-md px-3 py-2 bg-[color:var(--surface)] text-[color:var(--foreground)]"
                >
                  <option value="">— seçin —</option>
                  {store.periods.filter((p) => p.id !== periodId).map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[color:var(--muted-strong)] mb-1">Temel ödeme (paid) üçgeni</label>
                <select
                  value={priorPaidId}
                  onChange={(e) => setPriorPaidId(e.target.value)}
                  disabled={!priorPeriodId}
                  className="w-full text-sm border border-[color:var(--border)] rounded-md px-3 py-2 bg-[color:var(--surface)] text-[color:var(--foreground)] disabled:opacity-50"
                >
                  <option value="">— seçin —</option>
                  {priorUcgenDatasets.map((ds) => (
                    <option key={ds.datasetId} value={ds.datasetId}>
                      {ds.meta.brans_list?.[0] ?? ds.meta.filename}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[color:var(--muted-strong)] mb-1">
                  Temel muallak (incurred) üçgeni <span style={{ color: "var(--muted)" }}>(opsiyonel)</span>
                </label>
                <select
                  value={priorIncurredId}
                  onChange={(e) => setPriorIncurredId(e.target.value)}
                  disabled={!priorPeriodId}
                  className="w-full text-sm border border-[color:var(--border)] rounded-md px-3 py-2 bg-[color:var(--surface)] text-[color:var(--foreground)] disabled:opacity-50"
                >
                  <option value="">— yok —</option>
                  {priorUcgenDatasets.map((ds) => (
                    <option key={ds.datasetId} value={ds.datasetId}>
                      {ds.meta.brans_list?.[0] ?? ds.meta.filename}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Dönem */}
          <div>
            <label className="block text-xs font-medium text-[color:var(--muted-strong)] mb-1">
              Dönem
            </label>
            {store.periods.length === 0 ? (
              <p className="text-xs text-[color:var(--muted)]">
                Henüz dönem eklenmemiş. Veri modülüne gidip dönem oluşturun.
              </p>
            ) : (
              <select
                value={periodId}
                onChange={(e) => setPeriodId(e.target.value)}
                className="w-full text-sm border border-[color:var(--border)] rounded-md px-3 py-2 bg-[color:var(--surface)] text-[color:var(--foreground)]"
              >
                {store.periods.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            )}
          </div>

          {/* Veri seti seçimi */}
          {activeDatasets.length > 1 && (
            <div>
              <label className="block text-xs font-medium text-[color:var(--muted-strong)] mb-1">
                Veri Seti
              </label>
              <select
                value={selectedDatasetId}
                onChange={(e) => setSelectedDatasetId(e.target.value)}
                className="w-full text-sm border border-[color:var(--border)] rounded-md px-3 py-2 bg-[color:var(--surface)] text-[color:var(--foreground)]"
              >
                {activeDatasets.map((ds) => (
                  <option key={ds.datasetId} value={ds.datasetId}>
                    {ds.meta.filename} ({new Date(ds.meta.uploadedAt).toLocaleDateString("tr-TR")})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Hasar & roll-forward: güncel dönem branşı (+ granülarite yalnızca hasar) */}
          {(source === "hasar" || source === "rollforward") && (
            <>
              {hasarDatasets.length === 0 ? (
                <p className="text-xs text-[color:var(--muted)]">
                  {source === "rollforward"
                    ? "Güncel döneme hasar (dosya bazlı) verisi yüklenmemiş."
                    : "Bu döneme hasar verisi yüklenmemiş."}
                </p>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-medium text-[color:var(--muted-strong)] mb-1">
                      Branş
                    </label>
                    {loadingRecords ? (
                      <p className="text-xs text-[color:var(--muted)]">Yükleniyor…</p>
                    ) : bransList.length === 0 ? (
                      <p className="text-xs text-[color:var(--muted)]">Branş bilgisi bulunamadı.</p>
                    ) : (
                      <select
                        value={brans}
                        onChange={(e) => setBrans(e.target.value)}
                        className="w-full text-sm border border-[color:var(--border)] rounded-md px-3 py-2 bg-[color:var(--surface)] text-[color:var(--foreground)]"
                      >
                        {bransList.map((b) => (
                          <option key={b} value={b}>{b}</option>
                        ))}
                      </select>
                    )}
                  </div>

                  {source === "hasar" && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-[color:var(--muted-strong)] mb-1">
                          Kaza Dönemi
                        </label>
                        <select
                          value={originGran}
                          onChange={(e) => setOriginGran(e.target.value as Granularity)}
                          className="w-full text-sm border border-[color:var(--border)] rounded-md px-3 py-2 bg-[color:var(--surface)] text-[color:var(--foreground)]"
                        >
                          <option value="yearly">Yıllık</option>
                          <option value="quarterly">Çeyreklik</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[color:var(--muted-strong)] mb-1">
                          Gelişim Dönemi
                        </label>
                        <select
                          value={devGran}
                          onChange={(e) => setDevGran(e.target.value as Granularity)}
                          className="w-full text-sm border border-[color:var(--border)] rounded-md px-3 py-2 bg-[color:var(--surface)] text-[color:var(--foreground)]"
                        >
                          <option value="yearly">Yıllık</option>
                          <option value="quarterly">Çeyreklik</option>
                        </select>
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-[color:var(--muted)] leading-relaxed">
                    {source === "rollforward"
                      ? "Güncel dönemin ARTIMSAL hareketi (bu dönem ödemesi + dönem sonu muallak), temel üçgenin son diagonaline eklenir. Granülarite temel üçgenden alınır."
                      : "Paid üçgeni (kümülatif ödeme) ve Incurred üçgeni (kümülatif ödeme + dönem sonu muallak) otomatik oluşturulur."}
                  </p>
                </>
              )}
            </>
          )}

          {/* Üçgen kaynağı: ucgen dataset bilgisi */}
          {source === "ucgen" && (
            <>
              {ucgenDatasets.length === 0 ? (
                <p className="text-xs text-[color:var(--muted)]">
                  Bu döneme henüz üçgen verisi yüklenmemiş. Veri modülünde "Üçgen Verisi" kartından yükleyin.
                </p>
              ) : (() => {
                const ucgenDs = selectedPeriod?.datasets[selectedDatasetId];
                if (!ucgenDs) return null;
                return (
                  <div className="rounded-lg px-3 py-2.5 text-xs space-y-1" style={{ background: "var(--surface-alt)", border: "1px solid var(--border)" }}>
                    <div className="font-semibold" style={{ color: "var(--foreground)" }}>
                      {ucgenDs.meta.brans_list?.[0] ?? "—"}
                    </div>
                    <div style={{ color: "var(--muted-strong)" }}>
                      {ucgenDs.meta.filename} · {ucgenDs.meta.record_count} kaza dönemi
                    </div>
                    <div style={{ color: "var(--muted)" }}>
                      Yüklenme: {new Date(ucgenDs.meta.uploadedAt).toLocaleDateString("tr-TR")}
                    </div>
                  </div>
                );
              })()}
            </>
          )}

          {error && (
            <p className="text-xs text-[color:var(--danger)] bg-[color:var(--danger-soft)] border border-[color:var(--danger-border,#dc262655)] rounded-md px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <div className="px-5 pb-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-md border border-[color:var(--border)] text-[color:var(--muted-strong)] hover:text-[color:var(--foreground)] transition"
          >
            İptal
          </button>
          <button
            onClick={handleBuild}
            disabled={
              loading ||
              !periodId ||
              !selectedDatasetId ||
              ((source === "hasar" || source === "rollforward") && (!brans || bransList.length === 0)) ||
              (source === "rollforward" && !priorPaidId) ||
              (source === "ucgen" && ucgenDatasets.length === 0)
            }
            className="px-4 py-2 text-sm rounded-md bg-[color:var(--primary)] text-white font-medium hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading
              ? source === "ucgen" ? "Yükleniyor…" : source === "rollforward" ? "Taşınıyor…" : "Oluşturuluyor…"
              : source === "ucgen" ? "Üçgeni Yükle" : source === "rollforward" ? "İleri Taşı" : "Üçgenleri Yükle"}
          </button>
        </div>
      </div>
    </div>
  );
}
