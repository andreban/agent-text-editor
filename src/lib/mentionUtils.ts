// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

export interface DocRef {
  id: string;
  title: string;
}

/**
 * Builds the final prompt string by prepending referenced document context
 * so the agent can use document IDs directly without calling list_workspace_docs.
 */
export function buildPromptWithMentions(
  userText: string,
  mentionedDocs: DocRef[],
): string {
  if (mentionedDocs.length === 0) return userText;
  const docList = mentionedDocs
    .map((d) => `"${d.title}" (id: ${d.id})`)
    .join(", ");
  return `The user has referenced the following documents: ${docList}.\n\n${userText}`;
}

/**
 * Returns the query string after the last '@' if the input ends with an
 * in-progress mention (no space after @). Returns null if no active mention.
 */
export function extractMentionQuery(input: string): string | null {
  const match = input.match(/@([^\s]*)$/);
  if (!match) return null;
  return match[1];
}

/**
 * Removes the trailing '@query' trigger from the input string after a
 * document is selected from the picker.
 */
export function removeMentionTrigger(input: string): string {
  return input.replace(/@[^\s]*$/, "").trimEnd();
}
