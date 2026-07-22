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

const _nf = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });
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
      if (!base) throw new Error("Seçilen dönemde üçgen bulunamadı.");

      // Güncel dönem artımsal hasar kayıtları (gross → "hasar", large → "large" tipi)
      let ds = selectedPeriod?.datasets[selectedDatasetId] ?? null;
      if (!ds?.records?.length) ds = await store.loadDatasetRecords(periodId, selectedDatasetId);
      if (!ds?.records?.length) throw new Error("Güncel dönem hasar kaydı bulunamadı");

      // Roll-forward temeli — hedefe göre gross ya da large üçgenleri.
      const basePaid0 = isLarge ? base.largePaidTriangle : base.paidTriangle;
      const baseIncurred0 = (isLarge ? base.largeIncurredTriangle : base.incurredTriangle) ?? null;
      if (!basePaid0) {
        throw new Error(
          isLarge
            ? "Seçilen dönemde LARGE üçgeni yok — önce o dönemin large'ını yükleyin."
            : "Seçilen dönemde hem ödeme hem muallak üçgeni olmalı (ikisini de yükleyin).",
        );
      }
      if (!isLarge && !baseIncurred0) {
        throw new Error("Seçilen dönemde hem ödeme hem muallak üçgeni olmalı (ikisini de yükleyin).");
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

          {/* Dosya düzeltmeleri (opsiyonel) — bir dosyanın ödeme/muallağını roll-forward'da düzelt */}
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
                  Dosya düzeltmeleri (opsiyonel)
                  {adjCount > 0 && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                      style={{ background: "var(--warning-soft,#f59e0b22)", color: "var(--warning-strong,#b45309)" }}>
                      {adjCount} düzeltme
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
                        ["current", `Güncel dönem${selectedPeriod ? ` (${selectedPeriod.label})` : ""}`],
                        ["base", `Temel dönem${basePeriodLabel ? ` (${basePeriodLabel})` : ""}`],
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
                      ? "TEMEL dönemin dosyasını düzeltin (örn. muallağı yanlış girilmiş bir hasar). Düzeltme, temel üçgenin o origin diagonaline delta olarak uygulanır; roll-forward bu düzeltilmiş temelin üzerine taşınır."
                      : "GÜNCEL dönemin dosyasını (claim) düzeltin. Düzeltme yalnızca bu roll-forward'a uygulanır."}
                    {" Orijinal veriye dokunulmaz; boş bırakılan alan orijinal kalır."}
                  </p>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={adjSearch}
                    onChange={(e) => setAdjSearch(e.target.value)}
                    placeholder="Dosya no ara… (boşsa en büyük muallaklar)"
                    className="w-full text-xs border border-[color:var(--border)] rounded-md px-2.5 py-1.5 bg-[color:var(--surface)] text-[color:var(--foreground)]"
                  />
                  {activeLoading ? (
                    <p className="text-[11px]" style={{ color: "var(--muted)" }}>Dosyalar yükleniyor…</p>
                  ) : visibleAggs.length === 0 ? (
                    <p className="text-[11px]" style={{ color: "var(--muted)" }}>
                      {adjSearch.trim() ? "Eşleşen dosya yok." : "Dosya bulunamadı."}
                    </p>
                  ) : (
                    <div className="max-h-64 overflow-y-auto rounded-md" style={{ border: "1px solid var(--border)" }}>
                      <table className="w-full text-[11px]">
                        <thead className="sticky top-0" style={{ background: "var(--surface-alt)" }}>
                          <tr style={{ color: "var(--muted)" }}>
                            <th className="text-left font-medium px-2 py-1">Dosya · Kaza yılı</th>
                            <th className="text-right font-medium px-2 py-1">Ödeme</th>
                            <th className="text-right font-medium px-2 py-1">Muallak</th>
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
                                    title={`Orijinal ödeme: ${fmtNum(a.odeme)}`}
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
                                    title={`Orijinal muallak: ${fmtNum(a.muallak)}`}
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
                      Bu dönemin düzeltmelerini temizle ({isBaseScope ? "temel" : "güncel"})
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
