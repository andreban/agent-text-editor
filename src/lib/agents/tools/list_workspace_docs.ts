// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { Tool, ToolDefinition } from "@mast-ai/core";
import type { WorkspaceTools } from "./WorkspaceTools";

export class ListWorkspaceDocsTool implements Tool<Record<string, never>, string> {
  constructor(private workspaceTools: WorkspaceTools) {}

  definition(): ToolDefinition {
    return {
      name: "list_workspace_docs",
      description:
        "Lists all documents in the workspace. Returns an array of { id, title } objects.",
      parameters: { type: "object", properties: {} },
      scope: "read",
    };
  }

  async call(): Promise<string> {
    return this.workspaceTools.list_workspace_docs();
  }
}
