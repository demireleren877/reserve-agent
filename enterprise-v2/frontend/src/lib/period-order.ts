/**
 * Dönem etiketlerini kronolojik sıralamak için ortak yardımcı.
 * "2025", "2025Q4", "2026 Q1" gibi etiketleri küçükten büyüğe sıralar.
 * Bilinmeyen (rakamsız) etiketler en sona düşer.
 */
export function periodOrder(label: string): number {
  const m = String(label).match(/^(\d{4})(?:\s*[Qq]?\s*([1-4]))?/);
  if (!m) return Number.MAX_SAFE_INTEGER;
  return parseInt(m[1], 10) * 4 + (m[2] ? parseInt(m[2], 10) : 0);
}

/** Etikete göre artan (küçükten büyüğe) karşılaştırıcı. */
export function byPeriodLabel<T extends { label: string }>(a: T, b: T): number {
  const d = periodOrder(a.label) - periodOrder(b.label);
  return d !== 0 ? d : a.label.localeCompare(b.label, "tr");
}

/** Diziyi etikete göre sıralanmış YENİ dizi olarak döndürür. */
export function sortByPeriodLabel<T extends { label: string }>(arr: T[]): T[] {
  return [...arr].sort(byPeriodLabel);
}
