// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { EditorContext } from "./context";
import { ReadTool } from "./read";
import { ReadSelectionTool } from "./read_selection";
import { SearchTool } from "./search";
import { GetMetadataTool } from "./get_metadata";
import { GetCurrentModeTool } from "./get_current_mode";
import { RequestSwitchToEditorTool } from "./request_switch_to_editor";
import { EditTool } from "./edit";
import { WriteTool } from "./write";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeCtx(
  overrides: Partial<EditorContext> = {},
  mockEditor?: any,
): EditorContext {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editor = mockEditor ?? (null as any);
  return {
    editorRef: { current: editor },
    editorContentRef: { current: "" },
    activeTabRef: { current: "editor" },
    requestTabSwitch: () => Promise.resolve(false),
    setSuggestions: vi.fn(),
    approveAllRef: { current: false },
    ...overrides,
  };
}

describe("ReadTool", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockEditor: any;

  beforeEach(() => {
    mockEditor = { getValue: vi.fn().mockReturnValue("Initial content") };
  });

  it("returns editor content", async () => {
    expect(await new ReadTool(makeCtx({}, mockEditor)).call({}, {})).toBe(
      "Initial content",
    );
  });

  it("returns empty string if editor not initialized and no fallback", async () => {
    expect(await new ReadTool(makeCtx()).call({}, {})).toBe("");
  });

  it("falls back to editorContentRef when editor is null", async () => {
    const ctx = makeCtx({ editorContentRef: { current: "fallback content" } });
    expect(await new ReadTool(ctx).call({}, {})).toBe("fallback content");
  });

  it("falls back to editorContentRef when editor returns empty string", async () => {
    mockEditor.getValue.mockReturnValue("");
    const ctx = makeCtx(
      { editorContentRef: { current: "fallback content" } },
      mockEditor,
    );
    expect(await new ReadTool(ctx).call({}, {})).toBe("fallback content");
  });

  it("prefers editor content over fallback when editor has content", async () => {
    const ctx = makeCtx(
      { editorContentRef: { current: "fallback content" } },
      mockEditor,
    );
    expect(await new ReadTool(ctx).call({}, {})).toBe("Initial content");
  });
});

describe("GetCurrentModeTool", () => {
  it("returns editor mode by default", async () => {
    expect(await new GetCurrentModeTool(makeCtx()).call({}, {})).toBe("editor");
  });

  it("returns preview mode from activeTabRef", async () => {
    const ctx = makeCtx({ activeTabRef: { current: "preview" } });
    expect(await new GetCurrentModeTool(ctx).call({}, {})).toBe("preview");
  });
});

describe("RequestSwitchToEditorTool", () => {
  it("returns already-in-editor message when in editor mode", async () => {
    expect(await new RequestSwitchToEditorTool(makeCtx()).call({}, {})).toBe(
      "Already in editor mode.",
    );
  });

  it("returns success message when user accepts switch", async () => {
    const ctx = makeCtx({
      activeTabRef: { current: "preview" },
      requestTabSwitch: vi.fn().mockResolvedValue(true),
    });
    expect(await new RequestSwitchToEditorTool(ctx).call({}, {})).toBe(
      "Switched to editor mode.",
    );
  });

  it("returns declined message when user rejects switch", async () => {
    const ctx = makeCtx({
      activeTabRef: { current: "preview" },
      requestTabSwitch: vi.fn().mockResolvedValue(false),
    });
    expect(await new RequestSwitchToEditorTool(ctx).call({}, {})).toBe(
      "User declined to switch to editor mode.",
    );
  });
});

describe("SearchTool", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockEditor: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockModel: any;

  beforeEach(() => {
    mockModel = { findMatches: vi.fn() };
    mockEditor = { getModel: vi.fn().mockReturnValue(mockModel) };
  });

  it("returns error if editor not initialized", async () => {
    expect(await new SearchTool(makeCtx()).call({ query: "hello" }, {})).toBe(
      "Error: Editor not initialized.",
    );
  });

  it("returns error for empty query", async () => {
    expect(
      await new SearchTool(makeCtx({}, mockEditor)).call({ query: "" }, {}),
    ).toBe("Error: query parameter is required.");
  });

  it("returns not-found message when no matches", async () => {
    mockModel.findMatches.mockReturnValue([]);
    expect(
      await new SearchTool(makeCtx({}, mockEditor)).call({ query: "xyz" }, {}),
    ).toBe('No occurrences of "xyz" found.');
  });

  it("returns location of a single match", async () => {
    mockModel.findMatches.mockReturnValue([
      { range: { startLineNumber: 3, startColumn: 5 } },
    ]);
    expect(
      await new SearchTool(makeCtx({}, mockEditor)).call({ query: "foo" }, {}),
    ).toBe('Found 1 occurrence(s) of "foo": line 3, col 5.');
  });

  it("returns locations of multiple matches", async () => {
    mockModel.findMatches.mockReturnValue([
      { range: { startLineNumber: 1, startColumn: 1 } },
      { range: { startLineNumber: 5, startColumn: 10 } },
    ]);
    expect(
      await new SearchTool(makeCtx({}, mockEditor)).call({ query: "foo" }, {}),
    ).toBe('Found 2 occurrence(s) of "foo": line 1, col 1; line 5, col 10.');
  });
});

