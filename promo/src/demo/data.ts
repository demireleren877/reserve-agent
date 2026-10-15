// Fire Home Q3 kapanış demosu — tüm rakamlar tek bir tutarlı hesaptan gelir.
//
// data.json, scripts/demo_data.py ile (yıllık kaza dönemi, çeyreklik gelişim,
// %62 BF hasar prim oranı) hesaplandı: üçgen, faktörler, IBNR ve köprü kalemleri
// birbirini tutar. Büyük hasar (#F-2023-0187, 18,6m) AY2023'ün 2026Q3
// diyagonaline eklidir; agent onu faktörlerden çıkarır.
import raw from "./data.json";

export const AYS = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];
export const LARGE = 18.6;
export const LARGE_FILE = "#F-2023-0187";

type Raw = {
  inc: Record<string, number[]>;
  pat: number[];
  I2: number;
  I3: number;
  I3L: number;
  p3: Record<string, [number, number, number, number]>;
  newexp: number;
  release: number;
};
const R = raw as unknown as Raw;

/** Kümülatif gerçekleşen (incurred), büyük hasar dahil. */
export const INC: Record<number, number[]> = Object.fromEntries(
  AYS.map((a) => [a, R.inc[String(a)]]),
);
/** Aynı üçgen, büyük hasar hariç. */
export const INC_CLEAN: Record<number, number[]> = Object.fromEntries(
  AYS.map((a) => [a, a === 2023 ? INC[a].map((v, i) => (i === 14 ? v - LARGE : v)) : INC[a]]),
);
export const MAX_DEV = 39;

/** Hücre olgunluğu (0–1): gelişim desenine göre raporlanan oran. */
export const maturity = (d: number) => R.pat[d - 1];

/** Kaza yılı için yaş-yaş faktörü (d → d+1), yoksa null. */
export function ata(tri: Record<number, number[]>, ay: number, d: number): number | null {
  const r = tri[ay];
  return r.length > d ? r[d] / r[d - 1] : null;
}

/** Hacim ağırlıklı ortalama (son 8 kaza yılı). */
export function vwa(tri: Record<number, number[]>, d: number, win = 8): number {
  const pairs = AYS.filter((a) => tri[a].length > d).slice(-win);
  const num = pairs.reduce((s, a) => s + tri[a][d], 0);
  const den = pairs.reduce((s, a) => s + tri[a][d - 1], 0);
  return num / den;
}

export const TAIL = 1 / R.pat[38];

// Kuyruk uyumu: f−1 = a·d^(−b), log-log regresyon (d ≥ 4).
const fitPts = Array.from({ length: 35 }, (_, i) => i + 4).map((d) => ({ d, y: vwa(INC_CLEAN, d) - 1 }));
const lx = fitPts.map((p) => Math.log(p.d));
const ly = fitPts.map((p) => Math.log(Math.max(p.y, 1e-5)));
const mx = lx.reduce((s, v) => s + v, 0) / lx.length;
const my = ly.reduce((s, v) => s + v, 0) / ly.length;
const B = lx.reduce((s, v, i) => s + (v - mx) * (ly[i] - my), 0) / lx.reduce((s, v) => s + (v - mx) ** 2, 0);
const A = Math.exp(my - B * mx);
export const TAIL_FIT = (d: number) => A * Math.pow(d, B);
export const TAIL_POINTS = Array.from({ length: 38 }, (_, i) => i + 1).map((d) => ({
  d,
  y: vwa(INC_CLEAN, d) - 1,
}));

/** Bu çeyrekte AY2023'teki hareketin büyük hasardan gelen payı. */
export const LARGE_SHARE = LARGE / (INC[2023][14] - INC[2023][13]);
/** Isı haritası için en büyük hücre değeri. */
export const MAX_CELL = Math.max(...AYS.map((a) => Math.max(...INC_CLEAN[a])));

export const Q2_IBNR = R.I2;
export const Q3_IBNR = R.I3;
export const Q3_IBNR_WITH_LARGE = R.I3L;
export const OVERSTATEMENT = R.I3L - R.I3;
export const NEW_EXPOSURE = R.newexp;
export const DEV_PRIOR = R.release;

/** Kaza yılı özeti: [incurred, ultimate, ibnr, cdf]. */
export const SUMMARY = AYS.map((a) => {
  const [inc, ult, ibnr, cdf] = R.p3[String(a)];
  return { ay: a, inc, ult, ibnr, cdf, dev: INC[a].length };
});

export const fmt = (v: number, dp = 1) =>
  (v < 0 ? "\u2212" : "") +
  Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
