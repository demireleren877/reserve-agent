/**
 * Roll-forward dosya-bazlı düzeltmeler (non-destructive).
 * Kullanıcı bir dosyanın ödeme/muallağını düzeltir; roll-forward'a giden kayıtlar
 * bu düzeltmeyle dönüştürülür. Orijinal veriye dokunulmaz — düzeltmeler branch'te
 * ayrı saklanır ve denetlenebilir.
 */

import type { ClaimRecord } from "@/lib/api";
import type { ClaimAdjustment } from "@/types/project";
import type { Triangle, FileData } from "@/types/triangle";

export interface ClaimAgg {
  dosya: string;
  brans: string;
  kazaYili: string;
  hasarTarihi: string;
  gelisimTarihi: string; // en son (latest) gelişim tarihi
  odeme: number; // toplam ödeme
  muallak: number; // son tarihteki toplam muallak (stok)
}

function yearOf(s: string): string {
  const m = /(\d{4})/.exec(String(s));
  return m ? m[1] : String(s);
}

/**
 * Kayıtları dosya (claim) bazında topla — branş filtresiyle. Ödeme toplanır,
 * muallak EN SON gelişim tarihindeki toplam (stok) olarak alınır (backend ile aynı).
 */
export function aggregateClaims(records: ClaimRecord[], brans: string): ClaimAgg[] {
  const byDosya = new Map<string, ClaimRecord[]>();
  for (const r of records) {
    if (brans && String(r.brans).trim() !== brans) continue;
    const d = String(r.dosya_no ?? "").trim();
    if (!d) continue;
    (byDosya.get(d) ?? byDosya.set(d, []).get(d)!).push(r);
  }
  const out: ClaimAgg[] = [];
  for (const [dosya, rows] of byDosya) {
    let odeme = 0;
    let latest = "";
    for (const r of rows) {
      odeme += Number(r.odeme) || 0;
      const g = String(r.gelisim_tarihi);
      if (g > latest) latest = g;
    }
    const muallak = rows
      .filter((r) => String(r.gelisim_tarihi) === latest)
      .reduce((s, r) => s + (Number(r.muallak) || 0), 0);
    const rep = rows.find((r) => String(r.gelisim_tarihi) === latest) ?? rows[0];
    out.push({
      dosya,
      brans: rep.brans,
      kazaYili: yearOf(rep.hasar_tarihi),
      hasarTarihi: rep.hasar_tarihi,
      gelisimTarihi: latest,
      odeme,
      muallak,
    });
  }
  return out;
}

/**
 * Düzeltmeleri kayıtlara uygular: düzeltilen her dosyanın satırları kaldırılır ve
 * yerine tek bir kayıt konur (istenen toplam ödeme/muallak, en son gelişim tarihinde).
 * Böylece roll-forward'ın hesabı düzeltilmiş değerlerle çıkar. Orijinal `records`
 * mutasyona uğramaz.
 */
export function applyAdjustments(
  records: ClaimRecord[],
  adjustments: Record<string, ClaimAdjustment> | undefined,
): ClaimRecord[] {
  const keys = Object.keys(adjustments ?? {});
  if (!keys.length) return records;
  const adj = adjustments!;
  const adjSet = new Set(keys);

  // Düzeltilen dosyaların orijinal toplamları (fallback için) + temsilci satır.
  const aggOdeme = new Map<string, number>();
  const latest = new Map<string, string>();
  const rep = new Map<string, ClaimRecord>();
  for (const r of records) {
    const d = String(r.dosya_no ?? "").trim();
    if (!adjSet.has(d)) continue;
    aggOdeme.set(d, (aggOdeme.get(d) ?? 0) + (Number(r.odeme) || 0));
    const g = String(r.gelisim_tarihi);
    if (!latest.has(d) || g > (latest.get(d) as string)) {
      latest.set(d, g);
      rep.set(d, r);
    }
  }
  const latestMual = new Map<string, number>();
  for (const r of records) {
    const d = String(r.dosya_no ?? "").trim();
    if (!adjSet.has(d)) continue;
    if (String(r.gelisim_tarihi) === latest.get(d)) {
      latestMual.set(d, (latestMual.get(d) ?? 0) + (Number(r.muallak) || 0));
    }
  }

  const out: ClaimRecord[] = records.filter(
    (r) => !adjSet.has(String(r.dosya_no ?? "").trim()),
  );
  for (const d of keys) {
    const r = rep.get(d);
    if (!r) continue; // dosya bu dönemin kayıtlarında yok → uygulanamaz
    const a = adj[d];
    out.push({
      dosya_no: d,
      brans: r.brans,
      hasar_tarihi: r.hasar_tarihi,
      gelisim_tarihi: r.gelisim_tarihi,
      odeme: a.odeme ?? aggOdeme.get(d) ?? 0,
      muallak: a.muallak ?? latestMual.get(d) ?? 0,
    });
  }
  return out;
}

