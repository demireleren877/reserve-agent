import ExcelJS from "exceljs";
import { downloadFile } from "@/lib/download";
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

// ── Tema renkleri (ARGB) ──
const C = {
  primary: "FF1D4ED8",
  primarySoft: "FFEAF0FF",
  headerText: "FFFFFFFF",
  triHeader: "FF334155",
  zebra: "FFF7F9FB",
  diagonal: "FFFFF7E6",
  ibnr: "FF1D4ED8",
  border: "FFE2E5EA",
  borderStrong: "FFCBD1D9",
  totalFill: "FFEAF0FF",
};

const F_MONEY = "#,##0";
const F_FACTOR = "0.0000";
const F_PCT = "0.0%";
const F_K = "0.000";

type Cell = ExcelJS.Cell;

function thinBorder(): Partial<ExcelJS.Borders> {
  const s: ExcelJS.Border = { style: "thin", color: { argb: C.border } };
  return { top: s, left: s, bottom: s, right: s };
}

function fill(cell: Cell, argb: string) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
}

/** Başlık satırını renklendirir (mavi zemin, beyaz kalın). */
function styleHeaderRow(row: ExcelJS.Row, argb = C.primary) {
  row.eachCell((cell) => {
    fill(cell, argb);
    cell.font = { bold: true, color: { argb: C.headerText }, size: 11 };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = thinBorder();
  });
  row.height = 20;
}

function setCols(ws: ExcelJS.Worksheet, widths: number[]) {
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });
}

/** Üçgen sheet'i — renkli başlık, para formatı, son köşegen vurgusu. */
function addTriangleSheet(
  wb: ExcelJS.Workbook,
  tri: Triangle,
  sheetName: string,
  incremental = false,
) {
  const values = incremental
    ? tri.values.map((row) =>
        row.map((v, j) => {
          if (v == null) return null;
          if (j === 0) return v;
          const prev = row[j - 1];
          return prev != null ? v - prev : null;
        }),
      )
    : tri.values;

  const ws = wb.addWorksheet(sheetName);
  const header = ["Accident Year", ...tri.development_periods.map((_, i) => `Dev ${i + 1}`)];
  const hRow = ws.addRow(header);
  styleHeaderRow(hRow, C.triHeader);

  // son köşegen (rapor dönemi) sütun indeksleri
  const lastIdx = values.map((row) => {
    let li = -1;
    for (let j = 0; j < row.length; j++) if (row[j] != null) li = j;
    return li;
  });

  tri.origin_periods.forEach((o, i) => {
    const r = ws.addRow([o, ...values[i].map((v) => (v != null ? Math.round(v) : null))]);
    r.getCell(1).font = { bold: true };
    r.getCell(1).border = thinBorder();
    for (let j = 0; j < values[i].length; j++) {
      const cell = r.getCell(j + 2);
      cell.numFmt = F_MONEY;
      cell.border = thinBorder();
      if (j === lastIdx[i] && values[i][j] != null) fill(cell, C.diagonal);
    }
  });

  setCols(ws, header.map((_, i) => (i === 0 ? 13 : 12)));
  ws.views = [{ state: "frozen", xSplit: 1, ySplit: 1 }];
}

