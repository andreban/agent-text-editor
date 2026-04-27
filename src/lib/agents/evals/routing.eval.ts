// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { beforeAll, describe, expect, it } from "vitest";
import { AgentConfig, AgentRunner, ToolRegistry } from "@mast-ai/core";
import { GoogleGenAIAdapter } from "@mast-ai/google-genai";
import { buildOrchestratorPrompt } from "./roles/orchestrator";
import fixtures from "./fixtures/routing.json";

const apiKey = process.env.GEMINI_API_KEY;
const modelName = process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite-preview";

describe.skipIf(!apiKey)("orchestrator routing", () => {
  let adapter: GoogleGenAIAdapter;
  const passResults: boolean[] = [];

  beforeAll(() => {
    adapter = new GoogleGenAIAdapter(apiKey!, modelName);
  });

  it.each(fixtures)("routes: $prompt", async (fixture) => {
    const calledTools: string[] = [];
    const registry = new ToolRegistry();

    registry.register({
      definition: () => ({
        name: "invoke_planner",
        description:
          "Decomposes a high-level task into a structured step-by-step Plan.",
        parameters: {
          type: "object",
          properties: { task: { type: "string" } },
          required: ["task"],
        },
      }),
      call: async () => {
        calledTools.push("invoke_planner");
        return '{"goal":"done","steps":[]}';
      },
    });

    registry.register({
      definition: () => ({
        name: "invoke_researcher",
        description:
          "Queries workspace documents and synthesizes a structured answer.",
        parameters: {
          type: "object",
          properties: { query: { type: "string" } },
          required: ["query"],
        },
      }),
      call: async () => {
        calledTools.push("invoke_researcher");
        return '{"summary":"","sources":[]}';
      },
    });

    registry.register({
      definition: () => ({
        name: "invoke_writer",
        description:
          "Generates draft text for a single targeted section. Do NOT use for full-document rewrites — use invoke_planner instead.",
        parameters: {
          type: "object",
          properties: { instruction: { type: "string" } },
          required: ["instruction"],
        },
      }),
      call: async () => {
        calledTools.push("invoke_writer");
        return '{"draft":""}';
      },
    });

    registry.register({
      definition: () => ({
        name: "invoke_agent",
        description: "Delegates an ad-hoc task to a generic sub-agent.",
        parameters: {
          type: "object",
          properties: {
            systemPrompt: { type: "string" },
            task: { type: "string" },
          },
          required: ["systemPrompt", "task"],
        },
      }),
      call: async () => {
        calledTools.push("invoke_agent");
        return '{"result":""}';
      },
    });

    const runner = new AgentRunner(adapter, registry);
    const agentConfig: AgentConfig = {
      name: "Orchestrator",
      instructions: buildOrchestratorPrompt([]),
      tools: registry.definitions().map((d) => d.name),
    };

    for await (const event of runner
      .runBuilder(agentConfig)
      .runStream(fixture.prompt)) {
      if (event.type === "done") break;
    }

    const passed =
      fixture.expectedTool === "none"
        ? !calledTools.includes("invoke_planner") &&
          !calledTools.includes("invoke_researcher")
        : calledTools.includes(fixture.expectedTool);

    passResults.push(passed);
    expect(passed).toBe(true);
  });

  it("routing accuracy ≥ 80%", () => {
    const passCount = passResults.filter(Boolean).length;
    const accuracy = passCount / passResults.length;
    expect(accuracy).toBeGreaterThanOrEqual(0.8);
  });
});
