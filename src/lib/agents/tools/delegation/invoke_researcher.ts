// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { Tool, ToolDefinition } from "@mast-ai/core";
import type { AgentRunnerFactory } from "../../";
import { runResearch } from "../../";
import type { WorkspaceDocument } from "../../../workspace";

interface InvokeResearcherArgs {
  query: string;
  docIds?: string[];
}

export class InvokeResearcherTool implements Tool<InvokeResearcherArgs, string> {
  constructor(
    private factory: AgentRunnerFactory,
    private docsRef: { current: WorkspaceDocument[] },
  ) {}

  definition(): ToolDefinition {
    return {
      name: "invoke_researcher",
      description:
        "Queries workspace documents and synthesizes a structured answer. Returns JSON: { summary, sources: [{ id, title, excerpt }] }. Use this when the task requires finding information across workspace documents before writing or reviewing.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The question or information need to research.",
          },
          docIds: {
            type: "array",
            items: { type: "string" },
            description:
              "Optional list of document IDs to restrict the search to. If omitted, all workspace documents are queried.",
          },
        },
        required: ["query"],
      },
      scope: "read",
    };
  }

  async call(args: InvokeResearcherArgs): Promise<string> {
    const result = await runResearch(args.query, this.docsRef.current, this.factory, args.docIds);
    return JSON.stringify(result);
  }
}
