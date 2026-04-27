// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { Tool, ToolContext, ToolDefinition } from "@mast-ai/core";
import type { EditorContext } from "./context";

export class GetMetadataTool implements Tool<Record<string, never>, string> {
  constructor(private ctx: EditorContext) {}

  definition(): ToolDefinition {
    return {
      name: "get_metadata",
      description:
        "Returns metadata about the current document: character count, word count, and line count.",
      parameters: { type: "object", properties: {} },
      scope: "read",
    };
  }

  async call(_args: Record<string, never>, _ctx: ToolContext): Promise<string> {
    const editor = this.ctx.editorRef.current;
    if (!editor) return "Error: Editor not initialized.";
    const text = editor.getValue();
    const charCount = text.length;
    const lineCount = text === "" ? 0 : text.split("\n").length;
    const wordCount = text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
    return `Characters: ${charCount}, Words: ${wordCount}, Lines: ${lineCount}.`;
  }
}
