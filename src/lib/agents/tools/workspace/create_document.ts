// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { Tool, ToolContext, ToolDefinition } from "@mast-ai/core";
import type { WorkspaceContext } from "./context";
import { applyWorkspaceAction } from "./apply_workspace_action";

interface CreateDocumentArgs {
  title: string;
  content?: string;
}

export class CreateDocumentTool implements Tool<CreateDocumentArgs, string> {
  constructor(private ctx: WorkspaceContext) {}

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
      requiresApproval: true,
    };
  }

  async call(args: CreateDocumentArgs, _ctx: ToolContext): Promise<string> {
    if (!args.title?.trim()) {
      return JSON.stringify({ error: "title is required" });
    }
    return applyWorkspaceAction(
      `Create document "${args.title}"`,
      () => {
        const currentDoc = this.ctx.activeDocRef.current;
        if (currentDoc) {
          const content =
            this.ctx.editorRef.current?.getValue() ?? this.ctx.editorContentRef.current;
          this.ctx.saveDocContentFn(currentDoc.id, content);
        }
        const newId = this.ctx.createDocumentFn(args.title);
        const initialContent = args.content ?? "";
        this.ctx.editorRef.current?.setValue(initialContent);
        if (args.content && newId) {
          this.ctx.saveDocContentFn(newId, args.content);
        }
      },
      `Document "${args.title}" created automatically (Approve All is ON).`,
      this.ctx.setPendingWorkspaceAction,
      this.ctx.approveAllRef,
    );
  }
}
