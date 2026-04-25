// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { LlmAdapter } from "@mast-ai/core";

export async function judge(
  text: string,
  rubric: string,
  criteria: string,
  adapter: LlmAdapter,
): Promise<number> {
  const prompt =
    `You are an evaluator. Score the following output on a scale of 1–5.\n\n` +
    `Criteria: ${criteria}\n\n` +
    `Rubric:\n` +
    `1 – Completely fails to meet the criteria.\n` +
    `2 – Partially meets criteria; significant issues.\n` +
    `3 – Meets criteria; some minor issues.\n` +
    `4 – Meets all criteria well; negligible issues.\n` +
    `5 – Fully meets all criteria with no issues.\n\n` +
    `Task-specific rubric:\n${rubric}\n\n` +
    `Output to evaluate:\n${text}\n\n` +
    `Respond with ONLY a single integer: 1, 2, 3, 4, or 5. No explanation.`;

  const response = await adapter.generate({
    messages: [{ role: "user", content: { type: "text", text: prompt } }],
    tools: [],
  });

  const raw = response.text?.trim() ?? "";
  const score = parseInt(raw, 10);
  if (isNaN(score) || score < 1 || score > 5) {
    throw new Error(`judge: unexpected response: ${raw}`);
  }
  return score;
}
