// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { Tool, ToolContext, ToolDefinition } from "@mast-ai/core";
import type { WorkspaceContext } from "./context";

interface RenameDocumentArgs {
  id: string;
  title: string;
}

export class RenameDocumentTool implements Tool<RenameDocumentArgs, string> {
  constructor(private ctx: WorkspaceContext) {}

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
      requiresApproval: true,
    };
  }

  async call(args: RenameDocumentArgs, _ctx: ToolContext): Promise<string> {
    const doc = this.ctx.docsRef.current.find((d) => d.id === args.id);
    if (!doc) return JSON.stringify({ error: "Document not found" });
    if (!args.title?.trim())
      return JSON.stringify({ error: "title is required" });
    this.ctx.renameDocumentFn(args.id, args.title);
    return `Document renamed to "${args.title}".`;
  }
}
