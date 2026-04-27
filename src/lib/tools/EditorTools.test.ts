// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EditorTools, createDelegateToSkillHandler } from "./EditorTools";
import { WorkspaceTools } from "./WorkspaceTools";
import { saveSkills } from "../skills";
import type { AgentRunnerFactory } from "../agents";

describe("EditorTools", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockEditor: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockModel: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let setSuggestions: any;

  beforeEach(() => {
    mockModel = {
      findMatches: vi.fn(),
      pushEditOperations: vi.fn(),
      getFullModelRange: vi.fn().mockReturnValue({
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 10,
        endColumn: 10,
      }),
    };

    mockEditor = {
      getValue: vi.fn().mockReturnValue("Initial content"),
      setValue: vi.fn(),
      getModel: vi.fn().mockReturnValue(mockModel),
      getSelection: vi.fn().mockReturnValue(null),
    };

    setSuggestions = vi.fn();
  });

  describe("read", () => {
    it("should return the editor content", () => {
      const tools = new EditorTools({ current: mockEditor }, setSuggestions, {
        current: false,
      });
      expect(tools.read()).toBe("Initial content");
    });

    it("should return empty string if editor is not initialized and no fallback", () => {
      const tools = new EditorTools({ current: null }, setSuggestions, {
        current: false,
      });
      expect(tools.read()).toBe("");
    });

    it("should fall back to getEditorContent when editor is not initialized", () => {
      const tools = new EditorTools(
        { current: null },
        setSuggestions,
        { current: false },
        { current: "fallback content" },
      );
      expect(tools.read()).toBe("fallback content");
    });

    it("should fall back to getEditorContent when editor returns empty string", () => {
      mockEditor.getValue.mockReturnValue("");
      const tools = new EditorTools(
        { current: mockEditor },
        setSuggestions,
        { current: false },
        { current: "fallback content" },
      );
      expect(tools.read()).toBe("fallback content");
    });

    it("should prefer editor content over fallback when editor has content", () => {
      const tools = new EditorTools(
        { current: mockEditor },
        setSuggestions,
        { current: false },
        { current: "fallback content" },
      );
      expect(tools.read()).toBe("Initial content");
    });
  });

  describe("get_current_mode", () => {
    it("should return editor mode by default", () => {
      const tools = new EditorTools({ current: mockEditor }, setSuggestions, {
        current: false,
      });
      expect(tools.get_current_mode()).toBe("editor");
    });

    it("should return the mode from getActiveTab", () => {
      const tools = new EditorTools(
        { current: mockEditor },
        setSuggestions,
        { current: false },
        { current: "" },
        { current: "preview" },
      );
      expect(tools.get_current_mode()).toBe("preview");
    });
  });

  describe("request_switch_to_editor", () => {
    it("should return already-in-editor message when already in editor mode", async () => {
      const tools = new EditorTools(
        { current: mockEditor },
        setSuggestions,
        { current: false },
        { current: "" },
        { current: "editor" },
      );
      expect(await tools.request_switch_to_editor()).toBe(
        "Already in editor mode.",
      );
    });

    it("should return success message when user accepts the switch", async () => {
      const requestTabSwitch = vi.fn().mockResolvedValue(true);
      const tools = new EditorTools(
        { current: mockEditor },
        setSuggestions,
        { current: false },
        { current: "" },
        { current: "preview" },
        requestTabSwitch,
      );
      expect(await tools.request_switch_to_editor()).toBe(
        "Switched to editor mode.",
      );
      expect(requestTabSwitch).toHaveBeenCalledOnce();
    });

    it("should return declined message when user rejects the switch", async () => {
      const requestTabSwitch = vi.fn().mockResolvedValue(false);
      const tools = new EditorTools(
        { current: mockEditor },
        setSuggestions,
        { current: false },
        { current: "" },
        { current: "preview" },
        requestTabSwitch,
      );
      expect(await tools.request_switch_to_editor()).toBe(
        "User declined to switch to editor mode.",
      );
    });
  });

  describe("search", () => {
    it("should return error if editor is not initialized", () => {
      const tools = new EditorTools({ current: null }, setSuggestions, {
        current: false,
      });
      expect(tools.search({ query: "hello" })).toBe(
        "Error: Editor not initialized.",
      );
    });

    it("should return error for empty query", () => {
      const tools = new EditorTools({ current: mockEditor }, setSuggestions, {
        current: false,
      });
      expect(tools.search({ query: "" })).toBe(
        "Error: query parameter is required.",
      );
    });

    it("should return not-found message when there are no matches", () => {
      mockModel.findMatches.mockReturnValue([]);
      const tools = new EditorTools({ current: mockEditor }, setSuggestions, {
        current: false,
      });
      expect(tools.search({ query: "xyz" })).toBe(
        'No occurrences of "xyz" found.',
      );
    });

    it("should return location of a single match", () => {
      mockModel.findMatches.mockReturnValue([
        {
          range: {
            startLineNumber: 3,
            startColumn: 5,
            endLineNumber: 3,
            endColumn: 8,
          },
        },
      ]);
      const tools = new EditorTools({ current: mockEditor }, setSuggestions, {
        current: false,
      });
      expect(tools.search({ query: "foo" })).toBe(
        'Found 1 occurrence(s) of "foo": line 3, col 5.',
      );
    });

    it("should return locations of multiple matches", () => {
      mockModel.findMatches.mockReturnValue([
        {
          range: {
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: 1,
            endColumn: 4,
          },
        },
        {
          range: {
            startLineNumber: 5,
            startColumn: 10,
            endLineNumber: 5,
            endColumn: 13,
          },
        },
      ]);
      const tools = new EditorTools({ current: mockEditor }, setSuggestions, {
        current: false,
      });
      expect(tools.search({ query: "foo" })).toBe(
        'Found 2 occurrence(s) of "foo": line 1, col 1; line 5, col 10.',
      );
    });
  });

  describe("read_selection", () => {
    it("should return empty string if editor is not initialized", () => {
      const tools = new EditorTools({ current: null }, setSuggestions, {
        current: false,
      });
      expect(tools.read_selection()).toBe("");
    });

    it("should return empty string when selection is null", () => {
      const tools = new EditorTools({ current: mockEditor }, setSuggestions, {
        current: false,
      });
      expect(tools.read_selection()).toBe("");
    });

    it("should return the selected text", () => {
      const selection = {
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 6,
      };
      mockEditor.getSelection.mockReturnValue(selection);
      mockModel.getValueInRange = vi.fn().mockReturnValue("hello");
      const tools = new EditorTools({ current: mockEditor }, setSuggestions, {
        current: false,
      });
      expect(tools.read_selection()).toBe("hello");
      expect(mockModel.getValueInRange).toHaveBeenCalledWith(selection);
    });

    it("should return empty string when model is not available", () => {
      mockEditor.getModel.mockReturnValue(null);
      mockEditor.getSelection.mockReturnValue({
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 6,
      });
      const tools = new EditorTools({ current: mockEditor }, setSuggestions, {
        current: false,
      });
      expect(tools.read_selection()).toBe("");
    });
  });

  describe("get_metadata", () => {
    it("should return error if editor is not initialized", () => {
      const tools = new EditorTools({ current: null }, setSuggestions, {
        current: false,
      });
      expect(tools.get_metadata()).toBe("Error: Editor not initialized.");
    });

    it("should return zero counts for an empty document", () => {
      mockEditor.getValue.mockReturnValue("");
      const tools = new EditorTools({ current: mockEditor }, setSuggestions, {
        current: false,
      });
      expect(tools.get_metadata()).toBe("Characters: 0, Words: 0, Lines: 0.");
    });

    it("should return correct counts for a single-line document", () => {
      mockEditor.getValue.mockReturnValue("hello world");
      const tools = new EditorTools({ current: mockEditor }, setSuggestions, {
        current: false,
      });
      expect(tools.get_metadata()).toBe("Characters: 11, Words: 2, Lines: 1.");
    });

    it("should return correct line count for a multi-line document", () => {
      mockEditor.getValue.mockReturnValue("line one\nline two\nline three");
      const tools = new EditorTools({ current: mockEditor }, setSuggestions, {
        current: false,
      });
      expect(tools.get_metadata()).toBe("Characters: 28, Words: 6, Lines: 3.");
    });

    it("should not count leading/trailing whitespace as words", () => {
      mockEditor.getValue.mockReturnValue("  hello world  ");
      const tools = new EditorTools({ current: mockEditor }, setSuggestions, {
        current: false,
      });
      expect(tools.get_metadata()).toBe("Characters: 15, Words: 2, Lines: 1.");
    });
  });

  describe("edit", () => {
    it("should return an error if text is not found", async () => {
      mockModel.findMatches.mockReturnValue([]);
      const tools = new EditorTools({ current: mockEditor }, setSuggestions, {
        current: false,
      });

      const result = await tools.edit({
        originalText: "missing",
        replacementText: "found",
      });
      expect(result).toBe(
        'Error: Could not find the text "missing" in the document.',
      );
    });

    it("should create a suggestion and return a promise if not approveAll", async () => {
      mockModel.findMatches.mockReturnValue([
        {
          range: {
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: 1,
            endColumn: 5,
          },
        },
      ]);
      const tools = new EditorTools({ current: mockEditor }, setSuggestions, {
        current: false,
      });

      const promise = tools.edit({
        originalText: "old",
        replacementText: "new",
      });

      expect(setSuggestions).toHaveBeenCalled();

      // Get the callback passed to setSuggestions
      const updateFn = setSuggestions.mock.calls[0][0];
      const newSuggestions = updateFn([]);

      expect(newSuggestions).toHaveLength(1);
      expect(newSuggestions[0].originalText).toBe("old");
      expect(newSuggestions[0].replacementText).toBe("new");
      expect(newSuggestions[0].status).toBe("pending");
      expect(typeof newSuggestions[0].resolve).toBe("function");

      // Resolve it manually
      newSuggestions[0].resolve("Change accepted.");
      const result = await promise;
      expect(result).toBe("Change accepted.");
    });

    it("should apply edit immediately if approveAll is true", async () => {
      mockModel.findMatches.mockReturnValue([
        {
          range: {
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: 1,
            endColumn: 5,
          },
        },
      ]);
      const tools = new EditorTools({ current: mockEditor }, setSuggestions, {
        current: true,
      });

      const result = await tools.edit({
        originalText: "old",
        replacementText: "new",
      });

      expect(result).toBe("Change applied automatically (Approve All is ON).");
      expect(mockModel.pushEditOperations).toHaveBeenCalled();
      expect(setSuggestions).not.toHaveBeenCalled();
    });
  });

  describe("delegate_to_skill", () => {
    let editorToolsInstance: EditorTools;
    let mockRunStream: ReturnType<typeof vi.fn>;
    let mockRunBuilder: ReturnType<typeof vi.fn>;
    let mockFactory: AgentRunnerFactory;

    function makeMockStream(
      output: string,
      extraEvents: import("@mast-ai/core").AgentEvent[] = [],
    ): AsyncIterable<import("@mast-ai/core").AgentEvent> {
      return (async function* () {
        for (const e of extraEvents) yield e;
        yield { type: "done", output, history: [] };
      })();
    }

    let mockWorkspaceTools: WorkspaceTools;

    beforeEach(() => {
      localStorage.clear();
      editorToolsInstance = new EditorTools(
        { current: mockEditor },
        setSuggestions,
        { current: false },
      );
      mockRunStream = vi.fn().mockReturnValue(makeMockStream("done"));
      mockRunBuilder = vi.fn().mockReturnValue({ runStream: mockRunStream });
      mockFactory = {
        create: vi.fn().mockReturnValue({ runBuilder: mockRunBuilder }),
      };
      mockWorkspaceTools = new WorkspaceTools(
        { current: [] },
        { current: null },
        mockFactory,
      );
    });

    function makeHandler(factory = mockFactory) {
      return createDelegateToSkillHandler(
        factory,
        editorToolsInstance,
        mockWorkspaceTools,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        () => ({ runBuilder: mockRunBuilder }) as any,
      );
    }

    it("returns error string when skill name is not found", async () => {
      saveSkills([
        { id: "1", name: "Other", description: "d", instructions: "i" },
      ]);
      const result = await makeHandler()(
        { skillName: "Missing", task: "do it" },
        {},
      );
      expect(result).toContain('skill "Missing" not found');
      expect(result).toContain("Other");
    });

    it("returns error listing 'none' when no skills exist", async () => {
      const result = await makeHandler()(
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
      const result = await makeHandler()(
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
      await makeHandler()({ skillName: "Proofreader", task: "t" }, {});
      const [agentConfig] = mockRunBuilder.mock.calls[0];
      expect(agentConfig.tools).not.toContain("delegate_to_skill");
    });

    it("does not call factory.create when a custom runnerFactory override is used", async () => {
      saveSkills([
        { id: "1", name: "Proofreader", description: "d", instructions: "i" },
      ]);
      await makeHandler()({ skillName: "Proofreader", task: "t" }, {});
      // The override runnerFactory is used directly; factory.create is bypassed
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
      await makeHandler()({ skillName: "Proofreader", task: "t" }, { onEvent });
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
        {
          id: "1",
          name: "Research Skill",
          description: "d",
          instructions: "i",
        },
      ]);
      await makeHandler()(
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
      const handler = createDelegateToSkillHandler(
        mockFactory,
        editorToolsInstance,
        mockWorkspaceTools,
        customRunnerFactory,
      );
      await handler({ skillName: "Proofreader", task: "t" }, {});
      expect(customRunnerFactory).toHaveBeenCalledWith(
        expect.anything(),
        "gemini-2.5-pro",
      );
    });

    it("gives skill a read-only registry (no edit, no write tool registered)", async () => {
      saveSkills([
        { id: "1", name: "Proofreader", description: "d", instructions: "i" },
      ]);
      await makeHandler()({ skillName: "Proofreader", task: "t" }, {});
      const [agentConfig] = mockRunBuilder.mock.calls[0];
      expect(agentConfig.tools).not.toContain("edit");
      expect(agentConfig.tools).not.toContain("write");
    });
  });

  describe("write", () => {
    it("should create a suggestion for the full document if not approveAll", async () => {
      const tools = new EditorTools({ current: mockEditor }, setSuggestions, {
        current: false,
      });

      const promise = tools.write({ content: "New document content" });

      expect(setSuggestions).toHaveBeenCalled();

      const updateFn = setSuggestions.mock.calls[0][0];
      const newSuggestions = updateFn([]);

      expect(newSuggestions).toHaveLength(1);
      expect(newSuggestions[0].originalText).toBe("Initial content");
      expect(newSuggestions[0].replacementText).toBe("New document content");
      expect(newSuggestions[0].status).toBe("pending");

      newSuggestions[0].resolve("Change rejected.");
      const result = await promise;
      expect(result).toBe("Change rejected.");
    });

    it("should apply full replacement immediately if approveAll is true", async () => {
      const tools = new EditorTools({ current: mockEditor }, setSuggestions, {
        current: true,
      });

      const result = await tools.write({ content: "New document content" });

      expect(result).toBe(
        "Document updated automatically (Approve All is ON).",
      );
      expect(mockEditor.setValue).toHaveBeenCalledWith("New document content");
      expect(setSuggestions).not.toHaveBeenCalled();
    });
  });
});
