// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registerWebMCPTools } from "./WebMCPTools";
import { EditorTools } from "./EditorTools";
import { WorkspaceTools } from "./WorkspaceTools";

function makeEditorTools(): EditorTools {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockEditor: any = {
    getValue: vi.fn().mockReturnValue("editor content"),
    setValue: vi.fn(),
    getModel: vi.fn().mockReturnValue({
      findMatches: vi.fn().mockReturnValue([]),
      pushEditOperations: vi.fn(),
      getFullModelRange: vi
        .fn()
        .mockReturnValue({
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: 1,
          endColumn: 1,
        }),
    }),
    getSelection: vi.fn().mockReturnValue(null),
  };
  return new EditorTools(mockEditor, vi.fn(), false);
}

function makeWorkspaceTools(): WorkspaceTools {
  return new WorkspaceTools({ current: [] }, { current: null }, vi.fn());
}

describe("registerWebMCPTools", () => {
  const registeredTools: Map<
    string,
    {
      execute: (args: Record<string, unknown>) => unknown;
      signal?: AbortSignal;
    }
  > = new Map();

  beforeEach(() => {
    registeredTools.clear();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (navigator as any).modelContext = {
      registerTool: vi.fn(
        (
          tool: {
            name: string;
            execute: (args: Record<string, unknown>) => unknown;
          },
          options?: { signal?: AbortSignal },
        ) => {
          registeredTools.set(tool.name, {
            execute: tool.execute,
            signal: options?.signal,
          });
        },
      ),
    };
  });

  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (navigator as any).modelContext;
  });

  it("returns a no-op cleanup when navigator.modelContext is undefined", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (navigator as any).modelContext;
    const cleanup = registerWebMCPTools(
      makeEditorTools(),
      makeWorkspaceTools(),
    );
    expect(() => cleanup()).not.toThrow();
  });

  it("registers all expected tools", () => {
    registerWebMCPTools(makeEditorTools(), makeWorkspaceTools());
    const expected = [
      "read",
      "read_selection",
      "search",
      "get_metadata",
      "get_current_mode",
      "request_switch_to_editor",
      "edit",
      "write",
      "get_active_doc_info",
      "list_workspace_docs",
      "read_workspace_doc",
      "query_workspace_doc",
      "query_workspace",
    ];
    for (const name of expected) {
      expect(registeredTools.has(name), `missing tool: ${name}`).toBe(true);
    }
    expect(registeredTools.size).toBe(expected.length);
  });

  it("passes an AbortSignal to each registered tool", () => {
    registerWebMCPTools(makeEditorTools(), makeWorkspaceTools());
    for (const [, entry] of registeredTools) {
      expect(entry.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("cleanup aborts the shared signal", () => {
    const cleanup = registerWebMCPTools(
      makeEditorTools(),
      makeWorkspaceTools(),
    );
    const signal = registeredTools.get("read")!.signal!;
    expect(signal.aborted).toBe(false);
    cleanup();
    expect(signal.aborted).toBe(true);
  });

  it("read execute calls editorTools.read()", () => {
    const tools = makeEditorTools();
    vi.spyOn(tools, "read").mockReturnValue("document text");
    registerWebMCPTools(tools, makeWorkspaceTools());

    const result = registeredTools.get("read")!.execute({});
    expect(result).toBe("document text");
    expect(tools.read).toHaveBeenCalled();
  });

  it("read_selection execute calls editorTools.read_selection()", () => {
    const tools = makeEditorTools();
    vi.spyOn(tools, "read_selection").mockReturnValue("selected text");
    registerWebMCPTools(tools, makeWorkspaceTools());

    const result = registeredTools.get("read_selection")!.execute({});
    expect(result).toBe("selected text");
    expect(tools.read_selection).toHaveBeenCalled();
  });

  it("search execute calls editorTools.search() with args", () => {
    const tools = makeEditorTools();
    vi.spyOn(tools, "search").mockReturnValue("Found 1 occurrence(s)");
    registerWebMCPTools(tools, makeWorkspaceTools());

    const result = registeredTools.get("search")!.execute({ query: "hello" });
    expect(result).toBe("Found 1 occurrence(s)");
    expect(tools.search).toHaveBeenCalledWith({ query: "hello" });
  });

  it("get_metadata execute calls editorTools.get_metadata()", () => {
    const tools = makeEditorTools();
    vi.spyOn(tools, "get_metadata").mockReturnValue(
      "Characters: 5, Words: 1, Lines: 1.",
    );
    registerWebMCPTools(tools, makeWorkspaceTools());

    const result = registeredTools.get("get_metadata")!.execute({});
    expect(result).toBe("Characters: 5, Words: 1, Lines: 1.");
    expect(tools.get_metadata).toHaveBeenCalled();
  });

  it("get_current_mode execute calls editorTools.get_current_mode()", () => {
    const tools = makeEditorTools();
    vi.spyOn(tools, "get_current_mode").mockReturnValue("editor");
    registerWebMCPTools(tools, makeWorkspaceTools());

    const result = registeredTools.get("get_current_mode")!.execute({});
    expect(result).toBe("editor");
    expect(tools.get_current_mode).toHaveBeenCalled();
  });

  it("request_switch_to_editor execute calls editorTools.request_switch_to_editor()", async () => {
    const tools = makeEditorTools();
    vi.spyOn(tools, "request_switch_to_editor").mockResolvedValue(
      "Switched to editor mode.",
    );
    registerWebMCPTools(tools, makeWorkspaceTools());

    const result = await registeredTools
      .get("request_switch_to_editor")!
      .execute({});
    expect(result).toBe("Switched to editor mode.");
    expect(tools.request_switch_to_editor).toHaveBeenCalled();
  });

  it("edit execute calls editorTools.edit() with args", async () => {
    const tools = makeEditorTools();
    vi.spyOn(tools, "edit").mockResolvedValue("Change applied.");
    registerWebMCPTools(tools, makeWorkspaceTools());

    const result = await registeredTools
      .get("edit")!
      .execute({ originalText: "old", replacementText: "new" });
    expect(result).toBe("Change applied.");
    expect(tools.edit).toHaveBeenCalledWith({
      originalText: "old",
      replacementText: "new",
    });
  });

  it("write execute calls editorTools.write() with args", async () => {
    const tools = makeEditorTools();
    vi.spyOn(tools, "write").mockResolvedValue("Document updated.");
    registerWebMCPTools(tools, makeWorkspaceTools());

    const result = await registeredTools
      .get("write")!
      .execute({ content: "new full content" });
    expect(result).toBe("Document updated.");
    expect(tools.write).toHaveBeenCalledWith({ content: "new full content" });
  });

  it("get_active_doc_info execute calls workspaceTools.get_active_doc_info()", () => {
    const wt = makeWorkspaceTools();
    vi.spyOn(wt, "get_active_doc_info").mockReturnValue(
      '{"id":"1","title":"Doc"}',
    );
    registerWebMCPTools(makeEditorTools(), wt);

    const result = registeredTools.get("get_active_doc_info")!.execute({});
    expect(result).toBe('{"id":"1","title":"Doc"}');
    expect(wt.get_active_doc_info).toHaveBeenCalled();
  });

  it("list_workspace_docs execute calls workspaceTools.list_workspace_docs()", () => {
    const wt = makeWorkspaceTools();
    vi.spyOn(wt, "list_workspace_docs").mockReturnValue("[]");
    registerWebMCPTools(makeEditorTools(), wt);

    const result = registeredTools.get("list_workspace_docs")!.execute({});
    expect(result).toBe("[]");
    expect(wt.list_workspace_docs).toHaveBeenCalled();
  });

  it("read_workspace_doc execute calls workspaceTools.read_workspace_doc() with args", () => {
    const wt = makeWorkspaceTools();
    vi.spyOn(wt, "read_workspace_doc").mockReturnValue(
      '{"title":"T","content":"C"}',
    );
    registerWebMCPTools(makeEditorTools(), wt);

    const result = registeredTools
      .get("read_workspace_doc")!
      .execute({ id: "abc" });
    expect(result).toBe('{"title":"T","content":"C"}');
    expect(wt.read_workspace_doc).toHaveBeenCalledWith({ id: "abc" });
  });

  it("query_workspace_doc execute calls workspaceTools.query_workspace_doc() with args", async () => {
    const wt = makeWorkspaceTools();
    vi.spyOn(wt, "query_workspace_doc").mockResolvedValue('{"summary":"s"}');
    registerWebMCPTools(makeEditorTools(), wt);

    const result = await registeredTools
      .get("query_workspace_doc")!
      .execute({ id: "abc", query: "what?" });
    expect(result).toBe('{"summary":"s"}');
    expect(wt.query_workspace_doc).toHaveBeenCalledWith({
      id: "abc",
      query: "what?",
    });
  });

  it("query_workspace execute calls workspaceTools.query_workspace() with args", async () => {
    const wt = makeWorkspaceTools();
    vi.spyOn(wt, "query_workspace").mockResolvedValue('{"answer":"a"}');
    registerWebMCPTools(makeEditorTools(), wt);

    const result = await registeredTools
      .get("query_workspace")!
      .execute({ query: "summarize all" });
    expect(result).toBe('{"answer":"a"}');
    expect(wt.query_workspace).toHaveBeenCalledWith({ query: "summarize all" });
  });
});
