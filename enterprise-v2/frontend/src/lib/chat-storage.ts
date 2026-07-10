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

const KEY_PREFIX = "reserve-agent-chat-v1";
const MAX_SESSIONS = 30;

/**
 * Custom event fired after every chat write. The sync layer (ProjectProvider)
 * listens to this and pushes the user's full state to the Worker, debounced.
 */
export const CHAT_CHANGED_EVENT = "reserve-chat-changed";

function keyFor(uid: string): string {
  return `${KEY_PREFIX}:${uid}`;
}

function _load(uid: string): ChatSession[] {
  if (typeof window === "undefined" || !uid) return [];
  try {
    const raw = localStorage.getItem(keyFor(uid));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatSession[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function _save(uid: string, sessions: ChatSession[]): void {
  if (typeof window === "undefined" || !uid) return;
  try {
    localStorage.setItem(
      keyFor(uid),
      JSON.stringify(sessions.slice(-MAX_SESSIONS)),
    );
    window.dispatchEvent(new CustomEvent(CHAT_CHANGED_EVENT));
  } catch {
    /* quota — silent */
  }
}

export function loadSessions(uid: string): ChatSession[] {
  return _load(uid);
}

export function saveSession(uid: string, session: ChatSession): void {
  if (session.messages.length === 0) return;
  const sessions = _load(uid);
  const idx = sessions.findIndex((s) => s.id === session.id);
  if (idx >= 0) sessions[idx] = session;
  else sessions.push(session);
  _save(uid, sessions);
}

export function deleteSession(uid: string, id: string): void {
  _save(uid, _load(uid).filter((s) => s.id !== id));
}

/** Replace all sessions for a user — used by the sync layer on initial load. */
export function replaceAllSessions(uid: string, sessions: ChatSession[]): void {
  if (typeof window === "undefined" || !uid) return;
  try {
    localStorage.setItem(keyFor(uid), JSON.stringify(sessions.slice(-MAX_SESSIONS)));
    // Note: don't dispatch the change event — this is a server→client write,
    // not a user edit, so we don't want to trigger another PUT.
  } catch {
    /* quota — silent */
  }
}

export function sessionTitle(firstUserMessage: string): string {
  const t = firstUserMessage.trim();
  return t.length > 70 ? t.slice(0, 70) + "…" : t;
}

export function newSessionId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
