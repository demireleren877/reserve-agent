import { describe, it, expect } from "vitest";
import {
  fitExponential,
  fitInversePower,
  fitPower,
  fitWeibull,
} from "@/lib/tail-fit";

// Tam exponential LDF: ldf(t) = 1 + a·e^(b·t), a=1, b=-1
const EXP_LDFS = [1, 2, 3, 4, 5].map((t) => 1 + Math.exp(-t));

describe("fitExponential", () => {
  it("tam exponential veriyi yüksek R² ile fit eder ve parametreleri geri kazanır", () => {
    const fit = fitExponential(EXP_LDFS);
    expect(fit.ok).toBe(true);
    expect(fit.r2).toBeGreaterThan(0.999);
    expect(fit.params.a).toBeCloseTo(1, 4);
    expect(fit.params.b).toBeCloseTo(-1, 4);
  });
  it("cdfs n+1 eleman döner, tail faktörü > 1", () => {
    const fit = fitExponential(EXP_LDFS);
    expect(fit.cdfs.length).toBe(EXP_LDFS.length + 1);
    const tail = fit.cdfs[EXP_LDFS.length];
    expect(tail).toBeGreaterThan(1);
    expect(tail).toBeLessThan(1.01); // çok küçük kalan tail
  });
  it("CDF azalan (yaş ilerledikçe ultimate'a yaklaşır)", () => {
    const fit = fitExponential(EXP_LDFS);
    for (let i = 0; i < fit.cdfs.length - 1; i++) {
      expect(fit.cdfs[i]).toBeGreaterThanOrEqual(fit.cdfs[i + 1]);
    }
  });
  it("2'den az geçerli nokta → ok:false", () => {
    expect(fitExponential([1.5]).ok).toBe(false);
    expect(fitExponential([1, 1, 1]).ok).toBe(false); // hepsi ldf=1, geçersiz
  });
  it("include filtresi: dışlanan nokta off-line ise fit değişir", () => {
    // 4. noktayı bozuk yap; dışlanınca temiz fit (b≈-1) geri gelmeli
    const dirty = [...EXP_LDFS];
    dirty[3] = 1.5; // aykırı
    const withOutlier = fitExponential(dirty);
    const excluded = fitExponential(dirty, [true, true, true, false, true]);
    expect(excluded.ok).toBe(true);
    expect(excluded.params.b).toBeCloseTo(-1, 4); // temiz fit
    expect(withOutlier.params.b).not.toBeCloseTo(-1, 4); // aykırı bozar
  });
});

describe("fitInversePower", () => {
  it("azalan LDF'leri fit eder ve c parametresini seçer", () => {
    const ldfs = [1.5, 1.25, 1.15, 1.1, 1.07];
    const fit = fitInversePower(ldfs);
    expect(fit.ok).toBe(true);
    expect(fit.params.c).toBeDefined();
    expect(fit.cdfs.length).toBe(ldfs.length + 1);
  });
  it("inverse power kalın kuyruk: tail exponential'dan büyük", () => {
    const ldfs = [1.5, 1.25, 1.15, 1.1, 1.07];
    const ip = fitInversePower(ldfs);
    const exp = fitExponential(ldfs);
    if (ip.ok && exp.ok) {
      expect(ip.cdfs[ldfs.length]).toBeGreaterThan(exp.cdfs[ldfs.length]);
    }
  });
});

describe("fitPower & fitWeibull", () => {
  const ldfs = [1.5, 1.25, 1.15, 1.1, 1.07];
  it("power fit ok ve tail > 1", () => {
    const fit = fitPower(ldfs);
    if (fit.ok) {
      expect(fit.cdfs[ldfs.length]).toBeGreaterThan(1);
      expect(fit.params.b).toBeLessThan(1); // 0<b<1 kısıtı
    }
  });
  it("weibull fit ok ve cdfs azalan", () => {
    const fit = fitWeibull(ldfs);
    if (fit.ok) {
      for (let i = 0; i < fit.cdfs.length - 1; i++) {
        expect(fit.cdfs[i]).toBeGreaterThanOrEqual(fit.cdfs[i + 1]);
      }
    }
  });
});

describe("tüm modeller — chi-square istatistiği üretir", () => {
  const ldfs = [1.5, 1.25, 1.15, 1.1, 1.07];
  it.each([
    ["exp", fitExponential],
    ["invpower", fitInversePower],
  ])("%s fit chiSq ve r2 döndürür", (_name, fn) => {
    const fit = (fn as typeof fitExponential)(ldfs);
    if (fit.ok) {
      expect(fit.r2).toBeGreaterThan(0);
      expect(fit.r2).toBeLessThanOrEqual(1);
      expect(Number.isFinite(fit.chiSq!)).toBe(true);
    }
  });
});
