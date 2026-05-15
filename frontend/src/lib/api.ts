import type {
  ChatMessage,
  ChatResponse,
  ComputeResponse,
  LDFMethod,
  ModelsResponse,
  Triangle,
  UploadOptions,
} from "@/types/triangle";
import { getFirebaseAuth } from "@/lib/auth/firebase";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || "https://actuarial-api.onrender.com";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = getFirebaseAuth().currentUser;
  if (!user) return {};
  try {
    const token = await user.getIdToken();
    return { Authorization: `Bearer ${token}` };
  } catch {
    return {};
  }
}

export async function uploadExcel(
  file: File,
  opts: UploadOptions,
): Promise<{ triangle: Triangle; warnings: string[]; file_data?: Record<string, Record<string, Record<string, number>>> | null }> {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("Dosya 10 MB sınırını aşıyor");
  const buffer = await file.arrayBuffer();
  const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
  const authHeaders = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/v1/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify({
      file_b64: base64,
      triangle_type: opts.triangle_type,
      origin_granularity: opts.origin_granularity,
      development_granularity: opts.development_granularity,
      cumulative: opts.cumulative,
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: "Yükleme hatası" }));
    throw new Error(body.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export interface ComputeOptions {
  method?: LDFMethod;
  n_years?: number | null;
  excluded_origins?: string[];
  ldf_override?: number[] | null;
}

export async function compute(
  triangle: Triangle,
  opts: ComputeOptions = {},
): Promise<ComputeResponse> {
  const body = {
    triangle,
    method: opts.method ?? "volume_weighted",
    n_years: opts.n_years ?? null,
    excluded_origins: opts.excluded_origins ?? [],
    ldf_override: opts.ldf_override ?? null,
  };
  const authHeaders = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/v1/compute`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Hesaplama hatası" }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export interface SessionState {
  method: string;
  window: string;
  excluded_cells: { origin: string; step: number }[];
  selected_ldfs: number[];
  cdfs: number[];
  total_latest: number | null;
  total_ultimate: number | null;
  total_ibnr: number | null;
  per_origin: {
    origin: string;
    latest: number;
    cdf: number;
    ultimate: number;
    ibnr: number;
  }[];
}

/** Modül-payload formu — her aktif modül kendi state'ini kendi anahtarı altında gönderir. */
export type ModulesPayload = Record<string, Record<string, unknown>>;

/**
 * Multi-turn tool history için raw OpenAI mesaj formatı.
 * Tool çağrısı olan assistant mesajları, tool sonuç mesajları ve
 * düz assistant mesajlarını temsil eder.
 */
export type RawMessage = Record<string, unknown>;

/**
 * Tek genel agent endpoint'i. modules ile çağırmak yeni standart yoldur:
 *   chatWithAgent(msgs, { reserve: { triangle, session_state }, ifrs17: {...} })
 *
 * fullHistory: önceki turların raw mesaj zinciri (tool çağrısı + sonuçları).
 * Varsa agent tool context'ini kaybetmez; her tur için biriktirilip gönderilir.
 */
export async function chatWithAgent(
  messages: ChatMessage[],
  modulesOrTriangle: ModulesPayload | Triangle,
  model?: string | null,
  sessionState?: SessionState | null,
  fullHistory?: RawMessage[],
): Promise<ChatResponse> {
  const isModulesPayload =
    typeof modulesOrTriangle === "object" &&
    modulesOrTriangle !== null &&
    !("origin_periods" in modulesOrTriangle);

  const body: Record<string, unknown> = {
    messages,
    model: model ?? null,
  };
  if (isModulesPayload) {
    body.modules = modulesOrTriangle;
  } else {
    body.triangle = modulesOrTriangle;
    body.session_state = sessionState ?? null;
  }
  if (fullHistory && fullHistory.length > 0) {
    body.full_history = fullHistory;
  }

  const authHeaders = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/v1/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Agent hatası" }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function uploadPremiums(
  file: File,
  originGranularity: "yearly" | "quarterly" = "yearly",
): Promise<Record<string, number>> {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("Dosya 10 MB sınırını aşıyor");
  const buffer = await file.arrayBuffer();
  const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
  const authHeaders = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/v1/upload/premiums`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify({ file_b64: base64, origin_granularity: originGranularity }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: "Yükleme hatası" }));
    throw new Error(body.detail || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.premiums as Record<string, number>;
}

// ─── Cashflow API ────────────────────────────────────────────────────────────

export interface CashflowRecord {
  origin_year: number;
  dev_date: string; // ISO date
  paid: number;
}

export interface DevFactorRow {
  period: number;
  df: number;
  cdf: number;
  inv_cdf_100: number;
  inv_cdf_100_inc: number;
  global_weight: number;
}

