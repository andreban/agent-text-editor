// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EditorTools } from "./EditorTools";

describe("EditorTools", () => {
  let mockEditor: any;
  let mockModel: any;
  let setSuggestions: any;
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
