/**
 * Ekip çalışma alanı — masaüstü (enterprise-v2) paylaşımlı modelinin web karşılığı.
 *
 * Masaüstünde tüm kullanıcılar tek bir `team_state` üzerinde çalışır; kullanıcı
 * yönetimi, denetim günlüğü ve model kilidi bu paylaşıma göre tasarlanmıştır. Web'de
 * her kullanıcının kendi çalışma alanı vardır (kimliği = kendi uid'i). Yönetici başka
 * birini e-postayla eklerse o kişi giriş yaptığında yöneticinin alanına bağlanır.
 *
 * Yanıt gövdeleri masaüstü FastAPI uç noktalarıyla aynı biçimdedir; böylece
 * masaüstünden taşınan ekranlar değişmeden çalışır.
 */

import { readState } from "./state-store";

export type Role = "admin" | "user";

export interface Workspace {
  /** Veri satırlarının anahtarı (sahibin uid'i). */
  id: string;
  role: Role;
  isOwner: boolean;
  /** İşlemi yapanın görünen adı (denetim, kilit, "son güncelleyen"). */
  actorName: string;
  actorUid: string;
}

export class TeamError extends Error {
  constructor(public status: number, public code: string, public detail?: unknown) {
    super(code);
  }
}

export interface Result {
  status: number;
  body: unknown;
}

const ok = (body: unknown, status = 200): Result => ({ status, body });

export const LOCK_TTL_MS = 180_000; // masaüstüyle aynı: 3 dk, istemci 60 sn'de bir yeniler

const normEmail = (e: string) => e.trim().toLowerCase();

// ─── Çalışma alanı çözümleme ──────────────────────────────────────────────────

interface MemberRow {
  workspace_id: string;
  email: string;
  uid: string | null;
  role: Role;
  is_active: number;
}

/**
 * İsteği yapan kullanıcının çalışma alanını bulur.
 * Aktif bir üyelik varsa o alana bağlanır (ilk girişte uid kaydedilir);
 * pasif üyelik → 403 (masaüstünde pasif kullanıcı giriş yapamaz).
 * Üyelik yoksa kullanıcının kendi alanı ve rolü admin'dir.
 */
export async function resolveWorkspace(db: D1Database, uid: string, email: string): Promise<Workspace> {
  const mail = normEmail(email);
  const actorName = email || uid;
  if (mail) {
    const row = await db
      .prepare(
        "SELECT workspace_id, email, uid, role, is_active FROM workspace_members WHERE email = ? AND workspace_id != ? ORDER BY invited_at DESC LIMIT 1",
      )
      .bind(mail, uid)
      .first<MemberRow>();
    if (row) {
      if (!row.is_active) throw new TeamError(403, "user_inactive");
      if (row.uid !== uid) {
        await db
          .prepare("UPDATE workspace_members SET uid = ?, joined_at = ? WHERE workspace_id = ? AND email = ?")
          .bind(uid, Date.now(), row.workspace_id, mail)
          .run();
      }
      return { id: row.workspace_id, role: row.role, isOwner: false, actorName, actorUid: uid };
    }
  }
  return { id: uid, role: "admin", isOwner: true, actorName, actorUid: uid };
}

export function requireAdmin(ws: Workspace): void {
  if (ws.role !== "admin") throw new TeamError(403, "admin_required");
}

// ─── Kullanıcı yönetimi (/v1/admin/users) ─────────────────────────────────────
// Masaüstü: {id, username, role, is_active}. Web'de kimlik e-postadır ve parola
// Firebase'dedir; `id` ve `username` e-posta olarak döner.

export interface UserOut {
  id: string;
  username: string;
  role: Role;
  is_active: boolean;
  is_owner?: boolean;
  joined?: boolean;
}

