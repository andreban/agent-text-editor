// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { Tool, ToolDefinition } from "@mast-ai/core";
import type { WorkspaceTools } from "./WorkspaceTools";

interface QueryWorkspaceArgs {
  query: string;
}

export class QueryWorkspaceTool implements Tool<QueryWorkspaceArgs, string> {
  constructor(private workspaceTools: WorkspaceTools) {}

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

  async call(args: QueryWorkspaceArgs): Promise<string> {
    return this.workspaceTools.query_workspace(args);
  }
}
