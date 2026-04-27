// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from "vitest";
import { DefaultAgentRunnerFactory } from "./factory";
import { AgentRunner, ToolRegistry } from "@mast-ai/core";

vi.mock("@mast-ai/google-genai", () => {
  const GoogleGenAIAdapter = vi.fn();
  return { GoogleGenAIAdapter };
});

vi.mock("@mast-ai/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mast-ai/core")>();
  const AgentRunner = vi.fn();
  return { ...actual, AgentRunner };
});

describe("DefaultAgentRunnerFactory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("create() returns an AgentRunner instance", () => {
    const factory = new DefaultAgentRunnerFactory("api-key", "model-name");
    const runner = factory.create({ systemPrompt: "Be helpful." });
    expect(runner).toBeDefined();
    expect(AgentRunner).toHaveBeenCalledOnce();
  });

  it("create() returns a new instance on each call", () => {
    const factory = new DefaultAgentRunnerFactory("api-key", "model-name");
    const r1 = factory.create({});
    const r2 = factory.create({});
    expect(AgentRunner).toHaveBeenCalledTimes(2);
    expect(r1).not.toBe(r2);
  });

  it("create() passes tools registry to AgentRunner", () => {
    const factory = new DefaultAgentRunnerFactory("api-key", "model-name");
    const registry = new ToolRegistry();
    factory.create({ tools: registry });
    const [, passedRegistry] = (AgentRunner as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(passedRegistry).toBe(registry);
  });

  it("create() uses the factory modelName by default", async () => {
    const { GoogleGenAIAdapter } = await import("@mast-ai/google-genai");
    const factory = new DefaultAgentRunnerFactory("key", "default-model");
    factory.create({});
    expect(GoogleGenAIAdapter).toHaveBeenCalledWith(
      "key",
      "default-model",
      undefined,
    );
  });

  it("create() overrides modelName when model option is provided", async () => {
    const { GoogleGenAIAdapter } = await import("@mast-ai/google-genai");
    const factory = new DefaultAgentRunnerFactory("key", "default-model");
    factory.create({ model: "override-model" });
    expect(GoogleGenAIAdapter).toHaveBeenCalledWith(
      "key",
      "override-model",
      undefined,
    );
  });

  it("create() wires usageCallback into the adapter", async () => {
    const { GoogleGenAIAdapter } = await import("@mast-ai/google-genai");
    const usageCb = vi.fn();
    const factory = new DefaultAgentRunnerFactory("key", "model", usageCb);
    factory.create({});
    expect(GoogleGenAIAdapter).toHaveBeenCalledWith("key", "model", usageCb);
  });
});
