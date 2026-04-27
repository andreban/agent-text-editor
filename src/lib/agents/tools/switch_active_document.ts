// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { Tool, ToolDefinition } from "@mast-ai/core";
import type { WorkspaceTools } from "./WorkspaceTools";

interface SwitchActiveDocumentArgs {
  id: string;
}

export class SwitchActiveDocumentTool implements Tool<SwitchActiveDocumentArgs, string> {
  constructor(private workspaceTools: WorkspaceTools) {}

  definition(): ToolDefinition {
    return {
      name: "switch_active_document",
      description:
        "Switches the active document in the editor. Saves the current document content before switching. Does not require user authorization.",
      parameters: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "The document ID to switch to.",
          },
        },
        required: ["id"],
      },
      scope: "write",
    };
  }

  async call(args: SwitchActiveDocumentArgs): Promise<string> {
    return this.workspaceTools.switch_active_document(args);
  }
}
