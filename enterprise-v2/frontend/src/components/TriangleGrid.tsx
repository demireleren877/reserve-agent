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
import { formatNumber } from "@/lib/api";

ModuleRegistry.registerModules([ClientSideRowModelModule, CellStyleModule]);

interface Props {
  triangle: Triangle;
}

export function TriangleGrid({ triangle }: Props) {
  const columnDefs = useMemo<ColDef[]>(() => {
    const cols: ColDef[] = [
      {
        headerName: "Kaza",
        field: "origin",
        pinned: "left",
        width: 95,
        cellStyle: { fontWeight: 500, backgroundColor: "var(--surface-alt)" },
      },
    ];
    triangle.development_periods.forEach((dev, idx) => {
      cols.push({
        headerName: `${idx + 1}`,
        field: `dev_${dev}`,
        flex: 1,
        minWidth: 85,
        valueFormatter: (p) => formatNumber(p.value),
        cellStyle: (p) => ({
          color: p.value == null ? "var(--muted)" : "",
          background: p.value == null ? "transparent" : "",
          textAlign: "right" as const,
          fontVariantNumeric: "tabular-nums",
        }),
        type: "numericColumn",
      });
    });
    return cols;
  }, [triangle.development_periods]);

  const rowData = useMemo(() => {
    return triangle.origin_periods.map((origin, i) => {
      const row: Record<string, number | string | null> = { origin };
      triangle.development_periods.forEach((dev, j) => {
        row[`dev_${dev}`] = triangle.values[i][j] ?? null;
      });
      return row;
    });
  }, [triangle]);

  return (
    // autoHeight: grid tüm kaza yıllarını gösterir (kendi dikey scroll'u yok),
    // dikey kaydırma SAYFADA olur. Yatay (dev sütunları) grid'de kalır.
    <div className="ag-theme-quartz" style={{ width: "100%" }}>
      <AgGridReact
        columnDefs={columnDefs}
        rowData={rowData}
        defaultColDef={{ resizable: true, sortable: false }}
        headerHeight={32}
        rowHeight={30}
        domLayout="autoHeight"
      />
    </div>
  );
}