/** FileData'dan dosya_no → origin etiketi eşlemesi (temel üçgende dosyanın satırını bulmak için). */
export function originByDosyaFromFileData(fd: FileData | undefined): Map<string, string> {
  const m = new Map<string, string>();
  if (!fd) return m;
  for (const [origin, devs] of Object.entries(fd)) {
    for (const cell of Object.values(devs)) {
      for (const dosya of Object.keys(cell)) if (!m.has(dosya)) m.set(dosya, origin);
    }
  }
  return m;
}

function lastNonNullIdx(row: (number | null)[]): number {
  for (let j = row.length - 1; j >= 0; j--) if (row[j] != null) return j;
  return -1;
}

/**
 * TEMEL dönem düzeltmeleri: roll-forward'da seçilen önceki dönemin (temel) üçgenine,
 * bir dosyanın ödeme/muallak düzeltmesini NON-DESTRUCTIVE delta-yama olarak uygular.
 * Düzeltme, dosyanın origin satırının DIAGONAL hücresine (rapor dönemi = son kümülatif)
 * eklenir; böylece roll-forward bu düzeltilmiş temelin üzerine taşınır.
 *
 * - dPaid  = (yeni ödeme − orijinal ödeme)  → paid ve incurred'a
 * - dMuallak = (yeni muallak − orijinal muallak) → yalnız incurred'a (incurred = ödeme + muallak)
 *
 * Orijinal değerler `baseAggs` (temel dönemin kendi dosya verisi) üzerinden alınır.
 * Origin yerleşimi önce `originByDosya` (FileData), yoksa kaza yılı ile eşlenir.
 */
export function applyBaseAdjustments(
  priorPaid: Triangle,
  priorIncurred: Triangle | null,
  baseAggs: ClaimAgg[],
  adjustments: Record<string, ClaimAdjustment> | undefined,
  originByDosya?: Map<string, string>,
): { paid: Triangle; incurred: Triangle | null; unplaced: string[] } {
  const keys = Object.keys(adjustments ?? {});
  if (!keys.length) return { paid: priorPaid, incurred: priorIncurred, unplaced: [] };
  const adj = adjustments!;
  const aggByDosya = new Map(baseAggs.map((a) => [a.dosya, a]));

  const paidVals = priorPaid.values.map((r) => r.slice());
  const incVals = priorIncurred ? priorIncurred.values.map((r) => r.slice()) : null;
  const origins = priorPaid.origin_periods;

  const findOrigin = (dosya: string, agg: ClaimAgg): number => {
    const lbl = originByDosya?.get(dosya);
    if (lbl != null) {
      const i = origins.indexOf(lbl);
      if (i >= 0) return i;
    }
    // Kaza yılı ile eşle (yıllık: "2024"; çeyreklik: "2024Q1" → yıl önekiyle ilk eşleşen)
    return origins.findIndex((o) => /(\d{4})/.exec(o)?.[1] === agg.kazaYili);
  };

  const unplaced: string[] = [];
  for (const d of keys) {
    const agg = aggByDosya.get(d);
    if (!agg) { unplaced.push(d); continue; } // temel dönemde bu dosya yok
    const a = adj[d];
    const dPaid = (a.odeme ?? agg.odeme) - agg.odeme;
    const dMual = (a.muallak ?? agg.muallak) - agg.muallak;
    if (dPaid === 0 && dMual === 0) continue;
    const oi = findOrigin(d, agg);
    if (oi < 0) { unplaced.push(d); continue; }
    const diag = lastNonNullIdx(paidVals[oi]);
    if (diag < 0) { unplaced.push(d); continue; }
    paidVals[oi][diag] = (paidVals[oi][diag] ?? 0) + dPaid;
    if (incVals) incVals[oi][diag] = (incVals[oi][diag] ?? 0) + dPaid + dMual;
  }

  return {
    paid: { ...priorPaid, values: paidVals },
    incurred: priorIncurred && incVals ? { ...priorIncurred, values: incVals } : priorIncurred,
    unplaced,
  };
}
