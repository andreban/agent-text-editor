// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { Tool, ToolContext, ToolDefinition } from "@mast-ai/core";
import type { WorkspaceContext } from "./context";

interface SwitchActiveDocumentArgs {
  id: string;
}

export class SwitchActiveDocumentTool implements Tool<
  SwitchActiveDocumentArgs,
  string
> {
  constructor(private ctx: WorkspaceContext) {}

  definition(): ToolDefinition {
    return {
      name: "switch_active_document",
      description:
        "Switches the active document in the editor. Saves the current document content before switching. Does not require user authorization.",
      parameters: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "The document ID to switch to.",
          },
        },
        required: ["id"],
      },
      scope: "write",
    };
  }

  async call(
    args: SwitchActiveDocumentArgs,
    _ctx: ToolContext,
  ): Promise<string> {
    const doc = this.ctx.docsRef.current.find((d) => d.id === args.id);
    if (!doc) return JSON.stringify({ error: "Document not found" });

    const currentDoc = this.ctx.activeDocRef.current;
    if (currentDoc) {
      const content =
        this.ctx.editorRef.current?.getValue() ??
        this.ctx.editorContentRef.current;
      this.ctx.saveDocContentFn(currentDoc.id, content);
    }
    this.ctx.setActiveDocumentIdFn(args.id);
    this.ctx.editorRef.current?.setValue(doc.content);
    return JSON.stringify({ switched: true, id: args.id, title: doc.title });
  }
}
