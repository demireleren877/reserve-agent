"use client";

import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type KeyboardEvent,
} from "react";
import type { AgentAction, ChatMessage, ModelOption, AgentForm } from "@/types/triangle";
import {
  chatWithAgent,
  listModels,
  type ModulesPayload,
  type RawMessage,
} from "@/lib/api";
import { AgentSettings } from "@/components/AgentSettings";
import { useAgentConfig, isAgentConfigured } from "@/lib/agent/agent-config";
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
  // ask_user ile gelen aktif form (doldurulup gönderilene kadar chat'te durur).
  const [pendingForm, setPendingForm] = useState<AgentForm | null>(null);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [fullHistory, setFullHistory] = useState<RawMessage[]>([]);
  const [sessionId, setSessionId] = useState<string>(() => newSessionId());
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [cfg] = useAgentConfig();
  // Agent "aktif" = kullanıcı Ayarlar'da lokal LLM'i (base URL + model) tanımladıysa.
  // /v1/models değil (lokal endpoint model listesi sunmaz).
  const notConfigured = !isAgentConfigured(cfg);
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
        setModels(r.models);
        setModel(r.models[0]?.id ?? r.default);
      })
      .catch((e) => {
        setModelsError(
          e instanceof Error ? e.message : "Could not reach the backend",
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
    setPendingForm(null); // yeni mesaj → varsa eski formu kapat
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
        ? `${resp.assistant_message || ""}\n\n✓ ${resp.actions.length} actions applied.`
        : resp.assistant_message || "(empty response)";
      const finalMessages: ChatMessage[] = [
        ...newMessages,
        { role: "assistant", content: body.trim() },
      ];
      setMessages(finalMessages);
      // ask_user formu geldiyse chat'te tıklanabilir olarak göster.
      if (resp.form?.fields?.length) setPendingForm(resp.form);

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
      setError(e instanceof Error ? e.message : "Agent error");
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

  // Form gönderildi → cevapları okunur bir mesaja çevir, agent modele devam etsin.
  function submitAgentForm(
    form: AgentForm,
    answers: Record<string, string | string[]>,
  ) {
    const lines = form.fields.map((f) => {
      const v = answers[f.id];
      const disp = Array.isArray(v) ? v.join(", ") : v ?? "";
      return `- ${f.label} (${f.id}): ${disp}`;
    });
    setPendingForm(null);
    dispatchSend(`Form yanıtları:\n${lines.join("\n")}`);
  }

  const freqLabel =
    activeContext?.frequency === "yearly"
      ? "Yearly"
      : activeContext?.frequency === "quarterly"
      ? "Quarterly"
      : activeContext?.frequency ?? "";

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-4 h-14 border-b shrink-0">
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="h-7 w-7 rounded-lg bg-[color:var(--primary)] text-white grid place-items-center shrink-0">
            <AgentIcon />
          </div>
          <span className="text-sm font-semibold tracking-tight">Actuarius</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {/* Model selector — yalnız backend model listesi sunarsa. Lokal endpoint'te
              model Agent Ayarları'ndan gelir, /v1/models boştur → gizle. */}
          {!modelsError && models.length > 0 && (
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={modelsLoading || models.length === 0}
              className="h-6 max-w-[130px] rounded-md border border-[color:var(--border)] bg-[color:var(--surface-alt)] text-[11px] text-[color:var(--muted-strong)] px-1.5 outline-none focus:border-[color:var(--primary)] transition cursor-pointer disabled:opacity-50"
              title="Select model"
            >
              {modelsLoading && <option value="">…</option>}
              {models.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
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
                    setModels(r.models);
                    setModel(r.models[0]?.id ?? r.default);
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
            title="Chat history"
            active={showHistory}
            onClick={() => {
              if (uid) setSessions(loadSessions(uid));
              setShowHistory((v) => !v);
            }}
          >
            <HistoryIcon />
          </HeaderBtn>
          <HeaderBtn title="New chat" onClick={startNewChat}>
            <NewChatIcon />
          </HeaderBtn>
          <HeaderBtn title="Agent settings" active={showSettings} onClick={() => setShowSettings(true)}>
            <SettingsIcon />
          </HeaderBtn>
          {onClose && (
            <>
              <Divider />
              <HeaderBtn title="Close" onClick={onClose}>
                <CloseIcon />
              </HeaderBtn>
            </>
          )}
        </div>
      </div>

      {showSettings && <AgentSettings onClose={() => setShowSettings(false)} />}

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
              <span>←</span> Back
            </button>
            <span className="text-sm font-medium">History</span>
            <span className="ml-auto text-[11px] text-[color:var(--muted)]">
              {sessions.length} oturum
            </span>
          </div>
          <div className="p-3 space-y-1">
            {sessions.length === 0 && (
              <div className="py-12 text-center text-xs text-[color:var(--muted)]">
                No saved chats yet
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
          {notConfigured ? (
            /* Agent yapılandırılmadı — Ayarlar'a yönlendir */
            <div className="flex flex-col items-center justify-center h-full px-8 gap-4 text-center">
              <div className="h-11 w-11 rounded-2xl grid place-items-center" style={{ background: "var(--surface-alt)", border: "1px solid var(--border)" }}>
                <AgentIconLg />
              </div>
              <div>
                <div className="text-sm font-semibold">Agent not configured</div>
                <div className="text-xs text-[color:var(--muted)] mt-1 leading-relaxed">
                  Set your local LLM (Base URL + Model) in Agent Settings to start.
                </div>
              </div>
              <button onClick={() => setShowSettings(true)} className="btn btn-primary text-xs px-3">
                Open settings
              </button>
            </div>
          ) : messages.length === 0 ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center h-full px-8 gap-4 text-center">
              <div className="h-11 w-11 rounded-2xl bg-[color:var(--primary)] text-white grid place-items-center">
                <AgentIconLg />
              </div>
              <div>
                <div className="text-sm font-semibold">How can I help?</div>
                <div className="text-xs text-[color:var(--muted)] mt-1 leading-relaxed">
                  Ask about reserve analysis, IBNR calculation, LDF/BF settings, and scenarios.
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 space-y-5">
              {messages.map((m, i) => (
                <MessageBubble key={i} message={m} />
              ))}
              {pendingForm && !loading && (
                <AgentFormCard
                  key={pendingForm.title + pendingForm.fields.length}
                  form={pendingForm}
                  onSubmit={(ans) => submitAgentForm(pendingForm, ans)}
                />
              )}
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
            placeholder={notConfigured ? "Configure the agent in settings…" : "Type a message…"}
            disabled={loading || notConfigured}
            rows={1}
            className="flex-1 input-base resize-none leading-relaxed overflow-y-auto"
            style={{ minHeight: "38px", maxHeight: "128px" }}
          />
          <button
            onClick={() => dispatchSend(input)}
            disabled={loading || !input.trim() || notConfigured}
            className="btn btn-primary shrink-0 h-[38px] w-[38px] p-0 rounded-lg"
            title="Send (Enter)"
          >
            <SendIcon />
          </button>
        </div>
        <div className="text-[10px] text-[color:var(--muted)] mt-1.5 text-right">
          Enter: send · Shift+Enter: new line
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

// ask_user formu — chat içi tıklanabilir seçim/giriş kartı.
function AgentFormCard({
  form,
  onSubmit,
}: {
  form: AgentForm;
  onSubmit: (answers: Record<string, string | string[]>) => void;
}) {
  const [vals, setVals] = useState<Record<string, string | string[]>>(() => {
    const init: Record<string, string | string[]> = {};
    for (const f of form.fields) {
      if (f.type === "multiselect") {
        init[f.id] = Array.isArray(f.default)
          ? f.default.map(String)
          : f.default != null
          ? [String(f.default)]
          : [];
      } else if (f.default != null) {
        init[f.id] = String(f.default);
      } else {
        init[f.id] = f.type === "select" && f.options?.length ? f.options[0].value : "";
      }
    }
    return init;
  });
  const [submitted, setSubmitted] = useState(false);

  const setVal = (id: string, v: string | string[]) =>
    setVals((prev) => ({ ...prev, [id]: v }));
  const toggleMulti = (id: string, v: string) =>
    setVals((prev) => {
      const cur = Array.isArray(prev[id]) ? (prev[id] as string[]) : [];
      return { ...prev, [id]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] };
    });

  return (
    <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-alt)] px-4 py-3 space-y-3">
      <div className="text-sm font-semibold">{form.title}</div>
      {form.fields.map((f) => (
        <div key={f.id} className="space-y-1.5">
          <div className="text-xs font-medium text-[color:var(--muted)]">{f.label}</div>
          {f.hint && <div className="text-[11px] text-[color:var(--muted)]">{f.hint}</div>}

          {(f.type === "select" || f.type === "multiselect") && f.options && (
            <div className="flex flex-wrap gap-1.5">
              {f.options.map((o) => {
                const active =
                  f.type === "multiselect"
                    ? Array.isArray(vals[f.id]) && (vals[f.id] as string[]).includes(o.value)
                    : vals[f.id] === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    disabled={submitted}
                    onClick={() =>
                      f.type === "multiselect"
                        ? toggleMulti(f.id, o.value)
                        : setVal(f.id, o.value)
                    }
                    className={
                      "text-xs px-3 py-1.5 rounded-full border transition-colors " +
                      (active
                        ? "bg-[color:var(--primary)] text-white border-[color:var(--primary)]"
                        : "bg-[color:var(--surface)] border-[color:var(--border)] hover:border-[color:var(--primary)]")
                    }
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          )}

          {(f.type === "text" || f.type === "number") && (
            <input
              type={f.type === "number" ? "number" : "text"}
              disabled={submitted}
              value={(vals[f.id] as string) ?? ""}
              onChange={(e) => setVal(f.id, e.target.value)}
              className="input-base text-sm w-full"
            />
          )}
        </div>
      ))}
      <button
        type="button"
        disabled={submitted}
        onClick={() => {
          setSubmitted(true);
          onSubmit(vals);
        }}
        className="btn btn-primary text-xs px-4 py-1.5"
      >
        {form.submit_label || "Gönder"}
      </button>
    </div>
  );
}

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

function SettingsIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
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
