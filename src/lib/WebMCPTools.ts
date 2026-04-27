// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { EditorContext } from "./agents/tools/editor/context";
import type { WorkspaceContext } from "./agents/tools/workspace/context";
import { ReadTool } from "./agents/tools/editor/read";
import { ReadSelectionTool } from "./agents/tools/editor/read_selection";
import { SearchTool } from "./agents/tools/editor/search";
import { GetMetadataTool } from "./agents/tools/editor/get_metadata";
import { GetCurrentModeTool } from "./agents/tools/editor/get_current_mode";
import { RequestSwitchToEditorTool } from "./agents/tools/editor/request_switch_to_editor";
import { EditTool } from "./agents/tools/editor/edit";
import { WriteTool } from "./agents/tools/editor/write";
import { GetActiveDocInfoTool } from "./agents/tools/workspace/get_active_doc_info";
import { ListWorkspaceDocsTool } from "./agents/tools/workspace/list_workspace_docs";
import { ReadWorkspaceDocTool } from "./agents/tools/workspace/read_workspace_doc";
import { QueryWorkspaceDocTool } from "./agents/tools/workspace/query_workspace_doc";
import { QueryWorkspaceTool } from "./agents/tools/workspace/query_workspace";
import { CreateDocumentTool } from "./agents/tools/workspace/create_document";
import { RenameDocumentTool } from "./agents/tools/workspace/rename_document";
import { DeleteDocumentTool } from "./agents/tools/workspace/delete_document";
import { SwitchActiveDocumentTool } from "./agents/tools/workspace/switch_active_document";

interface WebMCPTool {
  name: string;
  description: string;
  inputSchema: object;
  execute: (args: Record<string, unknown>) => string | Promise<string>;
}

interface ModelContext {
  registerTool(tool: WebMCPTool, options?: { signal?: AbortSignal }): void;
}

declare global {
  interface Navigator {
    modelContext?: ModelContext;
  }
}

export function registerWebMCPTools(
  editorCtx: EditorContext,
  workspaceCtx: WorkspaceContext,
): () => void {
  if (!navigator.modelContext) {
    console.warn("WebMCP not detected in this browser.");
    return () => {};
  }

  const controller = new AbortController();
  const { signal } = controller;
  const mc = navigator.modelContext;

  const tools = [
    new ReadTool(editorCtx),
    new ReadSelectionTool(editorCtx),
    new SearchTool(editorCtx),
    new GetMetadataTool(editorCtx),
    new GetCurrentModeTool(editorCtx),
    new RequestSwitchToEditorTool(editorCtx),
    new EditTool(editorCtx),
    new WriteTool(editorCtx),
    new GetActiveDocInfoTool(workspaceCtx),
    new ListWorkspaceDocsTool(workspaceCtx),
    new ReadWorkspaceDocTool(workspaceCtx),
    new QueryWorkspaceDocTool(workspaceCtx),
    new QueryWorkspaceTool(workspaceCtx),
    new CreateDocumentTool(workspaceCtx),
    new RenameDocumentTool(workspaceCtx),
    new DeleteDocumentTool(workspaceCtx),
    new SwitchActiveDocumentTool(workspaceCtx),
  ];

  try {
    for (const tool of tools) {
      const def = tool.definition();
      mc.registerTool(
        {
          name: def.name,
          description: def.description,
          inputSchema: def.parameters,
          execute: (args) => tool.call(args as never, {}),
        },
        { signal },
      );
    }
  } catch (err) {
    console.warn("WebMCP tool registration failed:", err);
    return () => {};
  }

  return () => controller.abort();
}
