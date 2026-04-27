// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from "vitest";
import { createToolRegistry } from "./registries";
import type { EditorContext } from "./editor/context";
import type { WorkspaceContext } from "./workspace/context";
import type { AgentRunnerFactory } from "..";

function makeContexts() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockEditor: any = {
    getValue: vi.fn().mockReturnValue(""),
    setValue: vi.fn(),
    getModel: vi.fn().mockReturnValue(null),
    getSelection: vi.fn().mockReturnValue(null),
  };
  const mockFactory: AgentRunnerFactory = { create: vi.fn() };

  const editorCtx: EditorContext = {
    editorRef: { current: mockEditor },
    editorContentRef: { current: "" },
    activeTabRef: { current: "editor" },
    requestTabSwitch: () => Promise.resolve(false),
    setSuggestions: vi.fn(),
    approveAllRef: { current: false },
  };
  const workspaceCtx: WorkspaceContext = {
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
  return { editorCtx, workspaceCtx };
}

describe("createToolRegistry", () => {
  it("includes all read-only tools", () => {
    const { editorCtx, workspaceCtx } = makeContexts();
    const registry = createToolRegistry(editorCtx, workspaceCtx);
    const names = registry.getTools().map((d) => d.name);
    expect(names).toContain("read");
    expect(names).toContain("read_selection");
    expect(names).toContain("search");
    expect(names).toContain("get_metadata");
    expect(names).toContain("get_current_mode");
    expect(names).toContain("get_active_doc_info");
    expect(names).toContain("list_workspace_docs");
    expect(names).toContain("read_workspace_doc");
    expect(names).toContain("query_workspace_doc");
    expect(names).toContain("query_workspace");
  });

  it("includes edit, write, request_switch_to_editor", () => {
    const { editorCtx, workspaceCtx } = makeContexts();
    const registry = createToolRegistry(editorCtx, workspaceCtx);
    const names = registry.getTools().map((d) => d.name);
    expect(names).toContain("edit");
    expect(names).toContain("write");
    expect(names).toContain("request_switch_to_editor");
  });

  it("includes workspace write tools", () => {
    const { editorCtx, workspaceCtx } = makeContexts();
    const registry = createToolRegistry(editorCtx, workspaceCtx);
    const names = registry.getTools().map((d) => d.name);
    expect(names).toContain("create_document");
    expect(names).toContain("rename_document");
    expect(names).toContain("delete_document");
    expect(names).toContain("switch_active_document");
  });
});
