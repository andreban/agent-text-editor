// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { Tool, ToolContext, ToolDefinition } from "@mast-ai/core";
import type { EditorContext } from "./context";

export class RequestSwitchToEditorTool implements Tool<
  Record<string, never>,
  string
> {
  constructor(private ctx: EditorContext) {}

  definition(): ToolDefinition {
    return {
      name: "request_switch_to_editor",
      description:
        "Requests the user to switch from Preview mode to Editor mode. This will display a prompt to the user and pause until they accept or decline. Call this before attempting edits when in preview mode.",
      parameters: { type: "object", properties: {} },
      scope: "write",
    };
  }

  async call(_args: Record<string, never>, _ctx: ToolContext): Promise<string> {
    if (this.ctx.activeTabRef.current === "editor") {
      return "Already in editor mode.";
    }
    const accepted = await this.ctx.requestTabSwitch();
    if (accepted) {
      return "Switched to editor mode.";
    }
    return "User declined to switch to editor mode.";
  }
}
