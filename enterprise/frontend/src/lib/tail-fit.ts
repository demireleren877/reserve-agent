/**
 * Parametric tail factor fitting — log regression method.
 * Reference: Willis Towers Watson ResQ "Log regression fitting method".
 *
 *   Exponential decay: regress log(r_t - 1) vs t
 *     LDF(t) = 1 + a·exp(b·t),  b < 0
 *
 *   Inverse Power: regress log(r_t - 1) vs log(c + t)
 *     LDF(t) = 1 + a·(c+t)^b,   b < 0
 *     Try c ∈ {-0.5, 0, 1, 3, 5}, keep highest R²
 *
 *   Power: regress log(log(r_t)) vs t
 *     LDF(t) = a^(b^t),  0 < b < 1
 *
 *   Weibull: regress log(log(r_t / (r_t - 1))) vs log(t)
 *     LDF(t) = exp(a·t^b) / (exp(a·t^b) - 1),  b > 0
 */

interface Pair { t: number; ldf: number }

function linReg(xs: number[], ys: number[]): { a: number; b: number; r2: number } {
  const n = xs.length;
  const X = xs.reduce((s, x) => s + x, 0);
  const Y = ys.reduce((s, y) => s + y, 0);
  const XX = xs.reduce((s, x) => s + x * x, 0);
  const XY = xs.reduce((s, x, i) => s + x * ys[i], 0);
  const YY = ys.reduce((s, y) => s + y * y, 0);
  const SXX = XX - X * X / n;
  const SXY = XY - X * Y / n;
  const SYY = YY - Y * Y / n;
  const b = SXX === 0 ? 0 : SXY / SXX;
  const a = Y / n - b * X / n;
  const r2 = (SXX === 0 || SYY === 0) ? 0 : (SXY * SXY) / (SXX * SYY);
  return { a, b, r2 };
}

function buildCDFs(n: number, ldfFn: (t: number) => number): number[] {
  let tail = 1;
  for (let t = n + 1; t <= n + 2000; t++) {
    const ldf = ldfFn(t);
    if (ldf < 1 + 1e-7) break;
    tail *= ldf;
  }
  // Return n+1 elements: indices 0..n-1 = CDFs for each period, index n = tail factor.
  // This ensures ldfAt(cdfs, n-1) = cdf[n-1]/cdf[n] = ldfFn(n) (single step, not cumulative).
  const cdf = new Array(n + 1).fill(1);
  cdf[n] = tail;
  cdf[n - 1] = ldfFn(n) * tail;
  for (let i = n - 2; i >= 0; i--) {
    cdf[i] = ldfFn(i + 1) * cdf[i + 1];
  }
  return cdf;
}

function validPairs(ldfs: number[], include?: boolean[]): Pair[] {
  return ldfs.flatMap((ldf, i) =>
    ldf - 1 > 1e-10 && (include == null || include[i] !== false)
      ? [{ t: i + 1, ldf }]
      : [],
  );
}

// Chi-square goodness-of-fit: Σ(observed-fitted)²/fitted on original LDF scale
function chiSqStat(pairs: Pair[], fn: (t: number) => number, nParams: number) {
  const n = pairs.length;
  if (n <= nParams) return { chiSq: NaN, df: 0, pValue: NaN };
  const chi2 = pairs.reduce((s, p) => {
    const fitted = fn(p.t);
    if (fitted <= 1) return s;
    return s + (p.ldf - fitted) ** 2 / fitted;
  }, 0);
  const df = n - nParams;
  return { chiSq: chi2, df, pValue: chiSqPValue(chi2, df) };
}

function chiSqPValue(chi2: number, df: number): number {
  if (df <= 0 || !isFinite(chi2)) return NaN;
  // Wilson-Hilferty normal approximation of chi-square CDF
  const x = chi2 / df;
  const z = (Math.cbrt(x) - (1 - 2 / (9 * df))) / Math.sqrt(2 / (9 * df));
  return 1 - normalCDF(z);
}

function normalCDF(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.7814779 + t * (-1.821256 + t * 1.3302744))));
  return z >= 0 ? 1 - p : p;
}

export interface TailFit {
  cdfs: number[];
  params: Record<string, number>;
  r2?: number;
  chiSq?: number;
  chiSqDf?: number;
  chiSqP?: number;
  ok: boolean;
}

