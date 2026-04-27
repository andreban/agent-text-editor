// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from "vitest";
import { buildReadWriteRegistry } from "./registries";
import { EditorTools } from "./EditorTools";
import { WorkspaceTools } from "./WorkspaceTools";
import type { AgentRunnerFactory } from "../../agents";

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

describe("buildReadWriteRegistry", () => {
  it("includes all read-only tools", () => {
    const { editorTools, workspaceTools } = makeTools();
    const registry = buildReadWriteRegistry(editorTools, workspaceTools);
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
    const { editorTools, workspaceTools } = makeTools();
    const registry = buildReadWriteRegistry(editorTools, workspaceTools);
    const names = registry.getTools().map((d) => d.name);
    expect(names).toContain("edit");
    expect(names).toContain("write");
    expect(names).toContain("request_switch_to_editor");
  });

  it("includes workspace write tools", () => {
    const { editorTools, workspaceTools } = makeTools();
    const registry = buildReadWriteRegistry(editorTools, workspaceTools);
    const names = registry.getTools().map((d) => d.name);
    expect(names).toContain("create_document");
    expect(names).toContain("rename_document");
    expect(names).toContain("delete_document");
    expect(names).toContain("switch_active_document");
  });
});
