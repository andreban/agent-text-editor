// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { Tool, ToolContext, ToolDefinition } from "@mast-ai/core";
import type { WorkspaceContext } from "./context";

export class GetActiveDocInfoTool implements Tool<Record<string, never>, string> {
  constructor(private ctx: WorkspaceContext) {}

  definition(): ToolDefinition {
    return {
      name: "get_active_doc_info",
      description:
        "Returns the id and title of the document currently open in the editor.",
      parameters: { type: "object", properties: {} },
      scope: "read",
    };
  }

  async call(_args: Record<string, never>, _ctx: ToolContext): Promise<string> {
    const doc = this.ctx.activeDocRef.current;
    if (!doc) return JSON.stringify({ error: "No active document" });
    return JSON.stringify({ id: doc.id, title: doc.title });
  }
}
