// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { Tool, ToolDefinition } from "@mast-ai/core";
import type { EditorTools } from "./EditorTools";

interface SearchArgs {
  query: string;
}

export class SearchTool implements Tool<SearchArgs, string> {
  constructor(private editorTools: EditorTools) {}

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

  async call(args: SearchArgs): Promise<string> {
    return this.editorTools.search(args);
  }
}
