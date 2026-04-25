// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { AgentRunner, ToolRegistry } from "@mast-ai/core";
import type { AgentRunnerFactory } from "./factory";

export interface PlanStep {
  id: string;
  instruction: string;
  dependsOn: string[];
}

export interface Plan {
  goal: string;
  steps: PlanStep[];
}

export const PLANNER_SYSTEM_PROMPT =
  "You are a planning agent. Given a writing task and optional context, produce a structured JSON plan.\n\n" +
  "- Output ONLY valid JSON matching the Plan schema below. No prose, no markdown fences, no explanation.\n" +
  "- Steps that can run independently must declare dependsOn: []. Steps that need prior output must list the prerequisite step IDs.\n" +
  "- Keep steps focused — one outcome per step. Simple tasks warrant 1–2 steps.\n\n" +
  'Schema: { "goal": "string", "steps": [{ "id": "step_1", "instruction": "...", "dependsOn": [] }] }';

export function createPlannerAgent(factory: AgentRunnerFactory): AgentRunner {
  return factory.create({
    systemPrompt: PLANNER_SYSTEM_PROMPT,
    tools: new ToolRegistry(),
  });
}
