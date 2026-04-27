// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EditorTools } from "./EditorTools";

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
