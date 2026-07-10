/**
 * İskonto hesaplama motoru.
 * v(t) = 1 / (1 + r_t)^(t/12)  — t = ay sayısı, r_t = yıllık spot faiz
 */

export interface CurveNode {
  month: number;
  rate: number;
}

export interface MonthlyWeight {
  month: number;
  weight: number;
}

export interface DiscountedOrigin {
  origin: string;
  unpaid: number;
  bel: number;
  duration: number;
  discountPct: number;
  cashFlows: { month: number; amount: number; discounted: number }[];
}

export interface DiscountResult {
  origins: DiscountedOrigin[];
  totals: {
    unpaid: number;
    bel: number;
    duration: number;
    discountPct: number;
  };
}

function getRate(month: number, nodes: CurveNode[]): number {
  if (nodes.length === 0) return 0;
  for (let i = nodes.length - 1; i >= 0; i--) {
    if (month >= nodes[i].month) return nodes[i].rate;
  }
  return nodes[0].rate;
}

function vFactor(month: number, getAnnualRate: (m: number) => number): number {
  const r = getAnnualRate(month);
  if (month <= 0) return 1;
  return 1 / Math.pow(1 + r, month / 12);
}

export function buildFlatRateFn(annualRate: number): (month: number) => number {
  return () => annualRate;
}

export function buildCurveFn(nodes: CurveNode[]): (month: number) => number {
  const sorted = [...nodes].sort((a, b) => a.month - b.month);
  return (month: number) => getRate(month, sorted);
}

export function discountOrigin(
  origin: string,
  unpaid: number,
  pattern: MonthlyWeight[],
  getRateFn: (month: number) => number,
): DiscountedOrigin {
  let bel = 0;
  let weightedMonth = 0;
  const cashFlows: DiscountedOrigin["cashFlows"] = [];

  const sorted = [...pattern].sort((a, b) => a.month - b.month);

  let lastMonth = 0;
  for (const { month, weight } of sorted) {
    const amount = unpaid * weight;
    const v = vFactor(month, getRateFn);
    const discounted = amount * v;
    bel += discounted;
    weightedMonth += month * weight;
    if (month > lastMonth) lastMonth = month;
    cashFlows.push({ month, amount, discounted });
  }

  const duration = lastMonth;
  const discountPct = unpaid > 0 ? (unpaid - bel) / unpaid : 0;

  return { origin, unpaid, bel, duration, discountPct, cashFlows };
}

export function discountBranch(
  rows: { origin: string; unpaid: number }[],
  monthlyPattern: Record<string, MonthlyWeight[]>,
  getRateFn: (month: number) => number,
): DiscountResult {
  const origins: DiscountedOrigin[] = rows.map(({ origin, unpaid }) => {
    const pattern = monthlyPattern[origin] ?? [];
    return discountOrigin(origin, unpaid, pattern, getRateFn);
  });

  const totalUnpaid = origins.reduce((s, o) => s + o.unpaid, 0);
  const totalBel = origins.reduce((s, o) => s + o.bel, 0);
  const totalDuration = origins.reduce((m, o) => Math.max(m, o.duration), 0);
  const totalDiscountPct = totalUnpaid > 0 ? (totalUnpaid - totalBel) / totalUnpaid : 0;

  return {
    origins,
    totals: {
      unpaid: totalUnpaid,
      bel: totalBel,
      duration: totalDuration,
      discountPct: totalDiscountPct,
    },
  };
}
