// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { ToolRegistry } from "@mast-ai/core";
import {
  EditorTools,
  registerEditorTools,
  registerReadonlyEditorTools,
} from "./EditorTools";
import {
  WorkspaceTools,
  registerWorkspaceTools,
  registerReadonlyWorkspaceTools,
} from "./WorkspaceTools";

export interface ProposedEdit {
  originalText: string;
  replacementText: string;
  reason?: string;
}

export function buildReadonlyRegistry(
  editorTools: EditorTools,
  workspaceTools: WorkspaceTools,
): ToolRegistry {
  const registry = new ToolRegistry();
  registerReadonlyEditorTools(registry, editorTools);
  registerReadonlyWorkspaceTools(registry, workspaceTools);
  return registry;
}

export function buildReadWriteRegistry(
  editorTools: EditorTools,
  workspaceTools: WorkspaceTools,
): ToolRegistry {
  const registry = new ToolRegistry();
  registerEditorTools(registry, editorTools);
  registerWorkspaceTools(registry, workspaceTools);
  return registry;
}
