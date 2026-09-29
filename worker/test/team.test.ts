import { beforeEach, describe, expect, it, vi } from "vitest";
import { createD1 } from "./d1-shim";

// Firebase doğrulaması taklit: "Bearer uid|email" → token.
vi.mock("../src/auth", () => {
  class AuthError extends Error {
    constructor(public status: number, message: string) {
      super(message);
    }
  }
  return {
    AuthError,
    verifyIdToken: async (tok: string) => {
      const [uid, email] = tok.split("|");
      if (!uid) throw new AuthError(401, "bad_token");
      return { uid, email: email ?? "" };
    },
  };
});

const { default: worker } = await import("../src/index");

let env: Record<string, unknown>;
beforeEach(() => {
  env = { DB: createD1(), ALLOWED_ORIGIN: "http://localhost:3000", FIREBASE_PROJECT_ID: "x" };
});

async function call(who: string, method: string, path: string, body?: unknown) {
  const req = new Request(`https://w.test${path}`, {
    method,
    headers: { Authorization: `Bearer ${who}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const res = await worker.fetch(req as never, env as never, {} as never);
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const OWNER = "u-owner|owner@acme.com";
const MEMBER = "u-mem|mem@acme.com";
const OTHER = "u-other|other@else.com";

describe("çalışma alanı", () => {
  it("üye olmayan kullanıcı kendi alanının yöneticisidir", async () => {
    const me = await call(OWNER, "GET", "/v1/me");
    expect(me.status).toBe(200);
    expect(me.body.role).toBe("admin");
    expect(me.body.workspace).toEqual({ id: "u-owner", is_owner: true, owner_email: "owner@acme.com" });
  });

  it("eklenen üye sahibin durumunu, dönemlerini ve planını paylaşır", async () => {
    await call(OWNER, "GET", "/v1/me");
    await call(OWNER, "PUT", "/v1/state", { project: { periods: [] }, chat: null });
    await call(OWNER, "POST", "/v1/data/periods", { period_id: "p1", label: "2025Q4" });
    const add = await call(OWNER, "POST", "/v1/admin/users", { username: "Mem@Acme.com", password: "yok", role: "user" });
    expect(add.status).toBe(201);
    expect(add.body).toMatchObject({ id: "mem@acme.com", role: "user", is_active: true });

    const me = await call(MEMBER, "GET", "/v1/me");
    expect(me.body.role).toBe("user");
    expect(me.body.workspace.id).toBe("u-owner");
    expect(me.body.hasPlan).toBe(true);

    const st = await call(MEMBER, "GET", "/v1/state");
    expect(st.body.project).toEqual({ periods: [] });
    expect(st.body.updated_by_name).toBe("owner@acme.com");
    const periods = await call(MEMBER, "GET", "/v1/data/periods");
    expect(periods.body.map((p: { label: string }) => p.label)).toEqual(["2025Q4"]);

    // Başka biri paylaşımdan etkilenmez.
    expect((await call(OTHER, "GET", "/v1/data/periods")).body).toEqual([]);
  });

  it("pasif üye erişemez; kullanıcı yönetimi yalnız yöneticiye açıktır", async () => {
    await call(OWNER, "GET", "/v1/me");
    await call(OWNER, "POST", "/v1/admin/users", { username: "mem@acme.com", role: "user" });
    expect((await call(MEMBER, "GET", "/v1/admin/users")).status).toBe(403);
    expect((await call(MEMBER, "GET", "/v1/audit")).status).toBe(403);
    const upd = await call(OWNER, "PATCH", "/v1/admin/users/mem%40acme.com", { is_active: false });
    expect(upd.body.is_active).toBe(false);
    const blocked = await call(MEMBER, "GET", "/v1/state");
    expect(blocked.status).toBe(403);
    expect(blocked.body.detail).toBe("user_inactive");
  });

  it("üye plan değiştiremez; kendini ve sahibi silemez", async () => {
    await call(OWNER, "GET", "/v1/me");
    await call(OWNER, "POST", "/v1/admin/users", { username: "mem@acme.com", role: "admin" });
    expect((await call(MEMBER, "POST", "/v1/me/plan", { plan: "pro" })).status).toBe(403);
    expect((await call(MEMBER, "DELETE", "/v1/admin/users/mem%40acme.com")).status).toBe(400);
    expect((await call(MEMBER, "DELETE", "/v1/admin/users/owner%40acme.com")).status).toBe(404);
    const list = await call(MEMBER, "GET", "/v1/admin/users");
    expect(list.body.map((u: { id: string }) => u.id)).toEqual(["owner@acme.com", "mem@acme.com"]);
  });

  it("aynı kişi iki ekibe eklenemez, geçersiz e-posta reddedilir", async () => {
    await call(OWNER, "GET", "/v1/me");
    await call(OTHER, "GET", "/v1/me");
    await call(OWNER, "POST", "/v1/admin/users", { username: "mem@acme.com" });
    expect((await call(OWNER, "POST", "/v1/admin/users", { username: "mem@acme.com" })).status).toBe(409);
    const clash = await call(OTHER, "POST", "/v1/admin/users", { username: "mem@acme.com" });
    expect(clash.status).toBe(409);
    expect(clash.body.detail).toBe("member_of_other_workspace");
    expect((await call(OWNER, "POST", "/v1/admin/users", { username: "yok" })).status).toBe(400);
  });
});

describe("durum yazımı", () => {
  it("beklenen sürüm tutmazsa 409 döner", async () => {
    const a = await call(OWNER, "PUT", "/v1/state", { project: { v: 1 }, expectedVersion: 0 });
    expect(a.body.version).toBe(1);
    expect((await call(OWNER, "PUT", "/v1/state", { project: { v: 2 }, expectedVersion: 0 })).status).toBe(409);
    expect((await call(OWNER, "PUT", "/v1/state", { project: { v: 2 }, expectedVersion: 1 })).body.version).toBe(2);
  });

  it("proje geçmişi değiştirilemez denetim günlüğüne tek kez yazılır", async () => {
    const project = {
      periods: [
        {
          branches: [
            {
              id: "b1",
              name: "Motor",
              history: [
                { id: "e1", action: "exclude_cells", timestamp: "2026-01-14T11:32:00Z", source: "agent", details: { cells: 1 } },
                { id: "e2", action: "cashflow_run", timestamp: "2026-01-14T11:40:00Z" },
              ],
            },
          ],
        },
      ],
    };
    await call(OWNER, "PUT", "/v1/state", { project });
    await call(OWNER, "PUT", "/v1/state", { project }); // tekrar senkron → tekrar yazılmaz
    await call(OWNER, "POST", "/v1/data/periods", { period_id: "p1", label: "2025Q4" });
    const audit = await call(OWNER, "GET", "/v1/audit?limit=50");
    const ids = audit.body.events.map((e: { action: string }) => e.action);
    expect(ids.filter((a: string) => a === "exclude_cells")).toHaveLength(1);
    expect(ids).toContain("data.period_saved");
    const ex = audit.body.events.find((e: { action: string }) => e.action === "exclude_cells");
    expect(ex).toMatchObject({ actor: "owner@acme.com", source: "agent", branch_id: "b1", branch_name: "Motor" });
    expect(ex.details).toMatchObject({ cells: 1, module: "reserve" });
    const cf = audit.body.events.find((e: { action: string }) => e.action === "cashflow_run");
    expect(cf.details.module).toBe("cashflow");
  });
});

describe("model kilidi", () => {
  beforeEach(async () => {
    await call(OWNER, "GET", "/v1/me");
    await call(OWNER, "POST", "/v1/admin/users", { username: "mem@acme.com" });
  });

  it("ikinci kullanıcı 423 alır, sahibi yenileyebilir, bırakınca serbest kalır", async () => {
    const a = await call(OWNER, "POST", "/v1/locks/acquire", { lock_key: "p1/b1" });
    expect(a.body).toMatchObject({ locked: true, is_mine: true, locked_by_name: "owner@acme.com" });
    const b = await call(MEMBER, "POST", "/v1/locks/acquire", { lock_key: "p1/b1" });
    expect(b.status).toBe(423);
    expect(b.body.detail).toMatchObject({ code: "locked", locked_by_name: "owner@acme.com" });
    expect((await call(OWNER, "POST", "/v1/locks/acquire", { lock_key: "p1/b1" })).status).toBe(200);
    const st = await call(MEMBER, "GET", "/v1/locks/p1%2Fb1");
    expect(st.body).toMatchObject({ locked: true, is_mine: false });
    // Başkasının kilidini bırakmaya çalışmak etkisizdir.
    await call(MEMBER, "DELETE", "/v1/locks/p1%2Fb1");
    expect((await call(MEMBER, "GET", "/v1/locks/p1%2Fb1")).body.locked).toBe(true);
    expect((await call(OWNER, "DELETE", "/v1/locks/p1%2Fb1")).status).toBe(204);
    expect((await call(MEMBER, "POST", "/v1/locks/acquire", { lock_key: "p1/b1" })).status).toBe(200);
  });

  it("zorla devralma kilidi alır; kilitler çalışma alanına özeldir", async () => {
    await call(OWNER, "POST", "/v1/locks/acquire", { lock_key: "k" });
    const f = await call(MEMBER, "POST", "/v1/locks/force-acquire", { lock_key: "k" });
    expect(f.body).toMatchObject({ is_mine: true, locked_by_name: "mem@acme.com" });
    // Başka ekip aynı anahtarı bağımsız kilitler.
    expect((await call(OTHER, "POST", "/v1/locks/acquire", { lock_key: "k" })).status).toBe(200);
  });

  it("süresi dolan kilit başkası tarafından alınabilir", async () => {
    const now = Date.now();
    const spy = vi.spyOn(Date, "now").mockReturnValue(now);
    await call(OWNER, "POST", "/v1/locks/acquire", { lock_key: "k" });
    spy.mockReturnValue(now + 181_000);
    expect((await call(MEMBER, "POST", "/v1/locks/acquire", { lock_key: "k" })).status).toBe(200);
    spy.mockRestore();
  });

  it("üye çıkarılınca tuttuğu kilitler bırakılır", async () => {
    await call(MEMBER, "POST", "/v1/locks/acquire", { lock_key: "k" });
    await call(OWNER, "DELETE", "/v1/admin/users/mem%40acme.com");
    expect((await call(OWNER, "GET", "/v1/locks/k")).body.locked).toBe(false);
  });
});
