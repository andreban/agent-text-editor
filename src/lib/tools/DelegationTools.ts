// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { AgentConfig, ToolContext, ToolRegistry } from "@mast-ai/core";
import type { AgentRunnerFactory } from "../agents/factory";
import { createGenericAgent } from "../agents/generic";
import { EditorTools } from "./EditorTools";
import {
  WorkspaceTools,
  registerReadonlyWorkspaceTools,
} from "./WorkspaceTools";

function buildRegistryForGroups(
  groups: string[],
  workspaceTools: WorkspaceTools | null,
): ToolRegistry {
  const registry = new ToolRegistry();

  for (const group of groups) {
    if (group === "workspace_readonly" && workspaceTools) {
      registerReadonlyWorkspaceTools(registry, workspaceTools);
    }
  }

  return registry;
}

export function registerDelegationTools(
  registry: ToolRegistry,
  factory: AgentRunnerFactory,
  _editorTools: EditorTools,
  workspaceTools: WorkspaceTools | null,
): void {
  registry.register({
    definition: () => ({
      name: "invoke_agent",
      description:
        "Delegates an ad-hoc task to a generic sub-agent. The sub-agent runs with the given system prompt and optional tool groups. Returns { result: string } with the sub-agent's final response.",
      parameters: {
        type: "object",
        properties: {
          systemPrompt: {
            type: "string",
            description: "The system prompt / instructions for the sub-agent.",
          },
          task: {
            type: "string",
            description: "The task or question to send to the sub-agent.",
          },
          tools: {
            type: "array",
            items: { type: "string" },
            description:
              "Optional tool group names to give the sub-agent. Supported: 'workspace_readonly'.",
          },
        },
        required: ["systemPrompt", "task"],
      },
    }),
    call: async (
      args: { systemPrompt: string; task: string; tools?: string[] },
      context: ToolContext,
    ) => {
      const resolvedRegistry = buildRegistryForGroups(
        args.tools ?? [],
        workspaceTools,
      );

      const runner = createGenericAgent(
        factory,
        args.systemPrompt,
        resolvedRegistry,
      );
      const agentConfig: AgentConfig = {
        name: "Agent",
        instructions: args.systemPrompt,
        tools: resolvedRegistry.definitions().map((d) => d.name),
      };

      for await (const event of runner
        .runBuilder(agentConfig)
        .runStream(args.task)) {
        if (event.type === "done") {
          return JSON.stringify({ result: event.output });
        }
        context.onEvent?.(event);
      }

      throw new Error("invoke_agent: sub-agent ended without a done event");
    },
  });
}
