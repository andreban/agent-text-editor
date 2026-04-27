// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { Tool, ToolDefinition } from "@mast-ai/core";
import type { EditorTools } from "./EditorTools";

interface EditArgs {
  originalText: string;
  replacementText: string;
}

export class EditTool implements Tool<EditArgs, string> {
  constructor(private editorTools: EditorTools) {}

  definition(): ToolDefinition {
    return {
      name: "edit",
      description:
        "Proposes a targeted edit. This tool pauses and waits for user approval. ONLY use this for small, localized changes (e.g., 1-2 sentences). Never pass the entire document.",
      parameters: {
        type: "object",
        properties: {
          originalText: {
            type: "string",
            description:
              "The exact, minimal string of text to replace. Must be short. Do NOT pass the whole document.",
          },
          replacementText: {
            type: "string",
            description: "The new text to replace the originalText with.",
          },
        },
        required: ["originalText", "replacementText"],
      },
      scope: "write",
    };
  }

  async call(args: EditArgs): Promise<string> {
    return this.editorTools.edit(args);
  }
}
