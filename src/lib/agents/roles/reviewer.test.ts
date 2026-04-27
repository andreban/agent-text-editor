// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from "vitest";
import {
  createReviewerAgent,
  runReview,
  REVIEWER_SYSTEM_PROMPT,
} from "./reviewer";
import { ToolRegistry } from "@mast-ai/core";
import type { AgentRunnerFactory } from "./factory";
import type { ReviewResult } from "./reviewer";

function makeFactory(output: string): {
  factory: AgentRunnerFactory;
  mockCreate: ReturnType<typeof vi.fn>;
  capturedPrompts: string[];
} {
  const capturedPrompts: string[] = [];
  const mockRunStream = vi.fn().mockImplementation(async function* (
    prompt: string,
  ) {
    capturedPrompts.push(prompt);
    yield { type: "done" as const, output, history: [] };
  });
  const mockRunBuilder = vi.fn().mockReturnValue({ runStream: mockRunStream });
  const mockCreate = vi.fn().mockReturnValue({ runBuilder: mockRunBuilder });
  return { factory: { create: mockCreate }, mockCreate, capturedPrompts };
}

const CLEAN_RESULT: ReviewResult = {
  passed: true,
  issues: [],
  summary: "No issues found.",
};

const ERROR_RESULT: ReviewResult = {
  passed: false,
  issues: [
    {
      severity: "error",
      location: "They was",
      description:
        "Subject-verb agreement error: 'They was' should be 'They were'.",
      fix: "Replace 'They was' with 'They were'.",
    },
  ],
  summary: "One grammatical error found.",
};

describe("createReviewerAgent", () => {
  it("creates a runner using the provided factory", () => {
    const { factory, mockCreate } = makeFactory(JSON.stringify(CLEAN_RESULT));
    createReviewerAgent(factory);
    expect(mockCreate).toHaveBeenCalledOnce();
  });

  it("passes REVIEWER_SYSTEM_PROMPT as the system prompt", () => {
    const { factory, mockCreate } = makeFactory(JSON.stringify(CLEAN_RESULT));
    createReviewerAgent(factory);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ systemPrompt: REVIEWER_SYSTEM_PROMPT }),
    );
  });

  it("registers no tools (empty tool registry)", () => {
    const { factory, mockCreate } = makeFactory(JSON.stringify(CLEAN_RESULT));
    createReviewerAgent(factory);
    const { tools } = mockCreate.mock.calls[0][0] as { tools: ToolRegistry };
    expect(tools.getTools()).toEqual([]);
  });
});

describe("runReview", () => {
  it("returns a parsed ReviewResult", async () => {
    const { factory } = makeFactory(JSON.stringify(CLEAN_RESULT));
    const result = await runReview("Some text.", ["grammar"], factory);
    expect(result).toEqual(CLEAN_RESULT);
  });

  it("returns passed: false with issues when the agent reports errors", async () => {
    const { factory } = makeFactory(JSON.stringify(ERROR_RESULT));
    const result = await runReview(
      "They was late.",
      ["subject-verb agreement"],
      factory,
    );
    expect(result.passed).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues[0].severity).toBe("error");
  });

  it("includes all provided criteria in the prompt", async () => {
    const { factory, capturedPrompts } = makeFactory(
      JSON.stringify(CLEAN_RESULT),
    );
    await runReview(
      "Text.",
      ["grammatical correctness", "consistent tense"],
      factory,
    );
    expect(capturedPrompts[0]).toContain("grammatical correctness");
    expect(capturedPrompts[0]).toContain("consistent tense");
  });

  it("includes the text under review in the prompt", async () => {
    const { factory, capturedPrompts } = makeFactory(
      JSON.stringify(CLEAN_RESULT),
    );
    await runReview("The quick brown fox.", ["grammar"], factory);
    expect(capturedPrompts[0]).toContain("The quick brown fox.");
  });

  it("throws a descriptive error when the agent returns invalid JSON", async () => {
    const { factory } = makeFactory("not valid json");
    await expect(runReview("Text.", ["grammar"], factory)).rejects.toThrow(
      "runReview: reviewer agent returned invalid JSON",
    );
  });

  it("throws when result is missing required fields", async () => {
    const { factory } = makeFactory('{"passed": true}');
    await expect(runReview("Text.", ["grammar"], factory)).rejects.toThrow(
      "runReview: ReviewResult is missing required fields",
    );
  });
});

describe("invoke_reviewer via DelegationTools", () => {
  it("result is valid JSON with passed, issues, and summary fields", async () => {
    const { factory } = makeFactory(JSON.stringify(CLEAN_RESULT));
    const result = await runReview("Text.", ["grammar"], factory);
    const json = JSON.stringify(result);
    const parsed = JSON.parse(json) as ReviewResult;
    expect(typeof parsed.passed).toBe("boolean");
    expect(Array.isArray(parsed.issues)).toBe(true);
    expect(typeof parsed.summary).toBe("string");
  });
});
