// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GoogleGenAIAdapter } from "./GoogleGenAIAdapter";

// Mock @google/genai
vi.mock("@google/genai", () => {
  const generateContent = vi.fn().mockResolvedValue({
    candidates: [
      {
        content: {
          parts: [{ text: "Hello from Gemini!" }],
        },
      },
    ],
    usageMetadata: {
      promptTokenCount: 10,
      candidatesTokenCount: 5,
    },
  });

  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    GoogleGenAI: vi.fn().mockImplementation(function (this: any) {
      this.models = {
        generateContent,
      };
    }),
  };
});

describe("GoogleGenAIAdapter", () => {
  let adapter: GoogleGenAIAdapter;
  const mockUsageUpdate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new GoogleGenAIAdapter(
      "fake-api-key",
      "gemini-3.1-flash-lite-preview",
      mockUsageUpdate,
    );
  });

  it("should generate text response", async () => {
    const response = await adapter.generate({
      messages: [{ role: "user", content: { type: "text", text: "Hi" } }],
      tools: [],
    });

    expect(response.text).toBe("Hello from Gemini!");
    expect(mockUsageUpdate).toHaveBeenCalledWith({
      promptTokenCount: 10,
      candidatesTokenCount: 5,
      totalTokenCount: 15,
    });
  });

  it("should handle tool calls", async () => {
    const { GoogleGenAI } = await import("@google/genai");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockClient = new (GoogleGenAI as any)();
    mockClient.models.generateContent.mockResolvedValueOnce({
      candidates: [
        {
          content: {
            parts: [
              {
                functionCall: {
                  name: "testTool",
                  args: { arg1: "val1" },
                },
              },
            ],
          },
        },
      ],
      usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 5 },
    });

    // Re-initialize to use the new mock value if needed,
    // or just rely on the fact that generateContent is called on the same mock instance
    // Actually, because of vi.mock, all instances share the same mock functions.

    const response = await adapter.generate({
      messages: [
        { role: "user", content: { type: "text", text: "Call tool" } },
      ],
      tools: [{ name: "testTool", description: "desc", parameters: {} }],
    });

    expect(response.toolCalls).toHaveLength(1);
    expect(response.toolCalls[0].name).toBe("testTool");
    expect(response.toolCalls[0].args).toEqual({ arg1: "val1" });
  });
});
