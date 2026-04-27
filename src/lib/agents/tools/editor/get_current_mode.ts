// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { Tool, ToolContext, ToolDefinition } from "@mast-ai/core";
import type { EditorContext } from "./context";

export class GetCurrentModeTool implements Tool<Record<string, never>, string> {
  constructor(private ctx: EditorContext) {}

  definition(): ToolDefinition {
    return {
      name: "get_current_mode",
      description:
        "Returns the current UI mode: 'editor' (Monaco editor is visible) or 'preview' (Markdown preview is visible). Check this before making edits to ensure the editor is accessible.",
      parameters: { type: "object", properties: {} },
      scope: "read",
    };
  }

  async call(_args: Record<string, never>, _ctx: ToolContext): Promise<string> {
    return this.ctx.activeTabRef.current;
  }
}
