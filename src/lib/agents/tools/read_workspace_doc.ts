// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { Tool, ToolDefinition } from "@mast-ai/core";
import type { WorkspaceTools } from "./WorkspaceTools";

interface ReadWorkspaceDocArgs {
  id: string;
}

export class ReadWorkspaceDocTool implements Tool<ReadWorkspaceDocArgs, string> {
  constructor(private workspaceTools: WorkspaceTools) {}

  definition(): ToolDefinition {
    return {
      name: "read_workspace_doc",
      description:
        "Reads the full content of a specific document. Returns { title, content } or { error }.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "The document ID to read." },
        },
        required: ["id"],
      },
      scope: "read",
    };
  }

  async call(args: ReadWorkspaceDocArgs): Promise<string> {
    return this.workspaceTools.read_workspace_doc(args);
  }
}