export async function listUsers(db: D1Database, ws: Workspace): Promise<Result> {
  requireAdmin(ws);
  const owner = await db.prepare("SELECT email FROM users WHERE uid = ?").bind(ws.id).first<{ email: string }>();
  const rows = await db
    .prepare("SELECT email, uid, role, is_active FROM workspace_members WHERE workspace_id = ? ORDER BY invited_at ASC")
    .bind(ws.id)
    .all<{ email: string; uid: string | null; role: Role; is_active: number }>();
  const out: UserOut[] = [];
  if (owner) {
    out.push({ id: normEmail(owner.email), username: owner.email, role: "admin", is_active: true, is_owner: true, joined: true });
  }
  for (const r of rows.results) {
    out.push({ id: r.email, username: r.email, role: r.role, is_active: !!r.is_active, joined: !!r.uid });
  }
  return ok(out);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function createUser(
  db: D1Database,
  ws: Workspace,
  body: { username?: unknown; role?: unknown },
): Promise<Result> {
  requireAdmin(ws);
  const owner = await db
    .prepare("SELECT email, team_enabled FROM users WHERE uid = ?")
    .bind(ws.id)
    .first<{ email: string; team_enabled: number }>();
  // Çoklu kullanıcı Enterprise özelliği (fiyat sayfası böyle satıyor). Koltuk
  // başı fiyat olmadığından Pro'ya açmak ₺100'ye sınırsız kullanıcı demekti.
  if (!owner?.team_enabled) throw new TeamError(403, "team_requires_enterprise");

  const email = typeof body.username === "string" ? normEmail(body.username) : "";
  if (!EMAIL_RE.test(email)) throw new TeamError(400, "invalid_email");
  const role: Role = body.role === "admin" ? "admin" : "user";

  if (owner && normEmail(owner.email) === email) throw new TeamError(409, "username_exists");
  const existing = await db
    .prepare("SELECT workspace_id FROM workspace_members WHERE email = ?")
    .bind(email)
    .all<{ workspace_id: string }>();
  if (existing.results.some((r) => r.workspace_id === ws.id)) throw new TeamError(409, "username_exists");
  // Bir kişi aynı anda tek bir ekipte olabilir (durumu tek alana bağlanır).
  if (existing.results.length > 0) throw new TeamError(409, "member_of_other_workspace");

  await db
    .prepare("INSERT INTO workspace_members (workspace_id, email, uid, role, is_active, invited_at) VALUES (?, ?, NULL, ?, 1, ?)")
    .bind(ws.id, email, role, Date.now())
    .run();
  await appendAuditEvent(db, ws, { action: "admin.user_created", details: { module: "users", target: email, role } });
  return ok({ id: email, username: email, role, is_active: true, joined: false } satisfies UserOut, 201);
}

export async function updateUser(
  db: D1Database,
  ws: Workspace,
  userId: string,
  body: { role?: unknown; is_active?: unknown },
): Promise<Result> {
  requireAdmin(ws);
  const email = normEmail(userId);
  const row = await db
    .prepare("SELECT email, uid, role, is_active FROM workspace_members WHERE workspace_id = ? AND email = ?")
    .bind(ws.id, email)
    .first<{ email: string; uid: string | null; role: Role; is_active: number }>();
  if (!row) throw new TeamError(404, "user_not_found");
  const role: Role = body.role === "admin" || body.role === "user" ? body.role : row.role;
  const active = typeof body.is_active === "boolean" ? (body.is_active ? 1 : 0) : row.is_active;
  await db
    .prepare("UPDATE workspace_members SET role = ?, is_active = ? WHERE workspace_id = ? AND email = ?")
    .bind(role, active, ws.id, email)
    .run();
  await appendAuditEvent(db, ws, {
    action: "admin.user_updated",
    details: { module: "users", target: email, role, is_active: !!active },
  });
  return ok({ id: email, username: email, role, is_active: !!active, joined: !!row.uid } satisfies UserOut);
}

export async function deleteUser(db: D1Database, ws: Workspace, userId: string): Promise<Result> {
  requireAdmin(ws);
  const email = normEmail(userId);
  if (email === normEmail(ws.actorName)) throw new TeamError(400, "cannot_delete_self");
  const row = await db
    .prepare("SELECT uid FROM workspace_members WHERE workspace_id = ? AND email = ?")
    .bind(ws.id, email)
    .first<{ uid: string | null }>();
  if (!row) throw new TeamError(404, "user_not_found");
  await db.prepare("DELETE FROM workspace_members WHERE workspace_id = ? AND email = ?").bind(ws.id, email).run();
  // Çıkarılan üyenin tuttuğu kilitler bırakılır.
  if (row.uid) {
    await db.prepare("DELETE FROM model_locks WHERE workspace_id = ? AND locked_by_uid = ?").bind(ws.id, row.uid).run();
  }
  await appendAuditEvent(db, ws, { action: "admin.user_deleted", details: { module: "users", target: email } });
  return ok(null, 204);
}

// ─── Model kilitleri (/v1/locks) ──────────────────────────────────────────────

interface LockRow {
  locked_by_uid: string;
  locked_by_name: string;
  locked_at: number;
  expires_at: number;
}

const iso = (ms: number) => new Date(ms).toISOString();

async function purgeExpired(db: D1Database, ws: Workspace, key: string, now: number) {
  await db
    .prepare("DELETE FROM model_locks WHERE workspace_id = ? AND lock_key = ? AND expires_at < ?")
    .bind(ws.id, key, now)
    .run();
}

async function readLock(db: D1Database, ws: Workspace, key: string) {
  return db
    .prepare("SELECT locked_by_uid, locked_by_name, locked_at, expires_at FROM model_locks WHERE workspace_id = ? AND lock_key = ?")
    .bind(ws.id, key)
    .first<LockRow>();
}

function lockBody(key: string, row: LockRow, actorUid: string) {
  return {
    locked: true,
    lock_key: key,
    locked_by_id: row.locked_by_uid,
    locked_by_name: row.locked_by_name,
    locked_at: iso(row.locked_at),
    expires_at: iso(row.expires_at),
    is_mine: row.locked_by_uid === actorUid,
  };
}

function lockedError(row: LockRow | null): TeamError {
  return new TeamError(423, "locked", {
    code: "locked",
    locked_by_name: row?.locked_by_name ?? "?",
    expires_at: row ? iso(row.expires_at) : null,
  });
}

export async function getLock(db: D1Database, ws: Workspace, key: string, now = Date.now()): Promise<Result> {
  await purgeExpired(db, ws, key, now);
  const row = await readLock(db, ws, key);
  if (!row) return ok({ locked: false, lock_key: key, is_mine: false });
  return ok(lockBody(key, row, ws.actorUid));
}

export async function acquireLock(db: D1Database, ws: Workspace, key: string, now = Date.now()): Promise<Result> {
  if (!key) throw new TeamError(400, "missing_lock_key");
  await purgeExpired(db, ws, key, now);
  const expires = now + LOCK_TTL_MS;
  // INSERT OR IGNORE atomiktir: aynı anda iki istek gelirse yalnız biri satırı alır.
  await db
    .prepare(
      "INSERT OR IGNORE INTO model_locks (workspace_id, lock_key, locked_by_uid, locked_by_name, locked_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(ws.id, key, ws.actorUid, ws.actorName, now, expires)
    .run();
  // Benim kilidimse yenile (heartbeat); başkasınınsa 423.
  const upd = await db
    .prepare("UPDATE model_locks SET expires_at = ? WHERE workspace_id = ? AND lock_key = ? AND locked_by_uid = ?")
    .bind(expires, ws.id, key, ws.actorUid)
    .run();
  const row = await readLock(db, ws, key);
  if (!upd.meta.changes || !row) throw lockedError(row);
  return ok(lockBody(key, row, ws.actorUid));
}

export async function forceAcquireLock(db: D1Database, ws: Workspace, key: string, now = Date.now()): Promise<Result> {
  if (!key) throw new TeamError(400, "missing_lock_key");
  const expires = now + LOCK_TTL_MS;
  await db.prepare("DELETE FROM model_locks WHERE workspace_id = ? AND lock_key = ?").bind(ws.id, key).run();
  await db
    .prepare(
      "INSERT OR REPLACE INTO model_locks (workspace_id, lock_key, locked_by_uid, locked_by_name, locked_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(ws.id, key, ws.actorUid, ws.actorName, now, expires)
    .run();
  return ok(lockBody(key, { locked_by_uid: ws.actorUid, locked_by_name: ws.actorName, locked_at: now, expires_at: expires }, ws.actorUid));
}

export async function releaseLock(db: D1Database, ws: Workspace, key: string): Promise<Result> {
  await db
    .prepare("DELETE FROM model_locks WHERE workspace_id = ? AND lock_key = ? AND locked_by_uid = ?")
    .bind(ws.id, key, ws.actorUid)
    .run();
  return ok(null, 204);
}

// ─── Denetim günlüğü ──────────────────────────────────────────────────────────

const randomId = () => crypto.randomUUID().replace(/-/g, "");

export async function appendAuditEvent(
  db: D1Database,
  ws: Workspace,
  ev: { action: string; source?: "user" | "agent"; details?: Record<string, unknown> | null; branchId?: string | null; occurredAt?: number },
): Promise<void> {
  try {
    await db
      .prepare(
        "INSERT OR IGNORE INTO audit_events (workspace_id, event_id, occurred_at, actor_uid, actor_name, source, action, branch_id, details_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        ws.id,
        randomId(),
        ev.occurredAt ?? Date.now(),
        ws.actorUid,
        ws.actorName,
        ev.source ?? "user",
        ev.action.slice(0, 100),
        ev.branchId ?? null,
        ev.details ? JSON.stringify(ev.details) : null,
      )
      .run();
  } catch {
    // Uygulama-geneli olaylar ana işlemi geri almaz (masaüstündeki gibi).
  }
}

/**
 * Proje ağacındaki branş `history` kayıtlarını değiştirilemez audit tablosuna yazar.
 * Aynı kayıt her senkronda tekrar gelse de (workspace_id, event_id) birincil anahtarı
 * sayesinde tek satır kalır. Aktör istemciden alınmaz, oturumdaki kullanıcıdır.
 */
export function projectAuditStatements(db: D1Database, ws: Workspace, project: unknown): D1PreparedStatement[] {
  const out: D1PreparedStatement[] = [];
  if (!project || typeof project !== "object") return out;
  const periods = (project as { periods?: unknown }).periods;
  if (!Array.isArray(periods)) return out;
  for (const period of periods) {
    const branches = (period as { branches?: unknown })?.branches;
    if (!Array.isArray(branches)) continue;
    for (const branch of branches as Record<string, unknown>[]) {
      if (!branch || typeof branch !== "object") continue;
      const branchId = branch.id != null ? String(branch.id) : null;
      const history = branch.history;
      if (!Array.isArray(history)) continue;
      for (const event of history as Record<string, unknown>[]) {
        if (!event || typeof event !== "object") continue;
        const { id, action, timestamp } = event;
        if (typeof id !== "string" || typeof action !== "string" || typeof timestamp !== "string") continue;
        const t = Date.parse(timestamp);
        const details: Record<string, unknown> =
          event.details && typeof event.details === "object" ? { ...(event.details as Record<string, unknown>) } : {};
        if (!("module" in details)) details.module = action.startsWith("cashflow_") ? "cashflow" : "reserve";
        if (!("branch_name" in details)) details.branch_name = branch.name ?? branchId;
        out.push(
          db
            .prepare(
              "INSERT OR IGNORE INTO audit_events (workspace_id, event_id, occurred_at, actor_uid, actor_name, source, action, branch_id, details_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            )
            .bind(
              ws.id,
              id,
              Number.isFinite(t) ? t : Date.now(),
              ws.actorUid,
              ws.actorName,
              event.source === "agent" ? "agent" : "user",
              action.slice(0, 100),
              branchId,
              JSON.stringify(details),
            ),
        );
      }
    }
  }
  return out;
}

export async function listAuditEvents(db: D1Database, ws: Workspace, limitRaw: string | null): Promise<Result> {
  requireAdmin(ws);
  const n = Number(limitRaw ?? 200);
  const limit = Number.isFinite(n) ? Math.min(1000, Math.max(1, Math.floor(n))) : 200;
  const rows = await db
    .prepare(
      "SELECT event_id, occurred_at, actor_name, source, action, branch_id, details_json FROM audit_events WHERE workspace_id = ? ORDER BY occurred_at DESC LIMIT ?",
    )
    .bind(ws.id, limit)
    .all<{ event_id: string; occurred_at: number; actor_name: string; source: string; action: string; branch_id: string | null; details_json: string | null }>();

  // Eski kayıtlarda yalnız branch_id olabilir: güncel proje ağacından okunur ad çöz.
  const branchNames: Record<string, string> = {};
  try {
    // Durum parçalı saklanabiliyor; satırdaki project_json'ı doğrudan okumak
    // büyük projelerde boş döner ve adlar sessizce ID'ye düşerdi.
    const state = await readState(db, ws.id);
    const project = state?.project ? JSON.parse(state.project) : {};
    for (const p of project.periods ?? []) {
      for (const b of p.branches ?? []) if (b?.id && b?.name) branchNames[String(b.id)] = String(b.name);
    }
  } catch {
    /* bozuk proje JSON'u ad çözmeyi engellemez */
  }

  const events = rows.results.map((r) => {
    let details: unknown = null;
    try {
      details = r.details_json ? JSON.parse(r.details_json) : null;
    } catch {
      details = null;
    }
    return {
      id: r.event_id,
      timestamp: iso(r.occurred_at),
      actor: r.actor_name,
      source: r.source,
      action: r.action,
      branch_id: r.branch_id,
      branch_name: r.branch_id ? branchNames[r.branch_id] ?? null : null,
      details,
    };
  });
  return ok({ events });
}
