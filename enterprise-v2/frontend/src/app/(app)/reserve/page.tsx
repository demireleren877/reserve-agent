"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LDFMethod } from "@/types/triangle";
import type { Window } from "@/types/project";
import { DataTab } from "@/components/DataTab";
import { LDFTab } from "@/components/LDFTab";
import { CurveTab } from "@/components/CurveTab";
import { BFTab } from "@/components/BFTab";
import { UltimateTab } from "@/components/UltimateTab";
import { SummaryTab } from "@/components/SummaryTab";
import { ILRTab } from "@/components/ILRTab";
import { FrequencySeverityTab } from "@/components/FrequencySeverityTab";
import { FileAnalysisTab } from "@/components/FileAnalysisTab";
import { Breadcrumb } from "@/components/ProjectNav";
import { FolderBrowser } from "@/components/FolderBrowser";
import { ModelLockBanner } from "@/components/ModelLockBanner";
import { useModelLock } from "@/lib/use-model-lock";
import { useBranchSetters, useProject } from "@/lib/project-store";
import { formatNumber, type SessionState } from "@/lib/api";
import { exportToExcel } from "@/lib/export";
import { computeBranchSummary } from "@/lib/reserve-pipeline";
import {
  hasLarge,
  deriveAttritional,
  attritionalWorkingTriangle,
  computeLargeSummary,
  computeAttritionalSummary,
} from "@/lib/large-split";
import {
  aggregateLDFs,
  cascadeCDFs,
  cumulativeFactors,
  developmentRatios,
} from "@/lib/ldf";
import {
  fitExponential,
  fitInversePower,
  fitPower,
  fitWeibull,
  type TailFit,
} from "@/lib/tail-fit";
import { evalFormula, type FormulaContext } from "@/lib/formula";

type Tab = "data" | "file" | "ldf" | "curve" | "ilr" | "bf" | "freq" | "ultimate" | "summary";

const TABS: { id: Tab; label: string; sub: string }[] = [
  { id: "data",     label: "Veri",          sub: "Üçgen önizleme" },
  { id: "file",     label: "Dosya",         sub: "Dosya kırılımı" },
  { id: "ldf",      label: "LDF",           sub: "Gelişim faktörleri" },
  { id: "curve",    label: "Curve",         sub: "CDF eğrisi" },
  { id: "ilr",      label: "ILR",           sub: "Loss ratio üçgeni" },
  { id: "bf",       label: "BF",            sub: "Bornhuetter–Ferguson" },
  { id: "freq",     label: "Frekans-Şiddet", sub: "Adet × ort. maliyet" },
  { id: "ultimate", label: "Ultimate/IBNR", sub: "Rezerv projeksiyonu" },
  { id: "summary",  label: "Özet",          sub: "Model raporu" },
];

