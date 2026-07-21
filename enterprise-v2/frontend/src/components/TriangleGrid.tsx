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

  const columnDefs = useMemo<ColDef[]>(() => {
    const cols: ColDef[] = [
      {
        headerName: matrix.corner,
        field: "header",
        pinned: "left",
        width: 120,
        cellStyle: { fontWeight: 500, backgroundColor: "var(--surface-alt)" },
      },
    ];
    matrix.columns.forEach((label, idx) => {
      cols.push({
        headerName: label,
        field: `c${idx}`,
        flex: 1,
        minWidth: 82,
        valueFormatter: (p) =>
          p.value == null || p.value === "" ? "" : fmt.format(p.value as number),
        cellStyle: (p) => ({
          color: p.value == null ? "var(--muted)" : "",
          textAlign: "right" as const,
          fontVariantNumeric: "tabular-nums",
        }),
        type: "numericColumn",
      });
    });
    return cols;
  }, [matrix.corner, matrix.columns, fmt]);

  const rowData = useMemo(() => {
    return matrix.rows.map((r) => {
      const row: Record<string, number | string | null> = { header: r.header };
      r.cells.forEach((v, j) => {
        row[`c${j}`] = v ?? null;
      });
      return row;
    });
  }, [matrix.rows]);

  const pinnedBottom = useMemo(() => {
    const row: Record<string, number | string | null> = { header: "Toplam" };
    matrix.totals.forEach((v, j) => {
      row[`c${j}`] = v ?? null;
    });
    return [row];
  }, [matrix.totals]);

  return (
    <div className="ag-theme-quartz" style={{ width: "100%" }}>
      <AgGridReact
        columnDefs={columnDefs}
        rowData={rowData}
        pinnedBottomRowData={pinnedBottom}
        defaultColDef={{ resizable: true, sortable: false }}
        headerHeight={32}
        rowHeight={30}
        domLayout="autoHeight"
        getRowStyle={(p) =>
          p.node.rowPinned === "bottom"
            ? {
                fontWeight: 600,
                background: "var(--surface-alt)",
                borderTop: "2px solid var(--border-strong)",
              }
            : undefined
        }
      />
    </div>
  );
}
