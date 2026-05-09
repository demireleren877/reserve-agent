"use client";

import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type KeyboardEvent,
} from "react";
import type { AgentAction, ChatMessage, ModelOption } from "@/types/triangle";
import {
  chatWithAgent,
  listModels,
  type ModulesPayload,
  type RawMessage,
} from "@/lib/api";
import {
  loadSessions,
  saveSession,
  deleteSession,
  sessionTitle,
  newSessionId,
  type ChatSession,
  type StoredMessage,
} from "@/lib/chat-storage";
import { useAuth } from "@/lib/auth/auth-context";
import { useUserPlan } from "@/lib/auth/user-plan-context";

interface ActiveContext {
  periodLabel: string;
  branchName: string;
  frequency: string;
}

interface Props {
  modulesPayload: ModulesPayload;
  onActions?: (actions: AgentAction[]) => void;
  onClose?: () => void;
  activeContext?: ActiveContext | null;
}


export function ChatPanel({
  modulesPayload,
  onActions,
  onClose,
  activeContext,
}: Props) {
  const { user } = useAuth();
  const uid = user?.uid ?? "";
  const plan = useUserPlan();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [model, setModel] = useState<string>("");
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [fullHistory, setFullHistory] = useState<RawMessage[]>([]);
  const [sessionId, setSessionId] = useState<string>(() => newSessionId());
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!uid) return;
    setSessions(loadSessions(uid));
    // Refresh when the sync layer pulls fresh data from the server.
    function onSync() {
      setSessions(loadSessions(uid));
    }
    window.addEventListener("reserve-chat-loaded", onSync);
    return () => window.removeEventListener("reserve-chat-loaded", onSync);
  }, [uid]);

  useEffect(() => {
    listModels()
      .then((r) => {
        const available =
          plan === "free" ? r.models.slice(0, 1) : r.models;
        setModels(available);
        setModel(available[0]?.id ?? r.default);
      })
      .catch((e) => {
        setModelsError(
          e instanceof Error ? e.message : "Backend'e ulaşılamadı",
        );
      })
      .finally(() => setModelsLoading(false));
  }, [plan]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  function resizeTextarea() {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 128) + "px";
  }

  function buildSession(msgs: ChatMessage[], hist: RawMessage[]): ChatSession {
    const first = msgs.find((m) => m.role === "user");
    return {
      id: sessionId,
      createdAt: new Date().toISOString(),
      title: first ? sessionTitle(first.content) : "Sohbet",
      messages: msgs as StoredMessage[],
      fullHistory: hist,
    };
  }

  function startNewChat() {
    if (messages.length > 0 && uid) saveSession(uid, buildSession(messages, fullHistory));
    if (uid) setSessions(loadSessions(uid));
    setMessages([]);
    setFullHistory([]);
    setSessionId(newSessionId());
    setError(null);
    setShowHistory(false);
    textareaRef.current?.focus();
  }

  function restoreSession(s: ChatSession) {
    if (messages.length > 0 && uid) saveSession(uid, buildSession(messages, fullHistory));
    setMessages(s.messages as ChatMessage[]);
    setFullHistory(s.fullHistory ?? []);
    setSessionId(s.id);
    setShowHistory(false);
  }

  function removeSession(id: string) {
    if (!uid) return;
    deleteSession(uid, id);
    setSessions(loadSessions(uid));
  }

  async function dispatchSend(prompt: string) {
    if (!prompt.trim() || loading) return;
    setError(null);
    const userMsg: ChatMessage = { role: "user", content: prompt };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    setLoading(true);
    try {
      const resp = await chatWithAgent(
        newMessages,
        modulesPayload,
        model || null,
        null,
        fullHistory,
      );
      if (resp.actions?.length && onActions) onActions(resp.actions);
      const body = resp.actions?.length
        ? `${resp.assistant_message || ""}\n\n✓ ${resp.actions.length} aksiyon uygulandı.`
        : resp.assistant_message || "(boş yanıt)";
      const finalMessages: ChatMessage[] = [
        ...newMessages,
        { role: "assistant", content: body.trim() },
      ];
      setMessages(finalMessages);

      let nextHist = fullHistory;
      if (resp.raw_additions?.length) {
        nextHist = [
          ...fullHistory,
          { role: "user", content: userMsg.content } as RawMessage,
          ...resp.raw_additions,
        ];
        setFullHistory(nextHist);
      }
      if (uid) saveSession(uid, buildSession(finalMessages, nextHist));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Agent hatası");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      dispatchSend(input);
    }
  }

  const freqLabel =
    activeContext?.frequency === "yearly"
      ? "Yıllık"
      : activeContext?.frequency === "quarterly"
      ? "Çeyreklik"
      : activeContext?.frequency ?? "";

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-4 h-14 border-b shrink-0">
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="h-7 w-7 rounded-lg bg-[color:var(--primary)] text-white grid place-items-center shrink-0">
            <AgentIcon />
          </div>
          <span className="text-sm font-semibold tracking-tight">Actuarial Agent</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {/* Model selector */}
          {!modelsError && (
            <div className="flex items-center gap-1.5">
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                disabled={modelsLoading || models.length === 0}
                className="h-6 max-w-[130px] rounded-md border border-[color:var(--border)] bg-[color:var(--surface-alt)] text-[11px] text-[color:var(--muted-strong)] px-1.5 outline-none focus:border-[color:var(--primary)] transition cursor-pointer disabled:opacity-50"
                title="Model seç"
              >
                {modelsLoading && <option value="">…</option>}
                {models.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
              {plan === "free" && (
                <a
                  href="/onboarding/plan"
                  className="h-6 px-2 rounded-md text-[10px] font-semibold flex items-center gap-0.5 shrink-0"
                  style={{
                    background: "linear-gradient(135deg,#7c3aed,#4f46e5)",
                    color: "#fff",
                  }}
                  title="Tüm modellere erişmek için Pro'ya geç"
                >
                  Pro
                </a>
              )}
            </div>
          )}
          {modelsError && (
            <button
              className="text-[11px] text-[color:var(--danger)] hover:underline"
              title={modelsError}
              onClick={() => {
                setModelsError(null);
                setModelsLoading(true);
                listModels()
                  .then((r) => {
                    const available = plan === "free" ? r.models.slice(0, 1) : r.models;
                    setModels(available);
                    setModel(available[0]?.id ?? r.default);
                  })
                  .catch((e) => setModelsError(e instanceof Error ? e.message : "Hata"))
                  .finally(() => setModelsLoading(false));
              }}
            >
              ↺
            </button>
          )}
          <Divider />
          <HeaderBtn
            title="Sohbet geçmişi"
            active={showHistory}
            onClick={() => {
              if (uid) setSessions(loadSessions(uid));
              setShowHistory((v) => !v);
            }}
          >
            <HistoryIcon />
          </HeaderBtn>
          <HeaderBtn title="Yeni sohbet" onClick={startNewChat}>
            <NewChatIcon />
          </HeaderBtn>
          {onClose && (
            <>
              <Divider />
              <HeaderBtn title="Kapat" onClick={onClose}>
                <CloseIcon />
              </HeaderBtn>
            </>
          )}
        </div>
      </div>

      {/* ── Context bar ── */}
      {activeContext && !showHistory && (
        <div className="flex items-center gap-2 px-4 h-8 border-b bg-[color:var(--surface-alt)] shrink-0 text-xs text-[color:var(--muted-strong)]">
          <span className="font-medium text-[color:var(--foreground)] truncate max-w-[140px]">
            {activeContext.branchName}
          </span>
          <span className="text-[color:var(--border-strong)]">·</span>
          <span className="truncate">{activeContext.periodLabel}</span>
          {freqLabel && (
            <>
              <span className="text-[color:var(--border-strong)]">·</span>
              <span>{freqLabel}</span>
            </>
          )}
        </div>
      )}

      {/* ── History panel ── */}
      {showHistory ? (
        <div className="flex-1 overflow-y-auto">
          <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 border-b bg-[color:var(--surface)]">
            <button
              onClick={() => setShowHistory(false)}
              className="text-[11px] text-[color:var(--muted)] hover:text-[color:var(--foreground)] transition flex items-center gap-1"
            >
              <span>←</span> Geri
            </button>
            <span className="text-sm font-medium">Geçmiş</span>
            <span className="ml-auto text-[11px] text-[color:var(--muted)]">
              {sessions.length} oturum
            </span>
          </div>
          <div className="p-3 space-y-1">
            {sessions.length === 0 && (
              <div className="py-12 text-center text-xs text-[color:var(--muted)]">
                Henüz kayıtlı sohbet yok
              </div>
            )}
            {[...sessions].reverse().map((s) => (
              <div
                key={s.id}
                onClick={() => restoreSession(s)}
                className={
                  "group flex items-start gap-3 px-3 py-3 rounded-lg cursor-pointer transition " +
                  (s.id === sessionId
                    ? "bg-[color:var(--primary-soft)] border border-[color:var(--primary-border)]"
                    : "hover:bg-[color:var(--surface-alt)]")
                }
              >
                <div className="mt-0.5 text-[color:var(--muted)] shrink-0">
                  <HistoryIcon />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate leading-snug">
                    {s.title}
                  </div>
                  <div className="text-[10px] text-[color:var(--muted)] mt-0.5 tabular">
                    {new Date(s.createdAt).toLocaleString("tr-TR")} · {s.messages.length} mesaj
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); removeSession(s.id); }}
                  className="opacity-0 group-hover:opacity-100 text-[10px] text-[color:var(--muted)] hover:text-[color:var(--danger)] transition shrink-0 mt-0.5"
                >
                  Sil
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* ── Messages ── */
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center h-full px-8 gap-4 text-center">
              <div className="h-11 w-11 rounded-2xl bg-[color:var(--primary)] text-white grid place-items-center">
                <AgentIconLg />
              </div>
              <div>
                <div className="text-sm font-semibold">Nasıl yardımcı olabilirim?</div>
                <div className="text-xs text-[color:var(--muted)] mt-1 leading-relaxed">
                  Rezerv analizi, IBNR hesaplama, LDF/BF ayarları ve senaryo sorularınızı yazın.
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 space-y-5">
              {messages.map((m, i) => (
                <MessageBubble key={i} message={m} />
              ))}
              {loading && <TypingIndicator />}
              {error && (
                <div className="text-xs text-[color:var(--danger)] bg-[color:var(--danger-soft)] border border-[color:var(--danger-soft)] rounded-lg px-3 py-2">
                  {error}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Input ── */}
      <div className="shrink-0 border-t bg-[color:var(--surface)] px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => { setInput(e.target.value); resizeTextarea(); }}
            onKeyDown={handleKeyDown}
            placeholder="Mesaj yazın…"
            disabled={loading}
            rows={1}
            className="flex-1 input-base resize-none leading-relaxed overflow-y-auto"
            style={{ minHeight: "38px", maxHeight: "128px" }}
          />
          <button
            onClick={() => dispatchSend(input)}
            disabled={loading || !input.trim()}
            className="btn btn-primary shrink-0 h-[38px] w-[38px] p-0 rounded-lg"
            title="Gönder (Enter)"
          >
            <SendIcon />
          </button>
        </div>
        <div className="text-[10px] text-[color:var(--muted)] mt-1.5 text-right">
          Enter: gönder · Shift+Enter: yeni satır
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="h-6 w-6 rounded-full bg-[color:var(--primary)] text-white grid place-items-center shrink-0 mt-0.5 mr-2">
          <AgentIconSm />
        </div>
      )}
      <div
        className={
          "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed " +
          (isUser
            ? "bg-[color:var(--primary)] text-white rounded-tr-sm"
            : "bg-[color:var(--surface-alt)] border border-[color:var(--border)] rounded-tl-sm space-y-1")
        }
      >
        {isUser ? (
          <span className="whitespace-pre-wrap">{message.content}</span>
        ) : (
          <MarkdownLite text={message.content} />
        )}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-2">
      <div className="h-6 w-6 rounded-full bg-[color:var(--primary)] text-white grid place-items-center shrink-0">
        <AgentIconSm />
      </div>
      <div className="bg-[color:var(--surface-alt)] border border-[color:var(--border)] rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1">
        <span
          className="h-1.5 w-1.5 rounded-full bg-[color:var(--muted)] animate-bounce"
          style={{ animationDelay: "0ms" }}
        />
        <span
          className="h-1.5 w-1.5 rounded-full bg-[color:var(--muted)] animate-bounce"
          style={{ animationDelay: "120ms" }}
        />
        <span
          className="h-1.5 w-1.5 rounded-full bg-[color:var(--muted)] animate-bounce"
          style={{ animationDelay: "240ms" }}
        />
      </div>
    </div>
  );
}

