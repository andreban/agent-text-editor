// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { Tool, ToolContext, ToolDefinition } from "@mast-ai/core";
import type { EditorContext } from "./context";
import { applySuggestion } from "./apply_suggestion";

interface EditArgs {
  originalText: string;
  replacementText: string;
}

export class EditTool implements Tool<EditArgs, string> {
  constructor(private ctx: EditorContext) {}

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
      requiresApproval: true,
    };
  }

  async call(args: EditArgs, _ctx: ToolContext): Promise<string> {
    const editor = this.ctx.editorRef.current;
    if (!editor) return "Error: Editor not initialized.";
    const model = editor.getModel();
    if (!model) return "Error: Model not found.";

    const fullText = editor.getValue();
    if (
      args.originalText.length > 3000 ||
      (fullText.length > 200 && args.originalText.length > fullText.length * 0.8)
    ) {
      return "Error: `originalText` is too large. The `edit()` tool is for targeted changes. If you must rewrite the entire document, use `write()`. Otherwise, provide a smaller snippet of text to replace.";
    }

    const matches = model.findMatches(args.originalText, true, false, true, null, false);
    if (matches.length === 0) {
      return `Error: Could not find the text "${args.originalText}" in the document.`;
    }

    const range = matches[0].range;
    return applySuggestion(
      {
        originalText: args.originalText,
        replacementText: args.replacementText,
        range: {
          startLineNumber: range.startLineNumber,
          startColumn: range.startColumn,
          endLineNumber: range.endLineNumber,
          endColumn: range.endColumn,
        },
      },
      () => model.pushEditOperations([], [{ range, text: args.replacementText }], () => null),
      "Change applied automatically (Approve All is ON).",
      this.ctx.setSuggestions,
      this.ctx.approveAllRef,
    );
  }
}
