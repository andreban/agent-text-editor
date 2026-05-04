// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import {
  AgentConfig,
  AgentRunner,
  ToolContext,
  ToolRegistry,
} from "@mast-ai/core";
import type { AgentRunnerFactory } from "./factory";
import type { ResearchResult } from "./researcher";

export const WRITER_SYSTEM_PROMPT =
  "You are a writing specialist. You produce draft text based on explicit instructions and provided context.\n\n" +
  "- Write only the requested content — no preamble, no explanation, no markdown fences unless the content itself is markdown.\n" +
  "- If research context is provided, use it and attribute claims where appropriate (e.g. \"According to 'Source Title', ...\").\n" +
  "- If style context is provided, match its tone, voice, and formatting conventions.\n" +
  "- Do not call any tools. Return the draft text directly as your response.";

export function createWriterAgent(factory: AgentRunnerFactory): AgentRunner {
  return factory.create({
    systemPrompt: WRITER_SYSTEM_PROMPT,
    tools: new ToolRegistry(),
  });
}

function buildWriterPrompt(
  instruction: string,
  researchContext?: ResearchResult,
  styleContext?: string,
): string {
  let prompt = `Instruction: ${instruction}`;

  if (researchContext) {
    const sourceLines = researchContext.sources
      .map((s) => `- "${s.title}": ${s.excerpt}`)
      .join("\n");
    prompt +=
      `\n\nResearch context:\nSummary: ${researchContext.summary}` +
      (sourceLines ? `\nSources:\n${sourceLines}` : "");
  }

  if (styleContext) {
    prompt += `\n\nStyle reference (match tone, voice, and formatting):\n${styleContext}`;
  }

  return prompt;
}

export async function runWriter(
  instruction: string,
  factory: AgentRunnerFactory,
  researchContext?: ResearchResult,
  styleContext?: string,
  parentContext?: ToolContext,
): Promise<string> {
  const runner = createWriterAgent(factory);
  const agentConfig: AgentConfig = {
    name: "Writer",
    instructions: WRITER_SYSTEM_PROMPT,
    tools: [],
  };

  const prompt = buildWriterPrompt(instruction, researchContext, styleContext);

  const builder = runner.runBuilder(agentConfig);
  if (parentContext) builder.forwardTo(parentContext);

  for await (const event of builder.runStream(prompt)) {
    if (event.type === "done") {
      return event.output;
    }
  }

  throw new Error("runWriter: writer agent ended without a done event");
}
