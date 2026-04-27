// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { Tool, ToolDefinition } from "@mast-ai/core";
import type { EditorTools } from "./EditorTools";

export class ReadSelectionTool implements Tool<Record<string, never>, string> {
  constructor(private editorTools: EditorTools) {}

  definition(): ToolDefinition {
    return {
      name: "read_selection",
      description: "Reads the currently selected text in the editor.",
      parameters: { type: "object", properties: {} },
      scope: "read",
    };
  }

  async call(): Promise<string> {
    return this.editorTools.read_selection();
  }
}
