/**
 * Ödenmemiş yükümlülük (unpaid liability) — iskontolanan tutar.
 *
 *   unpaid = nihai − ödenmiş
 *
 * İncurred bazlı modelde bu muallak + IBNR'dır (nihai = ödenmiş + muallak +
 * IBNR). Paid bazlı modelde IBNR zaten nihai − ödenmiştir, yani ödenmemişin
 * tamamı; üstüne muallak eklemek çift sayım olur. Tek formül iki bazı da doğru
 * verir.
 *
 * Eskiden `latest + ibnr` alınıyordu. Bu nihainin kendisidir: incurred bazlı
 * modelde ÖDENMİŞ tutar da iskontolanıyordu.
 */
import type { BranchOriginRow } from "@/lib/reserve-pipeline";
import type { Branch } from "@/types/project";
import type { Triangle } from "@/types/triangle";

export interface UnpaidResult {
  rows: { origin: string; unpaid: number }[];
  /**
   * Incurred bazlı model ama ödenmiş üçgen yok: muallak ayrılamadı, satırlar
   * eski yolla (nihai) hesaplandı. Ekran ve ajan bunu kullanıcıya söylemeli.
   */
  paidMissing: boolean;
}

function lastDiagonal(t: Triangle | null | undefined): Map<string, number> {
  const out = new Map<string, number>();
  if (!t) return out;
  t.origin_periods.forEach((origin, i) => {
    const row = t.values[i] ?? [];
    for (let j = row.length - 1; j >= 0; j--) {
      const v = row[j];
      if (v != null) {
        out.set(String(origin), v);
        break;
      }
    }
  });
  return out;
}

export function unpaidByOrigin(branch: Branch, rows: BranchOriginRow[]): UnpaidResult {
  // Model üçgeni ödenmişse son diagonal zaten ödenmiştir.
  if (branch.triangle?.triangle_type === "paid") {
    return {
      rows: rows.map((r) => ({ origin: r.origin, unpaid: r.selected_ultimate - r.latest })),
      paidMissing: false,
    };
  }
  const paid = lastDiagonal(branch.paidTriangle);
  let paidMissing = false;
  const out = rows.map((r) => {
    const p = paid.get(String(r.origin));
    if (p == null) {
      paidMissing = true;
      return { origin: r.origin, unpaid: r.latest + r.ibnr };
    }
    return { origin: r.origin, unpaid: r.selected_ultimate - p };
  });
  return { rows: out, paidMissing };
}