export default function Home() {
  const { project, navLevel, activePeriod, activeBranch, setReadOnly } = useProject();

  // LDF hover karşılaştırması için önceki dönemin eşleşen branch'i (aynı frekans+ad).
  const priorLDFRef = useMemo(() => {
    if (!activePeriod || !activeBranch) return null;
    const order = (label: string): number => {
      const m = label.match(/^(\d{4})(?:[Qq](\d))?/);
      return m ? parseInt(m[1], 10) * 4 + (m[2] ? parseInt(m[2], 10) : 0) : 0;
    };
    const sorted = [...project.periods].sort((a, b) => order(a.label) - order(b.label));
    const idx = sorted.findIndex((p) => p.id === activePeriod.id);
    for (let k = idx - 1; k >= 0; k--) {
      const b = sorted[k].branches.find(
        (br) =>
          br.frequency === activeBranch.frequency &&
          br.name === activeBranch.name &&
          br.triangle,
      );
      if (b?.triangle) {
        return { label: sorted[k].label, triangle: b.triangle, fileData: b.fileData ?? null };
      }
    }
    return null;
  }, [project.periods, activePeriod, activeBranch]);
  // ── Segment (Attritional / Large) ──
  const largeOn = hasLarge(activeBranch);
  const [segment, setSegment] = useState<"attritional" | "large">("attritional");
  const isLargeSeg = largeOn && segment === "large";
  // Branch değişince ya da large kalkınca attritional'a dön.
  useEffect(() => {
    setSegment("attritional");
  }, [activeBranch?.id]);
  useEffect(() => {
    if (!largeOn) setSegment("attritional");
  }, [largeOn]);

  const setters = useBranchSetters("user", isLargeSeg ? "large" : undefined);

  const [tab, setTab] = useState<Tab>("data");

  const lockKey =
    navLevel === "branch" && activePeriod && activeBranch
      ? `branch:${activePeriod.id}/${activeBranch.id}`
      : null;
  const { state: lockState, forceAcquire } = useModelLock(lockKey);
  // Kilit "mine" olana kadar salt-okunur (acquire penceresinde de yazma yok);
  // backend hatasında bloklamayız (çalışmaya devam).
  const isReadOnly = !!lockKey && lockState.status !== "mine" && lockState.status !== "error";

  // Merkezi kilit: başkası düzenliyorken store yazımları da bloklanır
  useEffect(() => {
    setReadOnly(isReadOnly);
    return () => setReadOnly(false);
  }, [isReadOnly, setReadOnly]);

  // Kilitliyken tüm setter'lar no-op — tek merkezden blok
  const guardedSetters = useMemo(
    () =>
      isReadOnly
        ? (Object.fromEntries(
            Object.keys(setters).map((k) => [k, () => {}])
          ) as unknown as typeof setters)
        : setters,
    [isReadOnly, setters],
  );

  // ── LARGE-LOSS ayrımı ──
  // Large yüklüyse ana model ATTRITIONAL = GROSS − LARGE; Large kendi BAĞIMSIZ
  // modeliyle (largeModel) ayrıca modellenir. Segment seçiciyle geçilir.
  // Large yoksa her şey bugünkü gibi (tek segment) — geriye tam uyumlu.
  const attr = useMemo(
    () => (activeBranch && largeOn ? deriveAttritional(activeBranch) : null),
    [activeBranch, largeOn],
  );
  const largeSummary = useMemo(
    () => (activeBranch ? computeLargeSummary(activeBranch) : null),
    [activeBranch],
  );
  const attritionalSummary = useMemo(
    () => (activeBranch && largeOn ? computeAttritionalSummary(activeBranch) : null),
    [activeBranch, largeOn],
  );

  const grossTriangle = activeBranch?.triangle ?? null;
  const isPaidType = grossTriangle?.triangle_type === "paid";
  const triangle = useMemo(() => {
    if (!activeBranch) return null;
    if (isLargeSeg) {
      const lp = activeBranch.largePaidTriangle ?? activeBranch.largeIncurredTriangle ?? null;
      const li = activeBranch.largeIncurredTriangle ?? activeBranch.largePaidTriangle ?? null;
      return (isPaidType ? lp : li) ?? null;
    }
    return (largeOn ? attritionalWorkingTriangle(activeBranch) : grossTriangle) ?? null;
  }, [activeBranch, isLargeSeg, largeOn, grossTriangle, isPaidType]);

  const effPaid = isLargeSeg
    ? activeBranch?.largePaidTriangle ?? (isPaidType ? triangle : null)
    : (largeOn ? attr?.paid : activeBranch?.paidTriangle) ?? (isPaidType ? triangle : null);
  const effIncurred = isLargeSeg
    ? activeBranch?.largeIncurredTriangle ?? (!isPaidType ? triangle : null)
    : (largeOn ? attr?.incurred : activeBranch?.incurredTriangle) ?? (!isPaidType ? triangle : null);

  // Param kaynağı: Large segmentinde nötr defaults + kaydedilmiş largeModel.
  const pb =
    isLargeSeg && activeBranch
      ? {
          ...activeBranch,
          method: "volume_weighted" as LDFMethod,
          window: "all" as Window,
          excludedCells: [] as string[],
          karmaWindowPerStep: {},
          premiums: {},
          lrInputPerOrigin: {},
          basisPerOrigin: {},
          correctionPerOrigin: {},
          cdfInitial: {},
          cdfChoicePerPeriod: {},
          cdfModelPerPeriod: {},
          curveIncludePerPeriod: {},
          ...(activeBranch.largeModel ?? {}),
        }
      : activeBranch;

  // export/computeBranchSummary için mevcut segmentin model branch'i
  const modelBranch = useMemo(
    () => (pb ? { ...pb, triangle, paidTriangle: effPaid, incurredTriangle: effIncurred } : pb),
    [pb, triangle, effPaid, effIncurred],
  );

  const method = (pb?.method ?? "volume_weighted") as LDFMethod;
  const window: Window = pb?.window ?? "all";
  const premiums = pb?.premiums ?? {};
  const lrInputPerOrigin = pb?.lrInputPerOrigin ?? {};
  const basisPerOrigin = pb?.basisPerOrigin ?? {};
  const cdfInitial = pb?.cdfInitial ?? {};
  const cdfChoicePerPeriod =
    (pb?.cdfChoicePerPeriod ?? {}) as Record<string, "initial" | "user">;
  const cdfModelPerPeriod = (pb?.cdfModelPerPeriod ?? {}) as Record<string, 1 | 2 | 3 | 4 | 5 | 6>;
  const curveIncludePerPeriod = pb?.curveIncludePerPeriod ?? {};
  const correctionPerOrigin = pb?.correctionPerOrigin ?? {};

  // Sadece gerçek LDF verisi olan hücreleri sayan filtreli set.
  // Eski "phantom" elemeler (data null olduğu hücreler) burada düşer; UI ile
  // tutarlı olur ve kullanıcı geri alabilir.
  const rawExcluded = pb?.excludedCells;
  const excludedCells = useMemo(() => {
    const raw = rawExcluded ?? [];
    if (!triangle) return new Set(raw);
    const idx = new Map(triangle.origin_periods.map((o, i) => [o, i]));
    const out = new Set<string>();
    for (const k of raw) {
      const [origin, sStr] = k.split("|");
      const step = Number(sStr);
      const i = idx.get(origin);
      if (i == null || !Number.isFinite(step)) continue;
      const a = triangle.values[i][step];
      const b = triangle.values[i][step + 1];
      if (a != null && b != null) out.add(k);
    }
    return out;
  }, [rawExcluded, triangle]);

  // Phantom elemeleri kalıcı olarak temizle (bir kez, branch/triangle değişince).
  useEffect(() => {
    if (!triangle || !activeBranch) return;
    const raw = rawExcluded ?? [];
    if (raw.length === excludedCells.size) return;
    guardedSetters.setExcludedCells(excludedCells);
  }, [triangle, activeBranch, rawExcluded, excludedCells, guardedSetters]);

  const ratios = useMemo(
    () => (triangle ? developmentRatios(triangle, excludedCells) : []),
    [triangle, excludedCells],
  );

  const selectedLDFs = useMemo(() => {
    if (!triangle) return [];
    return aggregateLDFs(triangle, ratios, window, method);
  }, [triangle, ratios, window, method]);

  // Tail curve fit — include flags'e göre hesaplanır, cascade'e ve CurveTab'a geçer.
  const tailFits = useMemo(() => {
    if (!triangle || !selectedLDFs.length)
      return { exp: { ok: false, cdfs: [], params: {}, r2: undefined } as TailFit,
               invPower: { ok: false, cdfs: [], params: {}, r2: undefined } as TailFit,
               power: { ok: false, cdfs: [], params: {}, r2: undefined } as TailFit,
               weibull: { ok: false, cdfs: [], params: {}, r2: undefined } as TailFit };
    const include = triangle.development_periods.map((d, i) =>
      (i >= selectedLDFs.length || selectedLDFs[i] > 1) && curveIncludePerPeriod[String(d)] !== false
    );
    return {
      exp: fitExponential(selectedLDFs, include),
      invPower: fitInversePower(selectedLDFs, include),
      power: fitPower(selectedLDFs, include),
      weibull: fitWeibull(selectedLDFs, include),
    };
  }, [triangle, selectedLDFs, curveIncludePerPeriod]);

  // Curve seçimleri cascade mantığıyla uygulanır.
  // initialCDFs: her period için "initial" seçilmesi halinde gelecek CDF,
  // downstream kullanıcı override'ları anchor olarak dikkate alınır.
  // effectiveLDFs: fiili CDF'lerden türetilir, BF/Ultimate'de kullanılır.
  const cascade = useMemo(() => {
    if (!triangle)
      return { effective: [] as number[], initial: [] as number[], effLDFs: [] as number[] };
    return cascadeCDFs(
      triangle.development_periods,
      selectedLDFs,
      cdfChoicePerPeriod,
      cdfInitial,
      {
        model: cdfModelPerPeriod,
        fitCDFs: {
          exp: tailFits.exp.cdfs,
          invPower: tailFits.invPower.cdfs,
          power: tailFits.power.cdfs,
          weibull: tailFits.weibull.cdfs,
        },
      },
    );
  }, [triangle, selectedLDFs, cdfChoicePerPeriod, cdfInitial, cdfModelPerPeriod, tailFits]);

  const effectiveLDFs = cascade.effLDFs.length ? cascade.effLDFs : selectedLDFs;
  const initialCDFs = cascade.initial;

  const formulaCtx = useMemo<FormulaContext>(() => {
    const pattern = new Map<string, number>();
    const clUlt = new Map<string, number>();
    const exposure = new Map<string, number>();
    if (triangle) {
      const cdfs = cumulativeFactors(effectiveLDFs);
      for (let i = 0; i < triangle.origin_periods.length; i++) {
        const o = triangle.origin_periods[i];
        let latest: number | null = null;
        let latestIdx = -1;
        for (let j = 0; j < triangle.values[i].length; j++) {
          const v = triangle.values[i][j];
          if (v != null) {
            latest = v;
            latestIdx = j;
          }
        }
        if (latest == null) continue;
        const cdf =
          latestIdx >= 0 && latestIdx < cdfs.length ? cdfs[latestIdx] : 1;
        const cl = latest * cdf;
        const exp = premiums[o] ?? 0;
        const k =
          correctionPerOrigin[o] && correctionPerOrigin[o] > 0
            ? correctionPerOrigin[o]
            : 1;
        // Pattern ratio yıllık exposure üzerinden — mature yıllarla apples-to-apples
        const expAnnual = exp * k;
        clUlt.set(o, cl);
        exposure.set(o, expAnnual);
        if (expAnnual > 0) pattern.set(o, cl / expAnnual);
      }
    }
    return { pattern, clUlt, exposure };
  }, [triangle, effectiveLDFs, premiums, correctionPerOrigin]);

  const lrEvaluated = useMemo(() => {
    const out: Record<string, number> = {};
    const errs: Record<string, string> = {};
    for (const [origin, expr] of Object.entries(lrInputPerOrigin)) {
      if (!expr || !expr.trim()) continue;
      const { value, error } = evalFormula(expr, formulaCtx);
      if (value != null) out[origin] = value;
      if (error) errs[origin] = error;
    }
    return { values: out, errors: errs };
  }, [lrInputPerOrigin, formulaCtx]);

  const elrPerOrigin = lrEvaluated.values;
  const lrErrors = lrEvaluated.errors;

  const sessionState = useMemo<SessionState | null>(() => {
    if (!triangle) return null;
    const cdfs = cumulativeFactors(effectiveLDFs);
    const per_origin: SessionState["per_origin"] = [];
    let totalLatest = 0;
    let totalCLUlt = 0;
    let totalBFUlt = 0;
    let totalSelectedUlt = 0;
    let totalExposure = 0;
    for (let i = 0; i < triangle.values.length; i++) {
      let latest: number | null = null;
      let latestIdx = -1;
      for (let j = 0; j < triangle.values[i].length; j++) {
        const v = triangle.values[i][j];
        if (v != null) {
          latest = v;
          latestIdx = j;
        }
      }
      if (latest == null) continue;
      const origin = triangle.origin_periods[i];
      const cdf = latestIdx < cdfs.length ? cdfs[latestIdx] : 1;
      const clUlt = latest * cdf;
      const premium = premiums[origin] ?? 0;
      const k =
        correctionPerOrigin[origin] && correctionPerOrigin[origin] > 0
          ? correctionPerOrigin[origin]
          : 1;
      const premiumAnnual = premium * k;
      const patternRatio = premiumAnnual > 0 ? clUlt / premiumAnnual : null;
      const userLR = elrPerOrigin[origin];
      const selectedLR =
        userLR !== undefined
          ? userLR
          : patternRatio !== null
          ? patternRatio
          : 0.7;
      const pctDeveloped = clUlt > 0 ? latest / clUlt : 1;
      const bfUltAnnual =
        latest + selectedLR * premiumAnnual * (1 - pctDeveloped);
      const bfUlt = bfUltAnnual / k;
      const basis = basisPerOrigin[origin] ?? "cl";
      const selectedUlt = basis === "cl" ? clUlt : bfUlt;
      const selectedIbnr = selectedUlt - latest;
      const ulr = premium > 0 ? selectedUlt / premium : null;

      totalLatest += latest;
      totalExposure += premium;
      totalCLUlt += clUlt;
      totalBFUlt += bfUlt;
      totalSelectedUlt += selectedUlt;

      per_origin.push({
        origin,
        latest,
        cdf,
        ultimate: clUlt,
        ibnr: selectedIbnr,
        premium,
        premium_annual: premiumAnnual,
        correction: k,
        pattern_ratio: patternRatio,
        selected_lr: selectedLR,
        selected_lr_input: lrInputPerOrigin[origin] ?? null,
        cl_ultimate: clUlt,
        bf_ultimate: bfUlt,
        bf_ultimate_annual: bfUltAnnual,
        basis,
        selected_ultimate: selectedUlt,
        ulr,
      } as unknown as SessionState["per_origin"][number]);
    }
    return {
      method,
      window: String(window),
      excluded_cells: Array.from(excludedCells).map((k) => {
        const [origin, step] = k.split("|");
        return { origin, step: Number(step) };
      }),
      selected_ldfs: effectiveLDFs,
      cdfs,
      total_latest: totalLatest,
      total_ultimate: totalCLUlt,
      total_ibnr: totalSelectedUlt - totalLatest,
      per_origin,
      ...({
        total_exposure: totalExposure,
        total_bf_ultimate: totalBFUlt,
        total_selected_ultimate: totalSelectedUlt,
        total_selected_ibnr: totalSelectedUlt - totalLatest,
        curve_state: {
          development_periods: triangle.development_periods.map(String),
          initial_cdfs: initialCDFs,
          effective_cdfs: cascade.effective,
          choices: triangle.development_periods.map((d) => ({
            dev_period: String(d),
            choice: cdfChoicePerPeriod[String(d)] ?? "initial",
            user_value: cdfInitial[String(d)] ?? null,
          })),
          has_overrides: Object.values(cdfChoicePerPeriod).some(
            (c) => c === "user",
          ),
        },
        project_context: activePeriod && activeBranch
          ? {
              period: activePeriod.label,
              branch: activeBranch.name,
              frequency: activeBranch.frequency,
              history_count: activeBranch.history.length,
              recent_actions: activeBranch.history
                .slice(-5)
                .map((h) => ({ ts: h.timestamp, action: h.action })),
            }
          : null,
        file_data_summary: (() => {
          const fd = activeBranch?.fileData;
          if (!fd) return null;
          const origins = Object.keys(fd);
          if (!origins.length) return null;
          const originSummaries = origins.flatMap((origin) => {
            const devDates = Object.keys(fd[origin]);
            if (!devDates.length) return [];
            const lastDev = devDates[devDates.length - 1];
            const filesMap = fd[origin][lastDev];
            const entries = Object.entries(filesMap).map(([dosya, val]) => ({ dosya, val: Number(val) }));
            if (!entries.length) return [];
            const total = entries.reduce((s, e) => s + e.val, 0);
            entries.sort((a, b) => b.val - a.val);
            const top3sum = entries.slice(0, 3).reduce((s, e) => s + e.val, 0);
            return [{
              origin,
              dev_date: lastDev,
              total: Math.round(total),
              n_files: entries.length,
              top1_file: entries[0].dosya,
              top1_value: Math.round(entries[0].val),
              top1_pct: total > 0 ? Math.round(entries[0].val / total * 1000) / 10 : 0,
              top3_pct: total > 0 ? Math.round(top3sum / total * 1000) / 10 : 0,
            }];
          });
          return {
            has_file_data: true,
            origin_count: originSummaries.length,
            origins: originSummaries,
          };
        })(),
      } as Record<string, unknown>),
    } as SessionState;
  }, [
    triangle,
    effectiveLDFs,
    method,
    window,
    excludedCells,
    premiums,
    elrPerOrigin,
    lrInputPerOrigin,
    basisPerOrigin,
    activePeriod,
    activeBranch,
    correctionPerOrigin,
    initialCDFs,
    cascade.effective,
    cdfChoicePerPeriod,
    cdfInitial,
  ]);

  // -------- Pipeline helper (per-exclusion impact için yeniden çalıştırılır) -----
  const runPipeline = useCallback(
    (excluded: Set<string>) => {
      if (!triangle) return null;
      const r = developmentRatios(triangle, excluded);
      const ldfs = aggregateLDFs(triangle, r, window, method);
      const devs = triangle.development_periods;
      // Ultimate/IBNR ile AYNI hesap: curve modeli (exp/inverse-power/power/weibull)
      // + CDF override'ları uygulanır. Aksi halde Özet ile Ultimate sapar.
      const include = devs.map(
        (d, i) => (i >= ldfs.length || ldfs[i] > 1) && curveIncludePerPeriod[String(d)] !== false,
      );
      const cascade = cascadeCDFs(devs, ldfs, cdfChoicePerPeriod, cdfInitial, {
        model: cdfModelPerPeriod,
        fitCDFs: {
          exp: fitExponential(ldfs, include).cdfs,
          invPower: fitInversePower(ldfs, include).cdfs,
          power: fitPower(ldfs, include).cdfs,
          weibull: fitWeibull(ldfs, include).cdfs,
        },
      });
      const effLDFs = cascade.effLDFs.length ? cascade.effLDFs : ldfs;
      const cdfs = cumulativeFactors(effLDFs);

      const pattern = new Map<string, number>();
      const clUltMap = new Map<string, number>();
      const expMap = new Map<string, number>();
      for (let i = 0; i < triangle.origin_periods.length; i++) {
        let latest: number | null = null;
        let latestIdx = -1;
        for (let j = 0; j < triangle.values[i].length; j++) {
          const v = triangle.values[i][j];
          if (v != null) {
            latest = v;
            latestIdx = j;
          }
        }
        if (latest == null) continue;
        const o = triangle.origin_periods[i];
        const cdf = latestIdx < cdfs.length ? cdfs[latestIdx] : 1;
        const cl = latest * cdf;
        const k =
          correctionPerOrigin[o] && correctionPerOrigin[o] > 0
            ? correctionPerOrigin[o]
            : 1;
        const expA = (premiums[o] ?? 0) * k;
        clUltMap.set(o, cl);
        expMap.set(o, expA);
        if (expA > 0) pattern.set(o, cl / expA);
      }
      const ctx: FormulaContext = {
        pattern,
        clUlt: clUltMap,
        exposure: expMap,
      };
      const evaluated: Record<string, number> = {};
      for (const [o, expr] of Object.entries(lrInputPerOrigin)) {
        if (!expr || !expr.trim()) continue;
        const { value } = evalFormula(expr, ctx);
        if (value != null) evaluated[o] = value;
      }

      const rows = [] as {
        origin: string;
        latest: number;
        premium: number;
        premiumAnnual: number;
        correction: number;
        cdf: number;
        clUltimate: number;
        bfUltimate: number;
        selectedUltimate: number;
        ibnr: number;
        ulr: number | null;
        basis: "cl" | "bf";
        selectedLR: number;
        selectedLRInput: string | null;
        pctDeveloped: number | null;
      }[];
      let totalLatest = 0;
      let totalExposure = 0;
      let totalSelectedUlt = 0;
      for (let i = 0; i < triangle.origin_periods.length; i++) {
        let latest: number | null = null;
        let latestIdx = -1;
        for (let j = 0; j < triangle.values[i].length; j++) {
          const v = triangle.values[i][j];
          if (v != null) {
            latest = v;
            latestIdx = j;
          }
        }
        if (latest == null) continue;
        const o = triangle.origin_periods[i];
        const cdf = latestIdx < cdfs.length ? cdfs[latestIdx] : 1;
        const cl = latest * cdf;
        const premium = premiums[o] ?? 0;
        const k =
          correctionPerOrigin[o] && correctionPerOrigin[o] > 0
            ? correctionPerOrigin[o]
            : 1;
        const premiumAnnual = premium * k;
        const patternRatio = premiumAnnual > 0 ? cl / premiumAnnual : null;
        const userLR = evaluated[o];
        const selectedLR =
          userLR !== undefined
            ? userLR
            : patternRatio !== null
            ? patternRatio
            : 0.7;
        const pctDev = cl > 0 ? latest / cl : 1;
        const bfUltAnnual =
          latest + selectedLR * premiumAnnual * (1 - pctDev);
        const bfUlt = bfUltAnnual / k;
        const basis = basisPerOrigin[o] ?? "cl";
        const selectedUlt = basis === "cl" ? cl : bfUlt;
        const ibnr = selectedUlt - latest;
        const ulr = premium > 0 ? selectedUlt / premium : null;
        rows.push({
          origin: o,
          latest,
          premium,
          premiumAnnual,
          correction: k,
          cdf,
          clUltimate: cl,
          bfUltimate: bfUlt,
          selectedUltimate: selectedUlt,
          ibnr,
          ulr,
          basis,
          selectedLR,
          selectedLRInput: lrInputPerOrigin[o] ?? null,
          pctDeveloped: cl > 0 ? pctDev : null,
        });
        totalLatest += latest;
        totalExposure += premiumAnnual;
        totalSelectedUlt += selectedUlt;
      }
      return {
        rows,
        totals: {
          latest: totalLatest,
          exposure: totalExposure,
          selectedUltimate: totalSelectedUlt,
          ibnr: totalSelectedUlt - totalLatest,
        },
        effLDFs,
        effCDFs: cdfs,
      };
    },
    [
      triangle,
      window,
      method,
      cdfChoicePerPeriod,
      cdfInitial,
      cdfModelPerPeriod,
      curveIncludePerPeriod,
      correctionPerOrigin,
      premiums,
      lrInputPerOrigin,
      basisPerOrigin,
    ],
  );

  const summary = useMemo(
    () => runPipeline(excludedCells),
    [runPipeline, excludedCells],
  );

  // Per-exclusion impact: bu hücre eleme uygulanmasaydı IBNR ne kadar değişirdi
  const exclusionImpacts = useMemo(() => {
    if (!triangle || !summary) return [];
    const cur = summary.totals.ibnr;
    const out: {
      origin: string;
      step: number;
      ldfValue: number | null;
      median: number | null;
      deviationPct: number | null;
      ibnrImpact: number;
    }[] = [];
    // Kolon medyanları (eleme dahil değil) — referans için
    const nSteps = triangle.development_periods.length - 1;
    const colMedian: (number | null)[] = [];
    for (let j = 0; j < nSteps; j++) {
      const vals: number[] = [];
      for (let i = 0; i < triangle.values.length; i++) {
        const a = triangle.values[i][j];
        const b = triangle.values[i][j + 1];
        if (a != null && b != null && a !== 0) vals.push(b / a);
      }
      vals.sort((a, b) => a - b);
      colMedian.push(vals.length ? vals[Math.floor(vals.length / 2)] : null);
    }
    for (const key of Array.from(excludedCells)) {
      const [origin, stepStr] = key.split("|");
      const step = Number(stepStr);
      const i = triangle.origin_periods.indexOf(origin);
      const a = i >= 0 ? triangle.values[i][step] : null;
      const b = i >= 0 ? triangle.values[i][step + 1] : null;
      const ldfValue = a != null && b != null && a !== 0 ? b / a : null;
      const median = colMedian[step] ?? null;
      const dev =
        ldfValue != null && median != null && median !== 0
          ? ((ldfValue - median) / median) * 100
          : null;
      const without = new Set(excludedCells);
      without.delete(key);
      const altIbnr = runPipeline(without)?.totals.ibnr ?? cur;
      out.push({
        origin,
        step,
        ldfValue,
        median,
        deviationPct: dev,
        ibnrImpact: altIbnr - cur,
      });
    }
    out.sort((x, y) => {
      if (x.origin < y.origin) return -1;
      if (x.origin > y.origin) return 1;
      return x.step - y.step;
    });
    return out;
  }, [triangle, excludedCells, summary, runPipeline]);

  const curveOverrides = useMemo(() => {
    const out: { devPeriod: string; userValue: number }[] = [];
    if (!triangle) return out;
    for (const d of triangle.development_periods) {
      const k = String(d);
      if (cdfChoicePerPeriod[k] === "user") {
        out.push({ devPeriod: k, userValue: cdfInitial[k] ?? 1 });
      }
    }
    return out;
  }, [triangle, cdfChoicePerPeriod, cdfInitial]);

  const correctionEntries = useMemo(() => {
    return Object.entries(correctionPerOrigin)
      .filter(([, v]) => v && v !== 1)
      .map(([origin, value]) => ({ origin, value }));
  }, [correctionPerOrigin]);

  const manualLRCount = useMemo(
    () =>
      Object.values(lrInputPerOrigin).filter((v) => v && v.trim().length > 0)
        .length,
    [lrInputPerOrigin],
  );

  const bfBasisCount = useMemo(
    () => Object.values(basisPerOrigin).filter((b) => b === "bf").length,
    [basisPerOrigin],
  );

  // Eleme/dahil popup'ı için bekleyen pre-IBNR
  const pendingToggleRef = useRef<{
    origin: string;
    step: number;
    preIbnr: number;
  } | null>(null);
  const [toggleToast, setToggleToast] = useState<{
    origin: string;
    step: number;
    delta: number;
    excluded: boolean;
    ts: number;
  } | null>(null);

  function toggleCellHandler(origin: string, step: number) {
    if (summary) {
      pendingToggleRef.current = {
        origin,
        step,
        preIbnr: summary.totals.ibnr,
      };
    }
    guardedSetters.toggleCell(origin, step);
  }

  // Eleme/dahil sonrası IBNR farkını göster
  useEffect(() => {
    if (!pendingToggleRef.current || !summary) return;
    const { origin, step, preIbnr } = pendingToggleRef.current;
    pendingToggleRef.current = null;
    const delta = summary.totals.ibnr - preIbnr;
    const key = `${origin}|${step}`;
    const isNowExcluded = excludedCells.has(key);
    setToggleToast({ origin, step, delta, excluded: isNowExcluded, ts: Date.now() });
  }, [summary, excludedCells]);

  useEffect(() => {
    if (!toggleToast) return;
    const id = setTimeout(() => setToggleToast(null), 4500);
    return () => clearTimeout(id);
  }, [toggleToast]);

  function setExcludedCellsHandler(next: Set<string>) {
    guardedSetters.setExcludedCells(next);
  }

  // Global ReserveAgentBridge (root) tüm proje snapshot'ını ve action
  // handler'ını agent registry'ye kayıt ediyor — burada local kayıt yok.

  // Non-branch levels → folder browser
  if (navLevel !== "branch" || !activeBranch) {
    return (
      <Shell>
        <main className="p-6">
          <FolderBrowser />
        </main>
      </Shell>
    );
  }

  return (
    <Shell onUploaded={() => setTab("data")}>
      <ModelLockBanner state={lockState} onForceAcquire={forceAcquire} />
      {largeOn && (
        <div className="border-b bg-[color:var(--surface-alt)]/50 px-4 py-2 flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wide font-semibold text-[color:var(--muted)]">
            Segment
          </span>
          <div className="inline-flex h-7 p-0.5 rounded-lg bg-[color:var(--surface-alt)] border border-[color:var(--border)]">
            {([["attritional", "Attritional"], ["large", "Large"]] as const).map(
              ([val, lbl]) => {
                const on = segment === val;
                return (
                  <button
                    key={val}
                    onClick={() => setSegment(val)}
                    className={
                      "px-3 rounded-md text-[12px] font-medium transition " +
                      (on
                        ? "bg-[color:var(--surface)] text-[color:var(--primary)] shadow-sm"
                        : "text-[color:var(--muted-strong)] hover:text-[color:var(--foreground)]")
                    }
                  >
                    {lbl}
                  </button>
                );
              },
            )}
          </div>
          <span className="text-[11px] text-[color:var(--muted)]">
            {isLargeSeg
              ? "Large segmentini modelliyorsun (bağımsız parametreler)."
              : "Attritional = Gross − Large. Toplam Özet'te."}
          </span>
        </div>
      )}
      <div className="border-b bg-[color:var(--surface)] sticky top-[calc(3.5rem+var(--nav-h,0px))] z-20">
        <div className="flex items-stretch">
          <nav className="flex px-4 overflow-x-auto flex-1" role="tablist">
          {TABS.map((t, i) => {
            const active = t.id === tab;
            const disabled =
              t.id !== "data" && t.id !== "file" && !triangle;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                disabled={disabled}
                onClick={() => setTab(t.id)}
                className={
                  "relative px-4 py-2.5 text-sm border-b-2 transition flex flex-col items-start shrink-0 " +
                  (active
                    ? "border-[color:var(--primary)] text-[color:var(--foreground)]"
                    : disabled
                    ? "border-transparent text-[color:var(--muted)] opacity-40 cursor-not-allowed"
                    : "border-transparent text-[color:var(--muted-strong)] hover:text-[color:var(--foreground)]")
                }
              >
                <span className="flex items-center gap-2">
                  <span
                    className={
                      "inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold " +
                      (active
                        ? "bg-[color:var(--primary)] text-white"
                        : "bg-[color:var(--surface-alt)] text-[color:var(--muted-strong)]")
                    }
                  >
                    {i + 1}
                  </span>
                  <span className="font-medium">{t.label}</span>
                </span>
                <span className="text-[10px] text-[color:var(--muted)] ml-7 -mt-0.5">
                  {t.sub}
                </span>
              </button>
            );
          })}
          </nav>
          <div className="flex items-center px-3 gap-2 shrink-0">
            {triangle && (
              <button
                onClick={() => {
                  const bs = computeBranchSummary(modelBranch!);
                  exportToExcel({
                    branchName: activeBranch.name,
                    periodLabel: activePeriod?.label ?? "",
                    frequency: activeBranch.frequency,
                    triangle,
                    paidTriangle: effPaid,
                    incurredTriangle: effIncurred,
                    rows: bs.rows,
                    totals: bs.totals,
                    selectedLDFs: bs.selected_ldfs,
                    effectiveCDFs: bs.effective_cdfs,
                    initialCDFs,
                    cdfChoicePerPeriod,
                    cdfModelPerPeriod,
                    cdfInitial,
                    premiums,
                    lrInputPerOrigin,
                    basisPerOrigin,
                    correctionPerOrigin,
                  }).catch((e) => {
                    alert(
                      "Excel dışa aktarma hatası: " +
                        (e instanceof Error ? e.message : String(e)),
                    );
                  });
                }}
                className="px-3 py-1.5 text-xs font-medium rounded-md bg-[color:var(--surface-alt)] border border-[color:var(--border)] text-[color:var(--muted-strong)] hover:text-[color:var(--foreground)] hover:bg-[color:var(--primary-soft)] transition"
                title="Analizi Excel'e aktar"
              >
                ↓ Excel
              </button>
            )}
          </div>
        </div>
      </div>

      <main className="p-5 max-w-[1600px] w-full mx-auto">
        {tab === "data" && (
          <DataTab
            paidTriangle={effPaid}
            incurredTriangle={effIncurred}
            viewingLarge={isLargeSeg}
          />
        )}
        {tab === "ldf" && (
          <LDFTab
            triangle={triangle}
            window={window}
            excludedCells={excludedCells}
            cdfsOverride={initialCDFs}
            karmaWindowPerStep={pb?.karmaWindowPerStep ?? {}}
            fileData={activeBranch?.fileData}
            prior={priorLDFRef}
            onWindowChange={guardedSetters.setWindow}
            onToggleCell={toggleCellHandler}
            onClearCells={() => setExcludedCellsHandler(new Set())}
            onSetKarmaWindow={guardedSetters.setKarmaWindow}
            onInitKarma={guardedSetters.initKarma}
            onClearKarma={guardedSetters.clearKarma}
          />
        )}
        {tab === "curve" && (
          <CurveTab
            triangle={triangle}
            initialCDFs={initialCDFs}
            effectiveCdfs={cascade.effective}
            selectedLDFs={selectedLDFs}
            cdfInitial={cdfInitial}
            cdfModelPerPeriod={cdfModelPerPeriod}
            curveIncludePerPeriod={curveIncludePerPeriod}
            tailFits={tailFits}
            onSetUserValue={guardedSetters.setCdfInitial}
            onSetModel={guardedSetters.setCdfModel}
            onToggleInclude={guardedSetters.setCurveInclude}
            onReset={guardedSetters.resetCdfInitial}
          />
        )}
        {tab === "bf" && (
          <BFTab
            triangle={triangle}
            selectedLDFs={effectiveLDFs}
            premiums={premiums}
            elrPerOrigin={elrPerOrigin}
            lrInputPerOrigin={lrInputPerOrigin}
            lrErrors={lrErrors}
            correctionPerOrigin={correctionPerOrigin}
            onPremiumChange={(o, v) =>
              guardedSetters.setPremiums(
                (p) => ({ ...p, [o]: v }),
                "premiums_updated",
                { origin: o, value: v },
              )
            }
            onPremiumsBulk={(map) =>
              guardedSetters.setPremiums((p) => ({ ...p, ...map }), "premiums_bulk", {
                count: Object.keys(map).length,
              })
            }
            onLRInputChange={(o, expr) => guardedSetters.setLrInput(o, expr)}
            onCorrectionChange={guardedSetters.setCorrection}
          />
        )}
        {tab === "ultimate" && (
          <UltimateTab
            summary={summary}
            onBasisChange={guardedSetters.setBasis}
          />
        )}
        {tab === "summary" && summary && (
          <SummaryTab
            triangle={triangle}
            branchName={activeBranch.name}
            frequency={activeBranch.frequency}
            periodLabel={activePeriod?.label ?? ""}
            window={window}
            selectedLDFs={effectiveLDFs}
            effectiveCDFs={cascade.effective}
            initialCDFs={initialCDFs}
            excludedCells={excludedCells}
            rows={summary.rows}
            totals={summary.totals}
            curveOverrides={curveOverrides}
            correctionEntries={correctionEntries}
            manualLRCount={manualLRCount}
            bfBasisCount={bfBasisCount}
            exclusionImpacts={exclusionImpacts}
            largeTotals={
              largeOn && largeSummary
                ? {
                    latest: largeSummary.totals.latest,
                    selectedUltimate: largeSummary.totals.selected_ultimate,
                    ibnr: largeSummary.totals.ibnr,
                  }
                : null
            }
            attritionalTotals={
              largeOn && attritionalSummary
                ? {
                    latest: attritionalSummary.totals.latest,
                    selectedUltimate: attritionalSummary.totals.selected_ultimate,
                    ibnr: attritionalSummary.totals.ibnr,
                  }
                : null
            }
          />
        )}
        {tab === "ilr" && (
          <ILRTab
            triangle={triangle}
            premiums={premiums}
            correctionPerOrigin={correctionPerOrigin}
            selectedLDFs={effectiveLDFs}
          />
        )}
        {tab === "freq" && (
          <FrequencySeverityTab
            amountTriangle={effIncurred ?? triangle}
            countTriangle={activeBranch?.countTriangle}
            window={window}
            clIbnr={summary?.totals.ibnr ?? null}
          />
        )}
        {tab === "file" && (
          <FileAnalysisTab
            triangle={triangle}
            fileData={activeBranch?.fileData}
            excludedCells={excludedCells}
          />
        )}
      </main>

      {toggleToast && (
        <ToggleToast
          key={toggleToast.ts}
          origin={toggleToast.origin}
          step={toggleToast.step}
          delta={toggleToast.delta}
          excluded={toggleToast.excluded}
          onClose={() => setToggleToast(null)}
        />
      )}
    </Shell>
  );
}

