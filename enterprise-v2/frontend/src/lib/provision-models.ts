/**
 * Veri modülünde bir dataset yüklendiğinde REZERV modülünde SADECE model iskeleti
 * oluşturur: eşleşen dönem (yoksa) + branş başına boş model (branch).
 *
 * Veriyi (üçgen/large/prim) modele BAĞLAMA işi kullanıcıya bırakılır — rezerv
 * modülündeki "Veri modülünden yükle" akışında granülarite/roll-forward seçilerek
 * yapılır. Burada üçgen kurulmaz, parametre atanmaz.
 *
 * Idempotent: aynı (dönem, branş, frekans) modeli zaten varsa dokunulmaz.
 */

import { useCallback, useEffect, useState } from "react";
import { useProject } from "@/lib/project-store";
import {
  useDataStore,
  type PrimRecord,
  type TriangleRecord,
  type DataPeriod,
  type Dataset,
} from "@/lib/data-store";
import {
  buildTriangleFromRecords,
  rollForwardTriangle,
  type ClaimRecord,
} from "@/lib/api";
import { newDiagonalToFileData, mergeFileData } from "@/lib/roll-forward-util";
import { branchIdentityKey, sameBranchName, uniqueBranchNames } from "@/lib/branch-identity";
import type { Frequency } from "@/types/project";
import type { Triangle, FileData } from "@/types/triangle";

/** Geriye uyumlu alias; bütün branş eşleşmeleri ortak kimlik standardını kullanır. */
export function sameBrans(a: string | null | undefined, b: string | null | undefined): boolean {
  return sameBranchName(a, b);
}

/**
 * Dönem/origin etiketini kanonik forma indirger: "YYYY" veya "YYYYQn".
 * Toleranslı: "2023.0", "2023 Q1", "2023-q1", "2023/1", "202301" (yyyyqq/yyyymm).
 * Backend `_normalize_donem` ile hizalı; origin tarafı da aynı kefeye konur.
 */
export function normPeriodLabel(s: string | null | undefined): string {
  const t = String(s ?? "").trim();
  const yr = t.match(/^(\d{4})(?:\.0+)?$/);
  if (yr) return yr[1];
  const yq = t.match(/^(\d{4})\s*[-/ ]?\s*[Qq]?\s*([1-4])$/);
  if (yq) return `${yq[1]}Q${yq[2]}`;
  const six = t.match(/^(\d{4})(\d{2})$/);
  if (six) {
    const n = parseInt(six[2], 10);
    if (n >= 1 && n <= 4) return `${six[1]}Q${n}`; // yyyyqq
    if (n >= 1 && n <= 12) return `${six[1]}Q${Math.ceil(n / 3)}`; // yyyymm → çeyrek
  }
  return t;
}

/**
 * Prim (EP) kayıtlarını modelin origin dönemleriyle eşleştirir. SAF fonksiyon
 * (test edilebilir). Sonuç origin etiketiyle anahtarlanır — BFTab `premiums[origin]`
 * bunu doğrudan okur.
 *
 * Eşleşme:
 *  - Branş: `sameBrans` (case-insensitive) — EP dosyasında "eren", modelde "EREN" olsa da eşleşir.
 *  - Dönem: `normPeriodLabel` üzerinden birebir ("2023"=="2023", "2023 Q1"=="2023Q1").
 * Uydurma dönüşüm (yıllık↔çeyreklik) YOK; granülarite farklıysa eşleştirmez.
 */
export function matchPremiumsToOrigins(
  recs: PrimRecord[],
  brans: string | null | undefined,
  originPeriods: string[],
): Record<string, number> {
  const byDonem: Record<string, number> = {};
  for (const r of recs) {
    if (sameBrans(r.brans, brans)) {
      const period = normPeriodLabel(r.donem);
      byDonem[period] = (byDonem[period] ?? 0) + r.ep;
    }
  }
  const out: Record<string, number> = {};
  for (const o of originPeriods) {
    const v = byDonem[normPeriodLabel(o)];
    if (v != null) out[o] = v;
  }
  return out;
}

