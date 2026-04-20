// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EditorTools, createDelegateToSkillHandler } from "./EditorTools";
import { saveSkills } from "./skills";
import type { LlmAdapter } from "@mast-ai/core";

describe("EditorTools", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockEditor: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockModel: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let setSuggestions: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let setEditorContent: any;

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
    setEditorContent = vi.fn();
  });

  describe("read", () => {
    it("should return the editor content", () => {
      const tools = new EditorTools(
        mockEditor,
        setSuggestions,
        false,
        setEditorContent,
      );
      expect(tools.read()).toBe("Initial content");
    });

    it("should return empty string if editor is not initialized", () => {
      const tools = new EditorTools(
        null,
        setSuggestions,
        false,
        setEditorContent,
      );
      expect(tools.read()).toBe("");
    });
  });

  describe("search", () => {
    it("should return error if editor is not initialized", () => {
      const tools = new EditorTools(
        null,
        setSuggestions,
        false,
        setEditorContent,
      );
      expect(tools.search({ query: "hello" })).toBe(
        "Error: Editor not initialized.",
      );
    });

    it("should return error for empty query", () => {
      const tools = new EditorTools(
        mockEditor,
        setSuggestions,
        false,
        setEditorContent,
      );
      expect(tools.search({ query: "" })).toBe(
        "Error: query parameter is required.",
      );
    });

    it("should return not-found message when there are no matches", () => {
      mockModel.findMatches.mockReturnValue([]);
      const tools = new EditorTools(
        mockEditor,
        setSuggestions,
        false,
        setEditorContent,
      );
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
      const tools = new EditorTools(
        mockEditor,
        setSuggestions,
        false,
        setEditorContent,
      );
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
      const tools = new EditorTools(
        mockEditor,
        setSuggestions,
        false,
        setEditorContent,
      );
      expect(tools.search({ query: "foo" })).toBe(
        'Found 2 occurrence(s) of "foo": line 1, col 1; line 5, col 10.',
      );
    });
  });

  describe("get_metadata", () => {
    it("should return error if editor is not initialized", () => {
      const tools = new EditorTools(
        null,
        setSuggestions,
        false,
        setEditorContent,
      );
      expect(tools.get_metadata()).toBe("Error: Editor not initialized.");
    });

    it("should return zero counts for an empty document", () => {
      mockEditor.getValue.mockReturnValue("");
      const tools = new EditorTools(
        mockEditor,
        setSuggestions,
        false,
        setEditorContent,
      );
      expect(tools.get_metadata()).toBe("Characters: 0, Words: 0, Lines: 0.");
    });

    it("should return correct counts for a single-line document", () => {
      mockEditor.getValue.mockReturnValue("hello world");
      const tools = new EditorTools(
        mockEditor,
        setSuggestions,
        false,
        setEditorContent,
      );
      expect(tools.get_metadata()).toBe("Characters: 11, Words: 2, Lines: 1.");
    });

    it("should return correct line count for a multi-line document", () => {
      mockEditor.getValue.mockReturnValue("line one\nline two\nline three");
      const tools = new EditorTools(
        mockEditor,
        setSuggestions,
        false,
        setEditorContent,
      );
      expect(tools.get_metadata()).toBe("Characters: 28, Words: 6, Lines: 3.");
    });

    it("should not count leading/trailing whitespace as words", () => {
      mockEditor.getValue.mockReturnValue("  hello world  ");
      const tools = new EditorTools(
        mockEditor,
        setSuggestions,
        false,
        setEditorContent,
      );
      expect(tools.get_metadata()).toBe("Characters: 15, Words: 2, Lines: 1.");
    });
  });

  describe("edit", () => {
    it("should return an error if text is not found", async () => {
      mockModel.findMatches.mockReturnValue([]);
      const tools = new EditorTools(
        mockEditor,
        setSuggestions,
        false,
        setEditorContent,
      );

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
      const tools = new EditorTools(
        mockEditor,
        setSuggestions,
        false,
        setEditorContent,
      );

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
      const tools = new EditorTools(
        mockEditor,
        setSuggestions,
        true,
        setEditorContent,
      );

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let parentAdapter: any;
    let editorToolsInstance: EditorTools;
    let mockRun: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      localStorage.clear();
      parentAdapter = {
        generate: vi.fn(),
        generateStream: vi.fn(),
      } as unknown as LlmAdapter;
      editorToolsInstance = new EditorTools(
        mockEditor,
        setSuggestions,
        false,
        setEditorContent,
      );
      mockRun = vi.fn().mockResolvedValue({ output: "done" });
    });

    function makeHandler(adapterFactory = vi.fn()) {
      return createDelegateToSkillHandler(
        "test-api-key",
        parentAdapter,
        editorToolsInstance,
        adapterFactory,
        () => ({ run: mockRun as unknown as (agent: import("@mast-ai/core").AgentConfig, input: string) => Promise<{ output: string }> }),
      );
    }

    it("returns error string when skill name is not found", async () => {
      saveSkills([
        { id: "1", name: "Other", description: "d", instructions: "i" },
      ]);
      const result = await makeHandler()({
        skillName: "Missing",
        task: "do it",
      });
      expect(result).toContain('skill "Missing" not found');
      expect(result).toContain("Other");
    });

    it("returns error listing 'none' when no skills exist", async () => {
      const result = await makeHandler()({ skillName: "Any", task: "do it" });
      expect(result).toContain("none");
    });

    it("calls run with skill instructions and returns result.output", async () => {
      mockRun.mockResolvedValue({ output: "Proofreading complete." });
      saveSkills([
        {
          id: "1",
          name: "Proofreader",
          description: "d",
          instructions: "Check it",
        },
      ]);
      const result = await makeHandler()({
        skillName: "Proofreader",
        task: "check spelling",
      });
      expect(mockRun).toHaveBeenCalledOnce();
      const [agentConfig] = mockRun.mock.calls[0];
      expect(agentConfig.instructions).toBe("Check it");
      expect(result).toBe("Proofreading complete.");
    });

    it("does not include delegate_to_skill in child agent tool list", async () => {
      saveSkills([
        { id: "1", name: "Proofreader", description: "d", instructions: "i" },
      ]);
      await makeHandler()({ skillName: "Proofreader", task: "t" });
      const [agentConfig] = mockRun.mock.calls[0];
      expect(agentConfig.tools).not.toContain("delegate_to_skill");
    });

    it("reuses parent adapter when skill has no model", async () => {
      saveSkills([
        { id: "1", name: "Proofreader", description: "d", instructions: "i" },
      ]);
      const adapterFactory = vi.fn();
      await makeHandler(adapterFactory)({
        skillName: "Proofreader",
        task: "t",
      });
      expect(adapterFactory).not.toHaveBeenCalled();
    });

    it("calls adapterFactory when skill specifies a model", async () => {
      saveSkills([
        {
          id: "1",
          name: "Proofreader",
          description: "d",
          instructions: "i",
          model: "gemini-2.5-pro",
        },
      ]);
      const newAdapter = { generate: vi.fn() } as unknown as LlmAdapter;
      const adapterFactory = vi.fn().mockReturnValue(newAdapter);
      await makeHandler(adapterFactory)({
        skillName: "Proofreader",
        task: "t",
      });
      expect(adapterFactory).toHaveBeenCalledWith(
        "test-api-key",
        "gemini-2.5-pro",
      );
    });
  });

  describe("write", () => {
    it("should create a suggestion for the full document if not approveAll", async () => {
      const tools = new EditorTools(
        mockEditor,
        setSuggestions,
        false,
        setEditorContent,
      );

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
      const tools = new EditorTools(
        mockEditor,
        setSuggestions,
        true,
        setEditorContent,
      );

      const result = await tools.write({ content: "New document content" });

      expect(result).toBe(
        "Document updated automatically (Approve All is ON).",
      );
      expect(mockEditor.setValue).toHaveBeenCalledWith("New document content");
      expect(setSuggestions).not.toHaveBeenCalled();
    });
  });
});
