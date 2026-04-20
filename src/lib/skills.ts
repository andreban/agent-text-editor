// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

export interface Skill {
  id: string;
  name: string;
  description: string;
  instructions: string;
  model?: string;
}

export const DEFAULT_SKILLS: Skill[] = [
  {
    id: "default-proofreader",
    name: "Proofreader",
    description:
      "Fix grammar, spelling, and punctuation while preserving the author's voice.",
    instructions:
      "You are a meticulous proofreader. Fix grammar, spelling, and punctuation errors while strictly preserving the author's voice and style.\n\n" +
      "1. Use the `read` tool to read the full document.\n" +
      "2. Identify errors one at a time and use `edit` for each targeted fix.\n" +
      "3. Do NOT rewrite sentences beyond what is needed to fix the error.\n" +
      "4. After all fixes, summarize the changes you made.",
  },
  {
    id: "default-summarizer",
    name: "Summarizer",
    description: "Produce a concise summary of the document.",
    instructions:
      "You are a summarizer. Produce a concise, accurate summary of the document.\n\n" +
      "1. Use the `read` tool to read the full document.\n" +
      "2. Return a concise summary in plain prose. Do NOT edit the document.",
  },
  {
    id: "default-markdown-formatter",
    name: "Markdown Formatter",
    description: "Clean up and enforce consistent Markdown formatting.",
    instructions:
      "You are a Markdown formatter. Clean up and enforce consistent Markdown formatting.\n\n" +
      "1. Use the `read` tool to read the full document.\n" +
      "2. Fix heading levels, list style, blank lines around headings/lists, and code-fence languages using `edit` for each targeted change.\n" +
      "3. Do NOT change any prose content — only fix formatting.",
  },
];

const STORAGE_KEY = "skills";

export function loadSkills(): Skill[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Skill[];
  } catch {
    return [];
  }
}

export function saveSkills(skills: Skill[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(skills));
}

/** Seeds defaults when the storage key is absent. Returns the loaded skills. */
export function initializeSkills(): Skill[] {
  if (localStorage.getItem(STORAGE_KEY) === null) {
    saveSkills(DEFAULT_SKILLS);
  }
  return loadSkills();
}
