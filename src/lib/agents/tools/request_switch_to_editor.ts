// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { Tool, ToolDefinition } from "@mast-ai/core";
import type { EditorTools } from "./EditorTools";

export class RequestSwitchToEditorTool implements Tool<Record<string, never>, string> {
  constructor(private editorTools: EditorTools) {}

  definition(): ToolDefinition {
    return {
      name: "request_switch_to_editor",
      description:
        "Requests the user to switch from Preview mode to Editor mode. This will display a prompt to the user and pause until they accept or decline. Call this before attempting edits when in preview mode.",
      parameters: { type: "object", properties: {} },
      scope: "write",
    };
  }

  async call(): Promise<string> {
    return this.editorTools.request_switch_to_editor();
  }
}
