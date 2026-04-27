// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { AgentConfig, Tool, ToolDefinition } from "@mast-ai/core";
import type { AgentRunnerFactory } from "../../";
import { createPlannerAgent, Plan, PLANNER_SYSTEM_PROMPT } from "../../";
import type { PlanConfirmationRequest } from "../../../store";

interface InvokePlannerArgs {
  task: string;
  context?: string;
}

export class InvokePlannerTool implements Tool<InvokePlannerArgs, string> {
  constructor(
    private factory: AgentRunnerFactory,
    private setPendingPlanConfirmation: (req: PlanConfirmationRequest | null) => void,
  ) {}

  definition(): ToolDefinition {
    return {
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
      scope: "write",
    };
  }

  async call(args: InvokePlannerArgs): Promise<string> {
    const runner = createPlannerAgent(this.factory);
    const prompt = args.context ? `${args.task}\n\n${args.context}` : args.task;
    const agentConfig: AgentConfig = {
      name: "Planner",
      instructions: PLANNER_SYSTEM_PROMPT,
      tools: [],
    };

    for await (const event of runner.runBuilder(agentConfig).runStream(prompt)) {
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

        const accepted = await new Promise<boolean>((resolve) => {
          this.setPendingPlanConfirmation({ plan, resolve });
        });
        this.setPendingPlanConfirmation(null);

        if (!accepted) {
          throw new Error("Plan rejected by user.");
        }
        return JSON.stringify(plan);
      }
    }

    throw new Error("invoke_planner: planner agent ended without a done event");
  }
}
