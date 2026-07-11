"use client";

import { useState, useEffect, useMemo } from "react";
import { useDataStore, type TriangleRecord } from "@/lib/data-store";
import { buildTriangleFromRecords, rollForwardTriangle } from "@/lib/api";
import { useBranchSetters, useProject } from "@/lib/project-store";
import { newDiagonalToFileData } from "@/lib/file-analysis";
import type { FileData, Triangle } from "@/types/triangle";

interface Props {
  onClose: () => void;
  onLoaded: () => void;
}

type Granularity = "yearly" | "quarterly";
type Source = "hasar" | "ucgen" | "rollforward";

export function LoadFromDataStore({ onClose, onLoaded }: Props) {
  const store = useDataStore();
  const setters = useBranchSetters("user");
  const { project, activeBranch } = useProject();

  const [source, setSource] = useState<Source>("hasar");
  // Roll-forward: temel alınacak önceki üçgen (paid'i olan bir branş)
  const [priorBranchId, setPriorBranchId] = useState<string>("");
  const [periodId, setPeriodId] = useState<string>(store.activePeriodId ?? "");
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>("");
  const [brans, setBrans] = useState<string>("");
  const [originGran, setOriginGran] = useState<Granularity>("yearly");
  const [devGran, setDevGran] = useState<Granularity>("yearly");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [bransList, setBransList] = useState<string[]>([]);

  // Roll-forward için temel alınabilecek üçgenler: paid üçgeni olan, aktif
  // olmayan branşlar (her dönem/branş).
  const priorOptions = useMemo(() => {
    const out: { id: string; label: string; branch: import("@/types/project").Branch }[] = [];
    for (const p of project.periods) {
      for (const b of p.branches) {
        if (b.id === activeBranch?.id) continue;
        if (b.paidTriangle) out.push({ id: b.id, label: `${p.label} · ${b.name}`, branch: b });
      }
    }
    return out;
  }, [project.periods, activeBranch?.id]);

  // Seçim boşsa ilk seçeneğe düş (effect yerine türetilmiş değer)
  const effectivePriorId = priorBranchId || priorOptions[0]?.id || "";

  const selectedPeriod = store.periods.find((p) => p.id === periodId);
  const hasarDatasets = selectedPeriod
    ? Object.values(selectedPeriod.datasets).filter((d) => d.typeId === "hasar")
    : [];
  const ucgenDatasets = selectedPeriod
    ? Object.values(selectedPeriod.datasets).filter((d) => d.typeId === "ucgen")
    : [];
  const activeDatasets = source === "ucgen" ? ucgenDatasets : hasarDatasets;

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

  async function handleRollForward() {
    if (!periodId || !brans || !selectedDatasetId || !effectivePriorId) return;
    const prior = priorOptions.find((o) => o.id === effectivePriorId)?.branch;
    if (!prior?.paidTriangle) {
      setError("Seçilen önceki branşta paid üçgeni yok. Roll-forward için paid üçgeni gerekli.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      let ds = selectedPeriod?.datasets[selectedDatasetId] ?? null;
      if (!ds?.records?.length) ds = await store.loadDatasetRecords(periodId, selectedDatasetId);
      if (!ds?.records?.length) throw new Error("Güncel dönem kaydı bulunamadı");

      const pPaid = prior.paidTriangle as Triangle;
      const { paidTriangle, incurredTriangle, newDiagonalFiles } = await rollForwardTriangle(
        pPaid,
        (prior.incurredTriangle as Triangle | null) ?? null,
        ds.records as import("@/lib/api").ClaimRecord[],
        brans,
        pPaid.origin_granularity,
        pPaid.development_granularity,
      );

      // Yeni diagonalin dosya kırılımını, o diagonalin dev etiketiyle eşleyip
      // fileData'ya çevir (Dosya sekmesi bu dönemin hareketini gösterir).
      let fileData: FileData | undefined;
      if (newDiagonalFiles) {
        const fd = newDiagonalToFileData(paidTriangle, newDiagonalFiles);
        if (Object.keys(fd).length) fileData = fd;
      }

      const fileName = `${selectedPeriod?.label ?? ""} – ${brans} (roll-forward)`;
      setters.setBothTriangles(paidTriangle, incurredTriangle, fileName, fileData, null);
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
                className="flex-1 py-2 text-[11px] font-medium transition leading-tight"
                style={{
                  background: source === s ? "var(--primary)" : "var(--surface)",
                  color: source === s ? "#fff" : "var(--muted-strong)",
                }}
              >
                {s === "hasar" ? "Hasar verisinden" : s === "ucgen" ? "Hazır üçgenden" : "Roll-forward"}
              </button>
            ))}
          </div>

          {/* Roll-forward: temel alınacak önceki üçgen */}
          {source === "rollforward" && (
            <div>
              <label className="block text-xs font-medium text-[color:var(--muted-strong)] mb-1">
                Temel üçgen (önceki dönem)
              </label>
              {priorOptions.length === 0 ? (
                <p className="text-xs text-[color:var(--muted)]">
                  Paid üçgeni olan başka bir branş yok. Önce bir dönemi normal yükleyin.
                </p>
              ) : (
                <select
                  value={effectivePriorId}
                  onChange={(e) => setPriorBranchId(e.target.value)}
                  className="w-full text-sm border border-[color:var(--border)] rounded-md px-3 py-2 bg-[color:var(--surface)] text-[color:var(--foreground)]"
                >
                  {priorOptions.map((o) => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
              )}
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

          {/* Hasar / roll-forward: branş (+ granülarite yalnızca hasar) */}
          {(source === "hasar" || source === "rollforward") && (
            <>
              {hasarDatasets.length === 0 ? (
                <p className="text-xs text-[color:var(--muted)]">
                  {source === "rollforward"
                    ? "Bu döneme güncel dosya-bazlı hasar verisi yüklenmemiş."
                    : "Bu döneme hasar verisi yüklenmemiş."}
                </p>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-medium text-[color:var(--muted-strong)] mb-1">
                      {source === "rollforward" ? "Güncel dönem branşı" : "Branş"}
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
                        <label className="block text-xs font-medium text-[color:var(--muted-strong)] mb-1">Kaza Dönemi</label>
                        <select value={originGran} onChange={(e) => setOriginGran(e.target.value as Granularity)} className="w-full text-sm border border-[color:var(--border)] rounded-md px-3 py-2 bg-[color:var(--surface)] text-[color:var(--foreground)]">
                          <option value="yearly">Yıllık</option>
                          <option value="quarterly">Çeyreklik</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[color:var(--muted-strong)] mb-1">Gelişim Dönemi</label>
                        <select value={devGran} onChange={(e) => setDevGran(e.target.value as Granularity)} className="w-full text-sm border border-[color:var(--border)] rounded-md px-3 py-2 bg-[color:var(--surface)] text-[color:var(--foreground)]">
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
              (source === "rollforward" && !effectivePriorId) ||
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
