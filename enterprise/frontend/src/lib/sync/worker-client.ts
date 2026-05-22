/**
 * Backend client — Cloudflare Worker yerine FastAPI (Oracle).
 * Token localStorage'dan alınır, refresh yok (TTL 12 saat).
 */

import { getToken } from "@/lib/auth/jwt";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export interface StateResponse<P = unknown, C = unknown> {
  project: P | null;
  chat: C | null;
  version: number;
  updated_at: number;
}

export interface PutStateBody<P = unknown, C = unknown> {
  project?: P;
  chat?: C;
  expectedVersion?: number;
}

export interface PutStateResponse {
  version: number;
  updated_at: number;
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message?: string) {
    super(message ?? code);
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  if (!token) throw new ApiError(401, "not_logged_in");

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });

  if (!res.ok) {
    let code = `http_${res.status}`;
    let message: string | undefined;
    try {
      const body = (await res.json()) as { detail?: string };
      if (body.detail) { code = body.detail; message = body.detail; }
    } catch { /* ignore */ }
    throw new ApiError(res.status, code, message);
  }

  return (await res.json()) as T;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function login(username: string, password: string) {
  const res = await fetch(`${API_BASE}/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new ApiError(res.status, body.detail ?? "login_failed");
  }
  return res.json() as Promise<{ token: string; user_id: number; username: string; role: string }>;
}

// ─── State ────────────────────────────────────────────────────────────────────

export async function fetchState<P = unknown, C = unknown>(): Promise<StateResponse<P, C>> {
  return call<StateResponse<P, C>>("/v1/state", { method: "GET" });
}

export async function putState<P = unknown, C = unknown>(
  body: PutStateBody<P, C>,
): Promise<PutStateResponse> {
  return call<PutStateResponse>("/v1/state", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function deleteState(): Promise<void> {
  await call<{ ok: boolean }>("/v1/state", { method: "DELETE" });
}

// ─── Data periods ─────────────────────────────────────────────────────────────

export interface RemotePeriod {
  id: string;
  label: string;
  createdAt: string;
  datasetMetas: Record<string, { typeId: string } & Record<string, unknown>>;
}

export async function fetchPeriods(): Promise<RemotePeriod[]> {
  return call<RemotePeriod[]>("/v1/data/periods", { method: "GET" });
}

export async function upsertPeriod(period: {
  period_id: string;
  label: string;
  created_at: string;
}): Promise<void> {
  await call<{ ok: boolean }>("/v1/data/periods", {
    method: "POST",
    body: JSON.stringify(period),
  });
}

export async function deletePeriod(periodId: string): Promise<void> {
  await call<{ ok: boolean }>(`/v1/data/periods/${encodeURIComponent(periodId)}`, {
    method: "DELETE",
  });
}

export async function getDataset(periodId: string, datasetId: string) {
  return call<{ typeId: string; meta: unknown; records: unknown }>(
    `/v1/data/periods/${encodeURIComponent(periodId)}/datasets/${encodeURIComponent(datasetId)}`,
    { method: "GET" },
  );
}

export async function putDataset(
  periodId: string,
  datasetId: string,
  typeId: string,
  meta: unknown,
  records: unknown,
): Promise<void> {
  await call<{ ok: boolean }>(
    `/v1/data/periods/${encodeURIComponent(periodId)}/datasets/${encodeURIComponent(datasetId)}`,
    { method: "PUT", body: JSON.stringify({ typeId, meta, records }) },
  );
}

export async function deleteDataset(periodId: string, datasetId: string): Promise<void> {
  await call<{ ok: boolean }>(
    `/v1/data/periods/${encodeURIComponent(periodId)}/datasets/${encodeURIComponent(datasetId)}`,
    { method: "DELETE" },
  );
}

// ─── User management (admin) ──────────────────────────────────────────────────

export interface UserRecord {
  id: number;
  username: string;
  role: "admin" | "user";
  is_active: boolean;
}

export async function fetchUsers(): Promise<UserRecord[]> {
  return call<UserRecord[]>("/v1/admin/users", { method: "GET" });
}

export async function createUser(data: { username: string; password: string; role?: string }): Promise<UserRecord> {
  return call<UserRecord>("/v1/admin/users", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateUser(
  userId: number,
  data: { password?: string; role?: string; is_active?: boolean },
): Promise<UserRecord> {
  return call<UserRecord>(`/v1/admin/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteUser(userId: number): Promise<void> {
  await call<unknown>(`/v1/admin/users/${userId}`, { method: "DELETE" });
}