describe("ReadSelectionTool", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockEditor: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockModel: any;

  beforeEach(() => {
    mockModel = { getValueInRange: vi.fn() };
    mockEditor = {
      getSelection: vi.fn().mockReturnValue(null),
      getModel: vi.fn().mockReturnValue(mockModel),
    };
  });

  it("returns empty string if editor not initialized", async () => {
    expect(await new ReadSelectionTool(makeCtx()).call({}, {})).toBe("");
  });

  it("returns empty string when selection is null", async () => {
    expect(
      await new ReadSelectionTool(makeCtx({}, mockEditor)).call({}, {}),
    ).toBe("");
  });

  it("returns the selected text", async () => {
    const selection = {
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: 6,
    };
    mockEditor.getSelection.mockReturnValue(selection);
    mockModel.getValueInRange.mockReturnValue("hello");
    expect(
      await new ReadSelectionTool(makeCtx({}, mockEditor)).call({}, {}),
    ).toBe("hello");
    expect(mockModel.getValueInRange).toHaveBeenCalledWith(selection);
  });
});

describe("GetMetadataTool", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockEditor: any;

  beforeEach(() => {
    mockEditor = { getValue: vi.fn() };
  });

  it("returns error if editor not initialized", async () => {
    expect(await new GetMetadataTool(makeCtx()).call({}, {})).toBe(
      "Error: Editor not initialized.",
    );
  });

  it("returns zero counts for empty document", async () => {
    mockEditor.getValue.mockReturnValue("");
    expect(
      await new GetMetadataTool(makeCtx({}, mockEditor)).call({}, {}),
    ).toBe("Characters: 0, Words: 0, Lines: 0.");
  });

  it("returns correct counts for single-line document", async () => {
    mockEditor.getValue.mockReturnValue("hello world");
    expect(
      await new GetMetadataTool(makeCtx({}, mockEditor)).call({}, {}),
    ).toBe("Characters: 11, Words: 2, Lines: 1.");
  });

  it("returns correct line count for multi-line document", async () => {
    mockEditor.getValue.mockReturnValue("line one\nline two\nline three");
    expect(
      await new GetMetadataTool(makeCtx({}, mockEditor)).call({}, {}),
    ).toBe("Characters: 28, Words: 6, Lines: 3.");
  });
});

describe("EditTool", () => {
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
      getFullModelRange: vi
        .fn()
        .mockReturnValue({
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
    };
    setSuggestions = vi.fn();
  });

  it("returns error if text not found", async () => {
    mockModel.findMatches.mockReturnValue([]);
    const ctx = makeCtx({ setSuggestions }, mockEditor);
    const result = await new EditTool(ctx).call(
      { originalText: "missing", replacementText: "found" },
      {},
    );
    expect(result).toBe(
      'Error: Could not find the text "missing" in the document.',
    );
  });

  it("creates a suggestion and resolves when not approveAll", async () => {
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
    const ctx = makeCtx({ setSuggestions }, mockEditor);
    const promise = new EditTool(ctx).call(
      { originalText: "old", replacementText: "new" },
      {},
    );

    expect(setSuggestions).toHaveBeenCalled();
    const updateFn = setSuggestions.mock.calls[0][0];
    const newSuggestions = updateFn([]);
    expect(newSuggestions).toHaveLength(1);
    expect(newSuggestions[0].originalText).toBe("old");
    expect(newSuggestions[0].replacementText).toBe("new");
    expect(newSuggestions[0].status).toBe("pending");

    newSuggestions[0].resolve("Change accepted.");
    expect(await promise).toBe("Change accepted.");
  });

  it("applies edit immediately if approveAll is true", async () => {
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
    const ctx = makeCtx(
      { setSuggestions, approveAllRef: { current: true } },
      mockEditor,
    );
    const result = await new EditTool(ctx).call(
      { originalText: "old", replacementText: "new" },
      {},
    );
    expect(result).toBe("Change applied automatically (Approve All is ON).");
    expect(mockModel.pushEditOperations).toHaveBeenCalled();
    expect(setSuggestions).not.toHaveBeenCalled();
  });
});

describe("WriteTool", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockEditor: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockModel: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let setSuggestions: any;

  beforeEach(() => {
    mockModel = {
      getFullModelRange: vi
        .fn()
        .mockReturnValue({
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
    };
    setSuggestions = vi.fn();
  });

  it("creates a suggestion for the full document if not approveAll", async () => {
    const ctx = makeCtx({ setSuggestions }, mockEditor);
    const promise = new WriteTool(ctx).call(
      { content: "New document content" },
      {},
    );

    expect(setSuggestions).toHaveBeenCalled();
    const updateFn = setSuggestions.mock.calls[0][0];
    const newSuggestions = updateFn([]);
    expect(newSuggestions).toHaveLength(1);
    expect(newSuggestions[0].originalText).toBe("Initial content");
    expect(newSuggestions[0].replacementText).toBe("New document content");
    expect(newSuggestions[0].status).toBe("pending");

    newSuggestions[0].resolve("Change rejected.");
    expect(await promise).toBe("Change rejected.");
  });

  it("applies full replacement immediately if approveAll is true", async () => {
    const ctx = makeCtx(
      { setSuggestions, approveAllRef: { current: true } },
      mockEditor,
    );
    const result = await new WriteTool(ctx).call(
      { content: "New document content" },
      {},
    );
    expect(result).toBe("Document updated automatically (Approve All is ON).");
    expect(mockEditor.setValue).toHaveBeenCalledWith("New document content");
    expect(setSuggestions).not.toHaveBeenCalled();
  });
});
