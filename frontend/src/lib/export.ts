import * as XLSX from "xlsx";
import type { Triangle } from "@/types/triangle";
import type { BranchOriginRow } from "@/lib/reserve-pipeline";
import { fitInversePower, fitExponential, fitPower, fitWeibull } from "@/lib/tail-fit";

export interface ExportData {
  branchName: string;
  periodLabel: string;
  frequency: string;
  triangle: Triangle | null;
  paidTriangle: Triangle | null;
  incurredTriangle: Triangle | null;
  rows: BranchOriginRow[];
  totals: {
    latest: number;
    exposure_raw: number;
    exposure_annual: number;
    cl_ultimate: number;
    bf_ultimate: number;
    selected_ultimate: number;
    ibnr: number;
    ulr: number | null;
  } | null;
  selectedLDFs: number[];
  effectiveCDFs: number[];
  initialCDFs: number[];
  cdfChoicePerPeriod: Record<string, "initial" | "user">;
  cdfModelPerPeriod?: Record<string, 1 | 2 | 3 | 4 | 5 | 6>;
  cdfInitial: Record<string, number>;
  premiums: Record<string, number>;
  lrInputPerOrigin: Record<string, string>;
  basisPerOrigin: Record<string, "cl" | "bf">;
  correctionPerOrigin: Record<string, number>;
}

function fmt(v: number | null | undefined): number | string {
  if (v == null) return "";
  return Math.round(v);
}

function pct(v: number | null | undefined, decimals = 1): string {
  if (v == null) return "";
  return (v * 100).toFixed(decimals) + "%";
}

function triSheet(tri: Triangle, label: string, incremental = false): XLSX.WorkSheet {
  const values = incremental
    ? tri.values.map(row => row.map((v, j) => {
        if (v == null) return null;
        if (j === 0) return v;
        const prev = row[j - 1];
        return prev != null ? v - prev : null;
      }))
    : tri.values;

  const header = [label, ...tri.development_periods.map((d, i) => `Dev ${i + 1}`)];
  const rows = tri.origin_periods.map((o, i) => [
    o,
    ...values[i].map(v => (v != null ? Math.round(v) : "")),
  ]);
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws["!cols"] = header.map(() => ({ wch: 12 }));
  return ws;
}