export interface CashflowComputeResult {
  origin_years: number[];
  report_date: string;
  triangle: Record<string, Record<string, number>>;
  incremental: Record<string, Record<string, number>>;
  dev_factors: DevFactorRow[];
  quarterly_pattern: Record<string, { period: number; weight: number }[]>;
  monthly_pattern: Record<string, { month: number; weight: number }[]>;
  max_period: number;
}

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function uploadCashflowFile(file: File): Promise<{
  record_count: number;
  origin_years: number[];
  report_date: string;
  records: CashflowRecord[];
}> {
  if (file.size > 300 * 1024 * 1024) throw new Error("Dosya 300 MB sınırını aşıyor");
  const buffer = await file.arrayBuffer();
  const base64 = bufferToBase64(buffer);
  const authHeaders = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/v1/cashflow/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify({ file_b64: base64, filename: file.name }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: "Yükleme hatası" }));
    throw new Error(body.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function computeCashflow(
  records: CashflowRecord[],
): Promise<CashflowComputeResult> {
  const authHeaders = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/v1/cashflow/compute`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify({ records }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: "Hesaplama hatası" }));
    throw new Error(body.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Data (ham hasar) API ────────────────────────────────────────────────────

export interface DataInspectResult {
  /** Excel: sheet adları; CSV: [null] */
  sheets: (string | null)[];
  /** sheet_name → header listesi */
  headers: Record<string, string[]>;
  /** sheet_name → ilk 5 veri satırı */
  preview: Record<string, string[][]>;
  /** sheet_name → { field: column_name } otomatik tahmin */
  suggested_mapping: Record<string, Record<string, string>>;
}

export interface DataImportResult {
  record_count: number;
  brans_list: string[];
  hasar_tarihi_min: string;
  hasar_tarihi_max: string;
  gelisim_tarihi_min: string;
  gelisim_tarihi_max: string;
  total_odeme: number;
  total_muallak: number;
  records: {
    dosya_no: string;
    brans: string;
    hasar_tarihi: string;
    gelisim_tarihi: string;
    odeme: number;
    muallak: number;
  }[];
}

export async function inspectDataFile(file: File): Promise<DataInspectResult> {
  if (file.size > 50 * 1024 * 1024) throw new Error("Dosya 50 MB sınırını aşıyor");
  const base64 = bufferToBase64(await file.arrayBuffer());
  const authHeaders = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/v1/data/inspect`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify({ file_b64: base64, filename: file.name }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: "İnceleme hatası" }));
    throw new Error(body.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function importDataFile(
  file: File,
  sheetName: string | null,
  columnMapping: Record<string, string>,
): Promise<DataImportResult> {
  if (file.size > 50 * 1024 * 1024) throw new Error("Dosya 50 MB sınırını aşıyor");
  const base64 = bufferToBase64(await file.arrayBuffer());
  const authHeaders = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/v1/data/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify({
      file_b64: base64,
      filename: file.name,
      sheet_name: sheetName,
      column_mapping: columnMapping,
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: "İçeri aktarma hatası" }));
    throw new Error(body.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export interface ClaimRecord {
  dosya_no: string;
  brans: string;
  hasar_tarihi: string;
  gelisim_tarihi: string;
  odeme: number;
  muallak: number;
}

export interface PrimInspectResult {
  sheets: (string | null)[];
  headers: Record<string, string[]>;
  preview: Record<string, string[][]>;
  suggested_mapping: Record<string, Record<string, string>>;
}

export interface PrimImportResult {
  record_count: number;
  brans_list: string[];
  donem_list: string[];
  total_ep: number;
  records: { brans: string; donem: string; ep: number }[];
}

export async function inspectPrimFile(file: File): Promise<PrimInspectResult> {
  if (file.size > 50 * 1024 * 1024) throw new Error("Dosya 50 MB sınırını aşıyor");
  const base64 = bufferToBase64(await file.arrayBuffer());
  const authHeaders = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/v1/data/inspect-prim`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify({ file_b64: base64, filename: file.name }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: "İnceleme hatası" }));
    throw new Error(body.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function importPrimFile(
  file: File,
  sheetName: string | null,
  columnMapping: Record<string, string>,
): Promise<PrimImportResult> {
  if (file.size > 50 * 1024 * 1024) throw new Error("Dosya 50 MB sınırını aşıyor");
  const base64 = bufferToBase64(await file.arrayBuffer());
  const authHeaders = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/v1/data/import-prim`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify({
      file_b64: base64,
      filename: file.name,
      sheet_name: sheetName,
      column_mapping: columnMapping,
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: "İçeri aktarma hatası" }));
    throw new Error(body.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function buildTriangleFromRecords(
  records: ClaimRecord[],
  brans: string,
  originGranularity: "yearly" | "quarterly",
  developmentGranularity: "yearly" | "quarterly",
): Promise<{ paidTriangle: Triangle; incurredTriangle: Triangle }> {
  const authHeaders = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/v1/data/build-triangle`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify({
      records,
      brans,
      origin_granularity: originGranularity,
      development_granularity: developmentGranularity,
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: "Üçgen oluşturma hatası" }));
    throw new Error(body.detail || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return {
    paidTriangle: data.paid_triangle as Triangle,
    incurredTriangle: data.incurred_triangle as Triangle,
  };
}

export async function listModels(): Promise<ModelsResponse> {
  const res = await fetch(`${API_BASE}/v1/models`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const TR_FORMAT = new Intl.NumberFormat("tr-TR", {
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return TR_FORMAT.format(n);
}

const TR_FACTOR = new Intl.NumberFormat("tr-TR", {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

export function formatFactor(n: number): string {
  return TR_FACTOR.format(n);
}
