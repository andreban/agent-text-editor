// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { ToolRegistry } from "@mast-ai/core";
import type { AgentConfig, Tool, ToolContext, ToolDefinition, ToolProvider } from "@mast-ai/core";
import type { AgentRunnerFactory } from "../";
import { createGenericAgent } from "../";

interface InvokeAgentArgs {
  systemPrompt: string;
  task: string;
  tools?: string[];
}

export class InvokeAgentTool implements Tool<InvokeAgentArgs, string> {
  constructor(
    private factory: AgentRunnerFactory,
    private readonlyRegistry: ToolProvider,
  ) {}

  definition(): ToolDefinition {
    return {
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
      scope: "write",
    };
  }

  async call(args: InvokeAgentArgs, context: ToolContext): Promise<string> {
    const groups = args.tools ?? [];
    const resolvedRegistry = groups.includes("workspace_readonly")
      ? this.readonlyRegistry
      : new ToolRegistry();

    const runner = createGenericAgent(this.factory, args.systemPrompt, resolvedRegistry);
    const agentConfig: AgentConfig = {
      name: "Agent",
      instructions: args.systemPrompt,
      tools: resolvedRegistry.getTools().map((d) => d.name),
    };

    for await (const event of runner.runBuilder(agentConfig).runStream(args.task)) {
      if (event.type === "done") {
        return JSON.stringify({ result: event.output });
      }
      context.onEvent?.(event);
    }

    throw new Error("invoke_agent: sub-agent ended without a done event");
  }
}
