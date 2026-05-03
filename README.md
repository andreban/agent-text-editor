# Agent Text Editor

An AI-powered collaborative text editor where an LLM agent assists with editing text in a Monaco editor.

## Overview

Agent Text Editor is a React SPA that lets you write and edit text with the help of a Google Gemini AI agent. The agent can read your document, suggest edits, and rewrite sections — and every proposed change requires your explicit approval before it's applied.

## Features

- **Monaco editor** — full-featured code/text editor in the browser
- **AI-assisted editing** — chat with a Gemini agent that can read and edit your document
- **Approval workflow** — each AI-proposed edit is shown as a diff (strikethrough + replacement) for you to accept or reject
- **Approve All mode** — bypass per-edit confirmation for unattended bulk edits
- **Streaming responses** — real-time token streaming with collapsible thinking chunks
- **Token usage tracking** — aggregated input/output token counts per session

## Prerequisites

- Node.js 18+
- A [Google AI Studio](https://aistudio.google.com/) API key

## Getting Started

```bash
npm install
npm run dev
```

Open the app in your browser, enter your Google AI API key in the settings panel, and start chatting.

## Available Commands

```bash
npm run dev       # Start Vite dev server
npm run build     # Type-check + build for production
npm run lint      # Run ESLint
npm run format    # Format with Prettier
npm run test      # Run Vitest tests
npm run preview   # Preview production build
```

## Architecture

**Data flow:**

1. User submits a prompt in `ChatSidebar`
2. `App.tsx` creates an `AgentRunner` (from `@mast-ai/core`) backed by `GoogleGenAIAdapter`
3. The LLM decides to respond or invoke tools (`read`, `read_selection`, `edit`, `write`)
4. Mutating tools (`edit`/`write`) create a `Suggestion` entry in store state — the UI pauses and prompts the user to accept or reject unless "Approve All" is enabled
5. The tool resolves with the user's decision, and the agent loop continues until a final text response

**Key modules:**

| Module                               | Description                                                                                          |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `src/adapters/GoogleGenAIAdapter.ts` | `LlmAdapter` implementation for Google Gen AI SDK; handles streaming, thinking mode, and token usage |
| `src/lib/EditorTools.ts`             | Registers the four editor tools (`read`, `read_selection`, `edit`, `write`) with `ToolRegistry`      |
| `src/lib/store.tsx`                  | React Context holding editor instance, pending suggestions, API key, model, and token counts         |
| `src/components/EditorPanel.tsx`     | Monaco editor with diff decorations and accept/reject widgets                                        |
| `src/components/ChatSidebar.tsx`     | Streaming chat UI with thinking chunks, text deltas, and tool events                                 |
| `src/App.tsx`                        | Top-level assembly: agent runner, system prompt, and settings persistence                            |

## License

Apache 2.0 — see [LICENSE](LICENSE).
