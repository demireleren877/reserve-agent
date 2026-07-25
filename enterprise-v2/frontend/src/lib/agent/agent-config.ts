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

// Desktop OFFLINE çalışır → yalnızca LOKAL, OpenAI-uyumlu endpoint desteklenir
// (Ollama / LM Studio / llama.cpp server / LAN'daki bir sunucu). Bulut sağlayıcı yok.
export type LLMProvider = "local" | "custom";

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
};

// Boş = sunucudaki YERLEŞİK sistem promptu (GLOBAL_PROMPT + modül prompt'ları) kullanılır.
// Bu, web sürümüyle BİREBİR aynıdır. Kullanıcı özelleştirmek isterse Ayarlar'da yazar;
// yalnız o zaman GLOBAL kısmı override eder (modül prompt'ları yine eklenir).
export const DEFAULT_SYSTEM_PROMPT = "";

const STORAGE_KEY = "reserve-agent-config-v1";

function defaults(): AgentConfig {
  return {
    provider: "local",
    apiKey: "",
    baseUrl: "",
    model: "",
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

/** Config'in tam/geçerli (agent çalışabilir) olup olmadığı. Lokal endpoint'te
 *  API anahtarı OPSİYONEL; base URL + model yeterli. */
export function isAgentConfigured(cfg: AgentConfig = read()): boolean {
  const base = cfg.baseUrl.trim() || PROVIDER_DEFAULT_BASE_URL[cfg.provider];
  return !!base && !!cfg.model.trim();
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
