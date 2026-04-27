// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { AgentConfig, Tool, ToolContext, ToolDefinition } from "@mast-ai/core";
import { DOC_QUERIER_SYSTEM_PROMPT } from "../../";
import type { WorkspaceContext } from "./context";

interface QueryWorkspaceDocArgs {
  id: string;
  query: string;
}

export class QueryWorkspaceDocTool implements Tool<QueryWorkspaceDocArgs, string> {
  constructor(private ctx: WorkspaceContext) {}

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

  async call(args: QueryWorkspaceDocArgs, _ctx: ToolContext): Promise<string> {
    const doc = this.ctx.docsRef.current.find((d) => d.id === args.id);
    if (!doc) return JSON.stringify({ error: "Document not found" });

    const agent: AgentConfig = {
      name: "DocQuerier",
      instructions: DOC_QUERIER_SYSTEM_PROMPT,
      tools: [],
    };
    const runner = this.ctx.factory.create({ systemPrompt: agent.instructions });
    const input = `Document title: ${doc.title}\n\nDocument content:\n${doc.content}\n\nQuery: ${args.query}`;
    const result = await runner.run(agent, input);
    let parsed: { summary: string; excerpt: string };
    try {
      parsed = JSON.parse(result.output) as { summary: string; excerpt: string };
    } catch {
      parsed = { summary: result.output, excerpt: "" };
    }
    return JSON.stringify({ summary: parsed.summary, excerpt: parsed.excerpt ?? "" });
  }
}