/** Dashboard/rapor gibi birden fazla modeli aynı anda hesaplayan ekranlar için
 * useDataPremiums'in hook olmayan karşılığı. Veri modülündeki tüm prim
 * datasetlerini yükler ve model origin'leriyle aynı kurallarla eşleştirir. */
export async function loadDataPremiumsForModel(
  periodLabel: string,
  brans: string,
  originPeriods: string[],
  periods: DataPeriod[],
  loadDatasetRecords: LoadRecords,
): Promise<Record<string, number>> {
  const period = periods.find((p) => p.label.trim() === periodLabel.trim());
  if (!period || originPeriods.length === 0) return {};
  const datasets = Object.values(period.datasets).filter((d) => d.typeId === "prim");
  const records: PrimRecord[] = [];
  for (const dataset of datasets) {
    const loaded = dataset.records?.length
      ? dataset
      : await loadDatasetRecords(period.id, dataset.datasetId);
    records.push(...((loaded?.records ?? []) as PrimRecord[]));
  }
  return matchPremiumsToOrigins(records, brans, originPeriods);
}

export function useProvisionModels() {
  const { project, actions } = useProject();

  const ensurePeriod = useCallback(
    (label: string): { periodId: string; existing: boolean } => {
      const found = project.periods.find((p) => p.label === label);
      if (found) return { periodId: found.id, existing: true };
      return { periodId: actions.createPeriod(label), existing: false };
    },
    [project.periods, actions],
  );

  /** Dönem + branş başına boş model iskeleti oluştur (varsa dokunma). */
  const provisionShells = useCallback(
    (label: string, bransList: string[], frequency: Frequency) => {
      if (!bransList.length) return;
      const { periodId } = ensurePeriod(label);
      const period = project.periods.find((p) => p.id === periodId);
      const existingKeys = new Set(
        (period?.branches ?? [])
          .filter((branch) => branch.frequency === frequency)
          .map((branch) => branchIdentityKey(branch.name)),
      );
      for (const brans of uniqueBranchNames(bransList)) {
        const key = branchIdentityKey(brans);
        if (existingKeys.has(key)) continue;
        actions.createBranch(periodId, frequency, brans);
        // Aynı import paketindeki FIRE/fire gibi tekrarları da engeller.
        existingKeys.add(key);
      }
    },
    [ensurePeriod, project.periods, actions],
  );

  return { provisionShells };
}

/**
 * Veri ↔ model DİNAMİK bağ: bir modelin exposure'ını, veri modülündeki prim
 * verisinden CANLI türetir (kopyalamaz). Prim sonradan yüklense/güncellense de
 * model otomatik yansıtır. Eşleşme: branş adı (`sameBrans`, CASE-INSENSITIVE — EP'yi
 * küçük/büyük harfle yüklemek fark etmez) + dönem (`matchPremiumsToOrigins`).
 * Elle girilen exposure (branch.premiums) bunun ÜSTÜNE override olur.
 */
export function useDataPremiums(
  periodLabel: string | null | undefined,
  brans: string | null | undefined,
  originPeriods: string[] | null | undefined,
): Record<string, number> {
  const { periods, loadDatasetRecords } = useDataStore();
  const [premiums, setPremiums] = useState<Record<string, number>>({});
  // Origin dizisinin referansı her render değişmesin diye içeriğe göre sabitle.
  const originsKey = (originPeriods ?? []).join("|");

  useEffect(() => {
    const origins = originsKey ? originsKey.split("|") : [];
    if (!periodLabel || !brans || origins.length === 0) {
      setPremiums({});
      return;
    }
    const period = periods.find((p) => p.label.trim() === periodLabel.trim());
    // TÜM prim dataset'leri (ör. her branş ayrı dosyayla yüklenmiş olabilir) —
    // yalnız ilkini almak, ikinci branşın primini görünmez yapardı.
    const primDatasets = period
      ? Object.values(period.datasets).filter((d) => d.typeId === "prim")
      : [];
    if (!period || primDatasets.length === 0) {
      setPremiums({});
      return;
    }
    let cancelled = false;
    (async () => {
      const allRecs: PrimRecord[] = [];
      for (const primDs of primDatasets) {
        let recs = primDs.records as PrimRecord[] | undefined;
        if (!recs?.length) {
          const ds = await loadDatasetRecords(period.id, primDs.datasetId);
          recs = (ds?.records ?? []) as PrimRecord[];
        }
        if (cancelled) return;
        allRecs.push(...recs);
      }
      if (cancelled) return;
      setPremiums(matchPremiumsToOrigins(allRecs, brans, origins));
    })();
    return () => {
      cancelled = true;
    };
  }, [periodLabel, brans, originsKey, periods, loadDatasetRecords]);

  return premiums;
}

