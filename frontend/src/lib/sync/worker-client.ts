import { getFirebaseAuth } from "@/lib/auth/firebase";

export const WORKER_BASE =
  process.env.NEXT_PUBLIC_WORKER_BASE || "https://reserve-agent-worker-production.l5819033.workers.dev";

export type Plan = "free" | "pro";

export type Role = "admin" | "user";

export interface MeResponse {
  uid: string;
  email: string;
  plan: Plan;
  hasPlan: boolean;
  /** Ekip çalışma alanındaki rol (masaüstündeki admin/user). */
  role: Role;
  workspace: { id: string; is_owner: boolean; owner_email: string };
}

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

export class WorkerError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
    public detail?: unknown,
  ) {
    super(message ?? code);
  }
}

/** Masaüstü sürümündeki adıyla da erişilebilsin. */
export { WorkerError as ApiError };

export async function getToken(): Promise<string> {
  const cur = getFirebaseAuth().currentUser;
  if (!cur) throw new WorkerError(401, "no_user");
  return cur.getIdToken();
}

async function call<T>(
  path: string,
  init: RequestInit & { retryOnAuth?: boolean } = {},
): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${WORKER_BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });

  if (res.status === 401 && init.retryOnAuth !== false) {
    // Token may have expired in flight — force refresh once.
    const fresh = await getFirebaseAuth().currentUser?.getIdToken(true);
    if (fresh) {
      const retry = await fetch(`${WORKER_BASE}${path}`, {
        ...init,
        headers: {
          ...(init.headers ?? {}),
          Authorization: `Bearer ${fresh}`,
          ...(init.body ? { "Content-Type": "application/json" } : {}),
        },
      });
      return parse<T>(retry);
    }
  }

  return parse<T>(res);
}

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let code = `http_${res.status}`;
    let message: string | undefined;
    let detail: unknown;
    try {
      const body = (await res.json()) as { error?: string; message?: string; detail?: unknown };
      if (body.error) code = body.error;
      message = body.message;
      detail = body.detail;
    } catch {
      /* ignore */
    }
    throw new WorkerError(res.status, code, message, detail);
  }
  // 204 / boş gövde (ör. DELETE): res.json() boş gövdede patlar.
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export async function fetchMe(): Promise<MeResponse> {
  return call<MeResponse>("/v1/me", { method: "GET" });
}

export async function setPlan(plan: Plan): Promise<{ plan: Plan }> {
  return call<{ plan: Plan }>("/v1/me/plan", {
    method: "POST",
    body: JSON.stringify({ plan }),
  });
}

export async function fetchState<P = unknown, C = unknown>(): Promise<
  StateResponse<P, C>
> {
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

// ─── Data API ─────────────────────────────────────────────────────────────────

export interface RemotePeriod {
  id: string;
  label: string;
  createdAt: string;
  datasetMetas: Record<string, { typeId: string } & Record<string, unknown>>; // datasetId → {typeId, ...meta}
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

export async function getDataset(
  periodId: string,
  datasetId: string,
): Promise<{ typeId: string; meta: unknown; records: unknown }> {
  return call(`/v1/data/periods/${encodeURIComponent(periodId)}/datasets/${encodeURIComponent(datasetId)}`, {
    method: "GET",
  });
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

export async function deleteDataset(
  periodId: string,
  datasetId: string,
): Promise<void> {
  await call<{ ok: boolean }>(
    `/v1/data/periods/${encodeURIComponent(periodId)}/datasets/${encodeURIComponent(datasetId)}`,
    { method: "DELETE" },
  );
}

// ─── Denetim günlüğü (yönetici) ──────────────────────────────────────────────

export interface AuditEvent {
  id: string;
  timestamp: string | null;
  actor: string;
  source: string;
  action: string;
  branch_id: string | null;
  branch_name?: string | null;
  details: Record<string, unknown> | null;
}

export async function fetchAuditEvents(limit = 200): Promise<AuditEvent[]> {
  const res = await call<{ events: AuditEvent[] }>(`/v1/audit?limit=${limit}`, { method: "GET" });
  return res.events;
}

// ─── Kullanıcı yönetimi (yönetici) ────────────────────────────────────────────
// Web'de kullanıcılar e-postayla davet edilir; parolayı Firebase yönetir.

export interface UserRecord {
  /** E-posta (küçük harf) — kullanıcının kimliği. */
  id: string;
  username: string;
  role: Role;
  is_active: boolean;
  is_owner?: boolean;
  joined?: boolean;
}

export async function fetchUsers(): Promise<UserRecord[]> {
  return call<UserRecord[]>("/v1/admin/users", { method: "GET" });
}

export async function createUser(data: { username: string; role?: Role }): Promise<UserRecord> {
  return call<UserRecord>("/v1/admin/users", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateUser(
  userId: string,
  data: { role?: Role; is_active?: boolean },
): Promise<UserRecord> {
  return call<UserRecord>(`/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteUser(userId: string): Promise<void> {
  await call<unknown>(`/v1/admin/users/${encodeURIComponent(userId)}`, { method: "DELETE" });
}

// ─── Model kilitleri ──────────────────────────────────────────────────────────

export interface LockInfo {
  locked: boolean;
  is_mine?: boolean;
  locked_by_name?: string;
  expires_at?: string;
}

export async function acquireLock(lockKey: string, force = false): Promise<LockInfo> {
  return call<LockInfo>(force ? "/v1/locks/force-acquire" : "/v1/locks/acquire", {
    method: "POST",
    body: JSON.stringify({ lock_key: lockKey }),
  });
}

export async function releaseLock(lockKey: string): Promise<void> {
  await call<unknown>(`/v1/locks/${encodeURIComponent(lockKey)}`, { method: "DELETE" });
}

// ─── İletişim formu ──────────────────────────────────────────────────────────
// Oturum GEREKTİRMEZ: landing'deki form ziyaretçi tarafından doldurulur, bu yüzden
// `call()` yerine doğrudan fetch kullanılır (o token zorunlu kılıyor).

export interface ContactPayload {
  name: string;
  email: string;
  company?: string;
  message: string;
  /** Honeypot — kullanıcıya gösterilmez, boş kalmalı. */
  website?: string;
}

export async function sendContact(payload: ContactPayload): Promise<void> {
  const res = await fetch(`${WORKER_BASE}/v1/contact`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as
      | { error?: string; message?: string }
      | null;
    throw new WorkerError(
      res.status,
      body?.error ?? "contact_failed",
      body?.message ?? `HTTP ${res.status}`,
    );
  }
}
