// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { Tool, ToolDefinition } from "@mast-ai/core";
import type { WorkspaceTools } from "./WorkspaceTools";

interface DeleteDocumentArgs {
  id: string;
}

export class DeleteDocumentTool implements Tool<DeleteDocumentArgs, string> {
  constructor(private workspaceTools: WorkspaceTools) {}

  definition(): ToolDefinition {
    return {
      name: "delete_document",
      description:
        "Deletes a document from the workspace. Pauses for user authorization before deleting. If the deleted document was active, a different document becomes active.",
      parameters: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "The document ID to delete.",
          },
        },
        required: ["id"],
      },
      scope: "write",
    };
  }

  async call(args: DeleteDocumentArgs): Promise<string> {
    return this.workspaceTools.delete_document(args);
  }
}
