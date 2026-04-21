// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, vi } from "vitest";
import { computeDiffDecorations } from "./diffDecorations";
import type { Suggestion } from "./store";

function makeSuggestion(overrides: Partial<Suggestion> = {}): Suggestion {
  return {
    id: "test-id",
    originalText: "old text",
    replacementText: "new text",
    status: "pending",
    range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 9 },
    resolve: vi.fn(),
    ...overrides,
  };
}

describe("computeDiffDecorations", () => {
  it("single-word substitution produces a DELETE with after INSERT", () => {
    const s = makeSuggestion({ originalText: "old", replacementText: "new" });
    const decorations = computeDiffDecorations(s);
    expect(decorations.length).toBe(1);
    const dec = decorations[0];
    expect(dec.options.inlineClassName).toBe("suggestion-delete");
    expect(dec.options.after?.content).toBe(" new");
    expect(dec.options.after?.inlineClassName).toBe("suggestion-insert");
  });

  it("pure insertion (empty originalText) produces a zero-width decoration with after", () => {
    const s = makeSuggestion({ originalText: "", replacementText: "inserted" });
    const decorations = computeDiffDecorations(s);
    expect(decorations.length).toBe(1);
    const dec = decorations[0];
    expect(dec.range.startLineNumber).toBe(dec.range.endLineNumber);
    expect(dec.range.startColumn).toBe(dec.range.endColumn);
    expect(dec.options.after?.content).toBe(" inserted");
    expect(dec.options.after?.inlineClassName).toBe("suggestion-insert");
  });

  it("pure deletion (empty replacementText) produces a DELETE with no after", () => {
    const s = makeSuggestion({ originalText: "remove this", replacementText: "" });
    const decorations = computeDiffDecorations(s);
    expect(decorations.length).toBe(1);
    const dec = decorations[0];
    expect(dec.options.inlineClassName).toBe("suggestion-delete");
    expect(dec.options.after).toBeUndefined();
  });

  it("EQUAL + INSERT produces an equal decoration carrying the after insert", () => {
    // "hello " is EQUAL, "world" is inserted at the end
    const s = makeSuggestion({ originalText: "hello ", replacementText: "hello world" });
    const decorations = computeDiffDecorations(s);
    const equalDec = decorations.find(
      (d) => d.options.description === "suggestion-equal-with-insert",
    );
    expect(equalDec).toBeDefined();
    expect(equalDec!.options.after?.content).toBe(" world");
    expect(equalDec!.options.after?.inlineClassName).toBe("suggestion-insert");
  });

  it("correctly increments line numbers for multi-line originalText", () => {
    const s = makeSuggestion({
      originalText: "line1\nline2",
      replacementText: "line1\nchanged",
      range: { startLineNumber: 3, startColumn: 1, endLineNumber: 4, endColumn: 6 },
    });
    const decorations = computeDiffDecorations(s);
    const deleteDec = decorations.find((d) => d.options.description === "suggestion-delete");
    expect(deleteDec).toBeDefined();
    // "line2" starts on line 4 (3 + 1 for newline)
    expect(deleteDec!.range.startLineNumber).toBe(4);
  });

  it("escapes newlines in insert content as ↵", () => {
    const s = makeSuggestion({
      originalText: "a",
      replacementText: "b\nc",
    });
    const decorations = computeDiffDecorations(s);
    const dec = decorations.find((d) => d.options.after);
    expect(dec?.options.after?.content).toContain("↵");
  });
});
