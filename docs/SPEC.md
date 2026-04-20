# Technical Specification: AI Agent Text Editor

## Architecture

The application is a single-page React application bundled with Vite. It consists of three main architectural components:

1. **The Editor (Monaco):** Handles text input, rendering, and provides an API for programmatic access. Bound to the active document of the active workspace.
2. **The Agent (MAST):** Orchestrates the "think-act" loop. It uses a `ToolRegistry` to expose editor-specific and workspace-specific functions to the AI. The architecture supports multi-agent orchestration; the primary `AgentRunner` can spin up specialized sub-`AgentRunners` based on user-defined skills or for workspace document queries.
3. **The Adapter (Google Gen AI):** A custom implementation of `LlmAdapter` that bridges `MAST` with the `@google/genai` SDK.

## Data Flow

1. User enters a prompt in the chat sidebar.
2. `AgentRunner` receives the prompt and passes it to the `GoogleGenAIAdapter`.
3. The selected LLM (e.g., Gemini 2.5 Flash) decides whether to respond with text or call a tool.
4. If a tool is called (e.g., `read`, `edit`, or `write`), the `ToolRegistry` executes the function. For modification tools (`edit`, `write`), the UI intercepts the action to present the suggestion to the user, unless "approve all" mode is enabled.
5. The result of the tool execution (or the user's feedback/decision from a suggestion) is returned to the LLM, and the loop continues until a final response is generated.
6. If the task requires specialized knowledge, the main agent can call `delegate_to_skill`, invoking a sub-agent with specific instructions loaded from local storage. The sub-agent's results are returned to the main agent's context.
7. For workspace document queries, `query_workspace_doc` and `query_workspace` spin up short-lived sub-`AgentRunners` that read document content and return focused summaries without loading the full content into the main agent's context.

## Technical Stack

- **Frontend:** React 18, TypeScript, Vite.
- **Styling:** Tailwind CSS.
- **UI Components:** `shadcn/ui` (built on Radix UI).
- **Editor:** `@monaco-editor/react`.
- **LLM SDK:** `@google/genai`.
- **Agent Framework:** `@mast-ai/core` (Installed via `npm install github:andreban/mast-ai#packages/core`).
- **Testing:** `vitest`, `@testing-library/react`.
- **Quality:** `eslint`, `prettier`.

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
│   ├── WorkspacePicker.tsx
│   ├── WorkspacePanel.tsx
│   └── SkillsManager.tsx
├── lib/
│   ├── workspace.ts
│   ├── WorkspacesContext.tsx
│   ├── EditorTools.ts
│   ├── WorkspaceTools.ts
│   ├── skills.ts
│   ├── store.tsx
│   └── ThemeProvider.tsx
├── App.tsx
├── main.tsx
└── App.css
```

## Data Model

### Workspace

```ts
interface WorkspaceMeta {
  id: string;        // crypto.randomUUID()
  name: string;
  createdAt: number; // Date.now()
  updatedAt: number; // Date.now()
}

interface WorkspaceDocument {
  id: string;        // crypto.randomUUID()
  title: string;
  content: string;   // raw text / markdown
  updatedAt: number; // Date.now()
}

interface WorkspaceData {
  documents: WorkspaceDocument[];
  activeDocumentId: string | null;
}
```

`localStorage` layout:

| Key                    | Value                                   |
| ---------------------- | --------------------------------------- |
| `workspaces_index`     | `JSON.stringify(WorkspaceMeta[])`       |
| `workspace_{id}`       | `JSON.stringify(WorkspaceData)`         |
| `active_workspace_id`  | ID of the currently open workspace      |

Workspaces are stored independently so listing workspaces does not require deserializing all document content. `WorkspaceData` is loaded on demand when a workspace is opened.

On first load, if `workspaces_index` does not exist, a migration runs: any `supporting_docs` data is imported into a default workspace named `"My Workspace"`, and `supporting_docs` is removed.

## Component Breakdown

### `workspace.ts`

Type definitions for `WorkspaceMeta`, `WorkspaceDocument`, and `WorkspaceData`.

### `WorkspacesContext.tsx`

React context providing the full workspace API to the application:

- `index: WorkspaceMeta[]` — all workspace names and IDs.
- `activeWorkspaceId: string | null`
- `activeWorkspace: WorkspaceData | null` — loaded on demand.
- `activeDocument: WorkspaceDocument | null` — derived from `activeWorkspace`.
- `createWorkspace(name): WorkspaceMeta`
- `openWorkspace(id)`
- `renameWorkspace(id, newName)`
- `deleteWorkspace(id)` — removes `workspace_{id}` and the index entry; if the deleted workspace was active, sets `activeWorkspaceId` to `null`.
- `addDocument()`
- `updateDocument(id, patch)` — debounced write to `localStorage`.
- `deleteDocument(id)`
- `setActiveDocumentId(id)` — persisted inside `workspace_{id}`.

### `WorkspacePicker.tsx`

Full-screen view shown when `activeWorkspaceId` is `null`. Displays all workspaces with:
- Open, Rename (inline edit), and Delete (with confirmation) actions per workspace.
- **New Workspace** button: prompts for a name, creates the workspace, and opens it immediately.

Accessible from the editor header via a **Switch Workspace** button at any time.

### `WorkspacePanel.tsx`

Left drawer content shown when a workspace is open. Displays:
- The active workspace name (read-only label; rename goes via `WorkspacePicker`).
- All documents in the active workspace: click to open, double-click to rename, delete button per document.
- Active document is visually highlighted.
- **New Document** button: creates `"Untitled Document"` and activates it.

### `GoogleGenAIAdapter.ts`

Implements `LlmAdapter` interface:

- `generate(request: AdapterRequest): Promise<AdapterResponse>`
- Translates MAST messages/tools to `@google/genai` format.
- Handles tool calls from the model.
- Instantiated with the user's selected model name (e.g., `gemini-2.5-flash`).

### `EditorTools.ts`

Registers tools that operate exclusively on the currently open document:

- `read()`: `() => string`. Returns the complete content of the open document.
- `read_selection()`: `() => string`. Returns text currently selected in the editor.
- `search(query: string)`: `({ query: string }) => { results: { line: number, text: string }[] }`.
- `get_metadata()`: `() => { wordCount: number, lineCount: number, cursor: { line: number, column: number } }`.
- `edit(originalText, replacementText)`: Proposes a targeted change. Contains hard size constraints to enforce surgical edits. Uses a Promise to pause agent execution until the user resolves the change. Applies a red strikethrough decoration to `originalText` and injects `replacementText` inline (green) via `after.content`.
- `write(content)`: Proposes full replacement of the open document, pausing execution until user approval.
- `delegate_to_skill(skillName, task)`: Invokes a skill sub-agent.

`read`, `edit`, and `write` are intentionally symmetric — all three operate on the open document only. To access other documents, the agent uses `WorkspaceTools`.

### `WorkspaceTools.ts`

Registers tools scoped to the active workspace. Receives a ref snapshot of `WorkspaceData` at call time (same pattern as `EditorTools` receiving the Monaco editor ref):

- `list_workspace_docs()`: Returns `[{ id, title }]` — no content.
- `read_workspace_doc(id)`: Returns `{ title, content }` or `{ error: "Document not found" }`.
- `query_workspace_doc(id, query)`: Spins up a short-lived `AgentRunner` (`gemini-2.5-flash`) with the document content and query; returns `{ summary }`. The `AgentRunner` factory is injected as a parameter for testability.
- `query_workspace(query)`: Calls `list_workspace_docs`, then `query_workspace_doc` for each document sequentially, then passes all summaries to a synthesizer `AgentRunner`; returns `{ answer }`.

### `EditorPanel.tsx`

Wraps the Monaco Editor. Reads initial content from `WorkspacesContext.activeDocument.content` and calls `updateDocument` on change (debounced 500 ms). Replaces the former `AppState.editorContent` / `setEditorContent` pattern.

### `ChatSidebar.tsx`

Provides the streaming chat interface and message history.

### `SuggestionWidget.tsx`

- Uses Monaco's `addContentWidget` API to render a compact, hovering popup near the suggestion.
- **Visuals:** Relies purely on Monaco `deltaDecorations` (no ViewZones) for a true inline Google Docs-style experience. Original text receives a red strikethrough. Proposed text is injected into the same line via the `after.content` property, styled in green monospace. Provides compact buttons for "Accept" and "Reject".

### `SkillsManager.tsx`

A dialog for creating, editing, and deleting custom skills.

### `App.tsx`

The main entry point:

- Manages global state (API key, selected model, active suggestions, "approve all" toggle, skills).
- Wires `EditorTools` and `WorkspaceTools` into the `ToolRegistry`, passing the Monaco editor ref and a snapshot ref of `WorkspacesContext.activeWorkspace.documents` respectively.
- Dynamically constructs `AgentConfig.systemInstructions`: appends skill names/descriptions and workspace tool guidance.
- Renders `WorkspacePicker` when no workspace is active, or the editor layout (`WorkspacePanel` + `EditorPanel` + `ChatSidebar`) when a workspace is open.
- Handles responsive layout (desktop split-pane vs. mobile bottom-sheet).

## Main Agent System Instructions

The primary agent should be configured with a system prompt that explains its role as an editor and its mandatory approval workflow:

> You are a senior editorial assistant. You help the user refine their text.
>
> - `read()`, `edit()`, and `write()` operate on the currently open document only.
> - Always use `read()` or `read_selection()` before suggesting changes.
> - CRITICAL: Prefer small, surgical edits using `edit()`. Do not rewrite the entire document unless explicitly asked to.
> - All edits MUST be proposed via `edit()` or `write()`. Execution will PAUSE until user approval. Do not assume the change was applied until you receive a success confirmation.
> - Use `list_workspace_docs`, `read_workspace_doc`, or `query_workspace_doc` / `query_workspace` to access other documents in the workspace.
> - You have access to specialized sub-agents. Use them for focused tasks like proofreading.

## Security

- API keys are handled purely on the client side and are not stored on any backend.
- Users are prompted to enter their Google AI Studio API key on first use.
- The API key is persisted in the browser's `localStorage` so the user does not have to re-enter it on subsequent visits.

## Implementation Details

- **Vite Configuration:**
  - Use `vite-plugin-monaco-editor` or configure `optimizeDeps` and `worker` settings to ensure Monaco's web workers are correctly bundled and loaded.
  - Ensure `process.env` or similar is handled if the Google SDK expects it (though we should pass the key directly).
- **Testing Strategy:** Use Vitest for unit testing adapters, tools, and state logic. Use React Testing Library for component rendering and interaction tests.
- **Error Handling:**
  - Graceful handling of API rate limits and invalid tool calls.
  - Catch and display LLM errors (e.g., safety filters) in the chat UI.
- **Styling:** Use Tailwind CSS for utility-first styling and `shadcn/ui` for complex components (e.g., Dialogs for Skills Manager, workspace confirmation prompts).
- **Dark Mode:** Use Tailwind CSS's class-based dark mode strategy (`darkMode: 'class'` in `tailwind.config`). A `ThemeProvider` wraps the app and toggles a `dark` class on the `<html>` element. The Monaco editor theme switches between `vs` (light) and `vs-dark` (dark) in sync. The selected theme is persisted in `localStorage`.
- **Responsive Layout:** On screens narrower than the `md` breakpoint (768 px), the editor fills the screen and FABs open a bottom-sheet overlay for chat or the workspace panel. Touch targets must be at minimum 44 × 44 px. The Monaco editor renders in a flex-fill container so it uses available height without overflow.
