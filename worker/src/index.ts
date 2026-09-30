import {
  MAX_STATE_BYTES, STATE_KINDS, StateIncompleteError, byteLength, chunkStatements, planKind, readState,
  type KindPlan, type StateKind,
} from "./state-store";
import { AuthError, verifyIdToken, type VerifiedToken } from "./auth";
import {
  TeamError,
  acquireLock,
  appendAuditEvent,
  createUser,
  deleteUser,
  forceAcquireLock,
  getLock,
  listAuditEvents,
  listUsers,
  projectAuditStatements,
  releaseLock,
  resolveWorkspace,
  updateUser,
  type Result,
  type Workspace,
} from "./team";

interface Env {
  DB: D1Database;
  ALLOWED_ORIGIN: string;
  FIREBASE_PROJECT_ID: string;
  PADDLE_WEBHOOK_SECRET: string;
  PADDLE_API_KEY: string;
  PADDLE_ENV: string; // "sandbox" | "production"
  // İletişim formu → Resend ile e-posta gönderimi
  RESEND_API_KEY: string;   // secret: wrangler secret put RESEND_API_KEY
  CONTACT_TO: string;       // alıcı, ör. info@actuarius.com.tr
  CONTACT_FROM: string;     // gönderen, Resend'de DOĞRULANMIŞ domain olmalı
}

type Plan = "free" | "pro";

interface UserRow {
  uid: string;
  email: string;
  plan: Plan;
  plan_selected_at: number | null;
  paddle_subscription_id: string | null;
  created_at: number;
  updated_at: number;
}

interface StateRow {
  project_json: string | null;
  chat_json: string | null;
  version: number;
  updated_at: number;
  updated_by_name: string | null;
}

function corsHeaders(origin: string): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(body: unknown, init: ResponseInit, origin: string): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
      ...(init.headers ?? {}),
    },
  });
}

function err(
  status: number,
  code: string,
  origin: string,
  message?: string,
): Response {
  return json({ error: code, message: message ?? code }, { status }, origin);
}

async function authenticate(
  req: Request,
  env: Env,
): Promise<VerifiedToken> {
  const auth = req.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m?.[1]) throw new AuthError(401, "missing_bearer");
  return verifyIdToken(m[1], env.FIREBASE_PROJECT_ID);
}

async function ensureUser(env: Env, t: VerifiedToken): Promise<UserRow> {
  const now = Date.now();
  const existing = await env.DB.prepare(
    "SELECT uid, email, plan, plan_selected_at, paddle_subscription_id, created_at, updated_at FROM users WHERE uid = ?",
  )
    .bind(t.uid)
    .first<UserRow>();

  if (existing) {
    if (t.email && t.email !== existing.email) {
      await env.DB.prepare(
        "UPDATE users SET email = ?, updated_at = ? WHERE uid = ?",
      )
        .bind(t.email, now, t.uid)
        .run();
      return { ...existing, email: t.email, updated_at: now };
    }
    return existing;
  }

  const row: UserRow = {
    uid: t.uid,
    email: t.email,
    plan: "free",
    plan_selected_at: null,
    paddle_subscription_id: null,
    created_at: now,
    updated_at: now,
  };
  await env.DB.prepare(
    "INSERT INTO users (uid, email, plan, plan_selected_at, paddle_subscription_id, created_at, updated_at) VALUES (?, ?, ?, NULL, NULL, ?, ?)",
  )
    .bind(row.uid, row.email, row.plan, row.created_at, row.updated_at)
    .run();
  return row;
}

async function handleMe(env: Env, t: VerifiedToken, ws: Workspace, origin: string) {
  const user = await ensureUser(env, t);
  // Ekip üyesi, çalışma alanı sahibinin planını kullanır.
  const owner = ws.isOwner
    ? user
    : await env.DB.prepare(
        "SELECT uid, email, plan, plan_selected_at, paddle_subscription_id, created_at, updated_at FROM users WHERE uid = ?",
      )
        .bind(ws.id)
        .first<UserRow>();
  return json(
    {
      uid: user.uid,
      email: user.email,
      plan: owner?.plan ?? "free",
      hasPlan: ws.isOwner ? user.plan_selected_at !== null : true,
      role: ws.role,
      workspace: { id: ws.id, is_owner: ws.isOwner, owner_email: owner?.email ?? null },
    },
    { status: 200 },
    origin,
  );
}

async function cancelPaddleSubscription(
  subscriptionId: string,
  env: Env,
): Promise<void> {
  if (!env.PADDLE_API_KEY) return;
  const base =
    env.PADDLE_ENV === "sandbox"
      ? "https://sandbox-api.paddle.com"
      : "https://api.paddle.com";
  await fetch(`${base}/subscriptions/${subscriptionId}/cancel`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.PADDLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ effective_from: "next_billing_period" }),
  });
}

