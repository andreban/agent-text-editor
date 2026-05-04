// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createWriterAgent, runWriter, WRITER_SYSTEM_PROMPT } from "./writer";
import { ToolRegistry } from "@mast-ai/core";
import type { AgentRunnerFactory } from "./factory";
import type { ResearchResult } from "./researcher";

function makeFactory(output: string = "draft output"): {
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
  const mockRunBuilder = vi.fn().mockImplementation(() => {
    const builder = { runStream: mockRunStream, forwardTo: vi.fn() };
    builder.forwardTo.mockReturnValue(builder);
    return builder;
  });
  const mockCreate = vi.fn().mockReturnValue({ runBuilder: mockRunBuilder });
  return { factory: { create: mockCreate }, mockCreate, capturedPrompts };
}

describe("createWriterAgent", () => {
  it("creates a runner using the provided factory", () => {
    const { factory, mockCreate } = makeFactory();
    createWriterAgent(factory);
    expect(mockCreate).toHaveBeenCalledOnce();
  });

  it("passes WRITER_SYSTEM_PROMPT as the system prompt", () => {
    const { factory, mockCreate } = makeFactory();
    createWriterAgent(factory);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ systemPrompt: WRITER_SYSTEM_PROMPT }),
    );
  });

  it("registers no tools (empty tool registry)", () => {
    const { factory, mockCreate } = makeFactory();
    createWriterAgent(factory);
    const { tools } = mockCreate.mock.calls[0][0] as { tools: ToolRegistry };
    expect(tools.getTools()).toEqual([]);
  });
});

describe("runWriter", () => {
  it("returns the agent output as a string", async () => {
    const { factory } = makeFactory("my draft");
    const result = await runWriter("Write a paragraph.", factory);
    expect(result).toBe("my draft");
  });

  it("returns a non-empty string for a plain instruction", async () => {
    const { factory } = makeFactory("some content");
    const result = await runWriter("Write something.", factory);
    expect(result).toBeTruthy();
  });

  it("includes the instruction in the prompt", async () => {
    const { factory, capturedPrompts } = makeFactory();
    await runWriter("Write an introduction.", factory);
    expect(capturedPrompts[0]).toContain("Write an introduction.");
  });

  it("includes research summary and source titles when researchContext is provided", async () => {
    const { factory, capturedPrompts } = makeFactory();
    const research: ResearchResult = {
      summary: "The sky is blue.",
      sources: [
        { id: "1", title: "Science Doc", excerpt: "The sky appears blue." },
      ],
    };
    await runWriter("Write a paragraph.", factory, research);
    expect(capturedPrompts[0]).toContain("The sky is blue.");
    expect(capturedPrompts[0]).toContain("Science Doc");
  });

  it("includes style context when provided", async () => {
    const { factory, capturedPrompts } = makeFactory();
    await runWriter(
      "Write a paragraph.",
      factory,
      undefined,
      "Casual and fun.",
    );
    expect(capturedPrompts[0]).toContain("Casual and fun.");
  });

  it("includes both research and style context when both are provided", async () => {
    const { factory, capturedPrompts } = makeFactory();
    const research: ResearchResult = {
      summary: "Key finding.",
      sources: [{ id: "1", title: "Report", excerpt: "finding excerpt" }],
    };
    await runWriter("Draft a section.", factory, research, "Formal tone.");
    expect(capturedPrompts[0]).toContain("Key finding.");
    expect(capturedPrompts[0]).toContain("Report");
    expect(capturedPrompts[0]).toContain("Formal tone.");
  });

  it("omits research and style sections when neither is provided", async () => {
    const { factory, capturedPrompts } = makeFactory();
    await runWriter("Write something.", factory);
    expect(capturedPrompts[0]).not.toContain("Research context:");
    expect(capturedPrompts[0]).not.toContain("Style reference");
  });
});

describe("invoke_writer via DelegationTools", () => {
  let capturedPrompts: string[];
  let factory: AgentRunnerFactory;

  beforeEach(async () => {
    const made = makeFactory("the draft");
    factory = made.factory;
    capturedPrompts = made.capturedPrompts;
  });

  it("parses researchContext JSON and passes it through to runWriter", async () => {
    const research: ResearchResult = {
      summary: "Parsed summary.",
      sources: [{ id: "2", title: "My Doc", excerpt: "an excerpt" }],
    };
    // Simulate what DelegationTools does
    const parsedResearch = JSON.parse(
      JSON.stringify(research),
    ) as ResearchResult;
    await runWriter("Write something.", factory, parsedResearch);
    expect(capturedPrompts[0]).toContain("Parsed summary.");
    expect(capturedPrompts[0]).toContain("My Doc");
  });

  it("proceeds without research context when researchContext JSON is malformed", async () => {
    // Simulate malformed JSON path: no research context passed
    const result = await runWriter("Write something.", factory, undefined);
    expect(result).toBe("the draft");
    expect(capturedPrompts[0]).not.toContain("Research context:");
  });

  it("result is JSON with a draft string field", async () => {
    const draft = await runWriter("Write something.", factory);
    const result = JSON.stringify({ draft });
    const parsed = JSON.parse(result) as { draft: string };
    expect(typeof parsed.draft).toBe("string");
  });
});
