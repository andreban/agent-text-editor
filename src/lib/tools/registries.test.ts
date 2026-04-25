// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from "vitest";
import { buildReadonlyRegistry, buildReadWriteRegistry } from "./registries";
import { EditorTools } from "./EditorTools";
import { WorkspaceTools } from "./WorkspaceTools";
import type { AgentRunnerFactory } from "../agents/factory";

function makeTools() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockEditor: any = {
    getValue: vi.fn().mockReturnValue(""),
    setValue: vi.fn(),
    getModel: vi.fn().mockReturnValue(null),
    getSelection: vi.fn().mockReturnValue(null),
  };
  const setSuggestions = vi.fn();
  const mockFactory: AgentRunnerFactory = { create: vi.fn() };

  const editorTools = new EditorTools({ current: mockEditor }, setSuggestions, {
    current: false,
  });
  const workspaceTools = new WorkspaceTools(
    { current: [] },
    { current: null },
    mockFactory,
  );
  return { editorTools, workspaceTools };
}

describe("buildReadonlyRegistry", () => {
  it("includes read, read_selection, search, get_metadata, get_current_mode", () => {
    const { editorTools, workspaceTools } = makeTools();
    const registry = buildReadonlyRegistry(editorTools, workspaceTools);
    const names = registry.definitions().map((d) => d.name);
    expect(names).toContain("read");
    expect(names).toContain("read_selection");
    expect(names).toContain("search");
    expect(names).toContain("get_metadata");
    expect(names).toContain("get_current_mode");
  });

  it("excludes edit, write, request_switch_to_editor", () => {
    const { editorTools, workspaceTools } = makeTools();
    const registry = buildReadonlyRegistry(editorTools, workspaceTools);
    const names = registry.definitions().map((d) => d.name);
    expect(names).not.toContain("edit");
    expect(names).not.toContain("write");
    expect(names).not.toContain("request_switch_to_editor");
  });

  it("includes workspace read tools", () => {
    const { editorTools, workspaceTools } = makeTools();
    const registry = buildReadonlyRegistry(editorTools, workspaceTools);
    const names = registry.definitions().map((d) => d.name);
    expect(names).toContain("get_active_doc_info");
    expect(names).toContain("list_workspace_docs");
    expect(names).toContain("read_workspace_doc");
    expect(names).toContain("query_workspace_doc");
    expect(names).toContain("query_workspace");
  });

  it("excludes workspace write tools", () => {
    const { editorTools, workspaceTools } = makeTools();
    const registry = buildReadonlyRegistry(editorTools, workspaceTools);
    const names = registry.definitions().map((d) => d.name);
    expect(names).not.toContain("create_document");
    expect(names).not.toContain("rename_document");
    expect(names).not.toContain("delete_document");
    expect(names).not.toContain("switch_active_document");
  });
});

describe("buildReadWriteRegistry", () => {
  it("includes all read-only tools", () => {
    const { editorTools, workspaceTools } = makeTools();
    const registry = buildReadWriteRegistry(editorTools, workspaceTools);
    const names = registry.definitions().map((d) => d.name);
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
    const { editorTools, workspaceTools } = makeTools();
    const registry = buildReadWriteRegistry(editorTools, workspaceTools);
    const names = registry.definitions().map((d) => d.name);
    expect(names).toContain("edit");
    expect(names).toContain("write");
    expect(names).toContain("request_switch_to_editor");
  });

  it("includes workspace write tools", () => {
    const { editorTools, workspaceTools } = makeTools();
    const registry = buildReadWriteRegistry(editorTools, workspaceTools);
    const names = registry.definitions().map((d) => d.name);
    expect(names).toContain("create_document");
    expect(names).toContain("rename_document");
    expect(names).toContain("delete_document");
    expect(names).toContain("switch_active_document");
  });
});
