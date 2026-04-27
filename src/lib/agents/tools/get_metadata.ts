// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { Tool, ToolDefinition } from "@mast-ai/core";
import type { EditorTools } from "./EditorTools";

export class GetMetadataTool implements Tool<Record<string, never>, string> {
  constructor(private editorTools: EditorTools) {}

  definition(): ToolDefinition {
    return {
      name: "get_metadata",
      description:
        "Returns metadata about the current document: character count, word count, and line count.",
      parameters: { type: "object", properties: {} },
      scope: "read",
    };
  }

  async call(): Promise<string> {
    return this.editorTools.get_metadata();
  }
}
