/**
 * REGRESYON: agent snapshot'ında dinamik prim + large ayrımı TÜM branşlara
 * uygulanmalı, yalnız aktif branşa değil.
 *
 * Eski hata: buildProjectSnapshot içindeki merge `if (isActive)` ile
 * kilitliydi. Aktif olmayan her branş ham branch.premiums (çoğunlukla boş →
 * BF exposure 0 → BF ultimate CL'ye çöker) ve ham gross üçgenle (large ayrımı
 * uygulanmaz → attritional yerine gross IBNR) hesaplanıyordu. Kullanıcı bir
 * modeli incelerken başka bir dönem/branşın IBNR'ını sorduğunda agent
 * güvenle YANLIŞ rakam veriyordu.
 */
import { describe, it, expect } from "vitest";
import { buildProjectSnapshot, type BranchBinding } from "./ReserveAgentBridge";
import type { Triangle } from "@/types/triangle";
import type { Branch, Period } from "@/types/project";

function tri(values: (number | null)[][]): Triangle {
  return {
    origin_periods: ["2021", "2022", "2023"].slice(0, values.length),
    development_periods: [0, 1, 2],
    values,
    triangle_type: "incurred",
    origin_granularity: "yearly",
    development_granularity: "yearly",
  } as Triangle;
}

function branch(id: string, name: string, over: Partial<Branch> = {}): Branch {
  return {
    id, name, frequency: "yearly", createdAt: "", updatedAt: "",
    triangle: tri([[100, 150, 165], [120, 180, null], [130, null, null]]),
    method: "volume_weighted", window: "all", excludedCells: [],
    premiums: {}, lrInputPerOrigin: {},
    // 2023 BF basis'te: prim bağlanmazsa BF hesabı çöker, fark görünür olur.
    basisPerOrigin: { "2023": "bf" },
    correctionPerOrigin: {}, cdfInitial: {}, cdfChoicePerPeriod: {},
    cdfModelPerPeriod: {}, curveIncludePerPeriod: {}, history: [],
    ...over,
  } as unknown as Branch;
}

function period(branches: Branch[]): Period {
  return { id: "p1", label: "2026Q2", branches } as unknown as Period;
}

const PREMIUMS = { "2021": 400, "2022": 420, "2023": 450 };

function bindings(ids: string[]): Map<string, BranchBinding> {
  return new Map(ids.map((id) => [id, { premiums: PREMIUMS, large: null }]));
}

describe("buildProjectSnapshot — dinamik veri bağı", () => {
  it("aktif OLMAYAN branşa da prim uygular", () => {
    const active = branch("b1", "Fire Home");
    const other = branch("b2", "Fire Commercial");
    const p = period([active, other]);

    const snap = buildProjectSnapshot([p], p, active, bindings(["b1", "b2"]));
    const rows = snap.periods[0].branches;
    const inactive = rows.find((b) => b.id === "b2")!;

    expect(inactive.is_active).toBe(false);
    const bf2023 = inactive.per_origin.find((r) => r.origin === "2023")!;
    expect(bf2023.premium).toBe(450);
    expect(bf2023.premium).toBeGreaterThan(0);
  });

  it("aktif ve aktif olmayan branş AYNI girdide AYNI IBNR'ı verir", () => {
    const a = branch("b1", "Fire Home");
    const b = branch("b2", "Fire Home");
    const p = period([a, b]);

    const snap = buildProjectSnapshot([p], p, a, bindings(["b1", "b2"]));
    const [first, second] = snap.periods[0].branches;

    expect(first.is_active).toBe(true);
    expect(second.is_active).toBe(false);
    expect(second.totals.ibnr).toBeCloseTo(first.totals.ibnr, 6);
    expect(second.totals.selected_ultimate).toBeCloseTo(
      first.totals.selected_ultimate, 6,
    );
  });

  it("binding yoksa prim sıfır kalır — bağın gerçekten etki ettiğini kanıtlar", () => {
    const a = branch("b1", "Fire Home");
    const p = period([a]);

    const withBind = buildProjectSnapshot([p], p, a, bindings(["b1"]));
    const without = buildProjectSnapshot([p], p, a, new Map());

    const bound = withBind.periods[0].branches[0].per_origin.find((r) => r.origin === "2023")!;
    const unbound = without.periods[0].branches[0].per_origin.find((r) => r.origin === "2023")!;
    expect(bound.premium).toBe(450);
    expect(unbound.premium).toBe(0);
    expect(bound.selected_ultimate).not.toBeCloseTo(unbound.selected_ultimate, 6);
  });

  it("manuel girilen prim dinamik primi override eder", () => {
    const a = branch("b1", "Fire Home", { premiums: { "2023": 999 } });
    const p = period([a]);
    const snap = buildProjectSnapshot([p], p, a, bindings(["b1"]));
    const row = snap.periods[0].branches[0].per_origin.find((r) => r.origin === "2023")!;
    expect(row.premium).toBe(999);
  });
});
