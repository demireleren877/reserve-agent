/**
 * Veri modülünde bir dataset yüklendiği anda REZERV modülünde eşleşen dönem +
 * branş başına model (branch) otomatik oluşturur/günceller.
 *
 * - Dönem: veri dönemi etiketiyle eşleşen rezerv dönemi (yoksa oluşturulur).
 * - Branş: (dönem, branş adı, frekans) benzersizdir; varsa VERİSİ güncellenir,
 *   VARSAYIMLARI korunur (idempotent); yoksa yeni model kurulur.
 * - Hasar → gross üçgenler; Large → large üçgenler; Üçgen/Large Üçgen → hazır
 *   üçgenler; Prim → eşleşen modellere exposure atanır.
 *
 * Yalnızca yeni yüklemelerde çağrılır (mevcut veriler için otomatik kurulum yok).
 */

import { useCallback } from "react";
import { useProject } from "@/lib/project-store";
import { buildTriangleFromRecords, type ClaimRecord } from "@/lib/api";
import type { PrimRecord, TriangleRecord } from "@/lib/data-store";
import type { Frequency, Branch } from "@/types/project";
import type { Triangle } from "@/types/triangle";

function toTri(rec: TriangleRecord): Triangle {
  return {
    origin_periods: rec.origin_periods,
    development_periods: rec.development_periods,
    values: rec.values,
    triangle_type: rec.triangle_type,
    origin_granularity: rec.origin_granularity,
    development_granularity: rec.development_granularity,
  };
}

export function useProvisionModels() {
  const { project, actions } = useProject();

  /** Etikete göre rezerv dönemi bul; yoksa oluştur, id döndür. */
  const ensurePeriod = useCallback(
    (label: string): { periodId: string; existing: boolean } => {
      const found = project.periods.find((p) => p.label === label);
      if (found) return { periodId: found.id, existing: true };
      return { periodId: actions.createPeriod(label), existing: false };
    },
    [project.periods, actions],
  );

  /** (dönem, branş, frekans) modelini bul; yoksa oluştur, branchId döndür. */
  const ensureBranch = useCallback(
    (periodId: string, periodExisting: boolean, name: string, frequency: Frequency): string => {
      if (periodExisting) {
        const period = project.periods.find((p) => p.id === periodId);
        const b = period?.branches.find((x) => x.name === name && x.frequency === frequency);
        if (b) return b.id;
      }
      return actions.createBranch(periodId, frequency, name);
    },
    [project.periods, actions],
  );

  /** Hasar → gross üçgenler (her branş bir model). */
  const provisionHasar = useCallback(
    async (
      label: string,
      records: ClaimRecord[],
      bransList: string[],
      originGran: Frequency,
      devGran: Frequency,
    ) => {
      const { periodId, existing } = ensurePeriod(label);
      for (const brans of bransList) {
        try {
          const t = await buildTriangleFromRecords(records, brans, originGran, devGran);
          const branchId = ensureBranch(periodId, existing, brans, originGran);
          actions.updateBranch(
            branchId,
            () => ({
              triangle: t.incurredTriangle,
              triangleFileName: `${label} – ${brans}`,
              paidTriangle: t.paidTriangle,
              incurredTriangle: t.incurredTriangle,
              countTriangle: t.countTriangle ?? null,
              fileData: t.fileData ?? undefined,
            }),
            "data_provisioned",
            { source: "data-module", brans },
          );
        } catch {
          /* branş başarısızsa diğerlerini engelleme */
        }
      }
    },
    [ensurePeriod, ensureBranch, actions],
  );

  /** Large hasar → large üçgenler (eşleşen gross modele takılır; yoksa model kurulur). */
  const provisionLarge = useCallback(
    async (
      label: string,
      records: ClaimRecord[],
      bransList: string[],
      originGran: Frequency,
      devGran: Frequency,
    ) => {
      const { periodId, existing } = ensurePeriod(label);
      for (const brans of bransList) {
        try {
          const t = await buildTriangleFromRecords(records, brans, originGran, devGran);
          const branchId = ensureBranch(periodId, existing, brans, originGran);
          actions.updateBranch(
            branchId,
            () => ({
              largePaidTriangle: t.paidTriangle,
              largeIncurredTriangle: t.incurredTriangle,
              largeFileData: t.fileData ?? undefined,
            }),
            "large_provisioned",
            { source: "data-module", brans },
          );
        } catch {
          /* yok say */
        }
      }
    },
    [ensurePeriod, ensureBranch, actions],
  );

  /** Hazır üçgen (ucgen) → gross; large_ucgen → large. records = [paid, incurred]. */
  const provisionTriangle = useCallback(
    (label: string, records: TriangleRecord[], typeId: "ucgen" | "large_ucgen") => {
      const paidRec = records.find((r) => r.triangle_type === "paid");
      const incRec = records.find((r) => r.triangle_type === "incurred");
      const rep = incRec ?? paidRec;
      if (!rep) return;
      const brans = rep.brans;
      const frequency = rep.origin_granularity;
      const paid = paidRec ? toTri(paidRec) : null;
      const incurred = incRec ? toTri(incRec) : null;
      const { periodId, existing } = ensurePeriod(label);
      const branchId = ensureBranch(periodId, existing, brans, frequency);
      if (typeId === "large_ucgen") {
        actions.updateBranch(
          branchId,
          () => ({ largePaidTriangle: paid, largeIncurredTriangle: incurred }),
          "large_provisioned",
          { source: "data-module", brans },
        );
      } else {
        actions.updateBranch(
          branchId,
          () => ({
            triangle: incurred ?? paid,
            triangleFileName: `${label} – ${brans}`,
            paidTriangle: paid,
            incurredTriangle: incurred,
          }),
          "data_provisioned",
          { source: "data-module", brans },
        );
      }
    },
    [ensurePeriod, ensureBranch, actions],
  );

  /** Prim → eşleşen dönemin modellerine exposure (branşa göre, origin eşleşmesiyle). */
  const provisionPrim = useCallback(
    (label: string, records: PrimRecord[]) => {
      const period = project.periods.find((p) => p.label === label);
      if (!period) return; // henüz model yok — prim tek başına model oluşturmaz
      for (const branch of period.branches) {
        applyPrimToBranch(branch, records, (id, premiums) =>
          actions.updateBranch(
            id,
            (prev) => ({ premiums: { ...prev.premiums, ...premiums } }),
            "premiums_provisioned",
            { source: "data-module" },
          ),
        );
      }
    },
    [project.periods, actions],
  );

  return { provisionHasar, provisionLarge, provisionTriangle, provisionPrim };
}

function applyPrimToBranch(
  branch: Branch,
  records: PrimRecord[],
  commit: (branchId: string, premiums: Record<string, number>) => void,
) {
  const origins = branch.triangle?.origin_periods ?? branch.incurredTriangle?.origin_periods;
  if (!origins?.length) return;
  const originSet = new Set(origins);
  const premiums: Record<string, number> = {};
  for (const r of records) {
    if (r.brans !== branch.name) continue;
    if (originSet.has(r.donem)) premiums[r.donem] = r.ep;
  }
  if (Object.keys(premiums).length) commit(branch.id, premiums);
}
