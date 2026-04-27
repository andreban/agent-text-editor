// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registerWebMCPTools } from "./WebMCPTools";
import { createToolRegistry } from "./agents/tools/registries";
import type { EditorContext } from "./agents/tools/editor/context";
import type { WorkspaceContext } from "./agents/tools/workspace/context";

function makeEditorCtx(): EditorContext {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockEditor: any = {
    getValue: vi.fn().mockReturnValue("editor content"),
    setValue: vi.fn(),
    getModel: vi.fn().mockReturnValue({
      findMatches: vi.fn().mockReturnValue([]),
      pushEditOperations: vi.fn(),
      getFullModelRange: vi.fn().mockReturnValue({
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 1,
      }),
    }),
    getSelection: vi.fn().mockReturnValue(null),
  };
  return {
    editorRef: { current: mockEditor },
    editorContentRef: { current: "" },
    activeTabRef: { current: "editor" },
    requestTabSwitch: vi.fn().mockResolvedValue(false),
    setSuggestions: vi.fn(),
    approveAllRef: { current: false },
  };
}

function makeWorkspaceCtx(): WorkspaceContext {
  return {
    docsRef: { current: [] },
    activeDocRef: { current: null },
    factory: { create: vi.fn() },
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

  it("returns a no-op cleanup and warns when registerTool throws (old API shape)", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (navigator as any).modelContext = {
      registerTool: vi.fn(() => {
        throw new TypeError("unregisterTool is not a function");
      }),
    };
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const cleanup = registerWebMCPTools(createToolRegistry(makeEditorCtx(), makeWorkspaceCtx()));
    expect(warnSpy).toHaveBeenCalledWith(
      "WebMCP tool registration failed:",
      expect.any(TypeError),
    );
    expect(() => cleanup()).not.toThrow();
    warnSpy.mockRestore();
  });

  it("returns a no-op cleanup when navigator.modelContext is undefined", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (navigator as any).modelContext;
    const cleanup = registerWebMCPTools(createToolRegistry(makeEditorCtx(), makeWorkspaceCtx()));
    expect(() => cleanup()).not.toThrow();
  });

  it("registers all expected tools", () => {
    registerWebMCPTools(createToolRegistry(makeEditorCtx(), makeWorkspaceCtx()));
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
      "create_document",
      "rename_document",
      "delete_document",
      "switch_active_document",
    ];
    for (const name of expected) {
      expect(registeredTools.has(name), `missing tool: ${name}`).toBe(true);
    }
    expect(registeredTools.size).toBe(expected.length);
  });

  it("passes an AbortSignal to each registered tool", () => {
    registerWebMCPTools(createToolRegistry(makeEditorCtx(), makeWorkspaceCtx()));
    for (const [, entry] of registeredTools) {
      expect(entry.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("cleanup aborts the shared signal", () => {
    const cleanup = registerWebMCPTools(createToolRegistry(makeEditorCtx(), makeWorkspaceCtx()));
    const signal = registeredTools.get("read")!.signal!;
    expect(signal.aborted).toBe(false);
    cleanup();
    expect(signal.aborted).toBe(true);
  });

  it("read execute returns editor content", async () => {
    registerWebMCPTools(createToolRegistry(makeEditorCtx(), makeWorkspaceCtx()));
    expect(await registeredTools.get("read")!.execute({})).toBe("editor content");
  });

  it("get_current_mode execute returns current mode", async () => {
    registerWebMCPTools(createToolRegistry(makeEditorCtx(), makeWorkspaceCtx()));
    expect(await registeredTools.get("get_current_mode")!.execute({})).toBe("editor");
  });
});
