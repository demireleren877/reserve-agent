/**
 * buildFileSummary — agent'ın dosya analizini görebilmesi.
 *
 * Bu alan ev2'de HİÇ doldurulmuyordu (fork regresyonu): branşta DOSYA_NO
 * verisi olsa bile get_file_summary boş dönüyor, agent kullanıcıya
 * "bu branşta dosya kırılımı yok" diyordu. Leaf formatı web fork'undan
 * farklı ({p,o}) olduğu için birebir kopyalanamadı.
 */
import { describe, it, expect } from "vitest";
import { buildFileSummary } from "@/lib/file-analysis";
import type { Triangle } from "@/types/triangle";

const tri = {
  origin_periods: ["2021", "2022"],
  development_periods: [0, 1],
  values: [
    [100, 165],
    [130, null],
  ],
  triangle_type: "incurred",
  origin_granularity: "yearly",
  development_granularity: "yearly",
} as unknown as Triangle;

// Son diagonal: 2021 → dev 1, 2022 → dev 0
const fileData = {
  "2021": {
    "0": { A: { p: 10, o: 0 }, B: { p: 5, o: 0 } },
    "1": { A: { p: 120, o: 30 }, B: { p: 10, o: 5 } },
  },
  "2022": {
    "0": { C: { p: 90, o: 10 }, D: { p: 20, o: 10 } },
  },
} as never;

describe("buildFileSummary", () => {
  it("veri yoksa null döner", () => {
    expect(buildFileSummary(tri, null)).toBeNull();
    expect(buildFileSummary(null, fileData)).toBeNull();
    expect(buildFileSummary(tri, {} as never)).toBeNull();
  });

  it("son diagonal'i kullanır ve ödeme+muallak toplar", () => {
    const s = buildFileSummary(tri, fileData)!;
    expect(s.has_file_data).toBe(true);
    expect(s.metric).toBe("inc");
    const r2021 = s.per_origin.find((r) => r.origin === "2021")!;
    // dev1: A=120+30=150, B=10+5=15 → toplam 165 (üçgenle tutuyor)
    expect(r2021.total).toBe(165);
    expect(r2021.n_files).toBe(2);
  });

  it("yoğunlaşma paylarını hesaplar", () => {
    const s = buildFileSummary(tri, fileData)!;
    const r = s.per_origin.find((x) => x.origin === "2021")!;
    expect(r.top1_share).toBeCloseTo(150 / 165, 6);
    expect(r.top3_share).toBeCloseTo(1, 6);
  });

  it("en büyük dosyaları tutara göre sıralar", () => {
    const s = buildFileSummary(tri, fileData)!;
    expect(s.largest[0].dosya_no).toBe("A");
    expect(s.largest[0].amount).toBe(150);
    expect(s.largest[0].origin).toBe("2021");
    expect(s.n_files).toBe(4);
  });

  it("topN sınırını uygular", () => {
    const s = buildFileSummary(tri, fileData, 2)!;
    expect(s.largest).toHaveLength(2);
  });

  it("metrik seçilebilir — yalnız ödeme", () => {
    const s = buildFileSummary(tri, fileData, 15, "p")!;
    const r = s.per_origin.find((x) => x.origin === "2021")!;
    expect(r.total).toBe(130); // 120 + 10, muallak hariç
  });
});
