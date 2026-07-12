import { describe, it, expect } from "vitest";
import { mergeProjects } from "@/lib/project-merge";
import type { Project, Branch, Period } from "@/types/project";

function br(id: string, method = "volume_weighted"): Branch {
  return { id, name: id, frequency: "yearly", createdAt: "", updatedAt: "", method } as unknown as Branch;
}
function per(id: string, branches: Branch[], label = id): Period {
  return { id, label, createdAt: "", branches };
}
function proj(periods: Period[]): Project {
  return { periods, activePeriodId: periods[0]?.id ?? null, activeFrequency: "yearly", activeBranchId: null };
}

describe("mergeProjects — çok kullanıcı 3-yollu birleştirme", () => {
  it("farklı branch'leri düzenleyen iki kullanıcı → ikisi de korunur (Senaryo 2)", () => {
    const base = proj([per("P", [br("A"), br("B")])]);
    const mine = proj([per("P", [br("A", "chain_ladder"), br("B")])]); // ben A'yı değiştirdim
    const theirs = proj([per("P", [br("A"), br("B", "bf")])]);          // onlar B'yi değiştirdi
    const out = mergeProjects(base, mine, theirs);
    const branches = out.periods[0].branches;
    expect((branches.find((x) => x.id === "A") as { method: string }).method).toBe("chain_ladder"); // benim
    expect((branches.find((x) => x.id === "B") as { method: string }).method).toBe("bf");            // onların
  });

  it("aynı branch: ben değiştirdiysem benimki kazanır", () => {
    const base = proj([per("P", [br("A")])]);
    const mine = proj([per("P", [br("A", "chain_ladder")])]);
    const theirs = proj([per("P", [br("A", "bf")])]);
    const out = mergeProjects(base, mine, theirs);
    expect((out.periods[0].branches[0] as { method: string }).method).toBe("chain_ladder");
  });

  it("yalnız karşı taraf değiştirdiyse onlarınki gelir", () => {
    const base = proj([per("P", [br("A")])]);
    const mine = proj([per("P", [br("A")])]);           // ben dokunmadım
    const theirs = proj([per("P", [br("A", "bf")])]);   // onlar değiştirdi
    const out = mergeProjects(base, mine, theirs);
    expect((out.periods[0].branches[0] as { method: string }).method).toBe("bf");
  });

  it("karşı tarafın eklediği yeni branch görünür", () => {
    const base = proj([per("P", [br("A")])]);
    const mine = proj([per("P", [br("A")])]);
    const theirs = proj([per("P", [br("A"), br("C")])]);
    const out = mergeProjects(base, mine, theirs);
    expect(out.periods[0].branches.map((x) => x.id).sort()).toEqual(["A", "C"]);
  });

  it("benim eklediğim yeni branch korunur", () => {
    const base = proj([per("P", [br("A")])]);
    const mine = proj([per("P", [br("A"), br("D")])]);
    const theirs = proj([per("P", [br("A")])]);
    const out = mergeProjects(base, mine, theirs);
    expect(out.periods[0].branches.map((x) => x.id).sort()).toEqual(["A", "D"]);
  });

  it("benim sildiğim branch silinmiş kalır", () => {
    const base = proj([per("P", [br("A"), br("B")])]);
    const mine = proj([per("P", [br("A")])]);           // B'yi sildim
    const theirs = proj([per("P", [br("A"), br("B")])]);
    const out = mergeProjects(base, mine, theirs);
    expect(out.periods[0].branches.map((x) => x.id)).toEqual(["A"]);
  });

  it("karşı tarafın sildiği branch silinir", () => {
    const base = proj([per("P", [br("A"), br("B")])]);
    const mine = proj([per("P", [br("A"), br("B")])]);
    const theirs = proj([per("P", [br("A")])]);          // onlar B'yi sildi
    const out = mergeProjects(base, mine, theirs);
    expect(out.periods[0].branches.map((x) => x.id)).toEqual(["A"]);
  });

  it("karşı tarafın eklediği yeni dönem görünür", () => {
    const base = proj([per("P", [br("A")])]);
    const mine = proj([per("P", [br("A")])]);
    const theirs = proj([per("P", [br("A")]), per("Q", [br("Z")])]);
    const out = mergeProjects(base, mine, theirs);
    expect(out.periods.map((p) => p.id).sort()).toEqual(["P", "Q"]);
  });

  it("navigasyon (aktif dönem/branch) yerelde kalır", () => {
    const base = proj([per("P", [br("A")])]);
    const mine: Project = { ...proj([per("P", [br("A")])]), activeBranchId: "A", activePeriodId: "P" };
    const theirs: Project = { ...proj([per("P", [br("A")])]), activeBranchId: "X", activePeriodId: "Q" };
    const out = mergeProjects(base, mine, theirs);
    expect(out.activeBranchId).toBe("A");
    expect(out.activePeriodId).toBe("P");
  });

  it("base null (ilk senkron) → mine+theirs birleşir, aynı id'de benimki", () => {
    const mine = proj([per("P", [br("A", "chain_ladder")])]);
    const theirs = proj([per("P", [br("A", "bf")]), per("Q", [br("Z")])]);
    const out = mergeProjects(null, mine, theirs);
    expect((out.periods[0].branches[0] as { method: string }).method).toBe("chain_ladder");
    expect(out.periods.map((p) => p.id).sort()).toEqual(["P", "Q"]);
  });
});
