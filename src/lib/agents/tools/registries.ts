// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { ToolRegistry } from "@mast-ai/core";
import type { EditorContext } from "./editor/context";
import type { WorkspaceContext } from "./workspace/context";
import { ReadTool } from "./editor/read";
import { ReadSelectionTool } from "./editor/read_selection";
import { SearchTool } from "./editor/search";
import { GetMetadataTool } from "./editor/get_metadata";
import { GetCurrentModeTool } from "./editor/get_current_mode";
import { RequestSwitchToEditorTool } from "./editor/request_switch_to_editor";
import { EditTool } from "./editor/edit";
import { WriteTool } from "./editor/write";
import { GetActiveDocInfoTool } from "./workspace/get_active_doc_info";
import { ListWorkspaceDocsTool } from "./workspace/list_workspace_docs";
import { ReadWorkspaceDocTool } from "./workspace/read_workspace_doc";
import { QueryWorkspaceDocTool } from "./workspace/query_workspace_doc";
import { QueryWorkspaceTool } from "./workspace/query_workspace";
import { CreateDocumentTool } from "./workspace/create_document";
import { RenameDocumentTool } from "./workspace/rename_document";
import { DeleteDocumentTool } from "./workspace/delete_document";
import { SwitchActiveDocumentTool } from "./workspace/switch_active_document";

export function createToolRegistry(
  editorCtx: EditorContext,
  workspaceCtx: WorkspaceContext,
): ToolRegistry {
  const registry = new ToolRegistry();

  registry.register(new ReadTool(editorCtx));
  registry.register(new ReadSelectionTool(editorCtx));
  registry.register(new SearchTool(editorCtx));
  registry.register(new GetMetadataTool(editorCtx));
  registry.register(new GetCurrentModeTool(editorCtx));
  registry.register(new RequestSwitchToEditorTool(editorCtx));
  registry.register(new EditTool(editorCtx));
  registry.register(new WriteTool(editorCtx));

  registry.register(new GetActiveDocInfoTool(workspaceCtx));
  registry.register(new ListWorkspaceDocsTool(workspaceCtx));
  registry.register(new ReadWorkspaceDocTool(workspaceCtx));
  registry.register(new QueryWorkspaceDocTool(workspaceCtx));
  registry.register(new QueryWorkspaceTool(workspaceCtx));
  registry.register(new CreateDocumentTool(workspaceCtx));
  registry.register(new RenameDocumentTool(workspaceCtx));
  registry.register(new DeleteDocumentTool(workspaceCtx));
  registry.register(new SwitchActiveDocumentTool(workspaceCtx));

  return registry;
}
