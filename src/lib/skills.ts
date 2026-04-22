// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

export interface Skill {
  id: string;
  name: string;
  description: string;
  instructions: string;
  model?: string;
}

export const CREATE_SKILL_ID = "default-create-skill";

export const DEFAULT_SKILLS: Skill[] = [
  {
    id: CREATE_SKILL_ID,
    name: "Create Skill",
    description:
      "Drafts a new skill definition and writes it to the current document.",
    instructions:
      "You are a skill author. Given a description of what a new skill should do, draft a complete skill definition and save it as a new workspace document.\n\n" +
      "A skill definition uses this format:\n\n" +
      "---\n" +
      "name: <skill name>\n" +
      "description: <one-line description>\n" +
      "---\n\n" +
      "<step-by-step instructions for the skill's sub-agent>\n\n" +
      "Steps:\n" +
      "1. From the task, decide on a short name, a one-line description, and detailed step-by-step instructions the sub-agent should follow.\n" +
      "2. Call `create_document` with the skill name as the title.\n" +
      "3. Call `list_workspace_docs` to find the new document's ID by matching the title.\n" +
      "4. Call `switch_active_document` with that ID to open it.\n" +
      "5. Call `write` to fill the document with the complete skill definition.\n" +
      "6. Report the skill name and a brief summary of what it does.",
  },
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
      "2. If the `summarize` tool is available, pass the text to it and return its output. " +
      "Otherwise, write a concise summary in plain prose yourself.\n" +
      "Do NOT edit the document.",
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
