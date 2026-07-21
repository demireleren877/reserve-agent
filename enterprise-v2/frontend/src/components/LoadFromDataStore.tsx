"use client";

import { useState, useEffect } from "react";
import { useDataStore, type TriangleRecord } from "@/lib/data-store";
import { buildTriangleFromRecords, rollForwardTriangle, type ClaimRecord } from "@/lib/api";
import { newDiagonalToFileData, mergeFileData } from "@/lib/roll-forward-util";
import { useBranchSetters, useProject } from "@/lib/project-store";

interface Props {
  onClose: () => void;
  onLoaded: () => void;
  /** "large" → yüklenen üçgenler LARGE segmentine yazılır (setLargeTriangles). */
  target?: "gross" | "large";
}

type Granularity = "yearly" | "quarterly";
type Source = "hasar" | "ucgen" | "rollforward";

export function LoadFromDataStore({ onClose, onLoaded, target = "gross" }: Props) {
  const store = useDataStore();
  const setters = useBranchSetters("user");
  const { project, activeBranch } = useProject();
  const isLarge = target === "large";

  // Hedefe göre üçgenleri doğru segmente yaz.
  function commit(
    paid: import("@/types/triangle").Triangle | null,
    incurred: import("@/types/triangle").Triangle | null,
    fileName: string,
    fileData?: import("@/types/triangle").FileData | null,
    count?: import("@/types/triangle").Triangle | null,
  ) {
    if (isLarge) {
      setters.setLargeTriangles(paid, incurred, fileData ?? null);
    } else {
      setters.setBothTriangles(paid, incurred, fileName, fileData, count);
    }
  }

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

  // Roll-forward: yeni verinin ÜZERİNE geleceği, sistemde zaten üçgeni olan dönem
  const [priorPeriodId, setPriorPeriodId] = useState<string>("");

  const selectedPeriod = store.periods.find((p) => p.id === periodId);
  // Large hedefinde hasar kaynağı "Büyük Hasar (Large)" tipini kullanır.
  const claimsTypeId = isLarge ? "large" : "hasar";
  const hasarDatasets = selectedPeriod
    ? Object.values(selectedPeriod.datasets).filter((d) => d.typeId === claimsTypeId)
    : [];
  const ucgenDatasets = selectedPeriod
    ? Object.values(selectedPeriod.datasets).filter((d) => d.typeId === "ucgen")
    : [];
  // hasar ve rollforward güncel dönem hasar dataset'ini kullanır; ucgen → üçgen dataset'i
  const activeDatasets = source === "ucgen" ? ucgenDatasets : hasarDatasets;

  // Roll-forward temeli: sistemde (projede) üçgeni olan dönemler. Yeni artımsal
  // veri bunlardan seçilenin üzerine "ileri taşınır".
  // Roll-forward temeli, HEM paid HEM incurred üçgeni olan branch olmalı.
  function baseBranchOf(prjPeriodId: string) {
    const p = project.periods.find((x) => x.id === prjPeriodId);
    if (!p) return null;
    const withBoth = p.branches.filter((b) => b.paidTriangle && b.incurredTriangle);
    return (
      withBoth.find((b) => activeBranch && b.frequency === activeBranch.frequency && b.name === activeBranch.name) ??
      withBoth.find((b) => activeBranch && b.frequency === activeBranch.frequency) ??
      withBoth[0] ??
      null
    );
  }
  const priorPeriodOptions = project.periods.filter(
    (p) => p.id !== project.activePeriodId && p.branches.some((b) => b.paidTriangle && b.incurredTriangle),
  );

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
      commit(paidTriangle, incurredTriangle, fileName, fileData, countTriangle);
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

      const recs = ds.records as TriangleRecord[];
      const toTri = (rec: TriangleRecord) => ({
        origin_periods: rec.origin_periods,
        development_periods: rec.development_periods,
        values: rec.values,
        triangle_type: rec.triangle_type,
        origin_granularity: rec.origin_granularity,
        development_granularity: rec.development_granularity,
      });
      // Yeni import: iki kayıt (paid + incurred). Eski dataset: tek kayıt.
      const paidRec = recs.find((r) => r.triangle_type === "paid");
      const incRec = recs.find((r) => r.triangle_type === "incurred");
      const paid = paidRec ? toTri(paidRec) : null;
      const incurred = incRec ? toTri(incRec) : null;
      const fileName = `${selectedPeriod?.label ?? ""} – ${recs[0]?.brans ?? ""}`;
      // Ana çalışma üçgeni incurred; yoksa paid'e düşer (eski tek-üçgen dataset)
      commit(paid, incurred ?? paid, fileName);
      onLoaded();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bilinmeyen hata");
    } finally {
      setLoading(false);
    }
  }

  async function handleRollForward() {
    if (!periodId || !selectedDatasetId || !brans || !priorPeriodId) return;
    setError(null);
    setLoading(true);
    try {
      const base = baseBranchOf(priorPeriodId);
      // paid için ASLA incurred'a düşme — temelde ikisi de olmalı.
      if (!base?.paidTriangle || !base?.incurredTriangle) {
        throw new Error("Seçilen dönemde hem ödeme hem muallak üçgeni olmalı (ikisini de yükleyin).");
      }
      const priorPaid = base.paidTriangle;
      const priorIncurred = base.incurredTriangle;

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

      // Önceki dönemin TÜM köşegen dosya kırılımı + yeni köşegen → hepsi kalsın.
      const newDiagFd = newDiagonalFiles
        ? newDiagonalToFileData(paidTriangle, newDiagonalFiles)
        : null;
      const fileData = mergeFileData(base.fileData, newDiagFd);
      const fileName = `${selectedPeriod?.label ?? ""} – ${brans} (roll-forward)`;
      // incurred temel verilmediyse çalışma üçgeni olarak paid kullanılır
      commit(paidTriangle, incurredTriangle ?? paidTriangle, fileName, fileData);
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
          <h2 className="text-sm font-semibold">
            Veri Modülünden Yükle
            {isLarge && (
              <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[color:var(--primary-soft)] text-[color:var(--primary)] align-middle">
                LARGE
              </span>
            )}
          </h2>
          <button
            onClick={onClose}
            className="text-[color:var(--muted)] hover:text-[color:var(--foreground)] text-lg leading-none px-1"
          >
            ×
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Kaynak seçimi — Large hedefinde roll-forward yok (önceki large temeli gerekir) */}
          <div className="flex rounded-lg overflow-hidden border border-[color:var(--border)]">
            {((isLarge ? ["hasar", "ucgen"] : ["hasar", "ucgen", "rollforward"]) as Source[]).map((s) => (
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

          {/* Roll-forward: yeni verinin üzerine geleceği mevcut dönem */}
          {source === "rollforward" && (
            <div className="rounded-lg p-3 space-y-2" style={{ background: "var(--surface-alt)", border: "1px solid var(--border)" }}>
              <label className="block text-[11px] font-semibold" style={{ color: "var(--muted-strong)" }}>
                Hangi dönemin üzerine? (temel)
              </label>
              {priorPeriodOptions.length === 0 ? (
                <p className="text-[11px]" style={{ color: "var(--muted)" }}>
                  Sistemde hem ödeme hem muallak üçgeni olan başka dönem yok. Önce bir döneme
                  ödeme+muallak üçgeni (ya da hasar verisi) yükleyin.
                </p>
              ) : (
                <select
                  value={priorPeriodId}
                  onChange={(e) => setPriorPeriodId(e.target.value)}
                  className="w-full text-sm border border-[color:var(--border)] rounded-md px-3 py-2 bg-[color:var(--surface)] text-[color:var(--foreground)]"
                >
                  <option value="">— dönem seçin —</option>
                  {priorPeriodOptions.map((p) => {
                    const b = baseBranchOf(p.id);
                    return (
                      <option key={p.id} value={p.id}>
                        {p.label}{b ? ` — ${b.name}` : ""}
                      </option>
                    );
                  })}
                </select>
              )}
              <p className="text-[10px]" style={{ color: "var(--muted)" }}>
                Bu dönemin ödeme ve muallak üçgeni temel alınır; güncel dönemin artımsal hareketi
                onların üzerine eklenir.
              </p>
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
              (source === "rollforward" && !priorPeriodId) ||
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
