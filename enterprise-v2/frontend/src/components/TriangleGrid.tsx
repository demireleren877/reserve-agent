"use client";

import { AgGridReact } from "ag-grid-react";
import {
  CellStyleModule,
  ClientSideRowModelModule,
  ModuleRegistry,
  type ColDef,
} from "ag-grid-community";
import { useMemo } from "react";
import type { Triangle } from "@/types/triangle";
import { buildDisplayMatrix, type DisplayMatrix } from "@/lib/triangle-view";

ModuleRegistry.registerModules([ClientSideRowModelModule, CellStyleModule]);

type Props =
  | { matrix: DisplayMatrix; decimals?: number; triangle?: never }
  | { triangle: Triangle; decimals?: number; matrix?: never };

export function TriangleGrid(props: Props) {
  const decimals = props.decimals ?? 0;
  const matrix: DisplayMatrix = useMemo(
    () =>
      props.matrix ??
      buildDisplayMatrix(props.triangle, {
        cumulative: true,
        transposed: false,
        view: "development",
        originLenMonths: props.triangle.origin_granularity === "quarterly" ? 3 : 12,
        devLenMonths:
          props.triangle.development_granularity === "quarterly" ? 3 : 12,
        decimals,
      }),
    [props.matrix, props.triangle, decimals],
  );

  const fmt = useMemo(
    () =>
      new Intl.NumberFormat("tr-TR", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }),
    [decimals],
  );

  // Sütun genişliğini içeriğe göre hesapla — tutarlar KESİLMESİN (ellipsis yok).
  const colWidth = (idx: number): number => {
    let maxChars = matrix.columns[idx]?.length ?? 2;
    for (const r of matrix.rows) {
      const v = r.cells[idx];
      if (v != null) maxChars = Math.max(maxChars, fmt.format(v).length);
    }
    const t = matrix.totals[idx];
    if (t != null) maxChars = Math.max(maxChars, fmt.format(t).length);
    return Math.min(200, Math.max(78, Math.round(maxChars * 8.2) + 26));
  };

  const headerWidth = useMemo(() => {
    let maxChars = matrix.corner.length;
    for (const r of matrix.rows) maxChars = Math.max(maxChars, r.header.length);
    return Math.min(180, Math.max(96, Math.round(maxChars * 8) + 28));
  }, [matrix.corner, matrix.rows]);

  const columnDefs = useMemo<ColDef[]>(() => {
    const isTotal = (p: { data?: { __total?: boolean } }) => !!p.data?.__total;
    const cols: ColDef[] = [
      {
        headerName: matrix.corner,
        field: "header",
        pinned: "left",
        width: headerWidth,
        cellStyle: (p) => ({
          // Total satırında etiket de KALIN olsun (satır stili pinned hücreyi ezemiyor).
          fontWeight: isTotal(p) ? 700 : 500,
          backgroundColor: "var(--surface-alt)",
        }),
      },
    ];
    matrix.columns.forEach((label, idx) => {
      cols.push({
        headerName: label,
        field: `c${idx}`,
        width: colWidth(idx),
        valueFormatter: (p) =>
          p.value == null || p.value === "" ? "" : fmt.format(p.value as number),
        cellStyle: (p) => ({
          color: p.value == null ? "var(--muted)" : "",
          textAlign: "right" as const,
          fontVariantNumeric: "tabular-nums",
          textOverflow: "clip",
          // Total satırı: kalın + hafif dolgu (getRowStyle'a ek garanti — hücre
          // arka planı satır arka planını ezmesin).
          fontWeight: isTotal(p) ? 700 : 400,
          backgroundColor: isTotal(p) ? "var(--surface-alt)" : "transparent",
        }),
        type: "numericColumn",
      });
    });
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matrix, fmt, headerWidth]);

  const rowData = useMemo(() => {
    const rows = matrix.rows.map((r) => {
      const row: Record<string, number | string | null | boolean> = { header: r.header };
      r.cells.forEach((v, j) => {
        row[`c${j}`] = v ?? null;
      });
      return row;
    });
    // Toplam satırı (sütun toplamları) EN ALTTA — normal satır olarak (pinned
    // yerine) garanti görünür.
    const total: Record<string, number | string | null | boolean> = {
      header: "Total",
      __total: true,
    };
    matrix.totals.forEach((v, j) => {
      total[`c${j}`] = v ?? null;
    });
    rows.push(total);
    return rows;
  }, [matrix.rows, matrix.totals]);

  return (
    <div className="ag-theme-quartz" style={{ width: "100%" }}>
      <AgGridReact
        columnDefs={columnDefs}
        rowData={rowData}
        defaultColDef={{ resizable: true, sortable: false }}
        headerHeight={32}
        rowHeight={30}
        domLayout="autoHeight"
        getRowStyle={(p) =>
          (p.data as { __total?: boolean } | undefined)?.__total
            ? {
                fontWeight: 700,
                background: "var(--surface-alt)",
                borderTop: "2px solid var(--border-strong)",
              }
            : undefined
        }
      />
    </div>
  );
}
