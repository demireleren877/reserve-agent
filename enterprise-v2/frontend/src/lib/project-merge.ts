/**
 * Çok-kullanıcı için branch-düzeyi 3-yollu birleştirme (base / mine / theirs).
 *
 * base   : en son sunucudan alınan (ikimizin de başladığı) durum
 * mine   : benim yerel (belki düzenlenmiş) durumum
 * theirs : sunucudaki güncel durum (başkası yazmış olabilir)
 *
 * Kural (model kilidi sayesinde güvenli):
 *  - Bir branch'i BEN değiştirdiysem (mine != base) → benimki kalır.
 *    (Aynı branch'i aynı anda ikimiz düzenleyemeyiz; kilit engeller.)
 *  - Yalnız KARŞI taraf değiştirdiyse → onlarınki gelir.
 *  - İki taraf da silmişse / bir taraf silmişse → silinir (silme kazanır).
 *  - Yeni eklenenler (base'de yok) → birleştirilir.
 * Navigasyon (aktif dönem/branch) her zaman YERELDE kalır.
 */

import type { Project, Period, Branch } from "@/types/project";

const EMPTY: Project = { periods: [], activePeriodId: null, activeFrequency: null, activeBranchId: null };

function eq(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function byId<T extends { id: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((x) => [x.id, x]));
}

/** Genel 3-yollu, id-anahtarlı liste birleştirme. */
function mergeList<T extends { id: string }>(
  base: T[],
  mine: T[],
  theirs: T[],
  mergeItem: (b: T | undefined, m: T | undefined, t: T | undefined) => T | null,
): T[] {
  const baseM = byId(base), mineM = byId(mine), theirsM = byId(theirs);
  const ids: string[] = [];
  const seen = new Set<string>();
  // Sıra: benim sıramı koru, sonra sadece onlarda olan yenileri ekle
  for (const x of mine) if (!seen.has(x.id)) { ids.push(x.id); seen.add(x.id); }
  for (const x of theirs) if (!seen.has(x.id)) { ids.push(x.id); seen.add(x.id); }

  const out: T[] = [];
  for (const id of ids) {
    const b = baseM.get(id), m = mineM.get(id), t = theirsM.get(id);
    const inBase = baseM.has(id);
    // Silme: base'de vardı ama bir tarafta yok → silinmiş
    if (inBase && (!m || !t)) continue;
    const merged = mergeItem(b, m, t);
    if (merged) out.push(merged);
  }
  return out;
}

function mergeBranch(b: Branch | undefined, m: Branch | undefined, t: Branch | undefined): Branch | null {
  if (m && t) {
    // İkisi de mevcut: ben değiştirdiysem benimki, yoksa onlarınki
    const mineChanged = !b || !eq(m, b);
    return mineChanged ? m : t;
  }
  return m ?? t ?? null; // yeni eklenen (tek tarafta)
}

function mergePeriod(b: Period | undefined, m: Period | undefined, t: Period | undefined): Period | null {
  if (m && t) {
    const branches = mergeList(b?.branches ?? [], m.branches, t.branches, mergeBranch);
    // Period meta (label): ben değiştirdiysem benim, yoksa onların
    const metaMineChanged = !b || m.label !== b.label;
    return { ...(metaMineChanged ? m : t), branches };
  }
  return m ?? t ?? null;
}

export function mergeProjects(base: Project | null, mine: Project, theirs: Project): Project {
  const b = base ?? EMPTY;
  const periods = mergeList(b.periods, mine.periods, theirs.periods, mergePeriod);
  return {
    periods,
    // Navigasyon yerelde kalır
    activePeriodId: mine.activePeriodId,
    activeFrequency: mine.activeFrequency,
    activeBranchId: mine.activeBranchId,
  };
}
