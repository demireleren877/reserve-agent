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

class Stmt {
  private args: unknown[] = [];
  constructor(private db: DatabaseSync, private sql: string) {}
  bind(...args: unknown[]) {
    this.args = args.map((a) => (a === undefined ? null : a));
    return this;
  }
  async first<T = Row>(): Promise<T | null> {
    const r = this.db.prepare(this.sql).get(...this.args);
    return (r ?? null) as T | null;
  }
  async all<T = Row>(): Promise<{ results: T[] }> {
    return { results: this.db.prepare(this.sql).all(...this.args) as T[] };
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
        for (const s of stmts) out.push(await s.run());
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
