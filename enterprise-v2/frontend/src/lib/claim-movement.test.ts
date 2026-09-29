/**
 * buildClaimMovement — bir LDF geçişini dosya bazında açar.
 *
 * Neden ayrı: get_file_summary yalnızca SON diagonal'i gösteriyor, bu yüzden
 * "2021'in ilk geçişi neden bu kadar yüksek?" sorusu cevapsız kalıyordu.
 * Agent eleme kararı verirken aykırı geçişi tek bir büyük dosyanın mı
 * taşıdığını göremiyordu.
 */
import { describe, it, expect } from "vitest";
import { buildClaimMovement } from "@/lib/file-analysis";
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

// 2021 dev0 → dev1: A ödemeye döndü ve büyüdü, B arttı, C yeni girdi
const fileData = {
  "2021": {
    "0": { A: { p: 10, o: 80 }, B: { p: 5, o: 5 } },
    "1": { A: { p: 120, o: 30 }, B: { p: 10, o: 0 }, C: { p: 5, o: 0 } },
  },
  "2022": {
    "0": { D: { p: 90, o: 10 } },
  },
} as never;

describe("buildClaimMovement", () => {
  it("veri yoksa null döner", () => {
    expect(buildClaimMovement(tri, null)).toBeNull();
    expect(buildClaimMovement(null, fileData)).toBeNull();
    expect(buildClaimMovement(tri, {} as never)).toBeNull();
  });

  it("tek diagonal'li origin için hücre üretmez", () => {
    // 2022'nin tek snapshot'ı var — karşılaştıracak adım yok.
    expect(buildClaimMovement(tri, fileData)!["2022"]).toBeUndefined();
  });

  it("ödeme ve muallak hareketini ayrı toplar", () => {
    const cell = buildClaimMovement(tri, fileData)!["2021"]["0"];
    // ödeme: A +110, B +5, C +5 = +120
    expect(cell.paid_delta).toBe(120);
    // muallak: A -50, B -5, C 0 = -55
    expect(cell.os_delta).toBe(-55);
    // net incurred hareketi üçgendeki 165-100=65 ile tutmalı
    expect(cell.inc_delta).toBe(65);
  });

  it("dosya yaşam olaylarını sayar", () => {
    const cell = buildClaimMovement(tri, fileData)!["2021"]["0"];
    expect(cell.new_claims).toBe(1); // C
    expect(cell.closed).toBe(1); // yalnız B: A'nın muallağı 80→30, sıfırlanmadı
    expect(cell.reopened).toBe(0);
    expect(cell.n_claims).toBe(3);
  });

  it("geçişi taşıyan dosyayı başa koyar", () => {
    const cell = buildClaimMovement(tri, fileData)!["2021"]["0"];
    // A: +110 ödeme, -50 muallak → |inc| = 60, en büyük hareket
    expect(cell.top[0].dosya_no).toBe("A");
    expect(cell.top[0].inc_delta).toBe(60);
  });

  it("topN ile taşınan dosya sayısını sınırlar", () => {
    const cell = buildClaimMovement(tri, fileData, 1)!["2021"]["0"];
    expect(cell.top).toHaveLength(1);
    expect(cell.n_claims).toBe(3); // toplamlar yine tüm dosyaları kapsar
  });
});
