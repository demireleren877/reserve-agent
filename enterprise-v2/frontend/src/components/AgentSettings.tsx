"use client";

import { useMemo, useState } from "react";
import { getAgentDefaultPrompt } from "@/lib/api";
import {
  useAgentConfig,
  resetSystemPrompt,
  isAgentConfigured,
  PROVIDER_DEFAULT_BASE_URL,
  CLOUD_PROVIDERS,
  DEFAULT_MODEL,
  usesOAuth,
  type ApiFormat,
  type AuthType,
  type LLMProvider,
} from "@/lib/agent/agent-config";
import {
  AGENT_TOOLS,
  TOOL_MODULE_LABELS,
  type ToolModule,
} from "@/lib/agent/tools-manifest";

// Lokal (offline) + test/geliştirme için bulut OpenAI-uyumlu sağlayıcılar.
const PROVIDERS: { id: LLMProvider; label: string; hint: string }[] = [
  { id: "local", label: "Local (Ollama / LM Studio)", hint: "llama3.1  ·  qwen2.5" },
  { id: "custom", label: "Custom endpoint", hint: "model-id" },
  { id: "openrouter", label: "OpenRouter (bulut)", hint: "anthropic/claude-sonnet-4.6" },
  { id: "openai", label: "OpenAI (bulut)", hint: "gpt-4.1" },
];

const API_FORMATS: { id: ApiFormat; label: string; hint: string }[] = [
  { id: "openai", label: "OpenAI-compatible", hint: "Base URL; /chat/completions is appended" },
  { id: "ollama_chat", label: "Ollama chat", hint: "Full URL, e.g. https://gateway/api/chat — native tool calling" },
  { id: "ollama_generate", label: "Ollama generate", hint: "Full URL, e.g. https://gateway/api/generate — tools via prompt (use chat if available)" },
];
const AUTH_TYPES: { id: AuthType; label: string }[] = [
  { id: "api_key", label: "API key (Bearer)" },
  { id: "oauth_client_credentials", label: "OAuth2 client credentials" },
];

type Section = "api" | "prompt" | "tools";

