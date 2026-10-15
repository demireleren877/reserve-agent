// Fire Home Q3 kapanış demosu — tüm rakamlar tek bir tutarlı hesaptan gelir.
//
// data.json, scripts/demo_data.py ile üretilir (yıllık kaza dönemi, çeyreklik
// gelişim). AY2023'ün 2026Q3 diyagonalinde tek bir dosyadan gelen 18,6m'lik
// sıçrama var; agent bu hücreyi faktör seçiminden çıkarır (hasar üçgende kalır).
// AY2026 için BF, ön hasar prim oranı vw(2020:2024) pattern ratio'dur.
import raw from "./data.json";

export const AYS = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];
export const LARGE = 18.6;
export const LARGE_FILE = "#F-2023-0187";
export const OUT_AY = 2023;
export const OUT_DEV = 14; // 14→15

type Row = { latest: number; ep: number; cdf: number; cl: number; pattern: number; ult: number; ibnr: number; bf: boolean };
type Raw = {
  inc: Record<string, number[]>;
  incClean: Record<string, number[]>;
  pat: number[];
  I2: number;
  I3: number;
  I3L: number;
  lr: number;
  basis: number[];
  newexp: number;
  release: number;
  rows: Record<string, Row>;
};
const R = raw as unknown as Raw;

/** Kümülatif gerçekleşen (incurred) — dosya dahil, üçgende görünen gerçek veri. */
export const INC: Record<number, number[]> = Object.fromEntries(AYS.map((a) => [a, R.inc[String(a)]]));
/** Faktör seçiminde aykırı hücre hariç tutulmuş hali. */
export const INC_CLEAN: Record<number, number[]> = Object.fromEntries(AYS.map((a) => [a, R.incClean[String(a)]]));
export const MAX_DEV = 39;

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
export const TAIL_POINTS = Array.from({ length: 38 }, (_, i) => i + 1).map((d) => ({ d, y: vwa(INC_CLEAN, d) - 1 }));

/** Bu çeyrekte AY2023'teki hareketin tek dosyadan gelen payı. */
export const LARGE_SHARE = LARGE / (INC[OUT_AY][OUT_DEV] - INC[OUT_AY][OUT_DEV - 1]);
/** Isı tonu için en büyük hücre değeri. */
export const MAX_CELL = Math.max(...AYS.map((a) => Math.max(...INC[a])));

export const Q2_IBNR = R.I2;
export const Q3_IBNR = R.I3;
export const Q3_IBNR_WITH_CELL = R.I3L;
export const OVERSTATEMENT = R.I3L - R.I3;
export const NEW_EXPOSURE = R.newexp;
export const DEV_PRIOR = R.release;
export const PRIOR_LR = R.lr;
export const LR_BASIS = R.basis;

export const SUMMARY = AYS.map((a) => ({ ay: a, ...R.rows[String(a)], dev: INC[a].length }));

export const fmt = (v: number, dp = 1) =>
  (v < 0 ? "−" : "") +
  Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
