# Technical Specification: AI Agent Text Editor

## Architecture
The application is a single-page React application bundled with Vite. It consists of three main architectural components:
1. **The Editor (Monaco):** Handles text input, rendering, and provides an API for programmatic access.
2. **The Agent (MAST):** Orchestrates the "think-act" loop. It uses a `ToolRegistry` to expose editor-specific functions to the AI. The architecture supports multi-agent orchestration; the primary `AgentRunner` can spin up specialized sub-`AgentRunners` based on user-defined skills.
3. **The Adapter (Google Gen AI):** A custom implementation of `LlmAdapter` that bridges `MAST` with the `@google/genai` SDK.

## Data Flow
1. User enters a prompt in the chat sidebar.
2. `AgentRunner` receives the prompt and passes it to the `GoogleGenAIAdapter`.
3. The selected LLM (e.g., Gemini 2.5 Flash) decides whether to respond with text or call a tool.
4. If a tool is called (e.g., `read`, `edit`, or `write`), the `ToolRegistry` executes the function. For modification tools (`edit`, `write`), the UI intercepts the action to present the suggestion to the user, unless "approve all" mode is enabled.
5. The result of the tool execution (or the user's feedback/decision from a suggestion) is returned to the LLM, and the loop continues until a final response is generated.
6. If the task requires specialized knowledge, the main agent can call a `delegate_to_skill` tool, invoking a sub-agent with specific instructions loaded from local storage. The sub-agent's results are returned to the main agent's context.
7. Upon receiving a response from the LLM, the `GoogleGenAIAdapter` intercepts the usage metadata and updates the application's global token count.

## Technical Stack
- **Frontend:** React 18, TypeScript, Vite.
- **Styling:** Tailwind CSS.
- **UI Components:** `shadcn/ui` (built on Radix UI).
- **Editor:** `@monaco-editor/react`.
- **LLM SDK:** `@google/genai`.
- **Agent Framework:** `@mast-ai/core` (Installed via `npm install github:andreban/mast-ai#packages/core`).

## License
Apache-2.0

## License Headers
All source files must include the mandatory license header using the appropriate comment syntax:

**TypeScript/JavaScript/CSS:**
```typescript
// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0
```

**HTML:**
```html
<!--
Copyright 2026 Andre Cipriani Bandarra
SPDX-License-Identifier: Apache-2.0
-->
```

## Directory Structure
```text
src/
├── adapters/
│   └── GoogleGenAIAdapter.ts
├── components/
│   ├── EditorPanel.tsx
│   ├── ChatSidebar.tsx
│   ├── SuggestionWidget.tsx
│   └── SkillsManager.tsx
├── tools/
│   └── EditorTools.ts
├── types/
│   └── index.ts
├── App.tsx
├── main.tsx
└── App.css
```

## Component Breakdown

### `GoogleGenAIAdapter.ts`
Implements `LlmAdapter` interface:
- `generate(request: AdapterRequest): Promise<AdapterResponse>`
- Translates MAST messages/tools to `@google/genai` format.
- Handles tool calls from the model.
- Instantiated with the user's selected model name (e.g., `gemini-2.5-flash`).
- Extracts token usage statistics (`usageMetadata` from the `@google/genai` SDK response) and reports it back to the application state, typically via an event emitter or callback passed during adapter initialization.

### `EditorTools.ts`
Registers tools with `ToolRegistry`:
- `read()`: `() => string`. Returns the complete current editor content.
- `read_selection()`: `() => string`. Returns text currently selected.
- `search(query: string)`: `({ query: string }) => { results: { line: number, text: string }[] }`.
- `get_metadata()`: `() => { wordCount: number, lineCount: number, cursor: { line: number, column: number } }`.
- `edit(originalText: string, replacementText: string)`: `({ originalText: string, replacementText: string }) => string`. Proposes a change. The app locates `originalText` in the editor, applies a red/squiggly decoration, displays `replacementText` via a View Zone, and attaches a Content Widget with approval controls.
- `write(content: string)`: `({ content: string }) => string`. Proposes full replacement.
- `list_supporting_docs()`: `() => string[]`. Returns a list of names for available supporting markdown documents.
- `read_supporting_doc(name: string)`: `({ name: string }) => string`. Returns the complete content of the requested supporting document.
- `delegate_to_skill(skillName: string, task: string)`: `({ skillName: string, task: string }) => string`. Invokes sub-agent.

## Main Agent System Instructions
The primary agent should be configured with a system prompt that explains its role as an editor and its mandatory approval workflow.
Example:
> You are a senior editorial assistant. You help the user refine their text. 
> - Always use `read()` or `read_selection()` before suggesting changes.
> - All edits MUST be proposed via `edit()` or `write()`.
> - Do not assume you can change text without a tool call.
> - You have access to specialized sub-agents. Use them for focused tasks like proofreading.

### `EditorPanel.tsx`
Wraps the Monaco Editor component and provides an imperative handle or context for tools to interact with the editor instance.

### `ChatSidebar.tsx`
Provides the chat interface, message history, and token usage display.

### `SuggestionWidget.tsx`
- Uses Monaco's `addContentWidget` and `changeViewZones` APIs to render inline.
- **Visuals:** Original text is highlighted light red with a squiggly line using `deltaDecorations`. Proposed text is rendered in green. Provides inline buttons for "Accept", "Reject", and a text input for "Feedback".

### `SkillsManager.tsx`
A dialog or dedicated view for creating, editing, and deleting custom skills.

### `App.tsx`
The main entry point:
- Manages global state (e.g., API key, selected model, active suggestions, "approve all" toggle, user-defined skills, supporting documents, session token usage).
- Handles loading the API key, selected model, skills, and supporting documents from `localStorage` on initialization.
- Includes UI components for managing both specialized skills and supporting markdown documents (creation, editing, deletion).
- Dynamically constructs the `AgentConfig.systemInstructions` for the main `AgentRunner`. It appends only the `name` and `description` of each available skill into the main prompt, keeping it concise while ensuring the LLM knows when to use `delegate_to_skill` without needing to discover them first.
- Renders a UI element (e.g., in the chat sidebar or footer) displaying the accumulated token usage for the current session.
- Renders the `MonacoEditor` and `ChatSidebar` components.
- Initializes `AgentRunner` and `Conversation`.

## Security
- API keys are handled purely on the client side and are not stored on any backend.
- Users are prompted to enter their Google AI Studio API key on first use.
- The API key is persisted in the browser's `localStorage` so the user does not have to re-enter it on subsequent visits.

## Implementation Details
- **Vite Configuration:** 
  - Use `vite-plugin-monaco-editor` or configure `optimizeDeps` and `worker` settings to ensure Monaco's web workers are correctly bundled and loaded.
  - Ensure `process.env` or similar is handled if the Google SDK expects it (though we should pass the key directly).
- **Error Handling:** 
  - Graceful handling of API rate limits and invalid tool calls.
  - Catch and display LLM errors (e.g., safety filters) in the chat UI.
- **Styling:** Use Tailwind CSS for utility-first styling and `shadcn/ui` for complex components (e.g., Dialogs for Skills Manager, Tabs for Sidebar).