async function handleSetPlan(
  req: Request,
  env: Env,
  t: VerifiedToken,
  origin: string,
) {
  let body: { plan?: unknown };
  try {
    body = await req.json();
  } catch {
    return err(400, "invalid_json", origin);
  }
  const plan = body.plan;
  if (plan !== "free" && plan !== "pro") {
    return err(400, "invalid_plan", origin);
  }
  const ws = await resolveWorkspace(env.DB, t.uid, t.email);
  if (!ws.isOwner) return err(403, "plan_managed_by_owner", origin);
  const user = await ensureUser(env, t);
  const now = Date.now();

  // Downgrading to free → cancel active Paddle subscription
  if (plan === "free" && user.paddle_subscription_id) {
    await cancelPaddleSubscription(user.paddle_subscription_id, env);
  }

  await env.DB.prepare(
    "UPDATE users SET plan = ?, plan_selected_at = ?, updated_at = ? WHERE uid = ?",
  )
    .bind(plan, now, now, t.uid)
    .run();
  return json({ uid: t.uid, plan, updated_at: now }, { status: 200 }, origin);
}

async function handleGetState(env: Env, t: VerifiedToken, ws: Workspace, origin: string) {
  await ensureUser(env, t);
  let st;
  try {
    st = await readState(env.DB, ws.id);
  } catch (e) {
    if (e instanceof StateIncompleteError) return err(500, "state_incomplete", origin, e.message);
    throw e;
  }
  if (!st) {
    return json({ project: null, chat: null, version: 0, updated_at: 0 }, { status: 200 }, origin);
  }
  return json(
    {
      project: st.project ? JSON.parse(st.project) : null,
      chat: st.chat ? JSON.parse(st.chat) : null,
      version: st.version,
      updated_at: st.updated_at,
      updated_by_name: st.updated_by_name ?? null,
    },
    { status: 200 },
    origin,
  );
}

interface PutStateBody {
  project?: unknown;
  chat?: unknown;
  expectedVersion?: number;
}


