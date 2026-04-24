// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

export const DEFAULT_EDITOR_CONTENT = `# Welcome to the AI Agent Text Editor

This is a text editor paired with an AI agent that can read and rewrite your document. Use the chat sidebar on the right to give the agent instructions.

## What the agent can do

### Read your document
The agent can read the full document or a specific selection before responding — so you don't need to paste content into the chat.

> **Try it:** Select a paragraph, then ask *"Is this sentence too long?"*

### Make targeted edits
When you ask for a change, the agent locates the relevant text and proposes a precise edit. The change is shown as a diff directly in the editor — strikethrough for removed text, new text inserted inline.

> **Try it:** *"Rewrite the intro to be more concise."*

### Rewrite the whole document
For larger tasks, the agent can replace the entire document content in one step.

> **Try it:** *"Convert this document to use second-person voice throughout."*

## The accept / reject workflow

Every edit the agent proposes appears as a **suggestion** — the document is not changed until you decide:

- Click **Accept** to apply the edit.
- Click **Reject** to discard it and keep the original.
- Enable **Approve All** in the toolbar to auto-accept every suggestion without prompting.

## Built-in AI tools

When available in your browser, the agent can also use the [Chrome Built-in AI APIs](https://developer.chrome.com/docs/ai/built-in) to run tasks locally without sending data to a remote model:

- **Summarize** — generate a concise summary
- **Translate** — translate content into another language
- **Detect language** — identify the language of a passage

> **Try it:** *"Can you translate this document to Japanese and save it in a new document?"*

## Markdown preview

Switch to the **Preview** tab at any time to see the rendered output. The agent can also help you fix Markdown formatting.

> **Try it:** *"Add a table of contents based on the headings in this document."*

---

*Source code available at [github.com/andreban/agent-text-editor](https://github.com/andreban/agent-text-editor).*`;
