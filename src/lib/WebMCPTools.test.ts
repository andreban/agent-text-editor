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
    const cleanup = registerWebMCPTools(
      createToolRegistry(makeEditorCtx(), makeWorkspaceCtx()),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      "WebMCP tool registration failed:",
      expect.any(TypeError),
    );
    expect(() => cleanup()).not.toThrow();
    warnSpy.mockRestore();
  });

  it("stops registering after the first registerTool throw", () => {
    let calls = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (navigator as any).modelContext = {
      registerTool: vi.fn(() => {
        calls += 1;
        throw new TypeError("broken");
      }),
    };
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    registerWebMCPTools(
      createToolRegistry(makeEditorCtx(), makeWorkspaceCtx()),
    );
    expect(calls).toBe(1);
    warnSpy.mockRestore();
  });

  it("returns a no-op cleanup when navigator.modelContext is undefined", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (navigator as any).modelContext;
    const cleanup = registerWebMCPTools(
      createToolRegistry(makeEditorCtx(), makeWorkspaceCtx()),
    );
    expect(() => cleanup()).not.toThrow();
  });

  it("registers all expected tools", () => {
    registerWebMCPTools(
      createToolRegistry(makeEditorCtx(), makeWorkspaceCtx()),
    );
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
    registerWebMCPTools(
      createToolRegistry(makeEditorCtx(), makeWorkspaceCtx()),
    );
    for (const [, entry] of registeredTools) {
      expect(entry.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("cleanup aborts every registered signal", () => {
    const cleanup = registerWebMCPTools(
      createToolRegistry(makeEditorCtx(), makeWorkspaceCtx()),
    );
    const signals = [...registeredTools.values()].map((e) => e.signal!);
    expect(signals.length).toBeGreaterThan(0);
    expect(signals.every((s) => !s.aborted)).toBe(true);
    cleanup();
    expect(signals.every((s) => s.aborted)).toBe(true);
  });

  it("registers tools added to the registry after subscription", () => {
    const registry = createToolRegistry(makeEditorCtx(), makeWorkspaceCtx());
    registerWebMCPTools(registry);
    const initialCount = registeredTools.size;
    const lateTool = {
      definition: () => ({
        name: "late_tool",
        description: "registered after subscription",
        parameters: { type: "object", properties: {} },
        scope: "read" as const,
      }),
      call: vi.fn().mockResolvedValue("late result"),
    };
    registry.register(lateTool);
    expect(registeredTools.size).toBe(initialCount + 1);
    expect(registeredTools.has("late_tool")).toBe(true);
  });

  it("unregistering from the registry aborts only that tool's signal", () => {
    const registry = createToolRegistry(makeEditorCtx(), makeWorkspaceCtx());
    registerWebMCPTools(registry);
    const readSignal = registeredTools.get("read")!.signal!;
    const editSignal = registeredTools.get("edit")!.signal!;
    registry.unregister("edit");
    expect(editSignal.aborted).toBe(true);
    expect(readSignal.aborted).toBe(false);
  });

  it("read execute returns editor content", async () => {
    registerWebMCPTools(
      createToolRegistry(makeEditorCtx(), makeWorkspaceCtx()),
    );
    expect(await registeredTools.get("read")!.execute({})).toBe(
      "editor content",
    );
  });

  it("get_current_mode execute returns current mode", async () => {
    registerWebMCPTools(
      createToolRegistry(makeEditorCtx(), makeWorkspaceCtx()),
    );
    expect(await registeredTools.get("get_current_mode")!.execute({})).toBe(
      "editor",
    );
  });
});
