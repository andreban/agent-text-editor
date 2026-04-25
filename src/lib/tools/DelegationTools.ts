// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { AgentConfig, ToolContext, ToolRegistry } from "@mast-ai/core";
import type { AgentRunnerFactory } from "../agents/factory";
import { createGenericAgent } from "../agents/generic";
import {
  createPlannerAgent,
  Plan,
  PLANNER_SYSTEM_PROMPT,
} from "../agents/planner";
import { EditorTools } from "./EditorTools";
import { WorkspaceTools } from "./WorkspaceTools";
import { buildReadonlyRegistry } from "./registries";

export function registerDelegationTools(
  registry: ToolRegistry,
  factory: AgentRunnerFactory,
  editorTools: EditorTools,
  workspaceTools: WorkspaceTools,
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
      const groups = args.tools ?? [];
      const resolvedRegistry = groups.includes("workspace_readonly")
        ? buildReadonlyRegistry(editorTools, workspaceTools)
        : new ToolRegistry();

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

  registry.register({
    definition: () => ({
      name: "invoke_planner",
      description:
        "Decomposes a high-level task into a structured step-by-step Plan. Returns a JSON string: { goal, steps: [{ id, instruction, dependsOn }] }. The Orchestrator reads the plan and dispatches each step using the appropriate tools.",
      parameters: {
        type: "object",
        properties: {
          task: {
            type: "string",
            description: "The high-level task to decompose into a plan.",
          },
          context: {
            type: "string",
            description:
              "Optional additional context (e.g. current document summary, workspace doc list).",
          },
        },
        required: ["task"],
      },
    }),
    call: async (args: { task: string; context?: string }) => {
      const runner = createPlannerAgent(factory);
      const prompt = args.context
        ? `${args.task}\n\n${args.context}`
        : args.task;
      const agentConfig: AgentConfig = {
        name: "Planner",
        instructions: PLANNER_SYSTEM_PROMPT,
        tools: [],
      };

      for await (const event of runner
        .runBuilder(agentConfig)
        .runStream(prompt)) {
        if (event.type === "done") {
          let plan: Plan;
          try {
            plan = JSON.parse(event.output) as Plan;
          } catch {
            throw new Error(
              `invoke_planner: agent returned invalid JSON: ${event.output}`,
            );
          }
          if (typeof plan.goal !== "string" || !Array.isArray(plan.steps)) {
            throw new Error(
              "invoke_planner: plan is missing required fields (goal, steps)",
            );
          }
          return JSON.stringify(plan);
        }
      }

      throw new Error(
        "invoke_planner: planner agent ended without a done event",
      );
    },
  });
}
