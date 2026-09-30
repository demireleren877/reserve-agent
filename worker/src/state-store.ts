/**
 * Proje ve sohbet durumunun D1'de saklanması.
 *
 * D1 satır başına 2.000.000 bayt kabul ediyor. Durum tek satırda tutulurken
 * 900 KB'ta 413 dönüyordu — ve proje her branşın dosya bazlı verisini
 * (fileData) taşıdığı için birkaç branşlı bir müşteri ilk dönemde bu sınıra
 * takılıyordu. Küçük durum eskisi gibi satırın içinde kalır; büyüğü
 * user_state_chunks'a parçalar halinde yazılır.
 */

export type StateKind = "project" | "chat";
export const STATE_KINDS: StateKind[] = ["project", "chat"];

/** Satır içinde kalabilecek en büyük tek alan. İki alan birlikte < 2 MB. */
export const STATE_INLINE_BYTES = 900 * 1024;
/** Parça başına UTF-16 kod birimi. En kötü durumda 3 bayt/birim → ~1,35 MB. */
export const STATE_CHUNK_CHARS = 450_000;
/** Tek yazımda kabul edilen toplam (proje + sohbet). */
export const MAX_STATE_BYTES = 16 * 1024 * 1024;

export interface StoredState {
  project: string | null;
  chat: string | null;
  version: number;
  updated_at: number;
  updated_by_name: string | null;
}

export class StateIncompleteError extends Error {
  constructor(public kind: StateKind, public found: number, public expected: number) {
    super(`${kind}: ${found}/${expected} chunks`);
  }
}

const enc = new TextEncoder();
export const byteLength = (s: string) => enc.encode(s).length;

/** Metni vekil çiftlerin ortasından kesmeden parçalara böler. */
export function splitString(s: string, maxChars = STATE_CHUNK_CHARS): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < s.length) {
    let end = Math.min(i + maxChars, s.length);
    if (end < s.length) {
      const c = s.charCodeAt(end - 1);
      if (c >= 0xd800 && c <= 0xdbff) end -= 1;
    }
    out.push(s.slice(i, end));
    i = end;
  }
  return out;
}

/**
 * Durumu tek bir işlemde okur. Satır ile parçalar ayrı sorgularla okunursa
 * arada yazan biri eski satırla yeni parçaları karıştırabilir; batch tek
 * işlemdir.
 */
export async function readState(db: D1Database, uid: string): Promise<StoredState | null> {
  const [rowRes, partsRes] = await db.batch([
    db.prepare(
      "SELECT project_json, chat_json, project_chunks, chat_chunks, version, updated_at, updated_by_name FROM user_state WHERE uid = ?",
    ).bind(uid),
    db.prepare("SELECT kind, seq, part FROM user_state_chunks WHERE uid = ? ORDER BY kind, seq").bind(uid),
  ]);
  if (!rowRes || !partsRes) throw new Error("D1 batch returned fewer results than statements");
  const row = (rowRes.results as Array<{
    project_json: string | null; chat_json: string | null;
    project_chunks: number; chat_chunks: number;
    version: number; updated_at: number; updated_by_name: string | null;
  }>)[0];
  if (!row) return null;
  const parts = partsRes.results as Array<{ kind: StateKind; seq: number; part: string }>;

  const assemble = (kind: StateKind, inline: string | null, count: number): string | null => {
    if (!count) return inline || null;
    const mine = parts.filter((p) => p.kind === kind);
    // Eksik parçayla birleştirmek bozuk JSON ya da sessizce kırpılmış bir
    // proje üretir; ikisi de "yüklendi" görünen veri kaybıdır.
    if (mine.length !== count) throw new StateIncompleteError(kind, mine.length, count);
    return mine.map((p) => p.part).join("");
  };

  return {
    project: assemble("project", row.project_json, row.project_chunks),
    chat: assemble("chat", row.chat_json, row.chat_chunks),
    version: row.version,
    updated_at: row.updated_at,
    updated_by_name: row.updated_by_name,
  };
}

export interface KindPlan {
  /** Satıra yazılacak değer; parçalıysa "" (eski worker sürümü null görür, çökmez). */
  inline: string | null;
  count: number;
  /** null → bu alan bu yazımda gönderilmedi, mevcut parçalar olduğu gibi kalır. */
  chunks: string[] | null;
}

export function planKind(value: string | undefined, existingInline: string | null, existingCount: number): KindPlan {
  if (value === undefined) return { inline: existingInline, count: existingCount, chunks: null };
  if (byteLength(value) <= STATE_INLINE_BYTES) return { inline: value, count: 0, chunks: [] };
  const chunks = splitString(value);
  return { inline: "", count: chunks.length, chunks };
}

/**
 * Parça yazımları. Her biri "satırın write_id'si hâlâ benim" koşuluna bağlı:
 * aynı batch'teki UPDATE sürüm çakışması yüzünden uygulanmadıysa satır başka
 * bir yazıma aittir ve bu ifadeler hiçbir şey yapmaz.
 */
export function chunkStatements(
  db: D1Database, uid: string, writeId: string, plans: Record<StateKind, KindPlan>,
): D1PreparedStatement[] {
  const guard = "EXISTS (SELECT 1 FROM user_state WHERE uid = ? AND write_id = ?)";
  const out: D1PreparedStatement[] = [];
  for (const kind of STATE_KINDS) {
    const chunks = plans[kind].chunks;
    if (chunks === null) continue;
    out.push(
      db.prepare(`DELETE FROM user_state_chunks WHERE uid = ? AND kind = ? AND ${guard}`)
        .bind(uid, kind, uid, writeId),
    );
    chunks.forEach((part, seq) => {
      out.push(
        db.prepare(`INSERT INTO user_state_chunks (uid, kind, seq, part) SELECT ?, ?, ?, ? WHERE ${guard}`)
          .bind(uid, kind, seq, part, uid, writeId),
      );
    });
  }
  return out;
}
