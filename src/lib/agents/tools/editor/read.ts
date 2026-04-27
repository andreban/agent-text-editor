// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { Tool, ToolContext, ToolDefinition } from "@mast-ai/core";
import type { EditorContext } from "./context";

export class ReadTool implements Tool<Record<string, never>, string> {
  constructor(private ctx: EditorContext) {}

  definition(): ToolDefinition {
    return {
      name: "read",
      description: "Reads the complete current editor content.",
      parameters: { type: "object", properties: {} },
      scope: "read",
    };
  }

  async call(_args: Record<string, never>, _ctx: ToolContext): Promise<string> {
    const editor = this.ctx.editorRef.current;
    if (!editor) return this.ctx.editorContentRef.current;
    const value = editor.getValue();
    return value || this.ctx.editorContentRef.current;
  }
}
