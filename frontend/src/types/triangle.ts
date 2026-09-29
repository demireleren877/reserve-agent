export type TriangleType = "paid" | "incurred";
export type ModelBasis = "paid" | "outstanding" | "incurred";
export type Granularity = "yearly" | "quarterly";
export type LDFMethod = "volume_weighted" | "simple_average" | "geometric_average";

/** Dosya kırılımı leaf'i. Yeni backend: {p: ödeme, o: muallak}. Eski veri/roll-forward:
 *  sadece sayı (ödeme). Okurken filePaid/fileOs/fileIncurred kullan — ikisini de kabul eder. */
export interface FileLeafPO {
  p: number;
  o: number;
}
export type FileLeaf = number | FileLeafPO;
export type FileData = Record<string, Record<string, Record<string, FileLeaf>>>;

export function filePaid(v: FileLeaf | undefined): number {
  return typeof v === "number" ? v : v?.p ?? 0;
}
export function fileOs(v: FileLeaf | undefined): number {
  return typeof v === "number" ? 0 : v?.o ?? 0;
}
export function fileIncurred(v: FileLeaf | undefined): number {
  return filePaid(v) + fileOs(v);
}

export interface Triangle {
  origin_periods: string[];
  development_periods: number[];
  values: (number | null)[][];
  triangle_type: ModelBasis;
  origin_granularity: Granularity;
  development_granularity: Granularity;
  file_data?: FileData;
}

/** Outstanding is a period-end stock: cumulative incurred minus cumulative paid. */
export function deriveOutstandingTriangle(
  paid: Triangle | null | undefined,
  incurred: Triangle | null | undefined,
): Triangle | null {
  if (!paid || !incurred) return null;
  if (
    paid.origin_periods.length !== incurred.origin_periods.length ||
    paid.development_periods.length !== incurred.development_periods.length
  ) return null;
  return {
    ...incurred,
    triangle_type: "outstanding",
    values: incurred.values.map((row, i) =>
      row.map((inc, j) => {
        const p = paid.values[i]?.[j];
        return inc != null && p != null ? inc - p : null;
      }),
    ),
  };
}

export function selectModelTriangle(
  paid: Triangle | null | undefined,
  incurred: Triangle | null | undefined,
  basis: ModelBasis,
): Triangle | null {
  if (basis === "paid") return paid ?? null;
  if (basis === "outstanding") return deriveOutstandingTriangle(paid, incurred);
  return incurred ?? null;
}

export function fileValueForBasis(v: FileLeaf | undefined, basis: ModelBasis): number {
  if (basis === "paid") return filePaid(v);
  if (basis === "outstanding") return fileOs(v);
  return fileIncurred(v);
}

export interface ComputeResponse {
  method: string;
  n_origins: number;
  origin_periods: string[];
  ldfs: number[];
  cdfs: number[];
  latest_per_origin: number[];
  ultimate_per_origin: number[];
  reserve_per_origin: number[];
  total_latest: number;
  total_ultimate: number;
  total_reserve: number;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ToolInvocation {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  output: Record<string, unknown>;
}

export interface AgentAction {
  type: string;
  module?: string | null;
  payload: Record<string, unknown>;
}

export interface AgentFormOption {
  value: string;
  label: string;
}

export interface AgentFormField {
  id: string;
  label: string;
  type: "select" | "multiselect" | "text" | "number";
  options?: AgentFormOption[];
  default?: string | string[] | number | null;
  hint?: string;
}

export interface AgentForm {
  title: string;
  submit_label?: string;
  fields: AgentFormField[];
}

export interface ChatResponse {
  assistant_message: string;
  tool_invocations: ToolInvocation[];
  actions: AgentAction[];
  stopped_reason: string;
  raw_additions: Record<string, unknown>[];
  // ask_user ile istenen yapısal form — doluysa chat'te tıklanabilir gösterilir.
  form?: AgentForm | null;
}

export interface ModelOption {
  id: string;
  label: string;
}

export interface ModelsResponse {
  models: ModelOption[];
  default: string;
}

export interface UploadOptions {
  triangle_type: TriangleType;
  origin_granularity: Granularity;
  development_granularity: Granularity;
  cumulative: boolean;
}
