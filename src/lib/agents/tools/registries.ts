// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { ToolRegistry } from "@mast-ai/core";
import { EditorTools } from "./EditorTools";
import { WorkspaceTools } from "./WorkspaceTools";
import { ReadTool } from "./read";
import { ReadSelectionTool } from "./read_selection";
import { SearchTool } from "./search";
import { GetMetadataTool } from "./get_metadata";
import { GetCurrentModeTool } from "./get_current_mode";
import { RequestSwitchToEditorTool } from "./request_switch_to_editor";
import { EditTool } from "./edit";
import { WriteTool } from "./write";
import { GetActiveDocInfoTool } from "./get_active_doc_info";
import { ListWorkspaceDocsTool } from "./list_workspace_docs";
import { ReadWorkspaceDocTool } from "./read_workspace_doc";
import { QueryWorkspaceDocTool } from "./query_workspace_doc";
import { QueryWorkspaceTool } from "./query_workspace";
import { CreateDocumentTool } from "./create_document";
import { RenameDocumentTool } from "./rename_document";
import { DeleteDocumentTool } from "./delete_document";
import { SwitchActiveDocumentTool } from "./switch_active_document";

export function buildReadWriteRegistry(
  editorTools: EditorTools,
  workspaceTools: WorkspaceTools,
): ToolRegistry {
  const registry = new ToolRegistry();

  registry.register(new ReadTool(editorTools));
  registry.register(new ReadSelectionTool(editorTools));
  registry.register(new SearchTool(editorTools));
  registry.register(new GetMetadataTool(editorTools));
  registry.register(new GetCurrentModeTool(editorTools));
  registry.register(new RequestSwitchToEditorTool(editorTools));
  registry.register(new EditTool(editorTools));
  registry.register(new WriteTool(editorTools));

  registry.register(new GetActiveDocInfoTool(workspaceTools));
  registry.register(new ListWorkspaceDocsTool(workspaceTools));
  registry.register(new ReadWorkspaceDocTool(workspaceTools));
  registry.register(new QueryWorkspaceDocTool(workspaceTools));
  registry.register(new QueryWorkspaceTool(workspaceTools));
  registry.register(new CreateDocumentTool(workspaceTools));
  registry.register(new RenameDocumentTool(workspaceTools));
  registry.register(new DeleteDocumentTool(workspaceTools));
  registry.register(new SwitchActiveDocumentTool(workspaceTools));

  return registry;
}
