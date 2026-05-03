// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { Tool, ToolContext, ToolDefinition } from "@mast-ai/core";
import type { AgentRunnerFactory } from "../../";
import type { ResearchResult } from "../../";
import { runWriter } from "../../";

interface InvokeWriterArgs {
  instruction: string;
  researchContext?: string;
  styleContext?: string;
}

export class InvokeWriterTool implements Tool<InvokeWriterArgs, string> {
  constructor(private factory: AgentRunnerFactory) {}

  definition(): ToolDefinition {
    return {
      name: "invoke_writer",
      description:
        "Generates draft text for a single targeted section from an instruction and optional research/style context. " +
        "Returns { draft: string } — raw text only, no edits applied. " +
        "After receiving the draft, apply it using edit() for the target section. " +
        "Do NOT use this to rewrite the whole document at once — use invoke_planner to break full-document tasks into per-section steps.",
      parameters: {
        type: "object",
        properties: {
          instruction: {
            type: "string",
            description:
              "What to write. Be explicit: specify the target section, desired length, and any constraints.",
          },
          researchContext: {
            type: "string",
            description:
              "JSON-encoded ResearchResult from invoke_researcher. Inject when the draft should cite workspace sources.",
          },
          styleContext: {
            type: "string",
            description:
              "A verbatim excerpt from the document the Writer should match in tone, voice, and formatting.",
          },
        },
        required: ["instruction"],
      },
      scope: "write",
    };
  }

  async call(args: InvokeWriterArgs, context: ToolContext): Promise<string> {
    let parsedResearch: ResearchResult | undefined;
    if (args.researchContext) {
      try {
        parsedResearch = JSON.parse(args.researchContext) as ResearchResult;
      } catch {
        // malformed JSON — proceed without research context
      }
    }
    const draft = await runWriter(
      args.instruction,
      this.factory,
      parsedResearch,
      args.styleContext,
      context.onEvent,
    );
    return JSON.stringify({ draft });
  }
}
