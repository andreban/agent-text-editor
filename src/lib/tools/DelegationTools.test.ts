// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerDelegationTools } from "./DelegationTools";
import { ToolRegistry } from "@mast-ai/core";
import type { AgentRunnerFactory } from "../agents/factory";
import type { AgentEvent } from "@mast-ai/core";
import { EditorTools } from "./EditorTools";
import { WorkspaceTools } from "./WorkspaceTools";

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

function makeTools(factory: AgentRunnerFactory) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockEditor: any = {
    getValue: vi.fn().mockReturnValue(""),
    setValue: vi.fn(),
    getModel: vi.fn().mockReturnValue(null),
    getSelection: vi.fn().mockReturnValue(null),
  };
  const editorTools = new EditorTools({ current: mockEditor }, vi.fn(), {
    current: false,
  });
  const workspaceTools = new WorkspaceTools(
    { current: [] },
    { current: null },
    factory,
  );
  return { editorTools, workspaceTools };
}

describe("registerDelegationTools / invoke_agent", () => {
  let mockRunStream: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockRunStream = vi.fn().mockReturnValue(makeMockStream("sub-agent output"));
  });

  it("calls factory.create with the provided systemPrompt", async () => {
    const { factory, mockCreate } = makeFactory(mockRunStream);
    const { editorTools, workspaceTools } = makeTools(factory);
    const registry = new ToolRegistry();
    registerDelegationTools(
      registry,
      factory,
      editorTools,
      workspaceTools,
      vi.fn(),
    );

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
    const { editorTools: et, workspaceTools: wt } = makeTools(factory);
    registerDelegationTools(registry, factory, et, wt, vi.fn());

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
    const { editorTools: et, workspaceTools: wt } = makeTools(factory);
    registerDelegationTools(registry, factory, et, wt, vi.fn());

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
    const { editorTools: et, workspaceTools: wt } = makeTools(factory);
    registerDelegationTools(registry, factory, et, wt, vi.fn());

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
    const { editorTools: et, workspaceTools: wt } = makeTools(factory);
    registerDelegationTools(registry, factory, et, wt, vi.fn());

    const tool = registry.get("invoke_agent");
    expect(tool).toBeDefined();
    expect(tool?.definition().name).toBe("invoke_agent");
  });

  it("workspace_readonly group yields only read workspace tools (no create_document etc.)", async () => {
    const { factory, mockRunBuilder } = makeFactory(mockRunStream);
    const { editorTools: et, workspaceTools: wt } = makeTools(factory);
    const registry = new ToolRegistry();
    registerDelegationTools(registry, factory, et, wt, vi.fn());

    await callTool(registry, "invoke_agent", {
      systemPrompt: "s",
      task: "t",
      tools: ["workspace_readonly"],
    });

    const [agentConfig] = mockRunBuilder.mock.calls[0];
    expect(agentConfig.tools).toContain("list_workspace_docs");
    expect(agentConfig.tools).toContain("read_workspace_doc");
    expect(agentConfig.tools).not.toContain("create_document");
    expect(agentConfig.tools).not.toContain("rename_document");
    expect(agentConfig.tools).not.toContain("delete_document");
    expect(agentConfig.tools).not.toContain("switch_active_document");
  });
});

