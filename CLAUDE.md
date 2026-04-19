# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start Vite dev server
npm run build     # Type-check + build for production
npm run lint      # Run ESLint
npm run format    # Format with Prettier
npm run test      # Run Vitest tests
npm run preview   # Preview production build
```

## Architecture

This is an AI-powered collaborative text editor: a React SPA where an LLM agent assists with editing text in a Monaco editor.

**Data flow:**

1. User submits a prompt in `ChatSidebar`
2. `App.tsx` creates an `AgentRunner` (from `@mast-ai/core`) backed by `GoogleGenAIAdapter`
3. The LLM decides to respond or invoke tools (`read`, `read_selection`, `edit`, `write`)
4. Mutating tools (`edit`/`write`) create a `Suggestion` entry in store state — the UI pauses and prompts the user to accept or reject unless "Approve All" is enabled
5. The tool resolves with the user's decision, and the agent loop continues until a final text response

**Key modules:**

- `src/adapters/GoogleGenAIAdapter.ts` — implements `LlmAdapter` for Google Gen AI SDK; maps MAST message/tool formats, enables thinking mode (`ThinkingLevel.HIGH`), streams deltas, and reports token usage via callback
- `src/lib/EditorTools.ts` — registers the four editor tools with `ToolRegistry`; `edit` and `write` create suggestions and await user resolution
- `src/lib/store.tsx` — React Context holding the Monaco editor instance, pending `Suggestion[]`, API key, model selection, and aggregated token counts
- `src/components/EditorPanel.tsx` — Monaco editor with decorations (strikethrough + replacement text) rendered for each pending suggestion; hosts `SuggestionWidget` accept/reject buttons
- `src/components/ChatSidebar.tsx` — streaming chat UI that renders thinking chunks (collapsible), text deltas, and tool call/result events
- `src/App.tsx` — assembles the agent runner, sets the system prompt ("helpful senior editorial assistant"), and manages API key/model localStorage persistence

**MAST dependency:** `@mast-ai/core` is resolved from a local sibling path (`../mast-ai/packages/core`) via `vite.config.ts` alias. If that path is missing the dev server will fail.

## Project mandates (from GEMINI.md)

- All source files must carry the Apache-2.0 license header.
- All new logic requires Vitest test coverage.
- Run `npm run lint` and `npm run format` before committing.
- Never commit without explicit user approval after manual testing.