export function AgentSettings({ onClose }: { onClose: () => void }) {
  const [cfg, update] = useAgentConfig();
  const [section, setSection] = useState<Section>("api");
  const [showKey, setShowKey] = useState(false);
  const [advanced, setAdvanced] = useState(false);

  const grouped = useMemo(() => {
    const g: Record<ToolModule, typeof AGENT_TOOLS> = { reserve: [], cashflow: [], discount: [], data: [], global: [] };
    for (const t of AGENT_TOOLS) g[t.module].push(t);
    return g;
  }, []);

  const enabled = new Set(cfg.enabledToolIds);
  const toggleTool = (id: string) => {
    const next = new Set(enabled);
    if (next.has(id)) next.delete(id); else next.add(id);
    update({ enabledToolIds: [...next] });
  };
  const setModuleAll = (mod: ToolModule, on: boolean) => {
    const next = new Set(enabled);
    for (const t of grouped[mod]) { if (on) next.add(t.id); else next.delete(t.id); }
    update({ enabledToolIds: [...next] });
  };

  const providerHint = PROVIDERS.find((p) => p.id === cfg.provider)?.hint ?? "";
  const configured = isAgentConfigured(cfg);
  const isCloud = CLOUD_PROVIDERS.includes(cfg.provider);
  const isCustom = cfg.provider === "custom";
  const oauth = usesOAuth(cfg);
  const fullUrl = isCustom && cfg.apiFormat !== "openai";

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="card w-full max-w-2xl mx-4 shadow-2xl flex flex-col max-h-[86vh]">
        {/* Başlık */}
        <div className="px-5 py-3.5 border-b flex items-center gap-3">
          <div className="flex-1">
            <div className="text-sm font-semibold">Agent Settings</div>
            <div className="text-[11px] text-[color:var(--muted)]">API integration · model · system prompt · tools</div>
          </div>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${configured ? "bg-[color:var(--success-soft)] text-[color:var(--success)]" : "bg-[color:var(--warning-soft,#f59e0b22)] text-[color:var(--warning-strong,#b45309)]"}`}>
            {configured ? "Configured" : "Not configured"}
          </span>
          <button onClick={onClose} className="text-[color:var(--muted)] hover:text-[color:var(--foreground)] text-lg leading-none px-1">×</button>
        </div>

        {/* Sekmeler */}
        <div className="px-5 pt-3 flex gap-1">
          {([["api", "API & Model"], ["prompt", "System prompt"], ["tools", `Tools (${enabled.size})`]] as [Section, string][]).map(([s, lbl]) => (
            <button key={s} onClick={() => setSection(s)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${section === s ? "bg-[color:var(--primary)] text-white" : "bg-[color:var(--surface-alt)] text-[color:var(--muted-strong)] hover:text-[color:var(--foreground)]"}`}>
              {lbl}
            </button>
          ))}
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          {section === "api" && (
            <>
              <div className="rounded-md border border-[color:var(--border)] bg-[color:var(--surface-alt)]/40 px-3 py-2 text-[10.5px] text-[color:var(--muted)] leading-relaxed">
                {cfg.provider === "openrouter" ? (
                  <>OpenRouter is ready with <code>{cfg.model}</code>. Enter your <b>OpenRouter API key</b>.
                  (Internet is required; the key is stored on this device.)</>
                ) : isCloud ? (
                  <>Cloud provider (internet required). An <b>API key is required</b>; enter the model in the provider's format.</>
                ) : (
                  <>Offline — makinendeki/LAN'daki OpenAI-uyumlu yerel sunucu (Ollama, LM Studio). Base URL + Model yeterli; anahtar opsiyonel.</>
                )}
              </div>

              {/* Ana alan: API key (OAuth'ta kullanılmaz) */}
              {oauth ? (
                <div className="text-[11px] text-[color:var(--muted-strong)]">
                  Authentication: <b>OAuth2 client credentials</b> — token URL, client ID and secret are under Advanced.
                </div>
              ) : (
              <Field label={isCloud ? "API key" : "API key (optional)"} hint="Stored on this device.">
                <div className="flex gap-2">
                  <input type={showKey ? "text" : "password"} value={cfg.apiKey} onChange={(e) => update({ apiKey: e.target.value })}
                    placeholder={cfg.provider === "openrouter" ? "sk-or-v1-…" : isCloud ? "sk-…" : "(optional)"} autoComplete="off"
                    className="input-base flex-1 font-mono text-xs" />
                  <button onClick={() => setShowKey((v) => !v)} className="btn text-xs px-3">{showKey ? "Hide" : "Show"}</button>
                </div>
              </Field>
              )}

              <div className="text-[11px] text-[color:var(--muted-strong)]">
                Model: <span className="font-mono text-[color:var(--foreground)]">{cfg.model || "—"}</span>
                <button onClick={() => setAdvanced((v) => !v)} className="ml-3 underline text-[color:var(--muted)] hover:text-[color:var(--foreground)]">
                  {advanced ? "Hide advanced" : "Advanced (provider · model · base URL)"}
                </button>
              </div>

              {advanced && (
                <div className="space-y-4 border-t pt-4">
                  <Field label="Provider">
                    <div className="grid grid-cols-2 gap-2">
                      {PROVIDERS.map((p) => (
                        <button key={p.id} onClick={() => update({ provider: p.id, ...(p.id === "openrouter" && !cfg.model.trim() ? { model: DEFAULT_MODEL } : {}) })}
                          className={`py-2 rounded-md border text-xs font-medium transition ${cfg.provider === p.id ? "border-[color:var(--primary)] bg-[color:var(--primary-soft)] text-[color:var(--primary)]" : "border-[color:var(--border)] hover:bg-[color:var(--surface-alt)]"}`}>
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </Field>
                  {isCustom && (
                    <div className="space-y-3 rounded-md border border-[color:var(--border)] p-3">
                      <Field label="API format" hint={API_FORMATS.find((f) => f.id === cfg.apiFormat)?.hint}>
                        <div className="grid grid-cols-3 gap-2">
                          {API_FORMATS.map((f) => (
                            <button key={f.id} onClick={() => update({ apiFormat: f.id })}
                              className={`py-2 rounded-md border text-xs font-medium transition ${cfg.apiFormat === f.id ? "border-[color:var(--primary)] bg-[color:var(--primary-soft)] text-[color:var(--primary)]" : "border-[color:var(--border)] hover:bg-[color:var(--surface-alt)]"}`}>
                              {f.label}
                            </button>
                          ))}
                        </div>
                      </Field>
                      <Field label="Authentication">
                        <div className="grid grid-cols-2 gap-2">
                          {AUTH_TYPES.map((a) => (
                            <button key={a.id} onClick={() => update({ authType: a.id })}
                              className={`py-2 rounded-md border text-xs font-medium transition ${cfg.authType === a.id ? "border-[color:var(--primary)] bg-[color:var(--primary-soft)] text-[color:var(--primary)]" : "border-[color:var(--border)] hover:bg-[color:var(--surface-alt)]"}`}>
                              {a.label}
                            </button>
                          ))}
                        </div>
                      </Field>
                      {oauth && (
                        <>
                          <Field label="Token URL" hint="POST with Basic auth (client ID + secret) and grant_type=client_credentials.">
                            <input value={cfg.tokenUrl} onChange={(e) => update({ tokenUrl: e.target.value })}
                              placeholder="https://gateway/oauth/token" className="input-base w-full font-mono text-xs" />
                          </Field>
                          <div className="grid grid-cols-2 gap-3">
                            <Field label="Client ID">
                              <input value={cfg.clientId} onChange={(e) => update({ clientId: e.target.value })}
                                autoComplete="off" className="input-base w-full font-mono text-xs" />
                            </Field>
                            <Field label="Client secret" hint="Stored on this device.">
                              <div className="flex gap-2">
                                <input type={showKey ? "text" : "password"} value={cfg.clientSecret}
                                  onChange={(e) => update({ clientSecret: e.target.value })}
                                  autoComplete="off" className="input-base flex-1 font-mono text-xs" />
                                <button onClick={() => setShowKey((v) => !v)} className="btn text-xs px-3">{showKey ? "Hide" : "Show"}</button>
                              </div>
                            </Field>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Model" hint={`e.g. ${providerHint}`}>
                      <input value={cfg.model} onChange={(e) => update({ model: e.target.value })}
                        placeholder={providerHint} className="input-base w-full font-mono text-xs" />
                    </Field>
                    <Field label="Temperature">
                      <input type="number" min={0} max={2} step={0.1} value={cfg.temperature}
                        onChange={(e) => update({ temperature: Number(e.target.value) })}
                        className="input-base w-full text-xs" />
                    </Field>
                  </div>
                  {(cfg.provider === "local" || cfg.provider === "custom") && (
                    <label className="flex items-start gap-2 text-xs">
                      <input type="checkbox" checked={cfg.disableThinking}
                        onChange={(e) => update({ disableThinking: e.target.checked })}
                        className="mt-0.5 accent-[color:var(--primary)]" />
                      <span>
                        <span className="font-medium">Disable model thinking</span>
                        <span className="block text-[color:var(--muted)]">
                          Much faster replies with reasoning models such as Qwen 3.5 (about 17× on LM Studio). Turn off only if your server rejects it.
                        </span>
                      </span>
                    </label>
                  )}
                  <label className="flex items-start gap-2 text-xs">
                    <input type="checkbox" checked={cfg.skipTlsVerify}
                      onChange={(e) => update({ skipTlsVerify: e.target.checked })}
                      className="mt-0.5 accent-[color:var(--primary)]" />
                    <span>
                      <span className="font-medium">Skip TLS certificate verification</span>
                      <span className="block text-[color:var(--muted)]">
                        Only for corporate networks that re-sign HTTPS and show a certificate error. While on, anyone between you and the endpoint can read your API key.
                      </span>
                    </span>
                  </label>
                  <Field label={fullUrl ? "Endpoint URL" : "Base URL"}
                    hint={fullUrl ? "Full URL as given by your gateway (it is called as-is)." : `Empty = ${PROVIDER_DEFAULT_BASE_URL[cfg.provider] || "enter endpoint"}`}>
                    <input value={cfg.baseUrl} onChange={(e) => update({ baseUrl: e.target.value })}
                      placeholder={fullUrl ? (cfg.apiFormat === "ollama_chat" ? "https://gateway/api/chat" : "https://gateway/api/generate") : PROVIDER_DEFAULT_BASE_URL[cfg.provider] || "http://localhost:1234/v1"}
                      className="input-base w-full font-mono text-xs" />
                  </Field>
                </div>
              )}
            </>
          )}

          {section === "prompt" && (
            <Field label="System prompt" hint="Empty = built-in server default (same as web). If filled, it overrides GLOBAL; module prompts are still appended.">
              <textarea value={cfg.systemPrompt} onChange={(e) => update({ systemPrompt: e.target.value })}
                rows={14} placeholder="(empty) — using the built-in default. Use 'Load default' to load and edit it."
                className="input-base w-full text-xs leading-relaxed font-mono" />
              <div className="mt-2 flex items-center gap-3">
                <button
                  onClick={async () => {
                    try { update({ systemPrompt: await getAgentDefaultPrompt() }); }
                    catch { /* sunucu yoksa sessiz */ }
                  }}
                  className="text-[11px] underline text-[color:var(--muted)] hover:text-[color:var(--foreground)]">
                  Load default (edit)
                </button>
                <button onClick={resetSystemPrompt} className="text-[11px] underline text-[color:var(--muted)] hover:text-[color:var(--foreground)]">
                  Reset (use built-in)
                </button>
              </div>
            </Field>
          )}

          {section === "tools" && (
            <div className="space-y-4">
              <p className="text-[11px] text-[color:var(--muted)] leading-relaxed">
                Tools available to the LLM. Disabled tools are not sent to the LLM. <span className="text-[color:var(--warning-strong,#b45309)]">planned</span> = not connected end-to-end yet.
              </p>
              {(Object.keys(grouped) as ToolModule[]).map((mod) => {
                const tools = grouped[mod];
                if (!tools.length) return null;
                const onCount = tools.filter((t) => enabled.has(t.id)).length;
                return (
                  <div key={mod} className="rounded-lg border border-[color:var(--border)] overflow-hidden">
                    <div className="px-3 py-2 bg-[color:var(--surface-alt)] flex items-center gap-2">
                      <span className="text-xs font-semibold flex-1">{TOOL_MODULE_LABELS[mod]}</span>
                      <span className="text-[10px] text-[color:var(--muted)]">{onCount}/{tools.length}</span>
                      <button onClick={() => setModuleAll(mod, true)} className="text-[10px] underline text-[color:var(--muted)] hover:text-[color:var(--foreground)]">all</button>
                      <button onClick={() => setModuleAll(mod, false)} className="text-[10px] underline text-[color:var(--muted)] hover:text-[color:var(--foreground)]">none</button>
                    </div>
                    <div className="divide-y divide-[color:var(--border)]">
                      {tools.map((t) => (
                        <label key={t.id} className="flex items-start gap-2.5 px-3 py-2 cursor-pointer hover:bg-[color:var(--surface-alt)]/40">
                          <input type="checkbox" checked={enabled.has(t.id)} onChange={() => toggleTool(t.id)} className="mt-0.5 accent-[color:var(--primary)]" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-medium">{t.title}</span>
                              <span className="text-[9px] font-mono text-[color:var(--muted)]">{t.id}</span>
                              {t.kind === "read" && <Badge tone="muted">read</Badge>}
                              {t.impl === "planned" && <Badge tone="warn">planned</Badge>}
                            </div>
                            <div className="text-[10.5px] text-[color:var(--muted)] leading-snug">{t.description}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t flex items-center justify-between">
          <span className="text-[10px] text-[color:var(--muted)]">Changes are saved automatically.</span>
          <button onClick={onClose} className="btn btn-primary text-xs px-4">Done</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-[11px] font-semibold text-[color:var(--muted-strong)]">{label}</span>
        {hint && <span className="text-[10px] text-[color:var(--muted)]">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: "muted" | "warn" }) {
  const cls = tone === "warn"
    ? "bg-[color:var(--warning-soft,#f59e0b22)] text-[color:var(--warning-strong,#b45309)]"
    : "bg-[color:var(--surface-alt)] text-[color:var(--muted)]";
  return <span className={`text-[9px] font-semibold px-1 rounded ${cls}`}>{children}</span>;
}
