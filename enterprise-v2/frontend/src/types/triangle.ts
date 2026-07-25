export type TriangleType = "paid" | "incurred";
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
  triangle_type: TriangleType;
  origin_granularity: Granularity;
  development_granularity: Granularity;
  file_data?: FileData;
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

export interface ChatResponse {
  assistant_message: string;
  tool_invocations: ToolInvocation[];
  actions: AgentAction[];
  stopped_reason: string;
  raw_additions: Record<string, unknown>[];
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