function HeaderBtn({
  children,
  onClick,
  title,
  active,
}: {
  children: ReactNode;
  onClick: () => void;
  title?: string;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={
        "h-7 w-7 rounded-md grid place-items-center transition " +
        (active
          ? "bg-[color:var(--primary-soft)] text-[color:var(--primary)]"
          : "text-[color:var(--muted)] hover:text-[color:var(--foreground)] hover:bg-[color:var(--surface-alt)]")
      }
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-4 bg-[color:var(--border)] mx-0.5" />;
}

// ─── Markdown renderer ───────────────────────────────────────────────────────

function MarkdownLite({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let listBuf: string[] = [];
  let key = 0;

  const flushList = () => {
    if (!listBuf.length) return;
    const items = listBuf.slice();
    blocks.push(
      <ul key={key++} className="list-disc pl-4 space-y-0.5 text-sm">
        {items.map((l, i) => <li key={i}>{renderInline(l)}</li>)}
      </ul>,
    );
    listBuf = [];
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    const bullet = line.match(/^\s*[*•\-]\s+(.*)$/);
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (bullet) {
      listBuf.push(bullet[1]);
    } else if (heading) {
      flushList();
      const level = heading[1].length;
      blocks.push(
        <div
          key={key++}
          className={
            level === 1
              ? "font-semibold text-sm mt-2"
              : level === 2
              ? "font-semibold text-xs mt-1.5"
              : "font-medium text-xs mt-1"
          }
        >
          {renderInline(heading[2])}
        </div>,
      );
    } else if (line.trim() === "") {
      flushList();
      blocks.push(<div key={key++} className="h-1.5" />);
    } else {
      flushList();
      blocks.push(
        <div key={key++} className="text-sm leading-relaxed">
          {renderInline(line)}
        </div>,
      );
    }
  }
  flushList();
  return (
    <>
      {blocks.map((b, i) => (
        <Fragment key={i}>{b}</Fragment>
      ))}
    </>
  );
}

function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let idx = 0;
  for (const m of text.matchAll(re)) {
    const start = m.index ?? 0;
    if (start > last) out.push(text.slice(last, start));
    const tok = m[0];
    if (tok.startsWith("**")) {
      out.push(<strong key={`b${idx++}`}>{tok.slice(2, -2)}</strong>);
    } else {
      out.push(
        <code
          key={`c${idx++}`}
          className="bg-[color:var(--surface)] border px-1 rounded text-[11px] font-mono"
        >
          {tok.slice(1, -1)}
        </code>,
      );
    }
    last = start + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// ─── Icons ───────────────────────────────────────────────────────────────────

function AgentIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4z" />
      <path d="M19 15l1 2L22 18l-2 .6L19 21l-1-2.4L16 18l2-.6z" />
    </svg>
  );
}

function AgentIconLg() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4z" />
      <path d="M19 15l1 2L22 18l-2 .6L19 21l-1-2.4L16 18l2-.6z" />
    </svg>
  );
}

function AgentIconSm() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4z" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function NewChatIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}