export function fitExponential(ldfs: number[], include?: boolean[]): TailFit {
  const pairs = validPairs(ldfs, include);
  if (pairs.length < 2) return { cdfs: [], params: {}, ok: false };
  const xs = pairs.map(p => p.t);
  const ys = pairs.map(p => Math.log(p.ldf - 1));
  const { a, b, r2 } = linReg(xs, ys);
  const A = Math.exp(a);
  const fn = (t: number) => 1 + A * Math.exp(b * t);
  if (fn(1) <= 1) return { cdfs: [], params: {}, ok: false };
  const { chiSq, df, pValue } = chiSqStat(pairs, fn, 2);
  return { cdfs: buildCDFs(ldfs.length, fn), params: { a: A, b }, r2, chiSq, chiSqDf: df, chiSqP: pValue, ok: true };
}

export function fitInversePower(ldfs: number[], include?: boolean[]): TailFit {
  const pairs = validPairs(ldfs, include);
  if (pairs.length < 2) return { cdfs: [], params: {}, ok: false };
  const ys = pairs.map(p => Math.log(p.ldf - 1));
  const cValues = [-0.5, 0, 1, 3, 5];
  let best: { r2: number; a: number; b: number; c: number } | null = null;
  for (const c of cValues) {
    if (pairs.some(p => p.t + c <= 0)) continue;
    const xs = pairs.map(p => Math.log(p.t + c));
    const { a, b, r2 } = linReg(xs, ys);
    if (!best || r2 > best.r2) best = { r2, a, b, c };
  }
  if (!best) return { cdfs: [], params: {}, ok: false };
  const A = Math.exp(best.a);
  const fn = (t: number) => 1 + A * Math.pow(t + best!.c, best!.b);
  if (fn(1) <= 1) return { cdfs: [], params: {}, ok: false };
  const { chiSq, df, pValue } = chiSqStat(pairs, fn, 2);
  return {
    cdfs: buildCDFs(ldfs.length, fn),
    params: { a: A, b: best.b, c: best.c },
    r2: best.r2,
    chiSq, chiSqDf: df, chiSqP: pValue,
    ok: true,
  };
}

export function fitPower(ldfs: number[], include?: boolean[]): TailFit {
  const pairs = validPairs(ldfs, include).filter(p => p.ldf > 1);
  if (pairs.length < 2) return { cdfs: [], params: {}, ok: false };
  const xs = pairs.map(p => p.t);
  const ys = pairs.map(p => {
    const logLdf = Math.log(p.ldf);
    return logLdf > 0 ? Math.log(logLdf) : null;
  }).filter((y): y is number => y !== null);
  const xsFiltered = pairs
    .filter(p => Math.log(p.ldf) > 0)
    .map(p => p.t);
  if (xsFiltered.length < 2) return { cdfs: [], params: {}, ok: false };
  const { a, b, r2 } = linReg(xsFiltered, ys);
  const A = Math.exp(Math.exp(a));
  const B = Math.exp(b);
  if (B >= 1) return { cdfs: [], params: {}, ok: false };
  const fn = (t: number) => Math.pow(A, Math.pow(B, t));
  if (fn(1) <= 1) return { cdfs: [], params: {}, ok: false };
  const { chiSq, df, pValue } = chiSqStat(xsFiltered.map((t, i) => ({ t, ldf: Math.exp(Math.exp(ys[i])) })), fn, 2);
  return { cdfs: buildCDFs(ldfs.length, fn), params: { a: A, b: B }, r2, chiSq, chiSqDf: df, chiSqP: pValue, ok: true };
}

export function fitWeibull(ldfs: number[], include?: boolean[]): TailFit {
  const pairs = validPairs(ldfs, include).filter(p => {
    if (p.ldf <= 1) return false;
    const ratio = p.ldf / (p.ldf - 1);
    return ratio > 1 && Math.log(ratio) > 0;
  });
  if (pairs.length < 2) return { cdfs: [], params: {}, ok: false };
  const xs = pairs.map(p => Math.log(p.t));
  const ys = pairs.map(p => Math.log(Math.log(p.ldf / (p.ldf - 1))));
  const { a, b, r2 } = linReg(xs, ys);
  const A = Math.exp(a);
  if (A <= 0) return { cdfs: [], params: {}, ok: false };
  const fn = (t: number) => {
    const ev = Math.exp(A * Math.pow(t, b));
    if (!isFinite(ev) || ev <= 1) return 1;
    return ev / (ev - 1);
  };
  if (fn(1) <= 1) return { cdfs: [], params: {}, ok: false };
  const { chiSq, df, pValue } = chiSqStat(pairs, fn, 2);
  return { cdfs: buildCDFs(ldfs.length, fn), params: { a: A, b }, r2, chiSq, chiSqDf: df, chiSqP: pValue, ok: true };
}
