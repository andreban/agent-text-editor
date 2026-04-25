// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { beforeAll, describe, expect, it } from "vitest";
import { GoogleGenAIAdapter } from "@mast-ai/google-genai";
import { DefaultAgentRunnerFactory } from "../factory";
import type { ResearchResult } from "../researcher";
import { runWriter } from "../writer";
import { judge } from "./judge";
import fixtures from "./fixtures/writing.json";

const WRITING_CRITERIA =
  "The draft directly addresses the instruction with no preamble or explanation. " +
  "It reads as a single cohesive unit. When research context is provided, claims are " +
  "attributed to their source. When a style reference is provided, tone, voice, and " +
  "formatting match it. Markdown fences are absent unless the content itself is markdown.";

const apiKey = process.env.GEMINI_API_KEY;
const modelName = process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite-preview";

describe.skipIf(!apiKey)("writing quality", () => {
  let adapter: GoogleGenAIAdapter;
  let factory: DefaultAgentRunnerFactory;
  const scores: number[] = [];

  beforeAll(() => {
    adapter = new GoogleGenAIAdapter(apiKey!, modelName);
    factory = new DefaultAgentRunnerFactory(apiKey!, modelName);
  });

  it.each(fixtures)("fixture: $instruction", async (fixture) => {
    const research = fixture.researchContext as ResearchResult | null;

    const draft = await runWriter(
      fixture.instruction,
      factory,
      research ?? undefined,
      fixture.styleContext ?? undefined,
    );

    expect(draft).toBeTruthy();

    const score = await judge(draft, fixture.rubric, WRITING_CRITERIA, adapter);
    scores.push(score);
    expect(score).toBeGreaterThanOrEqual(3);
  });

  it("average writing quality score ≥ 4", () => {
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    expect(mean).toBeGreaterThanOrEqual(4);
  });
});
