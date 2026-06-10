/**
 * İskonto hesaplama motoru.
 * v(t) = 1 / (1 + r_t)^(t/12)  — t = ay sayısı, r_t = yıllık spot faiz
 *
 * Standart katmanı:
 *  - IFRS 4  : nominal (iskontosuz) veya tek düzenleyici oran (SEDDK 2025: %30).
 *              Risk Adjustment yok.
 *  - IFRS 17 : bottom-up iskonto eğrisi = risk-free eğri + illikidite primi.
 *              BEL (best estimate liability) + Risk Adjustment = LIC
 *              (Liability for Incurred Claims). RA yöntemi esnek:
 *              BEL yüzdesi veya Cost-of-Capital proxy'si.
 * Standart seçimi yalnızca VARSAYILANLARI belirler — tüm parametreler
 * kullanıcı tarafından değiştirilebilir.
 */

export interface CurveNode {
  month: number;
  rate: number;
}

export type ReportingStandard = "ifrs4" | "ifrs17";
export type RateMode = "none" | "flat" | "curve";
export type RaMethod = "none" | "pct_of_bel" | "cost_of_capital";

export interface RiskAdjustmentConfig {
  method: RaMethod;
  /** method="pct_of_bel": RA = BEL × pctOfBel (örn. 0.06). */
  pctOfBel: number;
  /** method="cost_of_capital": yıllık CoC oranı (örn. 0.06). */
  cocRate: number;
  /** CoC için sermaye proxy'si: SCR(t) ≈ kalan yükümlülük × capitalRatio. */
  capitalRatio: number;
}

export interface DiscountConfig {
  standard: ReportingStandard;
  rateMode: RateMode;
  flatRate: number;
  curveNodes: CurveNode[];
  /** IFRS 17 bottom-up: eğrinin/sabit oranın üzerine eklenen illikidite primi (baz puan). */
  illiquidityPremiumBps: number;
  riskAdjustment: RiskAdjustmentConfig;
}

export const SEDDK_FLAT_RATE_2025 = 0.3;

/** TL risk-free eğri varsayılanı — kullanıcı düzenleyebilir. */
export const DEFAULT_RISK_FREE_CURVE: CurveNode[] = [
  { month: 12, rate: 0.28 },
  { month: 36, rate: 0.25 },
  { month: 60, rate: 0.22 },
  { month: 120, rate: 0.2 },
];

export function defaultDiscountConfig(standard: ReportingStandard): DiscountConfig {
  if (standard === "ifrs17") {
    return {
      standard,
      rateMode: "curve",
      flatRate: SEDDK_FLAT_RATE_2025,
      curveNodes: DEFAULT_RISK_FREE_CURVE.map((n) => ({ ...n })),
      illiquidityPremiumBps: 100,
      riskAdjustment: {
        method: "pct_of_bel",
        pctOfBel: 0.06,
        cocRate: 0.06,
        capitalRatio: 0.1,
      },
    };
  }
  return {
    standard: "ifrs4",
    rateMode: "flat",
    flatRate: SEDDK_FLAT_RATE_2025,
    curveNodes: DEFAULT_RISK_FREE_CURVE.map((n) => ({ ...n })),
    illiquidityPremiumBps: 0,
    riskAdjustment: { method: "none", pctOfBel: 0.06, cocRate: 0.06, capitalRatio: 0.1 },
  };
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

/**
 * Konfigürasyondan iskonto oranı fonksiyonu üretir.
 * IFRS 17'de illikidite primi eğrinin/sabit oranın üzerine eklenir;
 * rateMode="none" → iskontosuz (v=1).
 */
export function buildRateFn(config: DiscountConfig): (month: number) => number {
  const spread =
    config.standard === "ifrs17" ? config.illiquidityPremiumBps / 10000 : 0;
  if (config.rateMode === "none") return () => 0;
  if (config.rateMode === "flat") {
    const base = buildFlatRateFn(config.flatRate);
    return (m) => base(m) + spread;
  }
  const base = buildCurveFn(config.curveNodes);
  return (m) => base(m) + spread;
}

/**
 * Tek origin için Risk Adjustment.
 * - pct_of_bel: RA = BEL × pct.
 * - cost_of_capital: RA = Σ_adım CoC × capitalRatio × kalan_nominal(t) × Δt × v(t).
 *   Kalan nominal, ödeme aylarındaki adımlarla azaltılır (runoff proxy'si).
 */
export function riskAdjustmentForOrigin(
  o: DiscountedOrigin,
  ra: RiskAdjustmentConfig,
  getRateFn: (month: number) => number,
): number {
  if (ra.method === "none") return 0;
  if (ra.method === "pct_of_bel") return o.bel * ra.pctOfBel;

  // cost_of_capital
  const flows = [...o.cashFlows].sort((a, b) => a.month - b.month);
  let remaining = flows.reduce((s, f) => s + f.amount, 0);
  let prevMonth = 0;
  let raTotal = 0;
  for (const f of flows) {
    const dtYears = (f.month - prevMonth) / 12;
    if (dtYears > 0 && remaining > 0) {
      const v = vFactor(f.month, getRateFn);
      raTotal += ra.cocRate * ra.capitalRatio * remaining * dtYears * v;
    }
    remaining -= f.amount;
    prevMonth = f.month;
  }
  return raTotal;
}

export interface StandardDiscountResult {
  standard: ReportingStandard;
  /** BEL hesabı (IFRS 4'te "iskontolu unpaid" ile aynı kavram). */
  base: DiscountResult;
  riskAdjustment: { total: number; byOrigin: Record<string, number> };
  /** IFRS 17: LIC = BEL + RA. IFRS 4: iskontolu unpaid (RA=0). */
  lic: number;
}

/** Standart konfigürasyonu ile uçtan uca hesap: BEL + RA + LIC. */
export function discountWithStandard(
  rows: { origin: string; unpaid: number }[],
  monthlyPattern: Record<string, MonthlyWeight[]>,
  config: DiscountConfig,
): StandardDiscountResult {
  const rateFn = buildRateFn(config);
  const base = discountBranch(rows, monthlyPattern, rateFn);
  const ra =
    config.standard === "ifrs17" ? config.riskAdjustment : { ...config.riskAdjustment, method: "none" as RaMethod };
  const byOrigin: Record<string, number> = {};
  let total = 0;
  for (const o of base.origins) {
    const v = riskAdjustmentForOrigin(o, ra, rateFn);
    byOrigin[o.origin] = v;
    total += v;
  }
  return {
    standard: config.standard,
    base,
    riskAdjustment: { total, byOrigin },
    lic: base.totals.bel + total,
  };
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