function ToggleToast({
  origin,
  step,
  delta,
  excluded,
  onClose,
}: {
  origin: string;
  step: number;
  delta: number;
  excluded: boolean;
  onClose: () => void;
}) {
  const ibnrDown = delta < 0;
  const tone = delta === 0
    ? "border-[color:var(--border)] bg-[color:var(--surface)]"
    : ibnrDown
    ? "border-[color:var(--success-border,#16a34a55)] bg-[color:var(--success-soft)]"
    : "border-[color:var(--danger-border,#dc262655)] bg-[color:var(--danger-soft)]";
  const accent = delta === 0
    ? "text-[color:var(--muted-strong)]"
    : ibnrDown
    ? "text-[color:var(--success)]"
    : "text-[color:var(--danger)]";
  const sign = delta > 0 ? "+" : "";

  return (
    <div
      className={
        "fixed top-20 right-6 z-50 w-[300px] card shadow-lg border-2 " + tone
      }
    >
      <div className="p-3 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-wide font-semibold text-[color:var(--muted-strong)]">
            {excluded ? "Hücre elendi" : "Hücre dahil edildi"}
          </div>
          <div className="text-sm font-medium mt-0.5 truncate">
            {origin} · adım {step + 1}→{step + 2}
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-[10px] uppercase text-[color:var(--muted)]">
              IBNR Δ
            </span>
            <span className={"text-base font-semibold tabular " + accent}>
              {sign}
              {formatNumber(delta)}
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-[color:var(--muted)] hover:text-[color:var(--foreground)] text-sm leading-none -mr-1 -mt-1 px-1"
          title="Kapat"
        >
          ×
        </button>
      </div>
    </div>
  );
}

function Shell({
  children,
  onUploaded,
}: {
  children: React.ReactNode;
  onUploaded?: () => void;
}) {
  return (
    <div className="min-h-screen">
      <header className="border-b bg-[color:var(--surface)] px-6 h-14 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-md bg-[color:var(--primary)] grid place-items-center text-white text-[11px] font-bold">
              R
            </div>
            <h1 className="text-sm font-semibold">Rezerv</h1>
          </div>
          <span className="text-[11px] text-[color:var(--muted)] hidden sm:inline">
            Dönem → Model → Branş
          </span>
        </div>
      </header>
      <Breadcrumb onUploaded={onUploaded} />
      {children}
    </div>
  );
}

