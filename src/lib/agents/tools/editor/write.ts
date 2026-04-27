// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { Tool, ToolContext, ToolDefinition } from "@mast-ai/core";
import type { EditorContext } from "./context";
import { applySuggestion } from "./apply_suggestion";

interface WriteArgs {
  content: string;
}

export class WriteTool implements Tool<WriteArgs, string> {
  constructor(private ctx: EditorContext) {}

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

  async call(args: WriteArgs, _ctx: ToolContext): Promise<string> {
    const editor = this.ctx.editorRef.current;
    if (!editor) return "Error: Editor not initialized.";
    const model = editor.getModel();
    if (!model) return "Error: Model not found.";

    const fullRange = model.getFullModelRange();
    return applySuggestion(
      {
        originalText: editor.getValue(),
        replacementText: args.content,
        range: {
          startLineNumber: fullRange.startLineNumber,
          startColumn: fullRange.startColumn,
          endLineNumber: fullRange.endLineNumber,
          endColumn: fullRange.endColumn,
        },
      },
      () => editor.setValue(args.content),
      "Document updated automatically (Approve All is ON).",
      this.ctx.setSuggestions,
      this.ctx.approveAllRef,
    );
  }
}
