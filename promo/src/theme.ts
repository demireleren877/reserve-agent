// Actuarius marka paleti (koyu tema — video için) ve tipografi.
export const C = {
  bg0: "#080d19",
  bg1: "#0a1122",
  bg2: "#0f1c37",
  ink: "#eef2fa",
  inkSoft: "#b3bfd6",
  muted: "#7f8ea9",
  accent: "#5b8bff",
  accentDeep: "#3f6fe6",
  accentSoft: "rgba(91,139,255,0.14)",
  line: "rgba(120,150,210,0.20)",
  good: "#5fe39a",
  warn: "#f2b866",
  chip: "rgba(120,150,210,0.10)",
};

export const FONT_SERIF =
  '"Iowan Old Style","Palatino Linotype",Palatino,"Book Antiqua",Georgia,"Times New Roman",serif';
export const FONT_SANS =
  'ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif';
export const FONT_MONO =
  'ui-monospace,"SF Mono","Cascadia Code",Menlo,Consolas,monospace';

// 30x30 gelişim üçgeni marka işareti — kare konumları (birim koordinat)
export const MARK_CELLS: { x: number; y: number }[] = [
  { x: 0, y: 0 }, { x: 11, y: 0 }, { x: 22, y: 0 },
  { x: 0, y: 11 }, { x: 11, y: 11 },
  { x: 0, y: 22 },
];
