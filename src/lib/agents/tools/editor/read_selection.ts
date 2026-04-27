// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { Tool, ToolContext, ToolDefinition } from "@mast-ai/core";
import type { EditorContext } from "./context";

export class ReadSelectionTool implements Tool<Record<string, never>, string> {
  constructor(private ctx: EditorContext) {}

  definition(): ToolDefinition {
    return {
      name: "read_selection",
      description: "Reads the currently selected text in the editor.",
      parameters: { type: "object", properties: {} },
      scope: "read",
    };
  }

  async call(_args: Record<string, never>, _ctx: ToolContext): Promise<string> {
    const editor = this.ctx.editorRef.current;
    if (!editor) return "";
    const selection = editor.getSelection();
    if (!selection) return "";
    return editor.getModel()?.getValueInRange(selection) || "";
  }
}
