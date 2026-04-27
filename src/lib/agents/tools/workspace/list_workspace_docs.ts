// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { Tool, ToolContext, ToolDefinition } from "@mast-ai/core";
import type { WorkspaceContext } from "./context";

export class ListWorkspaceDocsTool implements Tool<Record<string, never>, string> {
  constructor(private ctx: WorkspaceContext) {}

  definition(): ToolDefinition {
    return {
      name: "list_workspace_docs",
      description:
        "Lists all documents in the workspace. Returns an array of { id, title } objects.",
      parameters: { type: "object", properties: {} },
      scope: "read",
    };
  }

  async call(_args: Record<string, never>, _ctx: ToolContext): Promise<string> {
    return JSON.stringify(this.ctx.docsRef.current.map((d) => ({ id: d.id, title: d.title })));
  }
}
