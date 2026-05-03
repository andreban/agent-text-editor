// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from "vitest";
import { DelegateToSkillTool } from "./delegate_to_skill";
import type { EditorContext } from "../editor/context";
import type { WorkspaceContext } from "../workspace/context";
import { createToolRegistry } from "../registries";
import { saveSkills } from "../../../skills";
import type { AgentRunnerFactory } from "../../";

describe("DelegateToSkillTool", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockEditor: any;
  let editorCtx: EditorContext;
  let mockRunStream: ReturnType<typeof vi.fn>;
  let mockRunBuilder: ReturnType<typeof vi.fn>;
  let mockFactory: AgentRunnerFactory;
  let workspaceCtx: WorkspaceContext;

  function makeMockStream(
    output: string,
    extraEvents: import("@mast-ai/core").AgentEvent[] = [],
  ): AsyncIterable<import("@mast-ai/core").AgentEvent> {
    return (async function* () {
      for (const e of extraEvents) yield e;
      yield { type: "done", output, history: [] };
    })();
  }

  beforeEach(() => {
    localStorage.clear();
    mockEditor = {
      getValue: vi.fn().mockReturnValue("Initial content"),
      setValue: vi.fn(),
      getModel: vi.fn().mockReturnValue(null),
      getSelection: vi.fn().mockReturnValue(null),
    };
    mockRunStream = vi.fn().mockReturnValue(makeMockStream("done"));
    mockRunBuilder = vi.fn().mockReturnValue({ runStream: mockRunStream });
    mockFactory = {
      create: vi.fn().mockReturnValue({ runBuilder: mockRunBuilder }),
    };

    editorCtx = {
      editorRef: { current: mockEditor },
      editorContentRef: { current: "" },
      activeTabRef: { current: "editor" },
      requestTabSwitch: () => Promise.resolve(false),
      setSuggestions: vi.fn(),
      approveAllRef: { current: false },
    };
    workspaceCtx = {
      docsRef: { current: [] },
      activeDocRef: { current: null },
      factory: mockFactory,
      createDocumentFn: vi.fn().mockReturnValue(""),
      renameDocumentFn: vi.fn(),
      deleteDocumentFn: vi.fn(),
      setActiveDocumentIdFn: vi.fn(),
      saveDocContentFn: vi.fn(),
      editorRef: { current: null },
      editorContentRef: { current: "" },
      setPendingWorkspaceAction: vi.fn(),
      approveAllRef: { current: false },
    };
  });

  function makeTool(factory = mockFactory) {
    return new DelegateToSkillTool(
      factory,
      createToolRegistry(editorCtx, workspaceCtx).readOnly(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      () => ({ runBuilder: mockRunBuilder }) as any,
    );
  }

  it("returns error string when skill name is not found", async () => {
    saveSkills([
      { id: "1", name: "Other", description: "d", instructions: "i" },
    ]);
    const result = await makeTool().call(
      { skillName: "Missing", task: "do it" },
      {},
    );
    expect(result).toContain('skill "Missing" not found');
    expect(result).toContain("Other");
  });

  it("returns error listing 'none' when no skills exist", async () => {
    const result = await makeTool().call(
      { skillName: "Any", task: "do it" },
      {},
    );
    expect(result).toContain("none");
  });

  it("calls runBuilder with skill instructions and returns raw output", async () => {
    mockRunStream.mockReturnValue(makeMockStream("Proofreading complete."));
    saveSkills([
      {
        id: "1",
        name: "Proofreader",
        description: "d",
        instructions: "Check it",
      },
    ]);
    const result = await makeTool().call(
      { skillName: "Proofreader", task: "check spelling" },
      {},
    );
    expect(mockRunBuilder).toHaveBeenCalledOnce();
    const [agentConfig] = mockRunBuilder.mock.calls[0];
    expect(agentConfig.instructions).toBe("Check it");
    expect(result).toBe("Proofreading complete.");
  });

  it("does not include delegate_to_skill in child agent tool list", async () => {
    saveSkills([
      { id: "1", name: "Proofreader", description: "d", instructions: "i" },
    ]);
    await makeTool().call({ skillName: "Proofreader", task: "t" }, {});
    const [agentConfig] = mockRunBuilder.mock.calls[0];
    expect(agentConfig.tools).not.toContain("delegate_to_skill");
  });

  it("does not call factory.create when a custom runnerFactory override is used", async () => {
    saveSkills([
      { id: "1", name: "Proofreader", description: "d", instructions: "i" },
    ]);
    await makeTool().call({ skillName: "Proofreader", task: "t" }, {});
    expect(mockRunBuilder).toHaveBeenCalledOnce();
  });

  it("forwards non-done child events via context.onEvent", async () => {
    mockRunStream.mockReturnValue(
      makeMockStream("done", [
        { type: "text_delta", delta: "hello" },
        { type: "thinking", delta: "hmm" },
      ]),
    );
    saveSkills([
      { id: "1", name: "Proofreader", description: "d", instructions: "i" },
    ]);
    const onEvent = vi.fn();
    await makeTool().call({ skillName: "Proofreader", task: "t" }, { onEvent });
    expect(onEvent).toHaveBeenCalledWith({
      type: "text_delta",
      delta: "hello",
    });
    expect(onEvent).toHaveBeenCalledWith({ type: "thinking", delta: "hmm" });
    expect(onEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "done" }),
    );
  });

  it("gives skill read-only workspace tools (no create_document, switch_active_document)", async () => {
    saveSkills([
      { id: "1", name: "Research Skill", description: "d", instructions: "i" },
    ]);
    await makeTool().call(
      { skillName: "Research Skill", task: "check docs" },
      {},
    );
    const [agentConfig] = mockRunBuilder.mock.calls[0];
    expect(agentConfig.tools).toContain("list_workspace_docs");
    expect(agentConfig.tools).toContain("read_workspace_doc");
    expect(agentConfig.tools).not.toContain("create_document");
    expect(agentConfig.tools).not.toContain("switch_active_document");
  });

  it("passes model to runnerFactory when skill specifies a model", async () => {
    saveSkills([
      {
        id: "1",
        name: "Proofreader",
        description: "d",
        instructions: "i",
        model: "gemini-2.5-pro",
      },
    ]);
    const customRunnerFactory = vi
      .fn()
      .mockReturnValue({ runBuilder: mockRunBuilder });
    const tool = new DelegateToSkillTool(
      mockFactory,
      createToolRegistry(editorCtx, workspaceCtx).readOnly(),
      customRunnerFactory,
    );
    await tool.call({ skillName: "Proofreader", task: "t" }, {});
    expect(customRunnerFactory).toHaveBeenCalledWith(
      expect.anything(),
      "gemini-2.5-pro",
    );
  });

  it("gives skill a read-only registry (no edit, no write tool registered)", async () => {
    saveSkills([
      { id: "1", name: "Proofreader", description: "d", instructions: "i" },
    ]);
    await makeTool().call({ skillName: "Proofreader", task: "t" }, {});
    const [agentConfig] = mockRunBuilder.mock.calls[0];
    expect(agentConfig.tools).not.toContain("edit");
    expect(agentConfig.tools).not.toContain("write");
  });
});
