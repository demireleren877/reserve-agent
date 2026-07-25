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
                  <>OpenRouter üzerinden <code>{cfg.model}</code> hazır. Sadece <b>OpenRouter API anahtarını</b> gir.
                  (İnternet gerekir; anahtar bu cihazda saklanır.)</>
                ) : isCloud ? (
                  <>Bulut sağlayıcı (internet gerekir). <b>API anahtarı zorunlu</b>; modeli sağlayıcı formatında gir.</>
                ) : (
                  <>Offline — makinendeki/LAN'daki OpenAI-uyumlu yerel sunucu (Ollama, LM Studio). Base URL + Model yeterli; anahtar opsiyonel.</>
                )}
              </div>

              {/* Ana alan: API key */}
              <Field label={isCloud ? "API key" : "API key (opsiyonel)"} hint="Bu cihazda saklanır.">
                <div className="flex gap-2">
                  <input type={showKey ? "text" : "password"} value={cfg.apiKey} onChange={(e) => update({ apiKey: e.target.value })}
                    placeholder={cfg.provider === "openrouter" ? "sk-or-v1-…" : isCloud ? "sk-…" : "(boş bırakılabilir)"} autoComplete="off"
                    className="input-base flex-1 font-mono text-xs" />
                  <button onClick={() => setShowKey((v) => !v)} className="btn text-xs px-3">{showKey ? "Hide" : "Show"}</button>
                </div>
              </Field>

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
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Model" hint={`ör. ${providerHint}`}>
                      <input value={cfg.model} onChange={(e) => update({ model: e.target.value })}
                        placeholder={providerHint} className="input-base w-full font-mono text-xs" />
                    </Field>
                    <Field label="Temperature">
                      <input type="number" min={0} max={2} step={0.1} value={cfg.temperature}
                        onChange={(e) => update({ temperature: Number(e.target.value) })}
                        className="input-base w-full text-xs" />
                    </Field>
                  </div>
                  <Field label="Base URL" hint={`Boş = ${PROVIDER_DEFAULT_BASE_URL[cfg.provider] || "endpoint gir"}`}>
                    <input value={cfg.baseUrl} onChange={(e) => update({ baseUrl: e.target.value })}
                      placeholder={PROVIDER_DEFAULT_BASE_URL[cfg.provider] || "http://localhost:1234/v1"}
                      className="input-base w-full font-mono text-xs" />
                  </Field>
                </div>
              )}
            </>
          )}

          {section === "prompt" && (
            <Field label="System prompt" hint="Boş = sunucudaki yerleşik varsayılan (web ile birebir). Doldurursan GLOBAL kısmı override eder; modül prompt'ları yine eklenir.">
              <textarea value={cfg.systemPrompt} onChange={(e) => update({ systemPrompt: e.target.value })}
                rows={14} placeholder="(boş) — yerleşik varsayılan kullanılıyor. Özelleştirmek için 'Load default' ile getirip düzenle."
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
                LLM'in kullanabileceği araçlar. Kapatılanlar LLM'e gönderilmez. <span className="text-[color:var(--warning-strong,#b45309)]">planned</span> = henüz uçtan uca bağlı değil.
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
          <span className="text-[10px] text-[color:var(--muted)]">Değişiklikler otomatik kaydedilir.</span>
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
