import { getFirebaseAuth } from "@/lib/auth/firebase";

export const WORKER_BASE =
  process.env.NEXT_PUBLIC_WORKER_BASE || "https://reserve-agent-worker-production.l5819033.workers.dev";

export type Plan = "free" | "pro";

export interface MeResponse {
  uid: string;
  email: string;
  plan: Plan;
  hasPlan: boolean;
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
  constructor(public status: number, public code: string, message?: string) {
    super(message ?? code);
  }
}

async function getToken(): Promise<string> {
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
    try {
      const body = (await res.json()) as { error?: string; message?: string };
      if (body.error) code = body.error;
      message = body.message;
    } catch {
      /* ignore */
    }
    throw new WorkerError(res.status, code, message);
  }
  return (await res.json()) as T;
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
  datasetMetas: Record<string, unknown>; // typeId → meta (records hariç)
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
  typeId: string,
): Promise<{ meta: unknown; records: unknown }> {
  return call(`/v1/data/periods/${encodeURIComponent(periodId)}/datasets/${encodeURIComponent(typeId)}`, {
    method: "GET",
  });
}

export async function putDataset(
  periodId: string,
  typeId: string,
  meta: unknown,
  records: unknown,
): Promise<void> {
  await call<{ ok: boolean }>(
    `/v1/data/periods/${encodeURIComponent(periodId)}/datasets/${encodeURIComponent(typeId)}`,
    { method: "PUT", body: JSON.stringify({ meta, records }) },
  );
}

export async function deleteDataset(
  periodId: string,
  typeId: string,
): Promise<void> {
  await call<{ ok: boolean }>(
    `/v1/data/periods/${encodeURIComponent(periodId)}/datasets/${encodeURIComponent(typeId)}`,
    { method: "DELETE" },
  );
}
