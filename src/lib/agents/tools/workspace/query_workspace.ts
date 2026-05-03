// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { Tool, ToolContext, ToolDefinition } from "@mast-ai/core";
import { runResearch } from "../../";
import type { WorkspaceContext } from "./context";

interface QueryWorkspaceArgs {
  query: string;
}

export class QueryWorkspaceTool implements Tool<QueryWorkspaceArgs, string> {
  constructor(private ctx: WorkspaceContext) {}

  definition(): ToolDefinition {
    return {
      name: "query_workspace",
      description:
        "Asks a question spanning all workspace documents and synthesizes the results. Returns { summary, sources: [{ id, title, excerpt }] }.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The question to answer across all documents.",
          },
        },
        required: ["query"],
      },
      scope: "read",
    };
  }

  async call(args: QueryWorkspaceArgs, _ctx: ToolContext): Promise<string> {
    const result = await runResearch(
      args.query,
      this.ctx.docsRef.current,
      this.ctx.factory,
    );
    return JSON.stringify(result);
  }
}
