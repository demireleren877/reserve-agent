import type { RawMessage } from "@/lib/api";

export interface StoredMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatSession {
  id: string;
  createdAt: string;
  title: string;
  messages: StoredMessage[];
  fullHistory: RawMessage[];
}

const KEY = "reserve-agent-chat-v1";
const MAX_SESSIONS = 30;

function _load(): ChatSession[] {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(KEY) : null;
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatSession[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function _save(sessions: ChatSession[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(sessions.slice(-MAX_SESSIONS)));
  } catch {
    /* quota — silent */
  }
}

export function loadSessions(): ChatSession[] {
  return _load();
}

export function saveSession(session: ChatSession): void {
  if (session.messages.length === 0) return;
  const sessions = _load();
  const idx = sessions.findIndex((s) => s.id === session.id);
  if (idx >= 0) sessions[idx] = session;
  else sessions.push(session);
  _save(sessions);
}

export function deleteSession(id: string): void {
  _save(_load().filter((s) => s.id !== id));
}

export function sessionTitle(firstUserMessage: string): string {
  const t = firstUserMessage.trim();
  return t.length > 70 ? t.slice(0, 70) + "…" : t;
}

export function newSessionId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
