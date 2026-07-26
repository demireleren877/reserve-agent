"use client";

/**
 * AGENT YAPILANDIRMASI — kullanıcının Agent Ayarları ekranında girdiği API/LLM
 * ayarları. localStorage'da saklanır (bu cihazda). Motor (LLM çağrısı) bu config'i
 * okur: sağlayıcı, anahtar, model, system prompt ve açık araç listesi.
 *
 * "Şu an ne varsa o yapı devam edecek": araçlar tools-manifest'ten gelir; burada
 * yalnızca hangilerinin AÇIK olduğu (enabledToolIds) tutulur.
 */

import { useCallback, useSyncExternalStore } from "react";
import { defaultEnabledToolIds } from "./tools-manifest";

// Desktop asıl olarak OFFLINE/LOKAL (Ollama / LM Studio / LAN) için tasarlandı.
// Ayrıca test/geliştirme için bulut OpenAI-uyumlu sağlayıcılar da seçilebilir
// (OpenRouter/OpenAI) — hepsi aynı httpx client'ıyla /chat/completions'a gider.
export type LLMProvider = "local" | "custom" | "openrouter" | "openai";

/** Bulut (internet gerektiren) sağlayıcılar — API anahtarı zorunlu. */
export const CLOUD_PROVIDERS: LLMProvider[] = ["openrouter", "openai"];

export interface AgentConfig {
  provider: LLMProvider;
  /** API anahtarı (bu cihazda saklanır). */
  apiKey: string;
  /** Sağlayıcı taban URL'i (openrouter/custom için). Boşsa sağlayıcı varsayılanı. */
  baseUrl: string;
  /** Model kimliği (ör. "anthropic/claude-sonnet-4.6"). */
  model: string;
  /** Sistem promptu. */
  systemPrompt: string;
  /** Açık araç id'leri (tools-manifest). */
  enabledToolIds: string[];
  /** Örnekleme sıcaklığı. */
  temperature: number;
}

export const PROVIDER_DEFAULT_BASE_URL: Record<LLMProvider, string> = {
  local: "http://localhost:11434/v1", // Ollama varsayılanı (LM Studio: :1234, llama.cpp: :8080)
  custom: "",
  openrouter: "https://openrouter.ai/api/v1",
  openai: "https://api.openai.com/v1",
};

// Boş = sunucudaki YERLEŞİK sistem promptu (GLOBAL_PROMPT + modül prompt'ları) kullanılır.
// Bu, web sürümüyle BİREBİR aynıdır. Kullanıcı özelleştirmek isterse Ayarlar'da yazar;
// yalnız o zaman GLOBAL kısmı override eder (modül prompt'ları yine eklenir).
export const DEFAULT_SYSTEM_PROMPT = "";

const STORAGE_KEY = "reserve-agent-config-v1";

// Sonradan eklenen "ready" araçlar — geriye dönük configlerde otomatik AÇILIR.
const NEW_TOOL_IDS = ["roll_forward", "ask_user", "load_triangle_from_data"];

// Hazır entegre varsayılan: OpenRouter + gemini flash-lite. Kullanıcı yalnız API key girer.
export const DEFAULT_MODEL = "google/gemini-3.1-flash-lite-preview";

function defaults(): AgentConfig {
  return {
    provider: "openrouter",
    apiKey: "",
    baseUrl: "",
    model: DEFAULT_MODEL,
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    enabledToolIds: defaultEnabledToolIds(),
    temperature: 0.2,
  };
}

// ─── Küçük dış-store (useSyncExternalStore) ────────────────────────────────────
let cache: AgentConfig | null = null;
const listeners = new Set<() => void>();

function read(): AgentConfig {
  if (cache) return cache;
  if (typeof window === "undefined") return (cache = defaults());
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    cache = raw ? { ...defaults(), ...(JSON.parse(raw) as Partial<AgentConfig>) } : defaults();
    // Geriye dönük: bu sürümde eklenen yeni "ready" araçlar, kayıtlı config'te
    // yoksa AÇIK gelsin (yokluğunda LLM'e hiç gönderilmez → özellik çalışmaz).
    // Yalnız yeni id'ler eklenir; kullanıcının kapattığı eski araçlara dokunulmaz.
    if (raw) {
      const set = new Set(cache.enabledToolIds ?? []);
      let changed = false;
      for (const id of NEW_TOOL_IDS) {
        if (!set.has(id)) { set.add(id); changed = true; }
      }
      if (changed) cache = { ...cache, enabledToolIds: [...set] };
    }
  } catch {
    cache = defaults();
  }
  return cache;
}

export function getAgentConfig(): AgentConfig {
  return read();
}

export function setAgentConfig(patch: Partial<AgentConfig>): void {
  const next = { ...read(), ...patch };
  cache = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* kota — sessiz */
  }
  listeners.forEach((l) => l());
}

export function resetSystemPrompt(): void {
  setAgentConfig({ systemPrompt: DEFAULT_SYSTEM_PROMPT });
}

/** Config'in tam/geçerli (agent çalışabilir) olup olmadığı. Bulut sağlayıcıda API
 *  anahtarı zorunlu; lokal endpoint'te opsiyonel (base URL + model yeterli). */
export function isAgentConfigured(cfg: AgentConfig = read()): boolean {
  const base = cfg.baseUrl.trim() || PROVIDER_DEFAULT_BASE_URL[cfg.provider];
  if (!base || !cfg.model.trim()) return false;
  if (CLOUD_PROVIDERS.includes(cfg.provider) && !cfg.apiKey.trim()) return false;
  return true;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useAgentConfig(): [AgentConfig, (patch: Partial<AgentConfig>) => void] {
  const cfg = useSyncExternalStore(subscribe, read, read);
  const update = useCallback((patch: Partial<AgentConfig>) => setAgentConfig(patch), []);
  return [cfg, update];
}