async function handlePutState(
  req: Request,
  env: Env,
  t: VerifiedToken,
  ws: Workspace,
  origin: string,
) {
  let body: PutStateBody;
  try {
    body = (await req.json()) as PutStateBody;
  } catch {
    return err(400, "invalid_json", origin);
  }

  await ensureUser(env, t);

  const projectStr =
    body.project === undefined ? undefined : JSON.stringify(body.project);
  const chatStr =
    body.chat === undefined ? undefined : JSON.stringify(body.chat);

  const projectBytes = projectStr ? byteLength(projectStr) : 0;
  const chatBytes = chatStr ? byteLength(chatStr) : 0;
  if (projectBytes + chatBytes > MAX_STATE_BYTES) {
    return err(
      413,
      "state_too_large",
      origin,
      `${((projectBytes + chatBytes) / 1024 / 1024).toFixed(1)} MB > ${MAX_STATE_BYTES / 1024 / 1024} MB limit`,
    );
  }

  const now = Date.now();
  const existing = await env.DB.prepare(
    "SELECT project_json, chat_json, project_chunks, chat_chunks, version FROM user_state WHERE uid = ?",
  )
    .bind(ws.id)
    .first<{ project_json: string | null; chat_json: string | null; project_chunks: number; chat_chunks: number; version: number }>();

  const currentVersion = existing?.version ?? 0;
  if (
    body.expectedVersion !== undefined &&
    body.expectedVersion !== currentVersion
  ) {
    return err(
      409,
      "version_conflict",
      origin,
      `server version is ${currentVersion}`,
    );
  }

  const plans: Record<StateKind, KindPlan> = {
    project: planKind(projectStr, existing?.project_json ?? null, existing?.project_chunks ?? 0),
    chat: planKind(chatStr, existing?.chat_json ?? null, existing?.chat_chunks ?? 0),
  };
  const nextVersion = currentVersion + 1;
  const writeId = crypto.randomUUID();

  // Ekipte iki kişi aynı anda yazabilir: güncelleme yalnız sürüm hâlâ okunduğu
  // gibiyse uygulanır (masaüstündeki atomik WHERE version = beklenen). Parça
  // yazımları write_id'ye bağlı olduğundan çakışmayı kaybeden yazım
  // kazananın parçalarına dokunamaz.
  const write = existing
    ? env.DB.prepare(
        `UPDATE user_state SET project_json = ?, chat_json = ?, project_chunks = ?, chat_chunks = ?,
           write_id = ?, version = ?, updated_at = ?, updated_by_name = ?
         WHERE uid = ? AND version = ?`,
      ).bind(
        plans.project.inline, plans.chat.inline, plans.project.count, plans.chat.count,
        writeId, nextVersion, now, ws.actorName, ws.id, currentVersion,
      )
    : env.DB.prepare(
        `INSERT OR IGNORE INTO user_state
           (uid, project_json, chat_json, project_chunks, chat_chunks, write_id, version, updated_at, updated_by_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        ws.id, plans.project.inline, plans.chat.inline, plans.project.count, plans.chat.count,
        writeId, nextVersion, now, ws.actorName,
      );
  const [res] = await env.DB.batch([write, ...chunkStatements(env.DB, ws.id, writeId, plans)]);
  if (!res?.meta.changes) {
    return err(409, "version_conflict", origin, "state changed concurrently");
  }

  // Görünüm logundaki olayları değiştirilemez denetim tablosuna yaz.
  if (body.project !== undefined) {
    const stmts = projectAuditStatements(env.DB, ws, body.project);
    if (stmts.length) await env.DB.batch(stmts);
  }

  return json(
    { version: nextVersion, updated_at: now },
    { status: 200 },
    origin,
  );
}

async function handleDeleteAll(env: Env, ws: Workspace, origin: string) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM user_state_chunks WHERE uid = ?").bind(ws.id),
    env.DB.prepare("DELETE FROM user_state WHERE uid = ?").bind(ws.id),
  ]);
  return json({ ok: true }, { status: 200 }, origin);
}

// ─── Data: periods ────────────────────────────────────────────────────────────

interface PeriodRow {
  period_id: string;
  label: string;
  created_at: number;
  updated_at: number;
}

interface DatasetMetaRow {
  period_id: string;
  dataset_id: string;
  type_id: string;
  meta_json: string;
  updated_at: number;
}

async function handleListPeriods(env: Env, t: VerifiedToken, ws: Workspace, origin: string) {
  await ensureUser(env, t);

  const periods = await env.DB.prepare(
    "SELECT period_id, label, created_at, updated_at FROM user_periods WHERE uid = ? ORDER BY created_at ASC",
  ).bind(ws.id).all<PeriodRow>();

  // Her dönem için dataset meta'ları çek (records hariç — büyük olabilir)
  const metas = await env.DB.prepare(
    "SELECT period_id, dataset_id, type_id, meta_json, updated_at FROM user_datasets WHERE uid = ? ORDER BY updated_at ASC",
  ).bind(ws.id).all<DatasetMetaRow>();

  // period_id → {dataset_id: {typeId, ...meta}}
  const datasetsByPeriod: Record<string, Record<string, unknown>> = {};
  for (const row of metas.results) {
    const bucket = (datasetsByPeriod[row.period_id] ??= {});
    const meta = JSON.parse(row.meta_json);
    bucket[row.dataset_id] = { typeId: row.type_id, ...meta };
  }

  const result = periods.results.map((p) => ({
    id: p.period_id,
    label: p.label,
    createdAt: new Date(p.created_at).toISOString(),
    datasetMetas: datasetsByPeriod[p.period_id] ?? {},
  }));

  return json(result, { status: 200 }, origin);
}

async function handleUpsertPeriod(req: Request, env: Env, t: VerifiedToken, ws: Workspace, origin: string) {
  await ensureUser(env, t);
  let body: { period_id?: string; label?: string; created_at?: string };
  try { body = await req.json(); } catch { return err(400, "invalid_json", origin); }

  const { period_id, label, created_at } = body;
  if (!period_id || !label) return err(400, "missing_fields", origin);

  const now = Date.now();
  const createdAt = created_at ? new Date(created_at).getTime() : now;

  const existing = await env.DB.prepare(
    "SELECT period_id FROM user_periods WHERE uid = ? AND period_id = ?",
  ).bind(ws.id, period_id).first();

  if (existing) {
    await env.DB.prepare(
      "UPDATE user_periods SET label = ?, updated_at = ? WHERE uid = ? AND period_id = ?",
    ).bind(label, now, ws.id, period_id).run();
  } else {
    await env.DB.prepare(
      "INSERT INTO user_periods (uid, period_id, label, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    ).bind(ws.id, period_id, label, createdAt, now).run();
  }
  await appendAuditEvent(env.DB, ws, { action: "data.period_saved", details: { module: "data", target: label } });

  return json({ ok: true }, { status: 200 }, origin);
}

async function handleDeletePeriod(env: Env, t: VerifiedToken, ws: Workspace, periodId: string, origin: string) {
  await ensureUser(env, t);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM user_dataset_chunks WHERE uid = ? AND period_id = ?").bind(ws.id, periodId),
    env.DB.prepare("DELETE FROM user_datasets WHERE uid = ? AND period_id = ?").bind(ws.id, periodId),
    env.DB.prepare("DELETE FROM user_periods WHERE uid = ? AND period_id = ?").bind(ws.id, periodId),
  ]);
  await appendAuditEvent(env.DB, ws, { action: "data.period_deleted", details: { module: "data", target: "Değerleme dönemi" } });
  return json({ ok: true }, { status: 200 }, origin);
}

// ─── Data: datasets ───────────────────────────────────────────────────────────

// D1 satır başına 2.000.000 bayt kabul ediyor. Veri setini tek satıra yazmak
// gerçek bir çeyreklik hasar dosyasında (~3 MB) SQLITE_TOOBIG ile düşüyordu;
// kayıtlar artık bu boyutun altındaki parçalara bölünüyor.
const CHUNK_BYTES = 1_500_000;
// Tek istekte kabul edilen üst sınır. ~11 parça demek: D1'in ücretsiz planda
// çağrı başına 50 sorgu sınırının rahatça altında kalır.
const MAX_DATASET_BYTES = 16 * 1024 * 1024;

/**
 * Kayıt dizisini, her biri JSON olarak CHUNK_BYTES'ı aşmayan parçalara böler.
 * Bayt değil KAYIT sınırından bölünür: UTF-8 bir karakterin ortasından
 * kesilmez ve her parça kendi başına geçerli bir JSON dizisidir.
 */
function splitRecords(records: unknown[]): string[] | { tooLarge: number } {
  const enc = new TextEncoder();
  const chunks: string[] = [];
  let parts: string[] = [];
  let size = 2; // "[" + "]"
  for (const r of records) {
    const js = JSON.stringify(r);
    const n = enc.encode(js).length + 1; // + ayraç
    if (n + 2 > CHUNK_BYTES) return { tooLarge: n };
    if (size + n > CHUNK_BYTES && parts.length) {
      chunks.push(`[${parts.join(",")}]`);
      parts = [];
      size = 2;
    }
    parts.push(js);
    size += n;
  }
  if (parts.length) chunks.push(`[${parts.join(",")}]`);
  return chunks;
}

async function handleGetDataset(
  env: Env, t: VerifiedToken, ws: Workspace, periodId: string, datasetId: string, origin: string,
) {
  await ensureUser(env, t);
  const row = await env.DB.prepare(
    "SELECT type_id, meta_json, records_json, chunk_count FROM user_datasets WHERE uid = ? AND period_id = ? AND dataset_id = ?",
  ).bind(ws.id, periodId, datasetId).first<{ type_id: string; meta_json: string; records_json: string; chunk_count: number }>();

  if (!row) return err(404, "not_found", origin);

  let records: unknown[];
  if (row.chunk_count > 0) {
    const parts = await env.DB.prepare(
      "SELECT records_json FROM user_dataset_chunks WHERE uid = ? AND period_id = ? AND dataset_id = ? ORDER BY seq ASC",
    ).bind(ws.id, periodId, datasetId).all<{ records_json: string }>();
    // Parça sayısı tutmuyorsa yazma yarım kalmış demektir — eksik veriyi
    // tamammış gibi döndürmek, sessizce yanlış bir üçgen kurdurur.
    if (parts.results.length !== row.chunk_count) {
      return err(500, "dataset_incomplete", origin, `${parts.results.length}/${row.chunk_count} chunks`);
    }
    records = parts.results.flatMap((p) => JSON.parse(p.records_json) as unknown[]);
  } else {
    records = JSON.parse(row.records_json);
  }
  return json({ typeId: row.type_id, meta: JSON.parse(row.meta_json), records }, { status: 200 }, origin);
}

async function handlePutDataset(
  req: Request, env: Env, t: VerifiedToken, ws: Workspace, periodId: string, datasetId: string, origin: string,
) {
  await ensureUser(env, t);
  let body: { typeId?: string; meta?: unknown; records?: unknown };
  try { body = await req.json(); } catch { return err(400, "invalid_json", origin); }

  const typeId = body.typeId ?? datasetId;
  const metaStr = JSON.stringify(body.meta ?? {});
  const records = Array.isArray(body.records) ? body.records : [];
  const recordsStr = JSON.stringify(records);
  const enc = new TextEncoder();
  const totalBytes = enc.encode(metaStr).length + enc.encode(recordsStr).length;
  if (totalBytes > MAX_DATASET_BYTES) {
    return err(
      413, "dataset_too_large", origin,
      `${(totalBytes / 1024 / 1024).toFixed(1)} MB > ${MAX_DATASET_BYTES / 1024 / 1024} MB limit`,
    );
  }
  if (enc.encode(metaStr).length > CHUNK_BYTES) {
    return err(413, "dataset_meta_too_large", origin);
  }

  // Satıra sığıyorsa eskisi gibi satırın içinde; sığmıyorsa parçalara.
  const inline = enc.encode(metaStr).length + enc.encode(recordsStr).length <= CHUNK_BYTES;
  let chunks: string[] = [];
  if (!inline) {
    const split = splitRecords(records);
    if (!Array.isArray(split)) {
      return err(413, "dataset_record_too_large", origin, `single record ${split.tooLarge} bytes`);
    }
    chunks = split;
  }

  const now = Date.now();
  const key = [ws.id, periodId, datasetId] as const;
  // Hepsi tek batch: D1 batch'i tek bir işlem olarak uygular. Yarıda kalan bir
  // yazma, eski parçaların yenileriyle karışmış bir veri seti bırakamaz.
  await env.DB.batch([
    env.DB.prepare(
      "DELETE FROM user_dataset_chunks WHERE uid = ? AND period_id = ? AND dataset_id = ?",
    ).bind(...key),
    ...chunks.map((c, seq) =>
      env.DB.prepare(
        "INSERT INTO user_dataset_chunks (uid, period_id, dataset_id, seq, records_json) VALUES (?, ?, ?, ?, ?)",
      ).bind(...key, seq, c),
    ),
    // Parçalı kayıtta satırdaki records_json "[]": eski bir worker sürümüne
    // geri dönülürse JSON.parse çökmez, boş veri seti görünür.
    env.DB.prepare(
      `INSERT INTO user_datasets (uid, period_id, dataset_id, type_id, meta_json, records_json, chunk_count, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (uid, period_id, dataset_id) DO UPDATE SET
         meta_json = excluded.meta_json,
         records_json = excluded.records_json,
         chunk_count = excluded.chunk_count,
         updated_at = excluded.updated_at`,
    ).bind(...key, typeId, metaStr, inline ? recordsStr : "[]", chunks.length, now),
  ]);

  const meta = body.meta && typeof body.meta === "object" ? (body.meta as Record<string, unknown>) : {};
  await appendAuditEvent(env.DB, ws, {
    action: "data.dataset_saved",
    details: {
      module: "data",
      target: typeof meta.filename === "string" ? meta.filename : "Dataset",
      record_count: records.length,
    },
  });

  return json({ ok: true }, { status: 200 }, origin);
}

async function handleDeleteDataset(
  env: Env, t: VerifiedToken, ws: Workspace, periodId: string, datasetId: string, origin: string,
) {
  await ensureUser(env, t);
  await env.DB.batch([
    env.DB.prepare(
      "DELETE FROM user_dataset_chunks WHERE uid = ? AND period_id = ? AND dataset_id = ?",
    ).bind(ws.id, periodId, datasetId),
    env.DB.prepare(
      "DELETE FROM user_datasets WHERE uid = ? AND period_id = ? AND dataset_id = ?",
    ).bind(ws.id, periodId, datasetId),
  ]);
  await appendAuditEvent(env.DB, ws, { action: "data.dataset_deleted", details: { module: "data", target: "Dataset" } });
  return json({ ok: true }, { status: 200 }, origin);
}


// ---------------------------------------------------------------------------
// Paddle webhook — no auth header; signature verification via HMAC-SHA256
// ---------------------------------------------------------------------------

async function verifyPaddleSignature(
  req: Request,
  secret: string,
): Promise<{ ok: boolean; body: string }> {
  const body = await req.text();
  const sigHeader = req.headers.get("Paddle-Signature") ?? "";

  // Format: ts=<timestamp>;h1=<hmac>
  const parts = Object.fromEntries(
    sigHeader.split(";").map((p) => p.split("=")),
  );
  const ts = parts["ts"];
  const h1 = parts["h1"];
  if (!ts || !h1) return { ok: false, body };

  const signed = `${ts}:${body}`;
  const keyData = new TextEncoder().encode(secret);
  const msgData = new TextEncoder().encode(signed);
  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, msgData);
  const computed = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Timing-safe comparison to prevent timing attacks on webhook signature.
  const computedBytes = new TextEncoder().encode(computed);
  const h1Bytes = new TextEncoder().encode(h1);
  if (computedBytes.length !== h1Bytes.length) return { ok: false, body };
  const equal = computedBytes.every((b, i) => b === h1Bytes[i]);
  return { ok: equal, body };
}

async function handlePaddleWebhook(req: Request, env: Env): Promise<Response> {
  if (!env.PADDLE_WEBHOOK_SECRET) {
    return new Response("webhook not configured", { status: 501 });
  }

  const { ok, body } = await verifyPaddleSignature(req, env.PADDLE_WEBHOOK_SECRET);
  if (!ok) {
    return new Response("invalid signature", { status: 401 });
  }

  let event: {
    event_type?: string;
    data?: {
      id?: string; // subscription_id for subscription events
      custom_data?: { uid?: string };
      status?: string;
    };
  };
  try {
    event = JSON.parse(body);
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  const uid = event.data?.custom_data?.uid;
  const subscriptionId = event.data?.id ?? null;
  const activatingEvents = new Set([
    "subscription.activated",
    "subscription.updated",
    "transaction.completed",
  ]);

  if (uid && activatingEvents.has(event.event_type ?? "")) {
    const now = Date.now();
    await env.DB.prepare(
      "UPDATE users SET plan = 'pro', plan_selected_at = ?, paddle_subscription_id = ?, updated_at = ? WHERE uid = ?",
    )
      .bind(now, subscriptionId, now, uid)
      .run();
  }

  return new Response("ok", { status: 200 });
}

// ─── İletişim formu (public — token istemez) ────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** HTML kaçışı — kullanıcı girdisi maile gömülmeden önce zorunlu. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Anahtar/değer satırları — bildirim mailindeki künye tablosu. */
function table(rows: [string, string][]): string {
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">` +
    rows
      .map(
        ([k, v]) =>
          `<tr>` +
          `<td style="padding:9px 0;border-bottom:1px solid #edeae4;font:600 11px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:#8a8f99;width:104px;vertical-align:top">${k}</td>` +
          `<td style="padding:9px 0;border-bottom:1px solid #edeae4;font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#191b20">${v}</td>` +
          `</tr>`,
      )
      .join("") +
    `</table>`
  );
}

/**
 * Markalı e-posta iskeleti. Görsel yok — logo dosyası 1,3 MB olduğu için
 * tipografik wordmark kullanılıyor; her istemcide sorunsuz açılır.
 */
function shell(title: string, inner: string): string {
  return `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f3ef">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(title)} — Actuarius</div>
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f4f3ef;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#ffffff;border:1px solid #e5e2db;border-radius:14px;overflow:hidden">
        <tr><td style="padding:22px 28px;border-bottom:1px solid #edeae4">
          <span style="font:800 17px/1 -apple-system,Segoe UI,Roboto,sans-serif;letter-spacing:-.02em;color:#191b20">Actuarius</span>
          <span style="display:inline-block;width:1px;height:14px;background:#e5e2db;margin:0 10px;vertical-align:-2px"></span>
          <span style="font:600 11px/1 -apple-system,Segoe UI,Roboto,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#a85a33">${esc(title)}</span>
        </td></tr>
        <tr><td style="padding:28px">${inner}</td></tr>
        <tr><td style="padding:18px 28px;border-top:1px solid #edeae4;background:#faf9f7">
          <p style="margin:0;font:13px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#8a8f99">
            Actuarius · Aktüeryal rezerv platformu<br>
            <a href="https://actuarius.com.tr" style="color:#a85a33;text-decoration:none">actuarius.com.tr</a>
            &nbsp;·&nbsp;
            <a href="mailto:info@actuarius.com.tr" style="color:#a85a33;text-decoration:none">info@actuarius.com.tr</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/** Resend'e tek bir gönderim isteği. */
function sendEmail(
  env: Env,
  payload: Record<string, unknown>,
): Promise<Response> {
  return fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

/** Gövdedeki alanı string'e indirger, kırpar ve üst sınıra kadar keser. */
function field(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

async function handleContact(
  req: Request,
  env: Env,
  origin: string,
): Promise<Response> {
  // Basit kötüye kullanım engeli: yalnız kendi sitemizden gelen isteklere izin ver.
  const reqOrigin = req.headers.get("Origin");
  if (
    env.ALLOWED_ORIGIN &&
    env.ALLOWED_ORIGIN !== "*" &&
    reqOrigin &&
    reqOrigin !== env.ALLOWED_ORIGIN
  ) {
    return err(403, "forbidden_origin", origin);
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return err(400, "invalid_json", origin);
  }

  // Honeypot: gerçek kullanıcı bu alanı görmez. Doluysa botdur — sessizce başarı dön.
  if (field(body.website, 200)) {
    return json({ ok: true }, { status: 200 }, origin);
  }

  const name = field(body.name, 80);
  const email = field(body.email, 160);
  const company = field(body.company, 120);
  const message = field(body.message, 4000);

  if (name.length < 2) {
    return err(400, "invalid_name", origin, "Ad en az 2 karakter olmalı.");
  }
  if (!EMAIL_RE.test(email)) {
    return err(400, "invalid_email", origin, "Geçerli bir e-posta adresi girin.");
  }
  if (message.length < 10) {
    return err(400, "invalid_message", origin, "Mesaj en az 10 karakter olmalı.");
  }

  if (!env.RESEND_API_KEY) {
    return err(
      501,
      "email_not_configured",
      origin,
      "RESEND_API_KEY tanımlı değil (wrangler secret put RESEND_API_KEY).",
    );
  }

  const to = env.CONTACT_TO || "info@actuarius.com.tr";
  const from = env.CONTACT_FROM || "Actuarius <info@actuarius.com.tr>";

  const receivedAt = new Date().toLocaleString("tr-TR", {
    timeZone: "Europe/Istanbul",
    dateStyle: "long",
    timeStyle: "short",
  });

  // 1) Bize bildirim — yapılandırılmış, markalı
  const notify = await sendEmail(env, {
    from,
    to: [to],
    reply_to: email, // "Yanıtla" doğrudan gönderene gider
    subject: `Yeni iletişim talebi — ${company || name}`,
    text: [
      `Ad: ${name}`,
      `E-posta: ${email}`,
      ...(company ? [`Şirket: ${company}`] : []),
      `Tarih: ${receivedAt}`,
      "",
      message,
    ].join("\n"),
    html: shell(
      "Yeni iletişim talebi",
      `
      ${table([
        ["Ad", esc(name)],
        ["E-posta", `<a href="mailto:${esc(email)}" style="color:#a85a33;text-decoration:none">${esc(email)}</a>`],
        ...(company ? [["Şirket", esc(company)] as [string, string]] : []),
        ["Tarih", esc(receivedAt)],
      ])}
      <p style="margin:26px 0 8px;font:600 11px/1 -apple-system,Segoe UI,Roboto,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#8a8f99">MESAJ</p>
      <div style="background:#f4f3ef;border:1px solid #e5e2db;border-radius:10px;padding:16px 18px;font:15px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#191b20;white-space:pre-wrap">${esc(message)}</div>
      <p style="margin:24px 0 0;font:14px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#5d6472">
        Bu maili yanıtlarsanız doğrudan <b style="color:#191b20">${esc(name)}</b> kişisine ulaşır.
      </p>`,
    ),
  });

  if (!notify.ok) {
    const detail = await notify.text();
    return err(502, "email_send_failed", origin, detail.slice(0, 300));
  }

  // 2) Gönderene otomatik teyit — best-effort; başarısız olsa da form başarılıdır
  await sendEmail(env, {
    from,
    to: [email],
    reply_to: to,
    subject: "Mesajınızı aldık — Actuarius",
    text:
      `Merhaba ${name},\n\n` +
      `Mesajınız bize ulaştı. En kısa sürede (genelde aynı iş günü içinde) dönüş yapacağız.\n\n` +
      `Gönderdiğiniz mesaj:\n${message}\n\n` +
      `Actuarius · actuarius.com.tr`,
    html: shell(
      "Mesajınızı aldık",
      `
      <p style="margin:0 0 16px;font:16px/1.65 -apple-system,Segoe UI,Roboto,sans-serif;color:#191b20">Merhaba ${esc(name)},</p>
      <p style="margin:0 0 22px;font:15px/1.65 -apple-system,Segoe UI,Roboto,sans-serif;color:#5d6472">
        Mesajınız bize ulaştı. En kısa sürede — genelde aynı iş günü içinde — dönüş yapacağız.
        Bu arada ürünü ücretsiz hesapla deneyebilirsiniz.
      </p>
      <a href="https://actuarius.com.tr/reserve" style="display:inline-block;background:#a85a33;color:#ffffff;text-decoration:none;font:600 15px/1 -apple-system,Segoe UI,Roboto,sans-serif;padding:13px 24px;border-radius:8px">Ücretsiz başlayın</a>
      <p style="margin:26px 0 8px;font:600 11px/1 -apple-system,Segoe UI,Roboto,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#8a8f99">GÖNDERDİĞİNİZ MESAJ</p>
      <div style="background:#f4f3ef;border:1px solid #e5e2db;border-radius:10px;padding:16px 18px;font:14px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#5d6472;white-space:pre-wrap">${esc(message)}</div>`,
    ),
  }).catch(() => undefined);

  return json({ ok: true }, { status: 200 }, origin);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = env.ALLOWED_ORIGIN || "*";
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (url.pathname === "/health") {
      return json({ ok: true }, { status: 200 }, origin);
    }

    // Paddle webhook — no bearer token, signature-verified
    if (url.pathname === "/v1/paddle/webhook" && req.method === "POST") {
      return handlePaddleWebhook(req, env);
    }

    // İletişim formu — public; auth kapısından ÖNCE gelmeli
    if (url.pathname === "/v1/contact" && req.method === "POST") {
      try {
        return await handleContact(req, env, origin);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "internal_error";
        return err(500, "internal_error", origin, msg);
      }
    }

    if (!url.pathname.startsWith("/v1/")) {
      return err(404, "not_found", origin);
    }

    let token: VerifiedToken;
    try {
      token = await authenticate(req, env);
    } catch (e) {
      if (e instanceof AuthError) return err(e.status, e.message, origin);
      return err(500, "auth_failure", origin);
    }

    try {
      await ensureUser(env, token);
      const ws = await resolveWorkspace(env.DB, token.uid, token.email);
      const send = (r: Result) =>
        r.status === 204 ? new Response(null, { status: 204, headers: corsHeaders(origin) }) : json(r.body, { status: r.status }, origin);
      const readJson = async () => {
        try {
          return (await req.json()) as Record<string, unknown>;
        } catch {
          throw new TeamError(400, "invalid_json");
        }
      };

      if (url.pathname === "/v1/me" && req.method === "GET") {
        return await handleMe(env, token, ws, origin);
      }
      if (url.pathname === "/v1/me/plan" && req.method === "POST") {
        return await handleSetPlan(req, env, token, origin);
      }
      if (url.pathname === "/v1/state" && req.method === "GET") {
        return await handleGetState(env, token, ws, origin);
      }
      if (url.pathname === "/v1/state" && req.method === "PUT") {
        return await handlePutState(req, env, token, ws, origin);
      }
      if (url.pathname === "/v1/state" && req.method === "DELETE") {
        return await handleDeleteAll(env, ws, origin);
      }

      // ─── Data endpoints ───────────────────────────────────────────────────
      if (url.pathname === "/v1/data/periods" && req.method === "GET") {
        return await handleListPeriods(env, token, ws, origin);
      }
      if (url.pathname === "/v1/data/periods" && req.method === "POST") {
        return await handleUpsertPeriod(req, env, token, ws, origin);
      }
      // /v1/data/periods/:periodId
      const periodMatch = url.pathname.match(/^\/v1\/data\/periods\/([^/]+)$/);
      if (periodMatch?.[1] && req.method === "DELETE") {
        return await handleDeletePeriod(env, token, ws, periodMatch[1], origin);
      }
      // /v1/data/periods/:periodId/datasets/:datasetId
      const datasetMatch = url.pathname.match(/^\/v1\/data\/periods\/([^/]+)\/datasets\/([^/]+)$/);
      if (datasetMatch?.[1] && datasetMatch[2]) {
        const pId = datasetMatch[1];
        const dsId = datasetMatch[2];
        if (req.method === "GET")    return await handleGetDataset(env, token, ws, pId, dsId, origin);
        if (req.method === "PUT")    return await handlePutDataset(req, env, token, ws, pId, dsId, origin);
        if (req.method === "DELETE") return await handleDeleteDataset(env, token, ws, pId, dsId, origin);
      }

      // ─── Ekip: kullanıcılar, denetim, kilitler (masaüstüyle aynı yollar) ──
      if (url.pathname === "/v1/admin/users") {
        if (req.method === "GET") return send(await listUsers(env.DB, ws));
        if (req.method === "POST") return send(await createUser(env.DB, ws, await readJson()));
      }
      const userMatch = url.pathname.match(/^\/v1\/admin\/users\/([^/]+)$/);
      if (userMatch?.[1]) {
        const userId = decodeURIComponent(userMatch[1]);
        if (req.method === "PATCH") return send(await updateUser(env.DB, ws, userId, await readJson()));
        if (req.method === "DELETE") return send(await deleteUser(env.DB, ws, userId));
      }
      if (url.pathname === "/v1/audit" && req.method === "GET") {
        return send(await listAuditEvents(env.DB, ws, url.searchParams.get("limit")));
      }
      if (url.pathname === "/v1/locks/acquire" && req.method === "POST") {
        const b = await readJson();
        return send(await acquireLock(env.DB, ws, typeof b.lock_key === "string" ? b.lock_key : ""));
      }
      if (url.pathname === "/v1/locks/force-acquire" && req.method === "POST") {
        const b = await readJson();
        return send(await forceAcquireLock(env.DB, ws, typeof b.lock_key === "string" ? b.lock_key : ""));
      }
      if (url.pathname.startsWith("/v1/locks/")) {
        const key = decodeURIComponent(url.pathname.slice("/v1/locks/".length));
        if (req.method === "GET") return send(await getLock(env.DB, ws, key));
        if (req.method === "DELETE") return send(await releaseLock(env.DB, ws, key));
      }

      return err(404, "not_found", origin);
    } catch (e) {
      if (e instanceof TeamError) {
        // Masaüstü (FastAPI) biçimi: istemci `detail` alanını okur.
        return json({ error: e.code, message: e.code, detail: e.detail ?? e.code }, { status: e.status }, origin);
      }
      const msg = e instanceof Error ? e.message : "internal_error";
      return err(500, "internal_error", origin, msg);
    }
  },
} satisfies ExportedHandler<Env>;