export function exportToExcel(data: ExportData): void {
  const wb = XLSX.utils.book_new();
  const tri = data.triangle;

  // ── 1. Özet ───────────────────────────────────────────────────────────────
  const summaryHeader = [
    "Kaza Yılı", "Son Değer", "Prim", "Yıllık Prim", "Düzeltme (k)",
    "CDF", "% Gelişmiş", "CL Ultimate", "BF Ultimate", "Seçilen Ult",
    "IBNR", "Baz", "Seçilen LR", "ULR",
  ];
  const summaryRows = data.rows.map(r => [
    r.origin,
    fmt(r.latest),
    fmt(r.premium),
    fmt(r.premium_annual),
    r.correction !== 1 ? r.correction.toFixed(3) : "",
    r.cdf.toFixed(4),
    pct(r.pct_developed),
    fmt(r.cl_ultimate),
    fmt(r.bf_ultimate),
    fmt(r.selected_ultimate),
    fmt(r.ibnr),
    r.basis.toUpperCase(),
    pct(r.selected_lr),
    r.ulr != null ? pct(r.ulr) : "",
  ]);
  if (data.totals) {
    summaryRows.push([]);
    summaryRows.push([
      "TOPLAM",
      fmt(data.totals.latest),
      fmt(data.totals.exposure_raw),
      fmt(data.totals.exposure_annual),
      "", "", "",
      fmt(data.totals.cl_ultimate),
      fmt(data.totals.bf_ultimate),
      fmt(data.totals.selected_ultimate),
      fmt(data.totals.ibnr),
      "", "",
      data.totals.ulr != null ? pct(data.totals.ulr) : "",
    ]);
  }
  const summarySheet = XLSX.utils.aoa_to_sheet([
    [`${data.branchName} — ${data.periodLabel} (${data.frequency === "quarterly" ? "Çeyreklik" : "Yıllık"})`],
    [],
    summaryHeader,
    ...summaryRows,
  ]);
  summarySheet["!cols"] = summaryHeader.map((_, i) => ({ wch: i === 0 ? 12 : i >= 7 ? 14 : 10 }));
  XLSX.utils.book_append_sheet(wb, summarySheet, "Özet");

  // ── 2. LDF-CDF ────────────────────────────────────────────────────────────
  if (tri) {
    const devs = tri.development_periods;
    const header = ["Gelişim Dönemi", "Seçilen LDF", "Efektif CDF"];
    const rows = devs.map((d, i) => [
      String(d),
      i < data.selectedLDFs.length ? data.selectedLDFs[i].toFixed(5) : "",
      i < data.effectiveCDFs.length ? data.effectiveCDFs[i].toFixed(5) : "1.00000",
    ]);
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    ws["!cols"] = [{ wch: 16 }, { wch: 14 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws, "LDF-CDF");
  }

  // ── 3. Curve ──────────────────────────────────────────────────────────────
  if (tri && data.selectedLDFs.length) {
    const devs = tri.development_periods;
    const ex = fitExponential(data.selectedLDFs);
    const ip = fitInversePower(data.selectedLDFs);
    const pw = fitPower(data.selectedLDFs);
    const wb_ = fitWeibull(data.selectedLDFs);

    const modelNames: Record<number, string> = {
      1: "Initial", 2: "Exp.Decay", 3: "Inv.Power", 4: "Power", 5: "Weibull", 6: "User",
    };
    const header = [
      "Dev.", "Initial CDF", "Exp. Decay CDF", "Inv. Power CDF", "Power CDF",
      "Weibull CDF", "User Value", "Model", "Selected CDF", "Cumul%", "Incr%",
    ];
    let prevCumul = 0;
    const rows = devs.map((d, i) => {
      const key = String(d);
      const model = data.cdfModelPerPeriod?.[key] ?? (data.cdfChoicePerPeriod[key] === "user" ? 6 : 1);
      const initCDF = i < data.initialCDFs.length ? data.initialCDFs[i] : 1;
      const expCDF = ex.ok && i < ex.cdfs.length ? ex.cdfs[i] : null;
      const ipCDF = ip.ok && i < ip.cdfs.length ? ip.cdfs[i] : null;
      const pwCDF = pw.ok && i < pw.cdfs.length ? pw.cdfs[i] : null;
      const wbCDF = wb_.ok && i < wb_.cdfs.length ? wb_.cdfs[i] : null;
      const userCDF = data.cdfInitial[key] ?? null;
      const selCDF =
        model === 2 ? (expCDF ?? initCDF)
        : model === 3 ? (ipCDF ?? initCDF)
        : model === 4 ? (pwCDF ?? initCDF)
        : model === 5 ? (wbCDF ?? initCDF)
        : model === 6 ? (userCDF ?? 1)
        : initCDF;
      const cumulPct = selCDF > 0 ? 100 / selCDF : 0;
      const incrPct = cumulPct - prevCumul;
      prevCumul = cumulPct;
      return [
        i + 1,
        initCDF,
        expCDF ?? "",
        ipCDF ?? "",
        pwCDF ?? "",
        wbCDF ?? "",
        userCDF ?? "",
        modelNames[model] ?? String(model),
        selCDF,
        cumulPct / 100,
        incrPct / 100,
      ];
    });
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    ws["!cols"] = header.map(() => ({ wch: 14 }));
    for (let r = 1; r <= rows.length; r++) {
      const cumAddr = XLSX.utils.encode_cell({ r, c: 9 });
      const incrAddr = XLSX.utils.encode_cell({ r, c: 10 });
      if (ws[cumAddr]) ws[cumAddr].z = "0.00%";
      if (ws[incrAddr]) ws[incrAddr].z = "0.00%";
    }
    XLSX.utils.book_append_sheet(wb, ws, "Curve");
  }

  // ── 4. ILR ────────────────────────────────────────────────────────────────
  if (tri && tri.origin_periods.some(o => (data.premiums[o] ?? 0) > 0)) {
    const devs = tri.development_periods;
    const header = ["Kaza Yılı", "Prim (düz.)", ...devs.map((_, i) => `Dev ${i + 1}`)];
    const rows = tri.origin_periods.map((origin, i) => {
      const rawPrem = data.premiums[origin] ?? 0;
      const k = (data.correctionPerOrigin[origin] ?? 0) > 0 ? data.correctionPerOrigin[origin] : 1;
      const adjPrem = rawPrem * k;
      const ilrCells = tri.values[i].map(v =>
        v != null && adjPrem > 0 ? parseFloat(((v / adjPrem) * 100).toFixed(2)) : "",
      );
      return [origin, adjPrem > 0 ? Math.round(adjPrem) : "", ...ilrCells];
    });
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    ws["!cols"] = header.map((_, i) => ({ wch: i < 2 ? 14 : 10 }));
    XLSX.utils.book_append_sheet(wb, ws, "ILR (%)");
  }

  // ── 5. BF Girdileri ───────────────────────────────────────────────────────
  if (tri) {
    const header = ["Kaza Yılı", "Prim", "Düzeltme k", "Yıllık Prim", "Temel", "Seçilen LR"];
    const rows = tri.origin_periods.map(origin => {
      const rawPrem = data.premiums[origin] ?? 0;
      const k = (data.correctionPerOrigin[origin] ?? 0) > 0 ? data.correctionPerOrigin[origin] : 1;
      return [
        origin,
        rawPrem > 0 ? Math.round(rawPrem) : "",
        k !== 1 ? k : "",
        rawPrem > 0 ? Math.round(rawPrem * k) : "",
        (data.basisPerOrigin[origin] ?? "cl").toUpperCase(),
        data.lrInputPerOrigin[origin] ? data.lrInputPerOrigin[origin] + "%" : "",
      ];
    });
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    ws["!cols"] = header.map((_, i) => ({ wch: i === 0 ? 12 : 14 }));
    XLSX.utils.book_append_sheet(wb, ws, "BF Girdileri");
  }

  // ── 6–9. Üçgenler ─────────────────────────────────────────────────────────
  const paid = data.paidTriangle;
  const incurred = data.incurredTriangle;

  if (paid) {
    XLSX.utils.book_append_sheet(wb, triSheet(paid, "Kaza Yılı"), "Kümülatif Ödeme");
    XLSX.utils.book_append_sheet(wb, triSheet(paid, "Kaza Yılı", true), "Artımsal Ödeme");
  } else if (tri?.triangle_type === "paid") {
    XLSX.utils.book_append_sheet(wb, triSheet(tri, "Kaza Yılı"), "Kümülatif Ödeme");
    XLSX.utils.book_append_sheet(wb, triSheet(tri, "Kaza Yılı", true), "Artımsal Ödeme");
  }

  if (incurred) {
    XLSX.utils.book_append_sheet(wb, triSheet(incurred, "Kaza Yılı"), "Gerçekleşen");
  } else if (tri?.triangle_type === "incurred") {
    XLSX.utils.book_append_sheet(wb, triSheet(tri, "Kaza Yılı"), "Gerçekleşen");
  }

  // Muallak = incurred - paid (only when both are available)
  if (paid && incurred &&
    paid.origin_periods.length === incurred.origin_periods.length &&
    paid.development_periods.length === incurred.development_periods.length) {
    const muallakTri: Triangle = {
      ...incurred,
      values: incurred.values.map((row, i) =>
        row.map((inc, j) => {
          const p = paid.values[i]?.[j];
          return inc != null && p != null ? inc - p : null;
        }),
      ),
    };
    XLSX.utils.book_append_sheet(wb, triSheet(muallakTri, "Kaza Yılı"), "Muallak");
  }

  const filename = `${data.periodLabel}_${data.branchName}_rezerv.xlsx`
    .replace(/[/\\:*?"<>|]/g, "_");
  XLSX.writeFile(wb, filename);
}