describe("registerDelegationTools / invoke_planner", () => {
  let autoConfirm: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    autoConfirm = vi.fn().mockImplementation((req) => {
      if (req) req.resolve(true);
    });
  });

  it("invoke_planner tool is registered on the registry", () => {
    const mockRunStream = vi.fn();
    const { factory } = makeFactory(mockRunStream);
    const registry = new ToolRegistry();
    const { editorTools: et, workspaceTools: wt } = makeTools(factory);
    registerDelegationTools(registry, factory, et, wt, vi.fn());

    const tool = registry.get("invoke_planner");
    expect(tool).toBeDefined();
    expect(tool?.definition().name).toBe("invoke_planner");
  });

  const validPlan = {
    goal: "Write a blog post",
    steps: [{ id: "step_1", instruction: "Research the topic", dependsOn: [] }],
  };

  it("returns a JSON string that parses to a Plan with goal and steps", async () => {
    const mockRunStream = vi
      .fn()
      .mockReturnValue(makeMockStream(JSON.stringify(validPlan)));
    const { factory } = makeFactory(mockRunStream);
    const registry = new ToolRegistry();
    const { editorTools: et, workspaceTools: wt } = makeTools(factory);
    registerDelegationTools(registry, factory, et, wt, autoConfirm);

    const raw = await callTool(registry, "invoke_planner", {
      task: "Write a blog post about AI",
    });
    const parsed = JSON.parse(raw as string);
    expect(parsed.goal).toBe("Write a blog post");
    expect(Array.isArray(parsed.steps)).toBe(true);
    expect(parsed.steps).toHaveLength(1);
  });

  it("appends context to the task prompt when context is provided", async () => {
    const mockRunStream = vi
      .fn()
      .mockReturnValue(makeMockStream(JSON.stringify(validPlan)));
    const { factory } = makeFactory(mockRunStream);
    const registry = new ToolRegistry();
    const { editorTools: et, workspaceTools: wt } = makeTools(factory);
    registerDelegationTools(registry, factory, et, wt, autoConfirm);

    await callTool(registry, "invoke_planner", {
      task: "Write a blog post",
      context: "Style: formal",
    });

    expect(mockRunStream).toHaveBeenCalledWith(
      "Write a blog post\n\nStyle: formal",
    );
  });

  it("throws when agent output is not valid JSON", async () => {
    const mockRunStream = vi
      .fn()
      .mockReturnValue(makeMockStream("not json at all"));
    const { factory } = makeFactory(mockRunStream);
    const registry = new ToolRegistry();
    const { editorTools: et, workspaceTools: wt } = makeTools(factory);
    registerDelegationTools(registry, factory, et, wt, vi.fn());

    await expect(
      callTool(registry, "invoke_planner", { task: "t" }),
    ).rejects.toThrow("invalid JSON");
  });

  it("throws when parsed JSON is missing required Plan fields", async () => {
    const mockRunStream = vi
      .fn()
      .mockReturnValue(makeMockStream(JSON.stringify({ steps: [] })));
    const { factory } = makeFactory(mockRunStream);
    const registry = new ToolRegistry();
    const { editorTools: et, workspaceTools: wt } = makeTools(factory);
    registerDelegationTools(registry, factory, et, wt, vi.fn());

    await expect(
      callTool(registry, "invoke_planner", { task: "t" }),
    ).rejects.toThrow("missing required fields");
  });

  it("calls setPendingPlanConfirmation with the plan before awaiting", async () => {
    const mockRunStream = vi
      .fn()
      .mockReturnValue(makeMockStream(JSON.stringify(validPlan)));
    const { factory } = makeFactory(mockRunStream);
    const registry = new ToolRegistry();
    const { editorTools: et, workspaceTools: wt } = makeTools(factory);
    registerDelegationTools(registry, factory, et, wt, autoConfirm);

    await callTool(registry, "invoke_planner", { task: "Write a blog post" });

    expect(autoConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ plan: validPlan }),
    );
  });

  it("clears pendingPlanConfirmation with null after resolution", async () => {
    const mockRunStream = vi
      .fn()
      .mockReturnValue(makeMockStream(JSON.stringify(validPlan)));
    const { factory } = makeFactory(mockRunStream);
    const registry = new ToolRegistry();
    const { editorTools: et, workspaceTools: wt } = makeTools(factory);
    registerDelegationTools(registry, factory, et, wt, autoConfirm);

    await callTool(registry, "invoke_planner", { task: "t" });

    expect(autoConfirm).toHaveBeenCalledWith(null);
  });

  it("throws 'Plan rejected by user.' when confirmation resolves with false", async () => {
    const rejectConfirm = vi.fn().mockImplementation((req) => {
      if (req) req.resolve(false);
    });
    const mockRunStream = vi
      .fn()
      .mockReturnValue(makeMockStream(JSON.stringify(validPlan)));
    const { factory } = makeFactory(mockRunStream);
    const registry = new ToolRegistry();
    const { editorTools: et, workspaceTools: wt } = makeTools(factory);
    registerDelegationTools(registry, factory, et, wt, rejectConfirm);

    await expect(
      callTool(registry, "invoke_planner", { task: "t" }),
    ).rejects.toThrow("Plan rejected by user.");
  });

  it("clears pendingPlanConfirmation with null even when rejected", async () => {
    const rejectConfirm = vi.fn().mockImplementation((req) => {
      if (req) req.resolve(false);
    });
    const mockRunStream = vi
      .fn()
      .mockReturnValue(makeMockStream(JSON.stringify(validPlan)));
    const { factory } = makeFactory(mockRunStream);
    const registry = new ToolRegistry();
    const { editorTools: et, workspaceTools: wt } = makeTools(factory);
    registerDelegationTools(registry, factory, et, wt, rejectConfirm);

    await expect(
      callTool(registry, "invoke_planner", { task: "t" }),
    ).rejects.toThrow();

    expect(rejectConfirm).toHaveBeenCalledWith(null);
  });
});
