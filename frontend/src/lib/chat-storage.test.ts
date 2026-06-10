import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  CHAT_CHANGED_EVENT,
  deleteSession,
  loadSessions,
  newSessionId,
  replaceAllSessions,
  saveSession,
  sessionTitle,
  type ChatSession,
} from "@/lib/chat-storage";

function session(id: string, extra: Partial<ChatSession> = {}): ChatSession {
  return {
    id,
    createdAt: "2026-01-01T00:00:00Z",
    title: `Oturum ${id}`,
    messages: [{ role: "user", content: "merhaba" }],
    fullHistory: [],
    ...extra,
  };
}

describe("chat-storage", () => {
  beforeEach(() => localStorage.clear());

  it("boş kullanıcı için boş liste", () => {
    expect(loadSessions("u1")).toEqual([]);
    expect(loadSessions("")).toEqual([]);
  });

  it("kaydet → yükle round-trip", () => {
    saveSession("u1", session("s1"));
    const loaded = loadSessions("u1");
    expect(loaded).toHaveLength(1);
    expect(loaded[0].title).toBe("Oturum s1");
  });

  it("aynı id güncellenir, yeni id eklenir", () => {
    saveSession("u1", session("s1"));
    saveSession("u1", session("s1", { title: "güncellendi" }));
    saveSession("u1", session("s2"));
    const loaded = loadSessions("u1");
    expect(loaded).toHaveLength(2);
    expect(loaded[0].title).toBe("güncellendi");
  });

  it("boş mesajlı oturum kaydedilmez", () => {
    saveSession("u1", session("s1", { messages: [] }));
    expect(loadSessions("u1")).toEqual([]);
  });

  it("kullanıcılar izole", () => {
    saveSession("u1", session("s1"));
    expect(loadSessions("u2")).toEqual([]);
  });

  it("silme çalışır", () => {
    saveSession("u1", session("s1"));
    saveSession("u1", session("s2"));
    deleteSession("u1", "s1");
    expect(loadSessions("u1").map((s) => s.id)).toEqual(["s2"]);
  });

  it("30 oturum sınırı: en eskiler düşer", () => {
    for (let i = 0; i < 35; i++) saveSession("u1", session(`s${i}`));
    const loaded = loadSessions("u1");
    expect(loaded).toHaveLength(30);
    expect(loaded[0].id).toBe("s5");
    expect(loaded[29].id).toBe("s34");
  });

  it("yazma sonrası değişiklik event'i yayınlanır", () => {
    const spy = vi.fn();
    window.addEventListener(CHAT_CHANGED_EVENT, spy);
    saveSession("u1", session("s1"));
    expect(spy).toHaveBeenCalledTimes(1);
    window.removeEventListener(CHAT_CHANGED_EVENT, spy);
  });

  it("replaceAllSessions event yayınlamaz (server→client yazımı)", () => {
    const spy = vi.fn();
    window.addEventListener(CHAT_CHANGED_EVENT, spy);
    replaceAllSessions("u1", [session("s1")]);
    expect(spy).not.toHaveBeenCalled();
    expect(loadSessions("u1")).toHaveLength(1);
    window.removeEventListener(CHAT_CHANGED_EVENT, spy);
  });

  it("bozuk localStorage içeriği boş liste döner", () => {
    localStorage.setItem("reserve-agent-chat-v1:u1", "{bozuk json");
    expect(loadSessions("u1")).toEqual([]);
    localStorage.setItem("reserve-agent-chat-v1:u1", '"dizi-değil"');
    expect(loadSessions("u1")).toEqual([]);
  });

  it("sessionTitle 70 karakterde kırpar", () => {
    expect(sessionTitle("kısa soru")).toBe("kısa soru");
    const long = "a".repeat(100);
    expect(sessionTitle(long)).toBe("a".repeat(70) + "…");
    expect(sessionTitle("  boşluklu  ")).toBe("boşluklu");
  });

  it("newSessionId benzersiz üretir", () => {
    const ids = new Set(Array.from({ length: 50 }, () => newSessionId()));
    expect(ids.size).toBe(50);
  });
});
