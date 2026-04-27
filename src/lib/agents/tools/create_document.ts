// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { Tool, ToolDefinition } from "@mast-ai/core";
import type { WorkspaceTools } from "./WorkspaceTools";

interface CreateDocumentArgs {
  title: string;
  content?: string;
}

export class CreateDocumentTool implements Tool<CreateDocumentArgs, string> {
  constructor(private workspaceTools: WorkspaceTools) {}

  definition(): ToolDefinition {
    return {
      name: "create_document",
      description:
        "Creates a new document in the workspace with the given title and optional initial content. Providing content avoids a separate write step. Pauses for user authorization before creating.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "The title for the new document.",
          },
          content: {
            type: "string",
            description:
              "Optional initial content for the new document. If omitted the document is created blank.",
          },
        },
        required: ["title"],
      },
      scope: "write",
    };
  }

  async call(args: CreateDocumentArgs): Promise<string> {
    return this.workspaceTools.create_document(args);
  }
}
