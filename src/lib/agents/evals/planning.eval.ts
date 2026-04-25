// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { beforeAll, describe, expect, it } from "vitest";
import { AgentRunner, ToolRegistry } from "@mast-ai/core";
import { GoogleGenAIAdapter } from "@mast-ai/google-genai";
import { PLANNER_SYSTEM_PROMPT, type Plan } from "../planner";
import { judge } from "./judge";
import fixtures from "./fixtures/planning.json";

const PLANNING_CRITERIA =
  "The plan is concrete and properly ordered. Each step has a clear, " +
  "self-contained instruction. Steps that can run independently declare " +
  "dependsOn: []. Redundant or empty steps are absent.";

const apiKey = process.env.GEMINI_API_KEY;
const modelName = process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite-preview";

describe.skipIf(!apiKey)("planning quality", () => {
  let adapter: GoogleGenAIAdapter;
  const scores: number[] = [];

  beforeAll(() => {
    adapter = new GoogleGenAIAdapter(apiKey!, modelName);
  });

  it.each(fixtures)("fixture: $task", async (fixture) => {
    const runner = new AgentRunner(adapter, new ToolRegistry());
    const agentConfig = {
      name: "Planner",
      instructions: PLANNER_SYSTEM_PROMPT,
      tools: [] as string[],
    };

    let output = "";
    for await (const event of runner
      .runBuilder(agentConfig)
      .runStream(fixture.task)) {
      if (event.type === "done") {
        output = event.output;
        break;
      }
    }

    const plan = JSON.parse(output) as Plan;
    expect(typeof plan.goal).toBe("string");
    expect(Array.isArray(plan.steps)).toBe(true);

    const score = await judge(output, fixture.rubric, PLANNING_CRITERIA, adapter);
    scores.push(score);
    expect(score).toBeGreaterThanOrEqual(3);
  });

  it("average plan quality score ≥ 4", () => {
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    expect(mean).toBeGreaterThanOrEqual(4);
  });
});
