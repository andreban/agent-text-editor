// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from "vitest";
import {
  buildPromptWithMentions,
  extractMentionQuery,
  removeMentionTrigger,
} from "./mentionUtils";

describe("buildPromptWithMentions", () => {
  it("returns trailing text unchanged when no segments", () => {
    expect(buildPromptWithMentions([], "Hello")).toBe("Hello");
  });

  it("prepends document context when one doc is mentioned", () => {
    const result = buildPromptWithMentions(
      [{ text: "", doc: { id: "abc-123", title: "My Notes" } }],
      " Compare these",
    );
    expect(result).toContain('"My Notes"');
    expect(result).toContain("abc-123");
    expect(result).toContain("Compare these");
  });

  it("includes all mentioned documents in the preamble", () => {
    const result = buildPromptWithMentions(
      [
        { text: "", doc: { id: "1", title: "Doc A" } },
        { text: " and ", doc: { id: "2", title: "Doc B" } },
      ],
      " text",
    );
    expect(result).toContain('"Doc A"');
    expect(result).toContain('"Doc B"');
    expect(result).toContain("id: 1");
    expect(result).toContain("id: 2");
  });

  it("places inline user text (with @mentions) after the preamble", () => {
    const result = buildPromptWithMentions(
      [{ text: "do the thing ", doc: { id: "x", title: "Notes" } }],
      "",
    );
    const preambleEnd = result.indexOf("\n\n");
    expect(preambleEnd).toBeGreaterThan(0);
    expect(result.slice(preambleEnd + 2)).toBe("do the thing @Notes");
  });

  it("preserves inline position of mentions relative to surrounding text", () => {
    const result = buildPromptWithMentions(
      [{ text: "before ", doc: { id: "1", title: "Doc" } }],
      " after",
    );
    const preambleEnd = result.indexOf("\n\n");
    expect(result.slice(preambleEnd + 2)).toBe("before @Doc after");
  });
});

describe("extractMentionQuery", () => {
  it("returns null when no @ is present", () => {
    expect(extractMentionQuery("hello world")).toBeNull();
  });

  it("returns empty string immediately after @", () => {
    expect(extractMentionQuery("hello @")).toBe("");
  });

  it("returns the partial query after @", () => {
    expect(extractMentionQuery("hello @notes")).toBe("notes");
  });

  it("returns null when @ is followed by a space (mention not active)", () => {
    expect(extractMentionQuery("hello @ world")).toBeNull();
  });

  it("matches the last @ when multiple exist", () => {
    expect(extractMentionQuery("email user@example.com and @doc")).toBe("doc");
  });
});

describe("removeMentionTrigger", () => {
  it("removes trailing @query from input", () => {
    expect(removeMentionTrigger("hello @no")).toBe("hello");
  });

  it("removes bare @ at end of input", () => {
    expect(removeMentionTrigger("hello @")).toBe("hello");
  });

  it("leaves input unchanged when no trailing mention", () => {
    expect(removeMentionTrigger("hello world")).toBe("hello world");
  });

  it("trims trailing whitespace after removal", () => {
    expect(removeMentionTrigger("hello  @query")).toBe("hello");
  });
});
