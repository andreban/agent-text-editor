// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { Tool, ToolContext, ToolDefinition } from "@mast-ai/core";
import type { AgentRunnerFactory } from "../../";
import { runReview } from "../../";

interface InvokeReviewerArgs {
  text: string;
  criteria: string[];
}

export class InvokeReviewerTool implements Tool<InvokeReviewerArgs, string> {
  constructor(private factory: AgentRunnerFactory) {}

  definition(): ToolDefinition {
    return {
      name: "invoke_reviewer",
      description:
        "Evaluates a draft against explicit criteria and returns structured feedback. " +
        "Returns JSON: { passed: boolean, issues: [{ severity, location?, description, fix? }], summary }. " +
        "Use after invoke_writer to check a draft before applying it. " +
        "If passed is false and error-severity issues remain after 3 Writer→Reviewer cycles, " +
        "present the best available draft via edit() or write() and summarise remaining issues in your response.",
      parameters: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "The draft text to review.",
          },
          criteria: {
            type: "array",
            items: { type: "string" },
            description:
              "Review criteria to check against (e.g. 'grammatical correctness', 'consistent use of past tense', 'no unsupported factual claims').",
          },
        },
        required: ["text", "criteria"],
      },
      scope: "read",
    };
  }

  async call(args: InvokeReviewerArgs, context: ToolContext): Promise<string> {
    const result = await runReview(
      args.text,
      args.criteria,
      this.factory,
      context.onEvent,
    );
    return JSON.stringify(result);
  }
}
