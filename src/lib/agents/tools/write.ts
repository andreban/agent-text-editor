// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { Tool, ToolDefinition } from "@mast-ai/core";
import type { EditorTools } from "./EditorTools";

interface WriteArgs {
  content: string;
}

export class WriteTool implements Tool<WriteArgs, string> {
  constructor(private editorTools: EditorTools) {}

  definition(): ToolDefinition {
    return {
      name: "write",
      description:
        "Proposes a complete rewrite. This tool pauses and waits for user approval. ONLY use this when the user explicitly requests a total rewrite of the entire document.",
      parameters: {
        type: "object",
        properties: {
          content: {
            type: "string",
            description: "The full new document content.",
          },
        },
        required: ["content"],
      },
      scope: "write",
    };
  }

  async call(args: WriteArgs): Promise<string> {
    return this.editorTools.write(args);
  }
}
