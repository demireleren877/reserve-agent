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
  process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

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
