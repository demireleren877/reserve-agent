import { beforeEach, describe, expect, it, vi } from "vitest";
import { createD1 } from "./d1-shim";
import { chunkStatements, planKind, readState, splitString, STATE_INLINE_BYTES } from "../src/state-store";

/**
 * Proje durumunun parçalı saklanması.
 *
 * Proje her branşın dosya bazlı verisini taşıyor; tek branşlı gerçek veriyle
 * bir çeyrek ~180 KB. Durum tek satırdayken sınır 900 KB'tı ve aşılınca
 * senkron sessizce duruyordu — birkaç branşlı bir müşteri ilk dönemde.
 */

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
const db = () => env.DB as D1Database;

const ME = "u-me|me@acme.com";
async function call(method: string, path: string, body?: unknown, who = ME) {
  const req = new Request(`https://w.test${path}`, {
    method,
    headers: { Authorization: `Bearer ${who}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const res = await worker.fetch(req as never, env as never, {} as never);
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

/** fileData taşıyan, verilen boyuta ulaşan bir proje. */
function project(targetBytes: number, tag = "A") {
  const fileData: Record<string, Record<string, Record<string, { p: number; o: number }>>> = {};
  let bytes = 0;
  for (let i = 0; bytes < targetBytes; i++) {
    const origin = String(2010 + (i % 16));
    const dev = `2026-0${1 + (i % 9)}-30`;
    ((fileData[origin] ??= {})[dev] ??= {})[`${tag}-HSR-${i}`] = { p: i * 1.5, o: i % 7 };
    bytes += 40;
  }
  return {
    periods: [{ id: "p1", label: "2026Q1", branches: [{ id: "b1", name: "YANGIN ŞİRKET", fileData }] }],
    tag,
  };
}
const size = (v: unknown) => Buffer.byteLength(JSON.stringify(v), "utf8");

describe("durum boyutu", () => {
  it("eski 900 KB sınırını aşan proje kaydedilir ve aynen okunur", async () => {
    const p = project(3_000_000);
    expect(size(p)).toBeGreaterThan(STATE_INLINE_BYTES);
    const put = await call("PUT", "/v1/state", { project: p, expectedVersion: 0 });
    expect(put.status).toBe(200);
    const got = await call("GET", "/v1/state");
    expect(got.body.project).toEqual(p);
    expect(got.body.version).toBe(1);
  });

  it("satır içi → parçalı → satır içi geçişlerinde eski parça kalmaz", async () => {
    await call("PUT", "/v1/state", { project: project(1000, "k1"), expectedVersion: 0 });
    await call("PUT", "/v1/state", { project: project(3_000_000, "b"), expectedVersion: 1 });
    const small = project(1000, "k2");
    expect((await call("PUT", "/v1/state", { project: small, expectedVersion: 2 })).status).toBe(200);
    expect((await call("GET", "/v1/state")).body.project).toEqual(small);
    const n = await db().prepare("SELECT COUNT(*) AS n FROM user_state_chunks").first<{ n: number }>();
    expect(n?.n).toBe(0);
  });

  it("yalnız sohbet gönderilince parçalı proje olduğu gibi kalır", async () => {
    const p = project(3_000_000);
    await call("PUT", "/v1/state", { project: p, expectedVersion: 0 });
    expect((await call("PUT", "/v1/state", { chat: [{ role: "user", content: "selam" }], expectedVersion: 1 })).status).toBe(200);
    const got = await call("GET", "/v1/state");
    expect(got.body.project).toEqual(p);
    expect(got.body.chat).toEqual([{ role: "user", content: "selam" }]);
  });

  it("sınırı aşan durum anlaşılır bir 413 ile reddedilir", async () => {
    const big = project(26_000_000);
    expect(size(big)).toBeGreaterThan(16 * 1024 * 1024); // gerçekten sınırın üstünde mi
    const r = await call("PUT", "/v1/state", { project: big, expectedVersion: 0 });
    expect(r.status).toBe(413);
    expect(r.body.error).toBe("state_too_large");
  });

  it("tümünü sil parçaları da siler", async () => {
    await call("PUT", "/v1/state", { project: project(3_000_000), expectedVersion: 0 });
    expect((await call("DELETE", "/v1/state")).status).toBe(200);
    const n = await db().prepare("SELECT COUNT(*) AS n FROM user_state_chunks").first<{ n: number }>();
    expect(n?.n).toBe(0);
    expect((await call("GET", "/v1/state")).body.project).toBeNull();
  });
});

describe("eşzamanlı yazım", () => {
  it("aynı sürümden ikinci yazım 409 alır, ilkinin verisi bozulmaz", async () => {
    await call("PUT", "/v1/state", { project: project(1000, "base"), expectedVersion: 0 });
    const a = project(3_000_000, "A");
    const b = project(3_200_000, "B");
    expect((await call("PUT", "/v1/state", { project: a, expectedVersion: 1 })).status).toBe(200);
    expect((await call("PUT", "/v1/state", { project: b, expectedVersion: 1 })).status).toBe(409);
    expect((await call("GET", "/v1/state")).body.project).toEqual(a);
  });

  it("yarışı kaybeden yazımın parçaları kazananınkini ezemez", async () => {
    // Araya girme senaryosu: B mevcut sürümü (1) okudu; o sırada A yazıp
    // sürümü 2 yaptı. B'nin batch'i şimdi çalışıyor. HTTP'den bu sıralama
    // kurulamadığı için batch'i doğrudan veriyoruz.
    await call("PUT", "/v1/state", { project: project(1000, "base"), expectedVersion: 0 });
    const a = project(3_000_000, "A");
    expect((await call("PUT", "/v1/state", { project: a, expectedVersion: 1 })).status).toBe(200);

    const bStr = JSON.stringify(project(3_200_000, "B"));
    const plans = { project: planKind(bStr, null, 0), chat: planKind(undefined, null, 0) };
    const staleUpdate = db().prepare(
      "UPDATE user_state SET project_json = ?, project_chunks = ?, write_id = ?, version = ? WHERE uid = ? AND version = ?",
    ).bind(plans.project.inline, plans.project.count, "write-B", 2, "u-me", 1); // B hâlâ 1 sanıyor
    const [res] = await db().batch([staleUpdate, ...chunkStatements(db(), "u-me", "write-B", plans)]);
    expect(res?.meta.changes).toBe(0); // sürüm tutmadı

    const st = await readState(db(), "u-me");
    expect(JSON.parse(st!.project!)).toEqual(a); // A'nın parçaları yerinde
  });
});

describe("parçalama", () => {
  it("vekil çiftleri (emoji) ve Türkçe karakterleri bölmeden parçalar", () => {
    const s = "ğüşİıöç🙂".repeat(5000);
    for (const n of [7, 8, 9, 1000, 4097]) {
      const parts = splitString(s, n);
      expect(parts.join("")).toBe(s);
      for (const p of parts) {
        const last = p.charCodeAt(p.length - 1);
        expect(last >= 0xd800 && last <= 0xdbff).toBe(false);
      }
    }
  });
});

describe("denetim günlüğü", () => {
  it("branş adları parçalı projeden de çözülür", async () => {
    await call("PUT", "/v1/state", { project: project(3_000_000), expectedVersion: 0 });
    await db().prepare(
      "INSERT INTO audit_events (event_id, workspace_id, occurred_at, actor_uid, actor_name, source, action, branch_id, details_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind("e1", "u-me", Date.now(), "u-me", "me", "user", "model.updated", "b1", null).run();
    const r = await call("GET", "/v1/audit");
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.body)).toContain("YANGIN ŞİRKET");
  });
});
