"use client";

import { useState, useEffect } from "react";
import { useDataStore, type TriangleRecord } from "@/lib/data-store";
import { buildTriangleFromRecords, rollForwardTriangle, type ClaimRecord } from "@/lib/api";
import { newDiagonalToFileData, mergeFileData } from "@/lib/roll-forward-util";
import { useBranchSetters, useProject } from "@/lib/project-store";
import {
  aggregateClaims,
  applyAdjustments,
  applyBaseAdjustments,
  originByDosyaFromFileData,
  type ClaimAgg,
} from "@/lib/roll-adjust";
import type { ClaimAdjustment } from "@/types/project";

interface Props {
  onClose: () => void;
  onLoaded: () => void;
  /** "large" → yüklenen üçgenler LARGE segmentine yazılır (setLargeTriangles). */
  target?: "gross" | "large";
}

type Granularity = "yearly" | "quarterly";
type Source = "hasar" | "ucgen" | "rollforward";

const _nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
function fmtNum(n: number): string {
  return _nf.format(n);
}

export function LoadFromDataStore({ onClose, onLoaded, target = "gross" }: Props) {
  const store = useDataStore();
  const setters = useBranchSetters("user");
  const { project, activeBranch, actions } = useProject();
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

  // Dosya düzeltmeleri (roll-forward, non-destructive). Kapsam: güncel dönem (artımsal
  // kayıtlar) VEYA temel/önceki dönem (temel üçgene delta-yama). Aktif branch'te saklıysa yükle.
  const [adjScope, setAdjScope] = useState<"current" | "base">("current");
  const [adjustments, setAdjustments] = useState<Record<string, ClaimAdjustment>>(
    () => ((isLarge ? activeBranch?.largeRollAdjustments : activeBranch?.rollAdjustments) ?? {}),
  );
  const [baseAdjustments, setBaseAdjustments] = useState<Record<string, ClaimAdjustment>>(
    () => ((isLarge ? activeBranch?.largeBaseRollAdjustments : activeBranch?.baseRollAdjustments) ?? {}),
  );
  const [adjOpen, setAdjOpen] = useState(false);
  const [adjSearch, setAdjSearch] = useState("");
  const [claimAggs, setClaimAggs] = useState<ClaimAgg[]>([]);
  const [baseAggs, setBaseAggs] = useState<ClaimAgg[]>([]);
  const [loadingAggs, setLoadingAggs] = useState(false);
  const [loadingBaseAggs, setLoadingBaseAggs] = useState(false);

  const claimsTypeId = isLarge ? "large" : "hasar";
  // Temel dönemin (proje) veri-store karşılığı — etikete göre eşlenir (id uzayları ayrı).
  const basePeriodLabel = project.periods.find((p) => p.id === priorPeriodId)?.label;
  const baseStorePeriod = basePeriodLabel
    ? store.periods.find((sp) => sp.label === basePeriodLabel)
    : undefined;
  const baseHasClaimDataset = !!(
    baseStorePeriod && Object.values(baseStorePeriod.datasets).some((d) => d.typeId === claimsTypeId)
  );

  // Güncel dönemin dosya hareketlerini topla (panel açık + kapsam=güncel).
  useEffect(() => {
    if (source !== "rollforward" || !adjOpen || adjScope !== "current" || !periodId || !selectedDatasetId || !brans) return;
    let cancelled = false;
    setLoadingAggs(true);
    (async () => {
      try {
        let ds = store.periods.find((p) => p.id === periodId)?.datasets[selectedDatasetId] ?? null;
        if (!ds?.records?.length) ds = await store.loadDatasetRecords(periodId, selectedDatasetId);
        const recs = (ds?.records ?? []) as ClaimRecord[];
        const aggs = aggregateClaims(recs, brans).sort((a, b) => b.muallak - a.muallak);
        if (!cancelled) setClaimAggs(aggs);
      } catch {
        if (!cancelled) setClaimAggs([]);
      } finally {
        if (!cancelled) setLoadingAggs(false);
      }
    })();
    return () => { cancelled = true; };
  }, [source, adjOpen, adjScope, periodId, selectedDatasetId, brans, store]);

  // Temel dönemin dosya hareketlerini topla (panel açık + kapsam=temel).
  useEffect(() => {
    if (source !== "rollforward" || !adjOpen || adjScope !== "base" || !brans || !baseStorePeriod) return;
    let cancelled = false;
    setLoadingBaseAggs(true);
    (async () => {
      try {
        const dsMeta = Object.values(baseStorePeriod.datasets).find((d) => d.typeId === claimsTypeId);
        if (!dsMeta) { if (!cancelled) setBaseAggs([]); return; }
        let ds: typeof dsMeta | null = dsMeta;
        if (!ds.records?.length) ds = await store.loadDatasetRecords(baseStorePeriod.id, dsMeta.datasetId);
        const recs = (ds?.records ?? []) as ClaimRecord[];
        const aggs = aggregateClaims(recs, brans).sort((a, b) => b.muallak - a.muallak);
        if (!cancelled) setBaseAggs(aggs);
      } catch {
        if (!cancelled) setBaseAggs([]);
      } finally {
        if (!cancelled) setLoadingBaseAggs(false);
      }
    })();
    return () => { cancelled = true; };
  }, [source, adjOpen, adjScope, brans, baseStorePeriod, claimsTypeId, store]);

  // Branş/dönem/hedef değişince düzeltmeleri sıfırla (farklı segmentin/dönemin düzeltmesi karışmasın).
  useEffect(() => {
    setAdjustments((isLarge ? activeBranch?.largeRollAdjustments : activeBranch?.rollAdjustments) ?? {});
    setBaseAdjustments((isLarge ? activeBranch?.largeBaseRollAdjustments : activeBranch?.baseRollAdjustments) ?? {});
    setAdjSearch("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brans, priorPeriodId, isLarge]);

  // Kapsam=temel ama o dönemde dosya verisi yoksa güncel'e düş.
  useEffect(() => {
    if (adjScope === "base" && !baseHasClaimDataset) setAdjScope("current");
  }, [adjScope, baseHasClaimDataset]);

  const isBaseScope = adjScope === "base";
  const activeAdj = isBaseScope ? baseAdjustments : adjustments;
  const setActiveAdj = isBaseScope ? setBaseAdjustments : setAdjustments;
  const activeAggs = isBaseScope ? baseAggs : claimAggs;
  const activeLoading = isBaseScope ? loadingBaseAggs : loadingAggs;
  const adjCount = Object.keys(adjustments).length + Object.keys(baseAdjustments).length;

  function setOverride(dosya: string, field: "muallak" | "odeme", raw: string) {
    setActiveAdj((prev) => {
      const next = { ...prev };
      const cur = { ...(next[dosya] ?? {}) };
      const trimmed = raw.trim();
      if (trimmed === "") {
        delete cur[field];
      } else {
        const v = Number(trimmed.replace(/\s/g, "").replace(",", "."));
        if (Number.isNaN(v)) return prev;
        cur[field] = v;
      }
      if (cur.muallak == null && cur.odeme == null && cur.note == null) {
        delete next[dosya];
      } else {
        next[dosya] = cur;
      }
      return next;
    });
  }

  // Panelde gösterilecek satırlar: düzeltilmiş dosyalar her zaman üstte + arama/top-N.
  const visibleAggs = (() => {
    const q = adjSearch.trim();
    if (q) return activeAggs.filter((a) => a.dosya.includes(q) || a.kazaYili.includes(q));
    const overridden = activeAggs.filter((a) => activeAdj[a.dosya]);
    const rest = activeAggs.filter((a) => !activeAdj[a.dosya]).slice(0, 25);
    return [...overridden, ...rest];
  })();

  const selectedPeriod = store.periods.find((p) => p.id === periodId);
  // Large hedefinde: hasar → "Büyük Hasar (Large)", hazır üçgen → "Large Üçgen".
  // (claimsTypeId yukarıda tanımlı.)
  const triangleTypeId = isLarge ? "large_ucgen" : "ucgen";
  const hasarDatasets = selectedPeriod
    ? Object.values(selectedPeriod.datasets).filter((d) => d.typeId === claimsTypeId)
    : [];
  const ucgenDatasets = selectedPeriod
    ? Object.values(selectedPeriod.datasets).filter((d) => d.typeId === triangleTypeId)
    : [];
  // hasar ve rollforward güncel dönem hasar dataset'ini kullanır; ucgen → üçgen dataset'i
  const activeDatasets = source === "ucgen" ? ucgenDatasets : hasarDatasets;

  // Roll-forward temeli: sistemde (projede) üçgeni olan dönemler. Yeni artımsal
  // veri bunlardan seçilenin üzerine "ileri taşınır".
  // Roll-forward temeli, HEM paid HEM incurred üçgeni olan branch olmalı.
  // Hedefe göre temel branch koşulu: gross → paid+incurred, large → large üçgeni.
  const baseHasData = (b: (typeof project.periods)[number]["branches"][number]) =>
    isLarge ? !!(b.largePaidTriangle || b.largeIncurredTriangle) : !!(b.paidTriangle && b.incurredTriangle);
  function baseBranchOf(prjPeriodId: string) {
    const p = project.periods.find((x) => x.id === prjPeriodId);
    if (!p) return null;
    const withData = p.branches.filter(baseHasData);
    return (
      withData.find((b) => activeBranch && b.frequency === activeBranch.frequency && b.name === activeBranch.name) ??
      withData.find((b) => activeBranch && b.frequency === activeBranch.frequency) ??
      withData[0] ??
      null
    );
  }
  const priorPeriodOptions = project.periods.filter(
    (p) => p.id !== project.activePeriodId && p.branches.some(baseHasData),
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
      if (!ds?.records?.length) throw new Error("No records found");

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
      if (!ds?.records?.length) throw new Error("Triangle data not found");

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
      if (!base) throw new Error("No triangle in the selected period.");

      // Güncel dönem artımsal hasar kayıtları (gross → "hasar", large → "large" tipi)
      let ds = selectedPeriod?.datasets[selectedDatasetId] ?? null;
      if (!ds?.records?.length) ds = await store.loadDatasetRecords(periodId, selectedDatasetId);
      if (!ds?.records?.length) throw new Error("No claim records in the current period");

      // Roll-forward temeli — hedefe göre gross ya da large üçgenleri.
      const basePaid0 = isLarge ? base.largePaidTriangle : base.paidTriangle;
      const baseIncurred0 = (isLarge ? base.largeIncurredTriangle : base.incurredTriangle) ?? null;
      if (!basePaid0) {
        throw new Error(
          isLarge
            ? "No LARGE triangle in the selected period — load that period's large first."
            : "The selected period must have both paid and outstanding triangles (load both).",
        );
      }
      if (!isLarge && !baseIncurred0) {
        throw new Error("The selected period must have both paid and outstanding triangles (load both).");
      }

      // TEMEL dönem düzeltmeleri: prior üçgenlere delta-yama (non-destructive), roll'dan ÖNCE.
      const baseOriginMap = originByDosyaFromFileData(isLarge ? base.largeFileData : base.fileData);
      const patched = applyBaseAdjustments(basePaid0, baseIncurred0, baseAggs, baseAdjustments, baseOriginMap);
      const priorPaid = patched.paid;
      const priorIncurred = patched.incurred;

      const og = priorPaid.origin_granularity as Granularity;
      const dg = priorPaid.development_granularity as Granularity;

      // Güncel dönem düzeltmeleri: non-destructive — kayıtlar düzeltilmiş değerlerle dönüştürülür.
      const rolledRecords = applyAdjustments(ds.records as ClaimRecord[], adjustments);

      const { paidTriangle, incurredTriangle, newDiagonalFiles } = await rollForwardTriangle(
        priorPaid,
        priorIncurred,
        rolledRecords,
        brans,
        og,
        dg,
      );

      const newDiagFd = newDiagonalFiles
        ? newDiagonalToFileData(paidTriangle, newDiagonalFiles)
        : null;
      const fileName = `${selectedPeriod?.label ?? ""} – ${brans} (roll-forward)`;

      if (isLarge) {
        // Large segment üçgenleri (gross'tan bağımsız). largeModel korunur (dokunulmaz).
        const fd = mergeFileData(base.largeFileData, newDiagFd);
        setters.setLargeTriangles(paidTriangle, incurredTriangle ?? paidTriangle, fd);
      } else {
        // Gross: SADECE veri değişir; base'in tüm varsayım/seçimleri korunur.
        const fd = mergeFileData(base.fileData, newDiagFd);
        setters.setRolledForward(paidTriangle, incurredTriangle ?? paidTriangle, fileName, fd, base);
      }

      // Dosya düzeltmelerini branch'e kaydet (denetlenebilir + yeniden roll'da korunur).
      const curField = isLarge ? "largeRollAdjustments" : "rollAdjustments";
      const baseField = isLarge ? "largeBaseRollAdjustments" : "baseRollAdjustments";
      const curCount = Object.keys(adjustments).length;
      const baseCount = Object.keys(baseAdjustments).length;
      actions.updateActiveBranch(
        () => ({
          [curField]: curCount > 0 ? adjustments : undefined,
          [baseField]: baseCount > 0 ? baseAdjustments : undefined,
        }),
        "roll_adjustments",
        { current: curCount, base: baseCount, unplaced: patched.unplaced, target },
      );
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
      <div className={`card w-full ${source === "rollforward" ? "max-w-lg" : "max-w-md"} shadow-xl border border-[color:var(--border)]`}>
        <div className="p-5 border-b border-[color:var(--border)] flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            Load from Data Module
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

        <div className="p-5 space-y-4 max-h-[78vh] overflow-y-auto">
          {/* Kaynak seçimi — gross gibi large için de: full veri / hazır üçgen / roll-forward */}
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
                {s === "hasar" ? "Claim data" : s === "ucgen" ? "Prebuilt triangle" : "Roll-forward"}
              </button>
            ))}
          </div>

          {/* Roll-forward: yeni verinin üzerine geleceği mevcut dönem */}
          {source === "rollforward" && (
            <div className="rounded-lg p-3 space-y-2" style={{ background: "var(--surface-alt)", border: "1px solid var(--border)" }}>
              <label className="block text-[11px] font-semibold" style={{ color: "var(--muted-strong)" }}>
                Onto which period? (base)
              </label>
              {priorPeriodOptions.length === 0 ? (
                <p className="text-[11px]" style={{ color: "var(--muted)" }}>
                  There is no other period with both paid and outstanding triangles. First load a
                  paid+outstanding triangle (or claim data) into a period.
                </p>
              ) : (
                <select
                  value={priorPeriodId}
                  onChange={(e) => setPriorPeriodId(e.target.value)}
                  className="w-full text-sm border border-[color:var(--border)] rounded-md px-3 py-2 bg-[color:var(--surface)] text-[color:var(--foreground)]"
                >
                  <option value="">— select period —</option>
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
                This period's paid and outstanding triangles are used as the base; the current period's incremental movement
                is added on top.
              </p>
            </div>
          )}

          {/* Dönem */}
          <div>
            <label className="block text-xs font-medium text-[color:var(--muted-strong)] mb-1">
              Period
            </label>
            {store.periods.length === 0 ? (
              <p className="text-xs text-[color:var(--muted)]">
                No periods added yet. Go to the Data module and create a period.
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
                    {ds.meta.filename} ({new Date(ds.meta.uploadedAt).toLocaleDateString("en-GB")})
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
                    ? "No claim (file-level) data loaded into the current period."
                    : "No claim data loaded into this period."}
                </p>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-medium text-[color:var(--muted-strong)] mb-1">
                      Branch
                    </label>
                    {loadingRecords ? (
                      <p className="text-xs text-[color:var(--muted)]">Loading…</p>
                    ) : bransList.length === 0 ? (
                      <p className="text-xs text-[color:var(--muted)]">No branch information found.</p>
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
                          Accident Period
                        </label>
                        <select
                          value={originGran}
                          onChange={(e) => setOriginGran(e.target.value as Granularity)}
                          className="w-full text-sm border border-[color:var(--border)] rounded-md px-3 py-2 bg-[color:var(--surface)] text-[color:var(--foreground)]"
                        >
                          <option value="yearly">Yearly</option>
                          <option value="quarterly">Quarterly</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[color:var(--muted-strong)] mb-1">
                          Development Period
                        </label>
                        <select
                          value={devGran}
                          onChange={(e) => setDevGran(e.target.value as Granularity)}
                          className="w-full text-sm border border-[color:var(--border)] rounded-md px-3 py-2 bg-[color:var(--surface)] text-[color:var(--foreground)]"
                        >
                          <option value="yearly">Yearly</option>
                          <option value="quarterly">Quarterly</option>
                        </select>
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-[color:var(--muted)] leading-relaxed">
                    {source === "rollforward"
                      ? "The current period's INCREMENTAL movement (this period's paid + end-of-period outstanding) is added to the last diagonal of the base triangle. Granularity is taken from the base triangle."
                      : "The Paid triangle (cumulative paid) and Incurred triangle (cumulative paid + end-of-period outstanding) are built automatically."}
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
                  No triangle data loaded into this period yet. Load it from the "Triangle Data" card in the Data module.
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
                      {ucgenDs.meta.filename} · {ucgenDs.meta.record_count} accident periods
                    </div>
                    <div style={{ color: "var(--muted)" }}>
                      Uploaded: {new Date(ucgenDs.meta.uploadedAt).toLocaleDateString("en-GB")}
                    </div>
                  </div>
                );
              })()}
            </>
          )}

          {/* Claim adjustments (optional) — bir dosyanın ödeme/muallağını roll-forward'da düzelt */}
          {source === "rollforward" && priorPeriodId && brans && bransList.length > 0 && (
            <div className="rounded-lg" style={{ border: "1px solid var(--border)" }}>
              <button
                type="button"
                onClick={() => setAdjOpen((o) => !o)}
                className="w-full flex items-center justify-between px-3 py-2 text-[11px] font-semibold"
                style={{ color: "var(--muted-strong)" }}
              >
                <span className="flex items-center gap-2">
                  <span style={{ transform: adjOpen ? "rotate(90deg)" : "none", transition: "transform .15s" }}>▸</span>
                  Claim adjustments (optional)
                  {adjCount > 0 && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                      style={{ background: "var(--warning-soft,#f59e0b22)", color: "var(--warning-strong,#b45309)" }}>
                      {adjCount} adjustments
                    </span>
                  )}
                </span>
              </button>

              {adjOpen && (
                <div className="px-3 pb-3 space-y-2">
                  {/* Kapsam: hangi dönemin dosyasını düzeltiyoruz? */}
                  {baseHasClaimDataset && (
                    <div className="flex rounded-md overflow-hidden border border-[color:var(--border)]">
                      {([
                        ["current", `Current period${selectedPeriod ? ` (${selectedPeriod.label})` : ""}`],
                        ["base", `Base period${basePeriodLabel ? ` (${basePeriodLabel})` : ""}`],
                      ] as const).map(([val, lbl]) => {
                        const n = val === "base" ? Object.keys(baseAdjustments).length : Object.keys(adjustments).length;
                        return (
                          <button
                            key={val}
                            type="button"
                            onClick={() => { setAdjScope(val); setAdjSearch(""); }}
                            className="flex-1 py-1.5 text-[10px] font-medium transition"
                            style={{
                              background: adjScope === val ? "var(--primary)" : "var(--surface)",
                              color: adjScope === val ? "#fff" : "var(--muted-strong)",
                            }}
                          >
                            {lbl}{n > 0 ? ` · ${n}` : ""}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <p className="text-[10px] leading-relaxed" style={{ color: "var(--muted)" }}>
                    {isBaseScope
                      ? "Adjust a claim in the BASE period (e.g. a claim with a wrong outstanding). The adjustment is applied as a delta on that origin's diagonal of the base triangle; roll-forward is then carried over this corrected base."
                      : "Adjust a claim in the CURRENT period. The adjustment applies only to this roll-forward."}
                    {" Original data is not modified; a field left blank keeps its original value."}
                  </p>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={adjSearch}
                    onChange={(e) => setAdjSearch(e.target.value)}
                    placeholder="Search claim no… (empty = largest outstanding)"
                    className="w-full text-xs border border-[color:var(--border)] rounded-md px-2.5 py-1.5 bg-[color:var(--surface)] text-[color:var(--foreground)]"
                  />
                  {activeLoading ? (
                    <p className="text-[11px]" style={{ color: "var(--muted)" }}>Loading claims…</p>
                  ) : visibleAggs.length === 0 ? (
                    <p className="text-[11px]" style={{ color: "var(--muted)" }}>
                      {adjSearch.trim() ? "No matching claim." : "No claims found."}
                    </p>
                  ) : (
                    <div className="max-h-64 overflow-y-auto rounded-md" style={{ border: "1px solid var(--border)" }}>
                      <table className="w-full text-[11px]">
                        <thead className="sticky top-0" style={{ background: "var(--surface-alt)" }}>
                          <tr style={{ color: "var(--muted)" }}>
                            <th className="text-left font-medium px-2 py-1">Claim · Accident year</th>
                            <th className="text-right font-medium px-2 py-1">Paid</th>
                            <th className="text-right font-medium px-2 py-1">Outstanding</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleAggs.map((a) => {
                            const ov = activeAdj[a.dosya];
                            const changed = !!ov && (ov.muallak != null || ov.odeme != null);
                            return (
                              <tr key={`${adjScope}:${a.dosya}`} style={{ borderTop: "1px solid var(--border)", background: changed ? "var(--warning-soft,#f59e0b18)" : undefined }}>
                                <td className="px-2 py-1">
                                  <span className="font-mono">{a.dosya}</span>
                                  <span style={{ color: "var(--muted)" }}> · {a.kazaYili}</span>
                                </td>
                                <td className="px-1 py-1">
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    defaultValue={ov?.odeme != null ? String(ov.odeme) : ""}
                                    onChange={(e) => setOverride(a.dosya, "odeme", e.target.value)}
                                    placeholder={fmtNum(a.odeme)}
                                    className="w-24 text-right text-[11px] border border-[color:var(--border)] rounded px-1.5 py-1 bg-[color:var(--surface)]"
                                    title={`Original paid: ${fmtNum(a.odeme)}`}
                                  />
                                </td>
                                <td className="px-1 py-1">
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    defaultValue={ov?.muallak != null ? String(ov.muallak) : ""}
                                    onChange={(e) => setOverride(a.dosya, "muallak", e.target.value)}
                                    placeholder={fmtNum(a.muallak)}
                                    className="w-24 text-right text-[11px] border border-[color:var(--border)] rounded px-1.5 py-1 bg-[color:var(--surface)]"
                                    title={`Original outstanding: ${fmtNum(a.muallak)}`}
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {Object.keys(activeAdj).length > 0 && (
                    <button
                      type="button"
                      onClick={() => setActiveAdj({})}
                      className="text-[10px] underline"
                      style={{ color: "var(--muted)" }}
                    >
                      Clear this period's adjustments ({isBaseScope ? "base" : "current"})
                    </button>
                  )}
                </div>
              )}
            </div>
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
            Cancel
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
              ? source === "ucgen" ? "Loading…" : source === "rollforward" ? "Rolling forward…" : "Building…"
              : source === "ucgen" ? "Load Triangle" : source === "rollforward" ? "Roll Forward" : "Load Triangles"}
          </button>
        </div>
      </div>
    </div>
  );
}
