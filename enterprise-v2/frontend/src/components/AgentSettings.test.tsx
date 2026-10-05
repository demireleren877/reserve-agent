/**
 * Kurumsal gateway ayarı: Custom endpoint + Ollama biçimi + OAuth2 client credentials.
 * Kullanıcının test ortamı: token URL'ine Basic auth, /api/generate'e Bearer.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AgentSettings } from "@/components/AgentSettings";
import { setAgentConfig, isAgentConfigured, getAgentConfig } from "@/lib/agent/agent-config";
import { chatWithAgent } from "@/lib/api";

beforeEach(() => {
  localStorage.clear();
  setAgentConfig({
    provider: "openrouter", apiKey: "", baseUrl: "", model: "m",
    apiFormat: "openai", authType: "api_key", tokenUrl: "", clientId: "", clientSecret: "",
  });
});

describe("Agent Settings — kurumsal gateway", () => {
  it("Custom + OAuth seçilince token alanları görünür, API anahtarı alanı gizlenir", () => {
    setAgentConfig({ provider: "custom", authType: "oauth_client_credentials", apiFormat: "ollama_generate" });
    render(<AgentSettings onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Advanced \(provider/ }));
    expect(screen.getByText("Token URL")).toBeTruthy();
    expect(screen.getByText("Client ID")).toBeTruthy();
    expect(screen.getByText("Client secret")).toBeTruthy();
    expect(screen.getByText("Endpoint URL")).toBeTruthy();  // Ollama biçiminde tam adres
    expect(screen.queryByText("API key (optional)")).toBeNull();
  });

  it("OAuth eksikse yapılandırılmamış sayılır", () => {
    setAgentConfig({ provider: "custom", authType: "oauth_client_credentials", apiFormat: "ollama_chat",
                     baseUrl: "https://gw/api/chat", model: "qwen3.5:9b", tokenUrl: "https://gw/token", clientId: "a" });
    expect(isAgentConfigured(getAgentConfig())).toBe(false);
    setAgentConfig({ clientSecret: "s" });
    expect(isAgentConfigured(getAgentConfig())).toBe(true);
  });

  it("istek gövdesi biçimi ve OAuth bilgisini taşır", async () => {
    setAgentConfig({ provider: "custom", authType: "oauth_client_credentials", apiFormat: "ollama_generate",
                     baseUrl: "https://gw/api/generate", model: "qwen3.5:9b",
                     tokenUrl: "https://gw/token", clientId: "a", clientSecret: "s", skipTlsVerify: true });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ assistant_message: "ok", actions: [], tool_invocations: [] }), { status: 200 }));
    await chatWithAgent([{ role: "user", content: "selam" }], {} as never);
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.config).toMatchObject({
      base_url: "https://gw/api/generate", model: "qwen3.5:9b", api_format: "ollama_generate",
      auth_type: "oauth_client_credentials", token_url: "https://gw/token", client_id: "a",
      client_secret: "s", skip_tls_verify: true,
    });
    fetchMock.mockRestore();
  });

  it("Custom dışında eski davranış: OpenAI biçimi + anahtar, OAuth alanı gitmez", async () => {
    setAgentConfig({ provider: "openrouter", apiKey: "sk-or", authType: "oauth_client_credentials", apiFormat: "ollama_chat" });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ assistant_message: "ok", actions: [], tool_invocations: [] }), { status: 200 }));
    await chatWithAgent([{ role: "user", content: "selam" }], {} as never);
    const cfg = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body)).config;
    expect(cfg.api_format).toBe("openai");
    expect(cfg.auth_type).toBe("api_key");
    expect(cfg.client_secret).toBeUndefined();
    fetchMock.mockRestore();
  });
});

describe("Disable model thinking", () => {
  const send = async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ assistant_message: "ok", actions: [], tool_invocations: [] }), { status: 200 }));
    await chatWithAgent([{ role: "user", content: "selam" }], {} as never);
    const cfg = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body)).config;
    fetchMock.mockRestore();
    return cfg;
  };

  it("yerel sağlayıcıda varsayılan olarak düşünmeyi kapatır", async () => {
    setAgentConfig({ provider: "local", baseUrl: "http://192.168.1.174:8080/v1", model: "qwen/qwen3.5-9b", disableThinking: true });
    expect((await send()).disable_thinking).toBe(true);
  });

  it("bulut sağlayıcıya göndermez", async () => {
    setAgentConfig({ provider: "openrouter", apiKey: "k", disableThinking: true });
    expect((await send()).disable_thinking).toBe(false);
  });
});
