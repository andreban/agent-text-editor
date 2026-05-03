// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { Tool, ToolContext, ToolDefinition } from "@mast-ai/core";
import type { WorkspaceContext } from "./context";

interface ReadWorkspaceDocArgs {
  id: string;
}

export class ReadWorkspaceDocTool implements Tool<
  ReadWorkspaceDocArgs,
  string
> {
  constructor(private ctx: WorkspaceContext) {}

  definition(): ToolDefinition {
    return {
      name: "read_workspace_doc",
      description:
        "Reads the full content of a specific document. Returns { title, content } or { error }.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "The document ID to read." },
        },
        required: ["id"],
      },
      scope: "read",
    };
  }

  async call(args: ReadWorkspaceDocArgs, _ctx: ToolContext): Promise<string> {
    const doc = this.ctx.docsRef.current.find((d) => d.id === args.id);
    if (!doc) return JSON.stringify({ error: "Document not found" });
    return JSON.stringify({ title: doc.title, content: doc.content });
  }
}
