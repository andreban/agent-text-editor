// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import {
  AgentConfig,
  AgentEvent,
  AgentRunner,
  ToolRegistry,
} from "@mast-ai/core";
import type { AgentRunnerFactory } from "./factory";

export interface ReviewIssue {
  severity: "error" | "warning" | "suggestion";
  location?: string;
  description: string;
  fix?: string;
}

export interface ReviewResult {
  passed: boolean;
  issues: ReviewIssue[];
  summary: string;
}

export const REVIEWER_SYSTEM_PROMPT =
  "You are a review specialist. You evaluate text against the provided criteria and return structured feedback.\n\n" +
  "- Output ONLY valid JSON matching the ReviewResult schema. No prose outside the JSON.\n" +
  '- Schema: { "passed": boolean, "issues": [{ "severity": "error"|"warning"|"suggestion", "location"?: string, "description": string, "fix"?: string }], "summary": string }\n' +
  '- Set "location" to a short quoted excerpt from the text where each issue occurs.\n' +
  '- Use severity "error" for clear mistakes, "warning" for debatable issues, "suggestion" for improvements.\n' +
  '- "passed" is true only when there are no "error"-severity issues.\n' +
  '- If no issues are found, return { "passed": true, "issues": [], "summary": "No issues found." }';

export function createReviewerAgent(factory: AgentRunnerFactory): AgentRunner {
  return factory.create({
    systemPrompt: REVIEWER_SYSTEM_PROMPT,
    tools: new ToolRegistry(),
  });
}

function buildReviewerPrompt(text: string, criteria: string[]): string {
  const criteriaLines = criteria.map((c) => `- ${c}`).join("\n");
  return (
    "Review the following text against the listed criteria and return a ReviewResult JSON object.\n\n" +
    `Criteria:\n${criteriaLines}\n\n` +
    `Text:\n${text}`
  );
}

export async function runReview(
  text: string,
  criteria: string[],
  factory: AgentRunnerFactory,
  onEvent?: (event: AgentEvent) => void,
): Promise<ReviewResult> {
  const runner = createReviewerAgent(factory);
  const agentConfig: AgentConfig = {
    name: "Reviewer",
    instructions: REVIEWER_SYSTEM_PROMPT,
    tools: [],
  };

  const prompt = buildReviewerPrompt(text, criteria);

  for await (const event of runner.runBuilder(agentConfig).runStream(prompt)) {
    if (event.type === "done") {
      let result: ReviewResult;
      try {
        result = JSON.parse(event.output) as ReviewResult;
      } catch {
        throw new Error(
          `runReview: reviewer agent returned invalid JSON: ${event.output}`,
        );
      }
      if (
        typeof result.passed !== "boolean" ||
        !Array.isArray(result.issues) ||
        typeof result.summary !== "string"
      ) {
        throw new Error(
          "runReview: ReviewResult is missing required fields (passed, issues, summary)",
        );
      }
      return result;
    }
    onEvent?.(event);
  }

  throw new Error("runReview: reviewer agent ended without a done event");
}
