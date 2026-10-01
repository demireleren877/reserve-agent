import { describe, it, expect } from "vitest";
import { ultimateBelowPaid, unpaidByOrigin } from "@/lib/unpaid";
import type { BranchOriginRow } from "@/lib/reserve-pipeline";
import type { Branch } from "@/types/project";
import type { Triangle } from "@/types/triangle";

const tri = (type: string, values: (number | null)[][]) => ({
  origin_periods: ["2022", "2023"], development_periods: [0, 1], values,
  triangle_type: type, origin_granularity: "yearly", development_granularity: "yearly",
}) as unknown as Triangle;

// incurred: 2022 → 150 (ödenmiş 100 + muallak 50); 2023 → 90 (ödenmiş 40 + muallak 50)
const INC = tri("incurred", [[120, 150], [90, null]]);
const PAID = tri("paid", [[80, 100], [40, null]]);
const row = (origin: string, latest: number, ult: number) =>
  ({ origin, latest, selected_ultimate: ult, ibnr: ult - latest }) as BranchOriginRow;

describe("unpaidByOrigin", () => {
  it("incurred bazında unpaid = muallak + IBNR (ödenmiş iskontolanmaz)", () => {
    const b = { triangle: INC, paidTriangle: PAID } as unknown as Branch;
    const r = unpaidByOrigin(b, [row("2022", 150, 170), row("2023", 90, 140)]);
    // 2022: muallak 50 + IBNR 20 = 70 = 170 − 100
    // 2023: muallak 50 + IBNR 50 = 100 = 140 − 40
    expect(r.rows).toEqual([{ origin: "2022", unpaid: 70 }, { origin: "2023", unpaid: 100 }]);
    expect(r.paidMissing).toBe(false);
  });

  it("eski formül nihainin kendisini veriyordu", () => {
    // latest + ibnr = 170 ve 140 — ödenmiş 100 ve 40 da iskontolanıyordu.
    const r = row("2022", 150, 170);
    expect(r.latest + r.ibnr).toBe(r.selected_ultimate);
  });

  it("paid bazında unpaid = IBNR (muallak ikinci kez eklenmez)", () => {
    const b = { triangle: PAID, paidTriangle: PAID } as unknown as Branch;
    const r = unpaidByOrigin(b, [row("2022", 100, 170), row("2023", 40, 140)]);
    expect(r.rows).toEqual([{ origin: "2022", unpaid: 70 }, { origin: "2023", unpaid: 100 }]);
  });

  it("ödenmiş üçgen yoksa eski yola düşer ve bunu bildirir", () => {
    const b = { triangle: INC, paidTriangle: null } as unknown as Branch;
    const r = unpaidByOrigin(b, [row("2022", 150, 170)]);
    expect(r.paidMissing).toBe(true);
    expect(r.rows[0].unpaid).toBe(170);
  });
});

describe("ultimateBelowPaid", () => {
  it("nihaisi ödenmişin altındaki kaza yıllarını işaretler", () => {
    // 2022: nihai 95 < ödenmiş 100 → işaretli. 2023: nihai 140 > 40 → temiz.
    const r = ultimateBelowPaid(
      [{ origin: "2022", selected_ultimate: 95 }, { origin: "2023", selected_ultimate: 140 }],
      PAID,
    );
    expect(r).toEqual([{ origin: "2022", ultimate: 95, paid: 100, gap: -5 }]);
  });

  it("yuvarlama gürültüsünü işaretlemez, ödenmişi olmayan yılı atlar", () => {
    expect(ultimateBelowPaid([{ origin: "2022", selected_ultimate: 99.7 }], PAID)).toEqual([]);
    expect(ultimateBelowPaid([{ origin: "2030", selected_ultimate: 1 }], PAID)).toEqual([]);
    expect(ultimateBelowPaid([{ origin: "2022", selected_ultimate: 1 }], null)).toEqual([]);
  });
});
