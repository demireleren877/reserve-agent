/**
 * Parametric tail factor fitting for LDF data.
 * Input: array of selected LDFs (1-indexed d = step number).
 * Returns: fitted CDF array (one per development period).
 *
 * Models:
 *   Inverse Power:  LDF(d) = 1 + c × d^(-β)
 *   Exponential:    LDF(d) = 1 + c × exp(-β × d)
 *   Weibull:        LDF(d) = 1 + c × exp(-β × d^γ)
 */

interface Pair { d: number; lm1: number }

function linReg(xs: number[], ys: number[]): { a: number; b: number } {
  const n = xs.length;
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  const ss = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  const sp = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
  const b = ss === 0 ? 0 : sp / ss;
  return { a: my - b * mx, b };
}

function ssq(pairs: Pair[], model: (d: number) => number): number {
  return pairs.reduce((s, p) => {
    const r = Math.log(Math.max(p.lm1, 1e-12)) - Math.log(Math.max(model(p.d) - 1, 1e-12));
    return s + r * r;
  }, 0);
}

function buildCDFs(n: number, ldfFn: (d: number) => number): number[] {
  // Extend tail to near-convergence (max 2000 steps)
  let tail = 1;
  for (let d = n + 1; d <= n + 2000; d++) {
    const ldf = ldfFn(d);
    if (ldf < 1 + 1e-7) break;
    tail *= ldf;
  }
  const cdf = new Array(n).fill(1);
  cdf[n - 1] = ldfFn(n) * tail;
  for (let i = n - 2; i >= 0; i--) {
    cdf[i] = ldfFn(i + 1) * cdf[i + 1];
  }
  return cdf;
}

function validPairs(ldfs: number[]): Pair[] {
  return ldfs.flatMap((ldf, i) => {
    const lm1 = ldf - 1;
    return lm1 > 1e-10 ? [{ d: i + 1, lm1 }] : [];
  });
}

export interface TailFit {
  cdfs: number[];
  params: Record<string, number>;
  ok: boolean;
}

export function fitInversePower(ldfs: number[]): TailFit {
  const pairs = validPairs(ldfs);
  if (pairs.length < 2) return { cdfs: [], params: {}, ok: false };
  const xs = pairs.map(p => Math.log(p.d));
  const ys = pairs.map(p => Math.log(p.lm1));
  const { a, b } = linReg(xs, ys);
  const c = Math.exp(a);
  const beta = -b;
  if (beta <= 0) return { cdfs: [], params: {}, ok: false };
  const fn = (d: number) => 1 + c * Math.pow(d, -beta);
  return { cdfs: buildCDFs(ldfs.length, fn), params: { c, beta }, ok: true };
}

export function fitExponential(ldfs: number[]): TailFit {
  const pairs = validPairs(ldfs);
  if (pairs.length < 2) return { cdfs: [], params: {}, ok: false };
  const xs = pairs.map(p => p.d);
  const ys = pairs.map(p => Math.log(p.lm1));
  const { a, b } = linReg(xs, ys);
  const c = Math.exp(a);
  const beta = -b;
  if (beta <= 0) return { cdfs: [], params: {}, ok: false };
  const fn = (d: number) => 1 + c * Math.exp(-beta * d);
  return { cdfs: buildCDFs(ldfs.length, fn), params: { c, beta }, ok: true };
}

export function fitWeibull(ldfs: number[]): TailFit {
  const pairs = validPairs(ldfs);
  if (pairs.length < 3) return { cdfs: [], params: {}, ok: false };
  const gammas = [0.3, 0.5, 0.7, 1.0, 1.3, 1.5, 1.7, 2.0, 2.5, 3.0];
  let bestGamma = 1, bestC = 1, bestBeta = 1, bestSsq = Infinity;
  for (const gamma of gammas) {
    const xs = pairs.map(p => Math.pow(p.d, gamma));
    const ys = pairs.map(p => Math.log(p.lm1));
    const { a, b } = linReg(xs, ys);
    const c = Math.exp(a);
    const beta = -b;
    if (beta <= 0) continue;
    const fn = (d: number) => 1 + c * Math.exp(-beta * Math.pow(d, gamma));
    const sq = ssq(pairs, fn);
    if (sq < bestSsq) { bestSsq = sq; bestGamma = gamma; bestC = c; bestBeta = beta; }
  }
  if (bestSsq === Infinity) return { cdfs: [], params: {}, ok: false };
  const fn = (d: number) => 1 + bestC * Math.exp(-bestBeta * Math.pow(d, bestGamma));
  return {
    cdfs: buildCDFs(ldfs.length, fn),
    params: { c: bestC, beta: bestBeta, gamma: bestGamma },
    ok: true,
  };
}