// ─── DİNAMİK LARGE (veri ↔ model) ───────────────────────────────────────────────

export interface LargeTriangles {
  paid: Triangle | null;
  incurred: Triangle | null;
  fileData?: FileData | null;
}

type LoadRecords = (periodId: string, datasetId: string) => Promise<Dataset | null>;

function triFromRecord(rec: TriangleRecord): Triangle {
  return {
    origin_periods: rec.origin_periods,
    development_periods: rec.development_periods,
    values: rec.values,
    triangle_type: rec.triangle_type,
    origin_granularity: rec.origin_granularity,
    development_granularity: rec.development_granularity,
  };
}

async function recordsOf(ds: Dataset, periodId: string, load: LoadRecords): Promise<unknown[]> {
  if (ds.records?.length) return ds.records;
  const loaded = await load(periodId, ds.datasetId);
  return loaded?.records ?? [];
}

/**
 * Bir dönemin large üçgenlerini veri modülünden türetir (yöntem: doğrudan / roll-forward).
 * Roll-forward zinciri taban dönemi rekürsif çözer (çevrim koruması var).
 */
async function resolveLargeTriangles(
  periodLabel: string,
  brans: string,
  og: Frequency,
  dg: Frequency,
  dataPeriods: DataPeriod[],
  load: LoadRecords,
  seen: Set<string>,
): Promise<LargeTriangles | null> {
  if (seen.has(periodLabel)) return null; // çevrim
  seen.add(periodLabel);
  const period = dataPeriods.find((p) => p.label === periodLabel);
  if (!period) return null;
  const datasets = Object.values(period.datasets);

  // Hazır large üçgeni (large_ucgen) → daima doğrudan. Her large_ucgen dataset'i
  // TEK branş içerir (data page: brans_list=[recs[0].brans]). İlk large_ucgen'i
  // körlemesine almak, bu branşın large'ı yokken BAŞKA branşın large'ını sızdırırdı.
  // Bu branşa AİT dataset'i seç; yoksa large yok (null) — asla başka branşa düşme.
  const ucgenDatasets = datasets.filter((d) => d.typeId === "large_ucgen");
  for (const ds of ucgenDatasets) {
    const list = ds.meta.brans_list ?? [];
    // brans_list doluysa ve bu branşı içermiyorsa yükleme yapmadan ele.
    if (list.length && !list.some((b) => sameBrans(b, brans))) continue;
    const recs = (await recordsOf(ds, period.id, load)) as TriangleRecord[];
    const forBrans = recs.filter((r) => sameBrans(r.brans, brans));
    if (!forBrans.length) continue;
    const paidRec = forBrans.find((r) => r.triangle_type === "paid");
    const incRec = forBrans.find((r) => r.triangle_type === "incurred");
    if (!paidRec && !incRec) continue;
    return {
      paid: paidRec ? triFromRecord(paidRec) : null,
      incurred: incRec ? triFromRecord(incRec) : null,
      fileData: null,
    };
  }

  // Dosya bazlı large (large) → yöntem: doğrudan / roll-forward. Bir large dataset'i
  // ÇOK branş içerebilir; bu branşı içereni seç (ilkini değil).
  const largeDs =
    datasets.find(
      (d) => d.typeId === "large" && (d.meta.brans_list ?? []).some((b) => sameBrans(b, brans)),
    ) ?? datasets.find((d) => d.typeId === "large" && !(d.meta.brans_list?.length));
  if (!largeDs) return null;
  const recs = (await recordsOf(largeDs, period.id, load)) as ClaimRecord[];
  const method = largeDs.meta.largeMethod ?? "direct";
  const baseLabel = largeDs.meta.largeBasePeriodLabel;
  // Backend brans'ı TAM eşleşmeyle filtreler; datadaki gerçek casing'i geçir
  // (model adı "Kasko", kayıt "KASKO" olsa da doğru filtrelensin).
  const actualBrans = recs.find((r) => sameBrans(r.brans, brans))?.brans ?? brans;

  if (method === "rollforward" && baseLabel) {
    const base = await resolveLargeTriangles(baseLabel, brans, og, dg, dataPeriods, load, seen);
    if (base?.paid) {
      const { paidTriangle, incurredTriangle, newDiagonalFiles } = await rollForwardTriangle(
        base.paid,
        base.incurred ?? null,
        recs,
        actualBrans,
        og,
        dg,
      );
      const newFd = newDiagonalFiles ? newDiagonalToFileData(paidTriangle, newDiagonalFiles, base.fileData) : null;
      return {
        paid: paidTriangle,
        incurred: incurredTriangle ?? paidTriangle,
        fileData: mergeFileData(base.fileData ?? undefined, newFd),
      };
    }
    // taban çözülemedi → doğrudana düş
  }

  const t = await buildTriangleFromRecords(recs, actualBrans, og, dg);
  return { paid: t.paidTriangle, incurred: t.incurredTriangle, fileData: t.fileData ?? null };
}

