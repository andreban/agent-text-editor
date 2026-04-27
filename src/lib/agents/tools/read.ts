// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { Tool, ToolDefinition } from "@mast-ai/core";
import type { EditorTools } from "./EditorTools";

export class ReadTool implements Tool<Record<string, never>, string> {
  constructor(private editorTools: EditorTools) {}

  definition(): ToolDefinition {
    return {
      name: "read",
      description: "Reads the complete current editor content.",
      parameters: { type: "object", properties: {} },
      scope: "read",
    };
  }

  async call(): Promise<string> {
    return this.editorTools.read();
  }
}
