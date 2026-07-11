import { describe, it, expect } from "vitest";
import {
  buildFileSummary,
  lastDiagFiles,
  newDiagonalToFileData,
} from "@/lib/file-analysis";
import type { Triangle, FileData } from "@/types/triangle";

const tri: Triangle = {
  origin_periods: ["2022", "2023"],
  development_periods: [1, 2],
  values: [
    [100, 180],
    [120, null],
  ],
  triangle_type: "incurred",
  origin_granularity: "yearly",
  development_granularity: "yearly",
} as Triangle;

// origin → devLabel → { dosya_no: tutar }.
// development_periods=[1,2] → devDate = origin + age. 2022 son diagonal (step1,
// age2) = "2024"; 2023 son diagonal (step0, age1) = "2024".
const fd: FileData = {
  "2022": {
    "2023": { A: 60, B: 40 }, // step0 (age1)
    "2024": { A: 120, B: 60 }, // step1 (age2) = son diagonal, toplam 180
  },
  "2023": {
    "2024": { C: 90, D: 20, E: 10 }, // step0 (age1) = son diagonal, toplam 120
  },
};

describe("buildFileSummary", () => {
  it("üçgen/fileData yoksa null", () => {
    expect(buildFileSummary(null, fd)).toBeNull();
    expect(buildFileSummary(tri, null)).toBeNull();
    expect(buildFileSummary(tri, {})).toBeNull();
  });

  it("son diagonalden dosya kırılımı + konsantrasyon üretir", () => {
    const s = buildFileSummary(tri, fd)!;
    expect(s.has_file_data).toBe(true);
    expect(s.n_files).toBe(5); // A,B (2022) + C,D,E (2023)
    expect(s.total_last_diagonal).toBe(300); // 180 + 120

    const o2022 = s.per_origin.find((o) => o.origin === "2022")!;
    expect(o2022.total).toBe(180);
    expect(o2022.n_files).toBe(2);
    expect(o2022.top1_share).toBeCloseTo(120 / 180, 6);

    const o2023 = s.per_origin.find((o) => o.origin === "2023")!;
    expect(o2023.top3_share).toBeCloseTo(1, 6); // 3 dosya = tümü
  });

  it("en büyük dosyalar tüm portföyde sıralı döner", () => {
    const s = buildFileSummary(tri, fd)!;
    expect(s.largest_files[0]).toMatchObject({ origin: "2022", dosya_no: "A", amount: 120 });
    expect(s.largest_files.map((f) => f.amount)).toEqual([120, 90, 60, 20, 10]);
    expect(s.largest_files[0].share_of_origin).toBeCloseTo(120 / 180, 6);
  });

  it("topN limiti uygulanır", () => {
    const s = buildFileSummary(tri, fd, 2)!;
    expect(s.largest_files).toHaveLength(2);
    expect(s.n_files).toBe(5); // sayım limitten bağımsız
  });

  it("lastDiagFiles son gözlem dönemini seçer", () => {
    const diag = lastDiagFiles(tri, fd);
    expect(diag["2022"]).toEqual({ A: 120, B: 60 });
    expect(diag["2023"]).toEqual({ C: 90, D: 20, E: 10 });
  });
});

describe("newDiagonalToFileData (roll-forward)", () => {
  // Roll-forward sonrası üçgen: her origin'in son diagonali yeni dönem.
  // development_periods=[0,1,2] → devDate = origin + age.
  const rolled: Triangle = {
    origin_periods: ["2021", "2022", "2023"],
    development_periods: [0, 1, 2],
    values: [
      [1000, 1500, 1740], // 2021 son age2 → "2023"
      [1100, 1720, null], // 2022 son age1 → "2023"
      [900, null, null], // 2023 son age0 → "2023"
    ],
    triangle_type: "paid",
    origin_granularity: "yearly",
    development_granularity: "yearly",
  } as Triangle;

  it("yeni diagonalin dosya kırılımını doğru dev etiketine yerleştirir", () => {
    const fd = newDiagonalToFileData(rolled, {
      "2021": { A: 40 },
      "2022": { B: 120 },
      "2023": { D: 900 },
    });
    // her origin'in son gözlem dönemi "2023"
    expect(fd["2021"]).toEqual({ "2023": { A: 40 } });
    expect(fd["2022"]).toEqual({ "2023": { B: 120 } });
    expect(fd["2023"]).toEqual({ "2023": { D: 900 } });
  });

  it("boş kırılımı atlar", () => {
    const fd = newDiagonalToFileData(rolled, { "2021": {}, "2022": { B: 5 } });
    expect("2021" in fd).toBe(false);
    expect(fd["2022"]).toEqual({ "2023": { B: 5 } });
  });

  it("üçgende olmayan origin için sessizce atlar", () => {
    const fd = newDiagonalToFileData(rolled, { "1999": { Z: 1 } });
    expect(Object.keys(fd)).toHaveLength(0);
  });
});
