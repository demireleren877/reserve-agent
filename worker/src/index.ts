import { AuthError, verifyIdToken, type VerifiedToken } from "./auth";

interface Env {
  DB: D1Database;
  ALLOWED_ORIGIN: string;
  FIREBASE_PROJECT_ID: string;
  PADDLE_WEBHOOK_SECRET: string;
}

type Plan = "free" | "pro";

interface UserRow {
  uid: string;
  email: string;
  plan: Plan;
  plan_selected_at: number | null;
  created_at: number;
  updated_at: number;
}

interface StateRow {
  project_json: string | null;
  chat_json: string | null;
  version: number;
  updated_at: number;
}

function corsHeaders(origin: string): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
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
    "SELECT uid, email, plan, plan_selected_at, created_at, updated_at FROM users WHERE uid = ?",
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
    created_at: now,
    updated_at: now,
  };
  await env.DB.prepare(
    "INSERT INTO users (uid, email, plan, plan_selected_at, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?)",
  )
    .bind(row.uid, row.email, row.plan, row.created_at, row.updated_at)
    .run();
  return row;
}

async function handleMe(env: Env, t: VerifiedToken, origin: string) {
  const user = await ensureUser(env, t);
  return json(
    {
      uid: user.uid,
      email: user.email,
      plan: user.plan,
      hasPlan: user.plan_selected_at !== null,
    },
    { status: 200 },
    origin,
  );
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
  await ensureUser(env, t);
  const now = Date.now();
  await env.DB.prepare(
    "UPDATE users SET plan = ?, plan_selected_at = ?, updated_at = ? WHERE uid = ?",
  )
    .bind(plan, now, now, t.uid)
    .run();
  return json({ uid: t.uid, plan, updated_at: now }, { status: 200 }, origin);
}

async function handleGetState(env: Env, t: VerifiedToken, origin: string) {
  await ensureUser(env, t);
  const row = await env.DB.prepare(
    "SELECT project_json, chat_json, version, updated_at FROM user_state WHERE uid = ?",
  )
    .bind(t.uid)
    .first<StateRow>();

  if (!row) {
    return json(
      { project: null, chat: null, version: 0, updated_at: 0 },
      { status: 200 },
      origin,
    );
  }

  return json(
    {
      project: row.project_json ? JSON.parse(row.project_json) : null,
      chat: row.chat_json ? JSON.parse(row.chat_json) : null,
      version: row.version,
      updated_at: row.updated_at,
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

const MAX_BLOB_BYTES = 900 * 1024; // D1 row practical limit ~1 MB; leave headroom

async function handlePutState(
  req: Request,
  env: Env,
  t: VerifiedToken,
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

  const projectBytes = projectStr ? new TextEncoder().encode(projectStr).length : 0;
  const chatBytes = chatStr ? new TextEncoder().encode(chatStr).length : 0;
  if (projectBytes + chatBytes > MAX_BLOB_BYTES) {
    return err(
      413,
      "state_too_large",
      origin,
      `state exceeds ${MAX_BLOB_BYTES} bytes`,
    );
  }

  const now = Date.now();
  const existing = await env.DB.prepare(
    "SELECT project_json, chat_json, version FROM user_state WHERE uid = ?",
  )
    .bind(t.uid)
    .first<{ project_json: string | null; chat_json: string | null; version: number }>();

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

  const nextProject =
    projectStr !== undefined ? projectStr : existing?.project_json ?? null;
  const nextChat =
    chatStr !== undefined ? chatStr : existing?.chat_json ?? null;
  const nextVersion = currentVersion + 1;

  if (existing) {
    await env.DB.prepare(
      "UPDATE user_state SET project_json = ?, chat_json = ?, version = ?, updated_at = ? WHERE uid = ?",
    )
      .bind(nextProject, nextChat, nextVersion, now, t.uid)
      .run();
  } else {
    await env.DB.prepare(
      "INSERT INTO user_state (uid, project_json, chat_json, version, updated_at) VALUES (?, ?, ?, ?, ?)",
    )
      .bind(t.uid, nextProject, nextChat, nextVersion, now)
      .run();
  }

  return json(
    { version: nextVersion, updated_at: now },
    { status: 200 },
    origin,
  );
}

async function handleDeleteAll(env: Env, t: VerifiedToken, origin: string) {
  await env.DB.prepare("DELETE FROM user_state WHERE uid = ?").bind(t.uid).run();
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

  // Constant-time compare is not critical for webhook secrets (no timing oracle
  // on this path), but we do a simple string equality.
  return { ok: computed === h1, body };
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
  const activatingEvents = new Set([
    "subscription.activated",
    "subscription.updated",
    "transaction.completed",
  ]);

  if (uid && activatingEvents.has(event.event_type ?? "")) {
    const now = Date.now();
    await env.DB.prepare(
      "UPDATE users SET plan = 'pro', plan_selected_at = ?, updated_at = ? WHERE uid = ?",
    )
      .bind(now, now, uid)
      .run();
  }

  return new Response("ok", { status: 200 });
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
      if (url.pathname === "/v1/me" && req.method === "GET") {
        return await handleMe(env, token, origin);
      }
      if (url.pathname === "/v1/me/plan" && req.method === "POST") {
        return await handleSetPlan(req, env, token, origin);
      }
      if (url.pathname === "/v1/state" && req.method === "GET") {
        return await handleGetState(env, token, origin);
      }
      if (url.pathname === "/v1/state" && req.method === "PUT") {
        return await handlePutState(req, env, token, origin);
      }
      if (url.pathname === "/v1/state" && req.method === "DELETE") {
        return await handleDeleteAll(env, token, origin);
      }
      return err(404, "not_found", origin);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "internal_error";
      return err(500, "internal_error", origin, msg);
    }
  },
} satisfies ExportedHandler<Env>;
