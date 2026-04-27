// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { Tool, ToolDefinition } from "@mast-ai/core";
import type { WorkspaceTools } from "./WorkspaceTools";

interface RenameDocumentArgs {
  id: string;
  title: string;
}

export class RenameDocumentTool implements Tool<RenameDocumentArgs, string> {
  constructor(private workspaceTools: WorkspaceTools) {}

  definition(): ToolDefinition {
    return {
      name: "rename_document",
      description:
        "Renames an existing document in the workspace. Pauses for user authorization before renaming.",
      parameters: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "The document ID to rename.",
          },
          title: {
            type: "string",
            description: "The new title for the document.",
          },
        },
        required: ["id", "title"],
      },
      scope: "write",
    };
  }

  async call(args: RenameDocumentArgs): Promise<string> {
    return this.workspaceTools.rename_document(args);
  }
}
