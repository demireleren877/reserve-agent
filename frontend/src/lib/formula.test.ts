import { describe, it, expect } from "vitest";
import { evalFormula, isPlainNumber, type FormulaContext } from "@/lib/formula";

function ctx(over?: Partial<{ pattern: Record<string, number>; clUlt: Record<string, number>; exposure: Record<string, number> }>): FormulaContext {
  return {
    pattern: new Map(Object.entries(over?.pattern ?? {})),
    clUlt: new Map(Object.entries(over?.clUlt ?? {})),
    exposure: new Map(Object.entries(over?.exposure ?? {})),
  };
}

describe("evalFormula — sayılar", () => {
  it("düz ondalık", () => {
    expect(evalFormula("0.75", ctx()).value).toBeCloseTo(0.75);
  });
  it("yüzde", () => {
    expect(evalFormula("75%", ctx()).value).toBeCloseTo(0.75);
  });
  it("negatif", () => {
    expect(evalFormula("-0.05", ctx()).value).toBeCloseTo(-0.05);
  });
  it("boş string → null, hata yok", () => {
    const r = evalFormula("   ", ctx());
    expect(r.value).toBeNull();
    expect(r.error).toBeNull();
  });
});

describe("evalFormula — aritmetik öncelik", () => {
  it("çarpma toplamadan önce", () => {
    expect(evalFormula("1 + 2 * 3", ctx()).value).toBeCloseTo(7);
  });
  it("parantez önceliği değiştirir", () => {
    expect(evalFormula("(1 + 2) * 3", ctx()).value).toBeCloseTo(9);
  });
  it("sıfıra bölme hatası", () => {
    expect(evalFormula("1 / 0", ctx()).error).toBeTruthy();
  });
  it("unary eksi zincirleme", () => {
    expect(evalFormula("--0.5", ctx()).value).toBeCloseTo(0.5);
  });
});

describe("evalFormula — avg (pattern ratio ortalaması)", () => {
  const c = ctx({ pattern: { "2020": 0.6, "2021": 0.8, "2022": 1.0 } });
  it("virgüllü liste", () => {
    expect(evalFormula("avg(2020, 2021, 2022)", c).value).toBeCloseTo(0.8);
  });
  it("aralık inclusive", () => {
    expect(evalFormula("avg(2020:2022)", c).value).toBeCloseTo(0.8);
  });
  it("ters aralık da çalışır (lo/hi normalize)", () => {
    expect(evalFormula("avg(2022:2020)", c).value).toBeCloseTo(0.8);
  });
  it("ortalama Türkçe alias", () => {
    expect(evalFormula("ortalama(2020, 2022)", c).value).toBeCloseTo(0.8);
  });
  it("eksik origin pattern'leri atlar", () => {
    // 2099 yok → sadece 2020 sayılır
    expect(evalFormula("avg(2020, 2099)", c).value).toBeCloseTo(0.6);
  });
  it("hiç pattern yoksa hata", () => {
    expect(evalFormula("avg(2099)", c).error).toBeTruthy();
  });
});

describe("evalFormula — vw (volume-weighted)", () => {
  const c = ctx({
    clUlt: { "2020": 1000, "2021": 2000 },
    exposure: { "2020": 1500, "2021": 2500 },
  });
  it("ΣCL / Σexposure", () => {
    expect(evalFormula("vw(2020:2021)", c).value).toBeCloseTo(3000 / 4000);
  });
  it("exposure 0 → hata", () => {
    expect(evalFormula("vw(2099)", c).error).toMatch(/exposure/i);
  });
  it("vw çarpan ile", () => {
    expect(evalFormula("vw(2020:2021) * 1.1", c).value).toBeCloseTo((3000 / 4000) * 1.1);
  });
});

describe("evalFormula — sum_cl / sum_exp / pattern", () => {
  const c = ctx({
    clUlt: { "2020": 1000, "2021": 2000 },
    exposure: { "2020": 1500, "2021": 2500 },
    pattern: { "2020": 0.66 },
  });
  it("sum_cl", () => {
    expect(evalFormula("sum_cl(2020:2021)", c).value).toBeCloseTo(3000);
  });
  it("sum_exp", () => {
    expect(evalFormula("sum_exp(2020:2021)", c).value).toBeCloseTo(4000);
  });
  it("sum_cl / sum_exp = vw", () => {
    const a = evalFormula("sum_cl(2020:2021) / sum_exp(2020:2021)", c).value;
    const b = evalFormula("vw(2020:2021)", c).value;
    expect(a).toBeCloseTo(b!);
  });
  it("pattern tek yıl", () => {
    expect(evalFormula("pattern(2020)", c).value).toBeCloseTo(0.66);
  });
  it("pattern çoklu yıl → hata", () => {
    expect(evalFormula("pattern(2020, 2021)", c).error).toBeTruthy();
  });
});

describe("evalFormula — çeyreklik referanslar", () => {
  const c = ctx({ pattern: { "2020Q1": 0.5, "2020Q2": 0.6, "2020Q3": 0.7 } });
  it("çeyreklik aralık", () => {
    expect(evalFormula("avg(2020Q1:2020Q3)", c).value).toBeCloseTo(0.6);
  });
  it("yıllık:çeyreklik karışık aralık → hata", () => {
    expect(evalFormula("avg(2020:2020Q3)", c).error).toBeTruthy();
  });
});

describe("evalFormula — hata yönetimi (parser sağlamlığı)", () => {
  it("kapanmamış parantez", () => {
    expect(evalFormula("avg(2020", ctx()).error).toBeTruthy();
  });
  it("bilinmeyen fonksiyon", () => {
    expect(evalFormula("foo(2020)", ctx()).error).toMatch(/Bilinmeyen|bekleniyor/i);
  });
  it("beklenmeyen karakter", () => {
    expect(evalFormula("0.5 & 0.3", ctx()).error).toBeTruthy();
  });
  it("ardışık operatör", () => {
    expect(evalFormula("1 * * 2", ctx()).error).toBeTruthy();
  });
  it("fonksiyon argümansız → hata", () => {
    expect(evalFormula("avg()", ctx()).error).toBeTruthy();
  });
  it("ident sonrası paren yok → hata", () => {
    expect(evalFormula("avg", ctx()).error).toBeTruthy();
  });
});

describe("isPlainNumber", () => {
  it.each(["0.75", "75%", "-0.05", "100"])("%s düz sayı", (s) => {
    expect(isPlainNumber(s)).toBe(true);
  });
  it.each(["avg(2020)", "vw(2020:2021)", "", "2020Q1"])("%s düz sayı değil", (s) => {
    expect(isPlainNumber(s)).toBe(false);
  });
});