/** useDataLarge'ın hook olmayan karşılığı; dönemsel dashboard aynı canlı Large
 * kaynağını kullanabilsin diye dışa açılmış güvenli giriş noktası. */
export async function loadDataLargeForModel(
  periodLabel: string,
  brans: string,
  og: Frequency,
  dg: Frequency,
  periods: DataPeriod[],
  loadDatasetRecords: LoadRecords,
): Promise<LargeTriangles | null> {
  const period = periods.find((p) => p.label === periodLabel);
  const exists = !!period && Object.values(period.datasets).some(
    (dataset) => dataset.typeId === "large" || dataset.typeId === "large_ucgen",
  );
  if (!exists) return null;
  return resolveLargeTriangles(
    periodLabel,
    brans,
    og,
    dg,
    periods,
    loadDatasetRecords,
    new Set(),
  );
}

/**
 * Veri ↔ model DİNAMİK large bağı (EP gibi). Modelin large segmentini, veri
 * modülündeki large verisinden (yöntem: doğrudan/roll-forward) CANLI türetir.
 * Large sonradan yüklense/güncellense model otomatik yansıtır. Gross granülaritesi
 * (og/dg) hizalama için gerekir — gross bağlı değilse null döner.
 */
export function useDataLarge(
  periodLabel: string | null | undefined,
  brans: string | null | undefined,
  og: Frequency | null | undefined,
  dg: Frequency | null | undefined,
): LargeTriangles | null {
  const { periods, loadDatasetRecords } = useDataStore();
  const [large, setLarge] = useState<LargeTriangles | null>(null);

  useEffect(() => {
    if (!periodLabel || !brans || !og || !dg) {
      setLarge(null);
      return;
    }
    const period = periods.find((p) => p.label === periodLabel);
    const hasLargeDs =
      !!period &&
      Object.values(period.datasets).some((d) => d.typeId === "large" || d.typeId === "large_ucgen");
    if (!hasLargeDs) {
      setLarge(null);
      return;
    }
    let cancelled = false;
    resolveLargeTriangles(periodLabel, brans, og, dg, periods, loadDatasetRecords, new Set())
      .then((r) => {
        if (!cancelled) setLarge(r);
      })
      .catch(() => {
        if (!cancelled) setLarge(null);
      });
    return () => {
      cancelled = true;
    };
  }, [periodLabel, brans, og, dg, periods, loadDatasetRecords]);

  return large;
}
