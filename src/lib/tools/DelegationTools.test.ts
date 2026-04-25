// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerDelegationTools } from "./DelegationTools";
import { ToolRegistry } from "@mast-ai/core";
import type { AgentRunnerFactory } from "../agents/factory";
import type { AgentEvent } from "@mast-ai/core";

function makeMockStream(
  output: string,
  extraEvents: AgentEvent[] = [],
): AsyncIterable<AgentEvent> {
  return (async function* () {
    for (const e of extraEvents) yield e;
    yield { type: "done", output, history: [] };
  })();
}

function makeFactory(mockRunStream: ReturnType<typeof vi.fn>): {
  factory: AgentRunnerFactory;
  mockCreate: ReturnType<typeof vi.fn>;
  mockRunBuilder: ReturnType<typeof vi.fn>;
} {
  const mockRunBuilder = vi.fn().mockReturnValue({ runStream: mockRunStream });
  const mockCreate = vi.fn().mockReturnValue({ runBuilder: mockRunBuilder });
  return { factory: { create: mockCreate }, mockCreate, mockRunBuilder };
}

async function callTool(
  registry: ToolRegistry,
  name: string,
  args: unknown,
  context: { onEvent?: (event: AgentEvent) => void } = {},
) {
  const tool = registry.get(name);
  if (!tool) throw new Error(`Tool '${name}' not registered`);
  return tool.call(args, context);
}

describe("registerDelegationTools / invoke_agent", () => {
  let mockRunStream: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockRunStream = vi.fn().mockReturnValue(makeMockStream("sub-agent output"));
  });

  it("calls factory.create with the provided systemPrompt", async () => {
    const { factory, mockCreate } = makeFactory(mockRunStream);
    const registry = new ToolRegistry();
    registerDelegationTools(registry, factory, null as never, null);

    await callTool(registry, "invoke_agent", {
      systemPrompt: "Be brief.",
      task: "Summarize AI.",
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ systemPrompt: "Be brief." }),
    );
  });

  it("returns { result } with the sub-agent output", async () => {
    mockRunStream.mockReturnValue(makeMockStream("Great summary."));
    const { factory } = makeFactory(mockRunStream);
    const registry = new ToolRegistry();
    registerDelegationTools(registry, factory, null as never, null);

    const raw = await callTool(registry, "invoke_agent", {
      systemPrompt: "Help.",
      task: "Summarize.",
    });
    expect(JSON.parse(raw as string)).toEqual({ result: "Great summary." });
  });

  it("relays non-done child events via context.onEvent", async () => {
    mockRunStream.mockReturnValue(
      makeMockStream("done", [
        { type: "text_delta", delta: "hello" },
        { type: "thinking", delta: "hmm" },
      ]),
    );
    const { factory } = makeFactory(mockRunStream);
    const registry = new ToolRegistry();
    registerDelegationTools(registry, factory, null as never, null);

    const onEvent = vi.fn();
    await callTool(
      registry,
      "invoke_agent",
      { systemPrompt: "s", task: "t" },
      { onEvent },
    );

    expect(onEvent).toHaveBeenCalledWith({
      type: "text_delta",
      delta: "hello",
    });
    expect(onEvent).toHaveBeenCalledWith({ type: "thinking", delta: "hmm" });
    expect(onEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "done" }),
    );
  });

  it("uses empty tools list when no tool groups are requested", async () => {
    const { factory, mockRunBuilder } = makeFactory(mockRunStream);
    const registry = new ToolRegistry();
    registerDelegationTools(registry, factory, null as never, null);

    await callTool(registry, "invoke_agent", {
      systemPrompt: "s",
      task: "t",
      tools: [],
    });

    const [agentConfig] = mockRunBuilder.mock.calls[0];
    expect(agentConfig.tools).toEqual([]);
  });

  it("invoke_agent tool is registered on the registry", () => {
    const { factory } = makeFactory(mockRunStream);
    const registry = new ToolRegistry();
    registerDelegationTools(registry, factory, null as never, null);

    const tool = registry.get("invoke_agent");
    expect(tool).toBeDefined();
    expect(tool?.definition().name).toBe("invoke_agent");
  });
});
