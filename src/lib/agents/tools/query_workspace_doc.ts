// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { Tool, ToolDefinition } from "@mast-ai/core";
import type { WorkspaceTools } from "./WorkspaceTools";

interface QueryWorkspaceDocArgs {
  id: string;
  query: string;
}

export class QueryWorkspaceDocTool implements Tool<QueryWorkspaceDocArgs, string> {
  constructor(private workspaceTools: WorkspaceTools) {}

  definition(): ToolDefinition {
    return {
      name: "query_workspace_doc",
      description:
        "Asks a question about a specific document using a sub-agent. Returns { summary, excerpt } where excerpt is the most relevant verbatim passage.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "The document ID to query." },
          query: {
            type: "string",
            description: "The question about the document.",
          },
        },
        required: ["id", "query"],
      },
      scope: "read",
    };
  }

  async call(args: QueryWorkspaceDocArgs): Promise<string> {
    return this.workspaceTools.query_workspace_doc(args);
  }
}
