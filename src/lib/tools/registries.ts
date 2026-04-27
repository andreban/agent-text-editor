// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { ToolRegistry } from "@mast-ai/core";
import { EditorTools, registerEditorTools } from "./EditorTools";
import { WorkspaceTools, registerWorkspaceTools } from "./WorkspaceTools";

export function buildReadWriteRegistry(
  editorTools: EditorTools,
  workspaceTools: WorkspaceTools,
): ToolRegistry {
  const registry = new ToolRegistry();
  registerEditorTools(registry, editorTools);
  registerWorkspaceTools(registry, workspaceTools);
  return registry;
}
