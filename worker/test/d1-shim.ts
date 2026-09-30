/**
 * Testler için minimal D1 taklidi: Node'un yerleşik SQLite'ı üzerinde gerçek SQL.
 * Üretimdeki migration dosyaları sırayla uygulanır, böylece şema birebir aynıdır.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — node:sqlite tipleri workers-types kapsamında değil
import { DatabaseSync } from "node:sqlite";

type Row = Record<string, unknown>;

/**
 * D1'in satır/değer limiti (developers.cloudflare.com/d1/platform/limits):
 * "Maximum string, BLOB or table row size: 2,000,000 bytes". Yerel SQLite'ın
 * sınırı ~1 GB olduğu için shim bu limiti taklit etmezse testler, üretimde
 * D1'in reddedeceği yazmaları başarılı sayar — tek satıra 3 MB'lık veri seti
 * yazma hatası tam böyle gözden kaçtı.
 */
export const D1_MAX_VALUE_BYTES = 2_000_000;

class Stmt {
  private args: unknown[] = [];
  constructor(private db: DatabaseSync, private sql: string) {}
  bind(...args: unknown[]) {
    this.args = args.map((a) => (a === undefined ? null : a));
    let rowBytes = 0;
    for (const a of this.args) {
      if (typeof a === "string") rowBytes += Buffer.byteLength(a, "utf8");
    }
    if (rowBytes > D1_MAX_VALUE_BYTES) {
      throw new Error(`D1_ERROR: string or blob too big: SQLITE_TOOBIG (${rowBytes} bytes)`);
    }
    return this;
  }
  async first<T = Row>(): Promise<T | null> {
    const r = this.db.prepare(this.sql).get(...this.args);
    return (r ?? null) as T | null;
  }
  async all<T = Row>(): Promise<{ results: T[] }> {
    return { results: this.db.prepare(this.sql).all(...this.args) as T[] };
  }
  async exec() {
    if (/^\s*(SELECT|WITH)\b/i.test(this.sql)) {
      return { results: this.db.prepare(this.sql).all(...this.args) as Row[], success: true, meta: { changes: 0 } };
    }
    return { results: [], ...(await this.run()) };
  }
  async run() {
    const r = this.db.prepare(this.sql).run(...this.args);
    return { success: true, meta: { changes: Number(r.changes) } };
  }
}

export function createD1(): D1Database {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  const dir = join(__dirname, "..", "migrations");
  for (const f of readdirSync(dir).filter((x: string) => x.endsWith(".sql")).sort()) {
    db.exec(readFileSync(join(dir, f), "utf8"));
  }
  const api = {
    prepare: (sql: string) => new Stmt(db, sql),
    async batch(stmts: Stmt[]) {
      db.exec("BEGIN");
      try {
        const out = [];
        // Gerçek D1 batch'i her ifade için sonuç döndürür; SELECT'lerde satırlar
        // results'ta gelir. Shim yalnız run() çağırırsa okuma batch'leri boş görünür.
        for (const s of stmts) out.push(await s.exec());
        db.exec("COMMIT");
        return out;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    exec: async (sql: string) => db.exec(sql),
  };
  return api as unknown as D1Database;
}
