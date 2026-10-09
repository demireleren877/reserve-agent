import { describe, it, expect } from "vitest";
import { usesCompactContext, getAgentConfig, type AgentConfig } from "./agent-config";
import { defaultEnabledToolIds } from "./tools-manifest";

const cfg = (patch: Partial<AgentConfig>): AgentConfig => ({ ...getAgentConfig(), ...patch });

describe("usesCompactContext", () => {
  it("defaults on for local and custom endpoints, off for cloud providers", () => {
    expect(usesCompactContext(cfg({ provider: "local", compactContext: null }))).toBe(true);
    expect(usesCompactContext(cfg({ provider: "custom", compactContext: null }))).toBe(true);
    expect(usesCompactContext(cfg({ provider: "openrouter", compactContext: null }))).toBe(false);
  });

  it("an explicit choice wins", () => {
    expect(usesCompactContext(cfg({ provider: "local", compactContext: false }))).toBe(false);
    expect(usesCompactContext(cfg({ provider: "openai", compactContext: true }))).toBe(true);
  });

  it("the guide tool is enabled by default (compact context reads the guide through it)", () => {
    expect(defaultEnabledToolIds()).toContain("get_app_guide");
  });
});
