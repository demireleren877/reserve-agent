import { describe, expect, it } from "vitest";
import {
  branchIdentityKey,
  sameBranchName,
  uniqueBranchNames,
} from "@/lib/branch-identity";

describe("branch identity", () => {
  it.each([
    ["fire", "FIRE"],
    ["eren", "EREN"],
    ["İnşaat", "INSAAT"],
    ["ınşaat", "insaat"],
    ["Yangın", "YANGIN"],
    [" Motor   Fleet ", "motor fleet"],
  ])("matches %s and %s", (left, right) => {
    expect(sameBranchName(left, right)).toBe(true);
  });

  it("does not merge genuinely different names", () => {
    expect(branchIdentityKey("Motor")).not.toBe(branchIdentityKey("Motor Fleet"));
  });

  it("deduplicates while preserving first display spelling", () => {
    expect(uniqueBranchNames(["fire", "FIRE", " Fire ", "EREN", "eren", "Motor"]))
      .toEqual(["fire", "EREN", "Motor"]);
  });
});
