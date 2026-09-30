import { beforeEach, describe, expect, it, vi } from "vitest";
import { createD1 } from "./d1-shim";

/**
 * Veri setlerinin D1'de saklanması.
 *
 * Gerçek bir çeyreklik hasar dosyası (2026Q1_Import_To_ResQ.xlsx, 5.111 satır)
 * JSON'da 3,19 MB tutuyor. D1 satır başına 2 MB kabul ediyor; worker ise veri
 * setini tek satıra yazıp 4 MB'a kadar izin veriyordu. Sonuç: kullanıcının
 * kendi verisi web'e kaydedilemiyordu ve nedeni belirsiz bir 500 dönüyordu.
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

const ME = "u-me|me@acme.com";

async function call(method: string, path: string, body?: unknown) {
  const req = new Request(`https://w.test${path}`, {
    method,
    headers: { Authorization: `Bearer ${ME}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const res = await worker.fetch(req as never, env as never, {} as never);
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

/** Gerçek import çıktısıyla aynı biçimde, verilen boyuta ulaşan kayıtlar. */
function claims(targetBytes: number) {
  const rows: Record<string, unknown>[] = [];
  let bytes = 2;
  for (let i = 0; bytes < targetBytes; i++) {
    const r = {
      dosya_no: `HSR-2026-${String(i).padStart(7, "0")}`,
      brans: i % 3 === 0 ? "YANGIN (KONUT)" : i % 3 === 1 ? "MÜHENDİSLİK" : "GENEL SORUMLULUK",
      hasar_tarihi: `20${String(10 + (i % 16)).padStart(2, "0")}-0${1 + (i % 9)}-1${i % 9}`,
      gelisim_tarihi: "2026-03-31",
      odeme: Math.round(Math.random() * 1e7) / 100,
      muallak: Math.round(Math.random() * 1e7) / 100,
    };
    bytes += Buffer.byteLength(JSON.stringify(r), "utf8") + 1;
    rows.push(r);
  }
  return rows;
}

const PATH = "/v1/data/periods/p1/datasets/hasar";

async function seedPeriod() {
  const r = await call("POST", "/v1/data/periods", { period_id: "p1", label: "2026Q1" });
  expect(r.status).toBe(200);
}

describe("veri seti boyutu", () => {
  it("küçük veri seti yazılır ve aynen okunur", async () => {
    await seedPeriod();
    const records = claims(50_000);
    expect((await call("PUT", PATH, { typeId: "hasar", meta: { filename: "k.xlsx" }, records })).status).toBe(200);
    const got = await call("GET", PATH);
    expect(got.status).toBe(200);
    expect(got.body.records).toEqual(records);
  });

  it("gerçek bir çeyreklik dosya boyutundaki (3,2 MB) veri seti kaydedilir", async () => {
    await seedPeriod();
    const records = claims(3_200_000);
    const put = await call("PUT", PATH, { typeId: "hasar", meta: { filename: "2026Q1.xlsx" }, records });
    expect(put.status).toBe(200);
    const got = await call("GET", PATH);
    expect(got.body.records.length).toBe(records.length);
    expect(got.body.records).toEqual(records);
  });

  it("büyük veri seti küçüğüyle değiştirilince eski parçalar kalmaz", async () => {
    await seedPeriod();
    await call("PUT", PATH, { typeId: "hasar", meta: {}, records: claims(3_200_000) });
    const small = claims(10_000);
    await call("PUT", PATH, { typeId: "hasar", meta: {}, records: small });
    const got = await call("GET", PATH);
    expect(got.body.records).toEqual(small);
  });

  it("veri seti ve dönem silinince parçalar da silinir", async () => {
    await seedPeriod();
    await call("PUT", PATH, { typeId: "hasar", meta: {}, records: claims(3_200_000) });
    expect((await call("DELETE", PATH)).status).toBe(200);
    expect((await call("GET", PATH)).status).toBe(404);

    await call("PUT", PATH, { typeId: "hasar", meta: {}, records: claims(3_200_000) });
    expect((await call("DELETE", "/v1/data/periods/p1")).status).toBe(200);
    const db = env.DB as D1Database;
    const left = await db.prepare("SELECT COUNT(*) AS n FROM user_dataset_chunks").first<{ n: number }>();
    expect(left?.n).toBe(0);
  });

  it("limiti aşan veri seti anlaşılır bir 413 ile reddedilir, 500 ile değil", async () => {
    await seedPeriod();
    const r = await call("PUT", PATH, { typeId: "hasar", meta: {}, records: claims(17_000_000) });
    expect(r.status).toBe(413);
    expect(r.body.error).toBe("dataset_too_large");
  });
});