export async function exportToExcel(data: ExportData): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Actuarius Enterprise";
  wb.created = new Date();
  const tri = data.triangle;

  // ══ 1. Özet (FORMÜLLÜ) ══
  const ws = wb.addWorksheet("Summary");
  const titleRow = ws.addRow([
    `${data.branchName} — ${data.periodLabel} (${data.frequency === "quarterly" ? "Quarterly" : "Yearly"})`,
  ]);
  titleRow.getCell(1).font = { bold: true, size: 13, color: { argb: C.primary } };
  ws.addRow([]);

  const header = [
    "Accident Year", "Latest Value", "Premium", "Annual Premium", "Correction (k)",
    "CDF", "% Developed", "CL Ultimate", "BF Ultimate", "Selected Ult",
    "IBNR", "Basis", "Selected LR", "ULR",
  ];
  const hdrRow = ws.addRow(header);
  styleHeaderRow(hdrRow);

  const firstData = hdrRow.number + 1; // 4
  data.rows.forEach((r, idx) => {
    const rn = firstData + idx;
    const row = ws.addRow([
      r.origin,
      r.latest,
      r.premium > 0 ? r.premium : null,
      r.premium_annual > 0 ? r.premium_annual : null,
      r.correction !== 1 ? r.correction : null,
      r.cdf,
      { formula: `IFERROR(B${rn}/H${rn},"")` },       // % Gelişmiş = Latest/CL
      { formula: `B${rn}*F${rn}` },                    // CL Ultimate = Latest*CDF
      r.bf_ultimate,                                   // BF Ultimate (değer)
      { formula: `IF(L${rn}="BF",I${rn},H${rn})` },    // Seçilen = baz'a göre
      { formula: `J${rn}-B${rn}` },                    // IBNR = Seçilen − Latest
      r.basis.toUpperCase(),
      r.selected_lr,
      { formula: `IFERROR(J${rn}/C${rn},"")` },        // ULR = Seçilen/Prim
    ]);
    row.eachCell((cell) => (cell.border = thinBorder()));
    row.getCell(1).font = { bold: true };
    [2, 3, 4, 8, 9, 10, 11].forEach((c) => (row.getCell(c).numFmt = F_MONEY));
    row.getCell(5).numFmt = F_K;
    row.getCell(6).numFmt = F_FACTOR;
    row.getCell(7).numFmt = F_PCT;
    row.getCell(13).numFmt = F_PCT;
    row.getCell(14).numFmt = F_PCT;
    row.getCell(11).font = { bold: true, color: { argb: C.ibnr } };
    row.getCell(12).alignment = { horizontal: "center" };
    if (idx % 2 === 1) row.eachCell((cell) => { if (!cell.fill) fill(cell, C.zebra); });
  });

  const lastData = firstData + data.rows.length - 1;
  const totRn = lastData + 2;
  ws.addRow([]);
  const totalRow = ws.addRow([
    "TOTAL",
    { formula: `SUM(B${firstData}:B${lastData})` },
    { formula: `SUM(C${firstData}:C${lastData})` },
    { formula: `SUM(D${firstData}:D${lastData})` },
    null, null,
    { formula: `IFERROR(B${totRn}/H${totRn},"")` },
    { formula: `SUM(H${firstData}:H${lastData})` },
    { formula: `SUM(I${firstData}:I${lastData})` },
    { formula: `SUM(J${firstData}:J${lastData})` },
    { formula: `SUM(K${firstData}:K${lastData})` },
    null, null,
    { formula: `IFERROR(J${totRn}/C${totRn},"")` },
  ]);
  totalRow.eachCell((cell) => {
    cell.font = { bold: true };
    fill(cell, C.totalFill);
    cell.border = { top: { style: "medium", color: { argb: C.borderStrong } } };
  });
  [2, 3, 4, 8, 9, 10, 11].forEach((c) => (totalRow.getCell(c).numFmt = F_MONEY));
  totalRow.getCell(7).numFmt = F_PCT;
  totalRow.getCell(14).numFmt = F_PCT;
  totalRow.getCell(11).font = { bold: true, color: { argb: C.ibnr } };

  setCols(ws, [12, 12, 12, 12, 11, 10, 11, 13, 13, 13, 13, 8, 11, 9]);
  ws.views = [{ state: "frozen", ySplit: 3 }];

  // ══ 2. LDF-CDF ══
  if (tri) {
    const s = wb.addWorksheet("LDF-CDF");
    styleHeaderRow(s.addRow(["Development Period", "Selected LDF", "Effective CDF"]));
    tri.development_periods.forEach((_, i) => {
      const row = s.addRow([
        i + 1,
        i < data.selectedLDFs.length ? data.selectedLDFs[i] : null,
        i < data.effectiveCDFs.length ? data.effectiveCDFs[i] : 1,
      ]);
      row.getCell(2).numFmt = "0.00000";
      row.getCell(3).numFmt = "0.00000";
      row.eachCell((c) => (c.border = thinBorder()));
    });
    setCols(s, [16, 14, 14]);
  }

  // ══ 3. Curve ══
  if (tri && data.selectedLDFs.length) {
    const devs = tri.development_periods;
    const ex = fitExponential(data.selectedLDFs);
    const ip = fitInversePower(data.selectedLDFs);
    const pw = fitPower(data.selectedLDFs);
    const wbl = fitWeibull(data.selectedLDFs);
    const modelNames: Record<number, string> = {
      1: "Initial", 2: "Exp.Decay", 3: "Inv.Power", 4: "Power", 5: "Weibull", 6: "User",
    };
    const s = wb.addWorksheet("Curve");
    styleHeaderRow(
      s.addRow([
        "Dev.", "Initial CDF", "Exp. Decay", "Inv. Power", "Power",
        "Weibull", "User Value", "Model", "Selected CDF", "Cumul%", "Incr%",
      ]),
    );
    let prevCumul = 0;
    devs.forEach((d, i) => {
      const key = String(d);
      const model = data.cdfModelPerPeriod?.[key] ?? (data.cdfChoicePerPeriod[key] === "user" ? 6 : 1);
      const initCDF = i < data.initialCDFs.length ? data.initialCDFs[i] : 1;
      const expCDF = ex.ok && i < ex.cdfs.length ? ex.cdfs[i] : null;
      const ipCDF = ip.ok && i < ip.cdfs.length ? ip.cdfs[i] : null;
      const pwCDF = pw.ok && i < pw.cdfs.length ? pw.cdfs[i] : null;
      const wbCDF = wbl.ok && i < wbl.cdfs.length ? wbl.cdfs[i] : null;
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
      const row = s.addRow([
        i + 1, initCDF, expCDF, ipCDF, pwCDF, wbCDF, userCDF,
        modelNames[model] ?? String(model), selCDF, cumulPct / 100, incrPct / 100,
      ]);
      for (let c = 2; c <= 9; c++) if (c !== 8) row.getCell(c).numFmt = F_FACTOR;
      row.getCell(10).numFmt = "0.00%";
      row.getCell(11).numFmt = "0.00%";
      row.getCell(8).alignment = { horizontal: "center" };
      if (model !== 1) row.getCell(8).font = { bold: true, color: { argb: C.primary } };
      row.eachCell((c) => (c.border = thinBorder()));
    });
    setCols(s, [7, 13, 12, 12, 12, 12, 12, 11, 13, 11, 11]);
  }

  // ══ 4. ILR (%) ══
  if (tri && tri.origin_periods.some((o) => (data.premiums[o] ?? 0) > 0)) {
    const devs = tri.development_periods;
    const s = wb.addWorksheet("ILR (%)");
    styleHeaderRow(s.addRow(["Accident Year", "Premium (adj.)", ...devs.map((_, i) => `Dev ${i + 1}`)]));
    tri.origin_periods.forEach((origin, i) => {
      const rawPrem = data.premiums[origin] ?? 0;
      const k = (data.correctionPerOrigin[origin] ?? 0) > 0 ? data.correctionPerOrigin[origin] : 1;
      const adjPrem = rawPrem * k;
      const cells = tri.values[i].map((v) =>
        v != null && adjPrem > 0 ? (v / adjPrem) : null,
      );
      const row = s.addRow([origin, adjPrem > 0 ? Math.round(adjPrem) : null, ...cells]);
      row.getCell(1).font = { bold: true };
      row.getCell(2).numFmt = F_MONEY;
      for (let j = 0; j < cells.length; j++) row.getCell(j + 3).numFmt = F_PCT;
      row.eachCell((c) => (c.border = thinBorder()));
    });
    setCols(s, [12, 14, ...devs.map(() => 10)]);
    s.views = [{ state: "frozen", xSplit: 1, ySplit: 1 }];
  }

  // ══ 5. BF Girdileri ══
  if (tri) {
    const s = wb.addWorksheet("BF Girdileri");
    styleHeaderRow(s.addRow(["Accident Year", "Premium", "Correction k", "Annual Premium", "Basis", "Selected LR"]));
    tri.origin_periods.forEach((origin) => {
      const rawPrem = data.premiums[origin] ?? 0;
      const k = (data.correctionPerOrigin[origin] ?? 0) > 0 ? data.correctionPerOrigin[origin] : 1;
      const row = s.addRow([
        origin,
        rawPrem > 0 ? Math.round(rawPrem) : null,
        k !== 1 ? k : null,
        rawPrem > 0 ? Math.round(rawPrem * k) : null,
        (data.basisPerOrigin[origin] ?? "cl").toUpperCase(),
        data.lrInputPerOrigin[origin] ? data.lrInputPerOrigin[origin] + "%" : "",
      ]);
      row.getCell(1).font = { bold: true };
      row.getCell(2).numFmt = F_MONEY;
      row.getCell(3).numFmt = F_K;
      row.getCell(4).numFmt = F_MONEY;
      row.getCell(5).alignment = { horizontal: "center" };
      row.eachCell((c) => (c.border = thinBorder()));
    });
    setCols(s, [12, 14, 12, 14, 10, 12]);
  }

  // ══ 6–9. Üçgenler ══
  const paid = data.paidTriangle;
  const incurred = data.incurredTriangle;
  if (paid) {
    addTriangleSheet(wb, paid, "Cumulative Paid");
    addTriangleSheet(wb, paid, "Incremental Paid", true);
  } else if (tri?.triangle_type === "paid") {
    addTriangleSheet(wb, tri, "Cumulative Paid");
    addTriangleSheet(wb, tri, "Incremental Paid", true);
  }
  if (incurred) {
    addTriangleSheet(wb, incurred, "Incurred");
  } else if (tri?.triangle_type === "incurred") {
    addTriangleSheet(wb, tri, "Incurred");
  }
  if (
    paid && incurred &&
    paid.origin_periods.length === incurred.origin_periods.length &&
    paid.development_periods.length === incurred.development_periods.length
  ) {
    const muallakTri: Triangle = {
      ...incurred,
      values: incurred.values.map((row, i) =>
        row.map((inc, j) => {
          const p = paid.values[i]?.[j];
          return inc != null && p != null ? inc - p : null;
        }),
      ),
    };
    addTriangleSheet(wb, muallakTri, "Outstanding");
  }

  // ── İndir ──
  const filename = `${data.periodLabel}_${data.branchName}_rezerv.xlsx`.replace(
    /[/\\:*?"<>|]/g,
    "_",
  );
  const buf = await wb.xlsx.writeBuffer();
  await downloadFile(buf as ArrayBuffer, filename);
}
