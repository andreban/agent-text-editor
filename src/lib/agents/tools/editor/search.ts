// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { Tool, ToolContext, ToolDefinition } from "@mast-ai/core";
import type { EditorContext } from "./context";

interface SearchArgs {
  query: string;
}

export class SearchTool implements Tool<SearchArgs, string> {
  constructor(private ctx: EditorContext) {}

  definition(): ToolDefinition {
    return {
      name: "search",
      description:
        "Finds all occurrences of a query string in the document. Returns the line and column of each match.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The text to search for." },
        },
        required: ["query"],
      },
      scope: "read",
    };
  }

  async call(args: SearchArgs, _ctx: ToolContext): Promise<string> {
    const editor = this.ctx.editorRef.current;
    if (!editor) return "Error: Editor not initialized.";
    if (!args.query) return "Error: query parameter is required.";
    const model = editor.getModel();
    if (!model) return "Error: Model not found.";

    const matches = model.findMatches(args.query, true, false, false, null, false);
    if (matches.length === 0) return `No occurrences of "${args.query}" found.`;

    const locations = matches
      .map((m) => `line ${m.range.startLineNumber}, col ${m.range.startColumn}`)
      .join("; ");
    return `Found ${matches.length} occurrence(s) of "${args.query}": ${locations}.`;
  }
}
