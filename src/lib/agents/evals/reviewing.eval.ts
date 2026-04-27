// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { beforeAll, describe, expect, it } from "vitest";
import { GoogleGenAIAdapter } from "@mast-ai/google-genai";
import { DefaultAgentRunnerFactory } from "./roles/factory";
import { runReview } from "./roles/reviewer";
import { judge } from "./judge";
import fixtures from "./fixtures/reviewing.json";

const REVIEWING_CRITERIA =
  "The review accurately identifies all genuine errors in the text. It does not " +
  "flag correct text as erroneous. Each issue quotes the relevant excerpt in " +
  '"location". Severity levels are applied consistently. The summary gives a ' +
  "clear overall verdict. Output is valid ReviewResult JSON with no prose outside it.";

const apiKey = process.env.GEMINI_API_KEY;
const modelName = process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite-preview";

describe.skipIf(!apiKey)("reviewing quality", () => {
  let adapter: GoogleGenAIAdapter;
  let factory: DefaultAgentRunnerFactory;
  const scores: number[] = [];

  beforeAll(() => {
    adapter = new GoogleGenAIAdapter(apiKey!, modelName);
    factory = new DefaultAgentRunnerFactory(apiKey!, modelName);
  });

  it.each(fixtures)("fixture: $text", async (fixture) => {
    const result = await runReview(fixture.text, fixture.criteria, factory);

    expect(typeof result.passed).toBe("boolean");
    expect(Array.isArray(result.issues)).toBe(true);
    expect(typeof result.summary).toBe("string");

    if (fixture.knownErrors !== null && fixture.knownErrors !== undefined) {
      expect(result.passed).toBe(false);
      for (const known of fixture.knownErrors) {
        const lowerDesc = known.description.toLowerCase();
        const matched = result.issues.some(
          (issue) =>
            issue.description.toLowerCase().includes(lowerDesc.split(":")[0]) ||
            lowerDesc
              .split(" ")
              .filter((w) => w.length > 4)
              .some((keyword) =>
                issue.description.toLowerCase().includes(keyword),
              ),
        );
        expect(
          matched,
          `Expected an issue matching "${known.description}" but none found in: ${JSON.stringify(result.issues)}`,
        ).toBe(true);
      }
    } else {
      expect(
        result.issues.filter((i) => i.severity === "error"),
        `Expected no error-severity issues but got: ${JSON.stringify(result.issues)}`,
      ).toHaveLength(0);
    }

    const score = await judge(
      JSON.stringify(result),
      fixture.rubric,
      REVIEWING_CRITERIA,
      adapter,
    );
    scores.push(score);
    expect(score).toBeGreaterThanOrEqual(3);
  });

  it("average reviewing quality score ≥ 4", () => {
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    expect(mean).toBeGreaterThanOrEqual(4);
  });
});
