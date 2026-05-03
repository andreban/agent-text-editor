# Technical Specification: AI Agent Text Editor

## Architecture

The application is a single-page React application bundled with Vite. It consists of three main architectural components:

1. **The Editor (Monaco):** Handles text input, rendering, and provides an API for programmatic access. Bound to the active document of the active workspace.
2. **The Agent (MAST):** Orchestrates the "think-act" loop. It uses a `ToolRegistry` to expose editor-specific and workspace-specific functions to the AI. The architecture supports multi-agent orchestration; the primary `AgentRunner` can spin up specialized sub-`AgentRunners` based on user-defined skills or for workspace document queries.
3. **The Adapter (Google Gen AI):** A custom implementation of `LlmAdapter` that bridges `MAST` with the `@google/genai` SDK.

## Data Flow

1. User enters a prompt in the chat sidebar. Any `@document` mention chips are resolved to `{ id, title }` pairs and prepended to the prompt.
2. `AgentRunner` receives the prompt and passes it to the `GoogleGenAIAdapter`.
3. The selected LLM (e.g., Gemini 3.1 Flash Lite Preview) decides whether to respond with text or call a tool.
4. If a tool is called (e.g., `read`, `edit`, or `write`), the `ToolRegistry` executes the function. For modification tools (`edit`, `write`, workspace mutations), the UI intercepts the action to present the suggestion to the user, unless "approve all" mode is enabled.
5. The result of the tool execution (or the user's feedback/decision from a suggestion) is returned to the LLM, and the loop continues until a final response is generated.
6. If the task requires specialized knowledge, the main agent can call `delegate_to_skill`, invoking a sub-agent with specific instructions loaded from local storage. The sub-agent's results are returned to the main agent's context.
7. For workspace document queries, `query_workspace_doc` and `query_workspace` spin up short-lived sub-`AgentRunners` that read document content and return focused summaries without loading the full content into the main agent's context.

## Technical Stack

- **Frontend:** React 18, TypeScript, Vite.
- **Styling:** Tailwind CSS.
- **UI Components:** `shadcn/ui` (built on Radix UI).
- **Editor:** `@monaco-editor/react`.
- **LLM SDK:** `@google/genai`.
- **Agent Framework:** `@mast-ai/core` (installed from npm).
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
│   ├── ChatItem.tsx
│   ├── ChatSidebar.tsx
│   ├── EditorPanel.tsx
│   ├── MarkdownContent.tsx
│   ├── SettingsDialog.tsx
│   ├── SkillsDialog.tsx
│   ├── WorkspacePicker.tsx
│   └── WorkspacePanel.tsx
├── lib/
│   ├── diffDecorations.ts
│   ├── EditorTools.ts
│   ├── mentionUtils.ts
│   ├── skills.ts
│   ├── store.tsx
│   ├── ThemeProvider.tsx
│   ├── WebMCPTools.ts
│   ├── workspace.ts
│   ├── WorkspacesContext.tsx
│   └── WorkspaceTools.ts
├── App.tsx
├── main.tsx
└── App.css
```

## Data Model

### Workspace

```ts
interface WorkspaceMeta {
  id: string; // crypto.randomUUID()
  name: string;
  createdAt: number; // Date.now()
  updatedAt: number; // Date.now()
}

interface WorkspaceDocument {
  id: string; // crypto.randomUUID()
  title: string;
  content: string; // raw text / markdown
  updatedAt: number; // Date.now()
}

interface WorkspaceData {
  documents: WorkspaceDocument[];
  activeDocumentId: string | null;
}
```

`localStorage` layout:

| Key                   | Value                              |
| --------------------- | ---------------------------------- |
| `workspaces_index`    | `JSON.stringify(WorkspaceMeta[])`  |
| `workspace_{id}`      | `JSON.stringify(WorkspaceData)`    |
| `active_workspace_id` | ID of the currently open workspace |

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
- Handles tool calls and streaming text/thought deltas from the model.
- Captures `thoughtSignature` from function call parts for correct turn attribution.
- Enables thinking mode (`ThinkingLevel.HIGH`) by default.
- Instantiated with the user's selected model name (e.g., `gemini-3.1-flash-lite-preview`).

### `EditorTools.ts`

Registers tools that operate exclusively on the currently open document:

- `read()`: `() => string`. Returns the complete content of the open document.
- `read_selection()`: `() => string`. Returns text currently selected in the editor.
- `search(query: string)`: `({ query: string }) => { results: { line: number, text: string }[] }`.
- `get_metadata()`: `() => { wordCount: number, lineCount: number, cursor: { line: number, column: number } }`.
- `get_current_mode()`: `() => "editor" | "preview"`. Returns whether the editor is in edit or Markdown preview mode.
- `request_switch_to_editor()`: Prompts the user to switch from preview to editor mode before the agent makes edits.
- `edit(originalText, replacementText)`: Proposes a targeted change. Contains hard size constraints to enforce surgical edits. Uses a Promise to pause agent execution until the user resolves the change. Diff decorations are computed via `diffDecorations.ts` at word granularity.
- `write(content)`: Proposes full replacement of the open document, pausing execution until user approval.
- `delegate_to_skill(skillName, task)`: Invokes a skill sub-agent.

`read`, `edit`, and `write` are intentionally symmetric — all three operate on the open document only. To access other documents, the agent uses `WorkspaceTools`.

### `WorkspaceTools.ts`

Registers tools scoped to the active workspace. Receives a ref snapshot of `WorkspaceData` at call time (same pattern as `EditorTools` receiving the Monaco editor ref):

- `get_active_doc_info()`: Returns `{ id, title }` of the currently open document.
- `list_workspace_docs()`: Returns `[{ id, title }]` — no content.
- `read_workspace_doc(id)`: Returns `{ title, content }` or `{ error: "Document not found" }`.
- `query_workspace_doc(id, query)`: Spins up a short-lived `AgentRunner` with the document content and query; returns `{ summary }`. The `AgentRunner` factory is injected as a parameter for testability.
- `query_workspace(query)`: Calls `list_workspace_docs`, then `query_workspace_doc` for each document sequentially, then passes all summaries to a synthesizer `AgentRunner`; returns `{ answer }`.
- `create_document(title)`: Creates a new document (requires user approval). On apply, saves the current document's content and immediately syncs the Monaco model to `""` via `setEditorValueFn` — see "React State Synchronization for Agent Tools" below.
- `rename_document(id, title)`: Renames an existing document (requires user approval).
- `delete_document(id)`: Deletes a document (requires user approval).
- `switch_active_document(id)`: Changes the active document in the editor. Saves the current document's content then immediately syncs Monaco to the new document's content via `setEditorValueFn` — see "React State Synchronization for Agent Tools" below.

**Constructor parameters relevant to state sync:**

- `setEditorValueFn: (content: string) => void` — calls `editorInstance.setValue(content)` on the Monaco instance. Used by `switch_active_document` and `create_document` to eagerly load the new document's content into Monaco before React's render cycle catches up. See "React State Synchronization for Agent Tools" below.

### `diffDecorations.ts`

Computes and applies inline diff decorations to the Monaco editor for a pending suggestion:

- Uses `diff_match_patch` to compute word-level diffs between `originalText` and `replacementText`.
- Applies Monaco decorations: removed words receive a red strikethrough class; added words are injected via `after.content` styled in green monospace.
- Exported as `applyDiffDecorations(editor, suggestion)` and `clearDiffDecorations(editor, decorationIds)`.

### `mentionUtils.ts`

Utilities for the `@`-mention feature in the chat input:

- `extractMentionQuery(input)`: Returns the query after the last `@` if an in-progress mention is detected, otherwise `null`.
- `removeMentionTrigger(input)`: Strips the trailing `@query` token after a document is selected.
- `buildPromptWithMentions(userText, mentionedDocs)`: Prepends resolved `{ id, title }` pairs to the prompt so the agent can reference documents by ID without calling `list_workspace_docs`.

### `WebMCPTools.ts`

Registers all editor and workspace tools with `navigator.modelContext` (WebMCP API), allowing external browser agents to drive the editor. Mirrors the `EditorTools` and `WorkspaceTools` registrations so both the built-in agent and external agents share the same capabilities.

### `EditorPanel.tsx`

Wraps the Monaco Editor. Reads initial content from `WorkspacesContext.activeDocument.content` and calls `updateDocument` on change (debounced 500 ms). Manages pending suggestions: renders diff decorations via `diffDecorations.ts` and shows a floating Accept/Reject toolbar positioned dynamically relative to the suggestion range. Includes a tab bar to toggle between editor and Markdown preview modes.

### `ChatSidebar.tsx`

Provides the streaming chat interface and message history. Key details:

- Uses `@tanstack/react-virtual` to virtualise the message list for performance with long histories.
- Renders individual messages via `ChatItem.tsx`.
- Chat input supports `@`-mention autocomplete: typing `@` opens a document picker; selected documents appear as chip tokens resolved by `mentionUtils.ts` on submit.
- On desktop, the sidebar is collapsible via a toggle button in the header.

### `ChatItem.tsx`

Renders a single chat message, including:

- Streaming text deltas rendered via `MarkdownContent`.
- Thinking steps shown as collapsible "Thinking Process" panels.
- Tool call and tool result events displayed inline.

### `MarkdownContent.tsx`

Renders Markdown content with syntax highlighting. Used in both the editor's preview tab and the chat sidebar for agent responses. HTML output is sanitised to prevent XSS.

### `SettingsDialog.tsx`

Modal dialog for configuring user preferences:

- Google AI Studio API key input.
- Model selector (list of supported Gemini models).
- Theme toggle (light / dark).

### `SkillsDialog.tsx`

A dialog for creating, editing, and deleting custom skills.

### `App.tsx`

The main entry point:

- Manages global state (API key, selected model, active suggestions, "approve all" toggle, skills).
- Wires `EditorTools` and `WorkspaceTools` into the `ToolRegistry`, passing the Monaco editor ref and a snapshot ref of `WorkspacesContext.activeWorkspace.documents` respectively.
- Registers `WebMCPTools` for external browser agent access.
- Dynamically constructs `AgentConfig.systemInstructions`: appends skill names/descriptions and workspace tool guidance.
- Renders `WorkspacePicker` when no workspace is active, or the editor layout (`WorkspacePanel` + `EditorPanel` + `ChatSidebar`) when a workspace is open.
- Handles responsive layout (desktop collapsible split-pane vs. mobile bottom-sheet).

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

## React State Synchronization for Agent Tools

### The Problem

Agent tools execute as async JavaScript outside React's event loop. When a tool calls a React state setter (e.g., `setActiveDocumentId`), React schedules a re-render — it does **not** update state synchronously. The tool's Promise can resolve before React has committed the new state to the DOM.

For document-switching operations this creates a concrete bug: `switch_active_document` calls `setActiveDocumentId(id)` and returns. The agent immediately calls `read()` or `edit()`. But `EditorPanel` drives Monaco via two chained `useEffect` hooks (the first fires when `activeDocument` changes and calls `setLocalContent`; the second propagates `localContent` to the store as `editorContent`). Both effects are deferred until after the browser paints. Monaco therefore still holds the _previous_ document's content when the agent reads or edits it.

The same race applies to `create_document`: the newly created document is switched in by the workspace context, but Monaco doesn't reflect it until the effects run.

### The Fix: Eager Monaco Sync

After calling any state setter that changes the active document, immediately call `editorInstance.setValue(newContent)` on the Monaco instance. This is safe because:

1. `@monaco-editor/react` guards its controlled `value` prop: it calls `editor.setValue` only when the incoming prop differs from the current model value. Once we've set the model directly, the subsequent prop update from React's render cycle is a no-op.
2. Monaco's `onChange` fires synchronously from `setValue`. In `EditorPanel`, `handleChange` updates `localContent` and starts a debounced `updateDocument` save. By the time that debounce fires (500 ms), React has re-rendered and `activeDocument` refers to the new document — so the save targets the correct document.

### Rule for Future Tools

Any tool that changes the active document — whether by switching, creating, or any other mechanism — **must** call `setEditorValueFn(newContent)` after mutating React state. The canonical content to pass is the new document's `content` field from `docsRef`, or `""` for a newly created empty document. Do **not** rely on a `setTimeout` or `flushSync` to delay the Promise resolution; eagerly syncing Monaco is both more reliable and avoids artificial latency in the agent loop.

## Security

- API keys are handled purely on the client side and are not stored on any backend.
- Users are prompted to enter their Google AI Studio API key on first use.
- The API key is persisted in the browser's `localStorage` so the user does not have to re-enter it on subsequent visits.
- Markdown rendering output is HTML-sanitised to prevent XSS from untrusted document content.

## Implementation Details

- **Vite Configuration:**
  - Use `vite-plugin-monaco-editor` or configure `optimizeDeps` and `worker` settings to ensure Monaco's web workers are correctly bundled and loaded.
  - Ensure `process.env` or similar is handled if the Google SDK expects it (though we should pass the key directly).
- **Testing Strategy:** Use Vitest for unit testing adapters, tools, and state logic. Use React Testing Library for component rendering and interaction tests.
- **Error Handling:**
  - Graceful handling of API rate limits and invalid tool calls.
  - Catch and display LLM errors (e.g., safety filters) in the chat UI.
- **Styling:** Use Tailwind CSS for utility-first styling and `shadcn/ui` for complex components (e.g., Dialogs for Skills, workspace confirmation prompts).
- **Dark Mode:** Use Tailwind CSS's class-based dark mode strategy (`darkMode: 'class'` in `tailwind.config`). A `ThemeProvider` wraps the app and toggles a `dark` class on the `<html>` element. The Monaco editor theme switches between `vs` (light) and `vs-dark` (dark) in sync. The selected theme is persisted in `localStorage`.
- **Responsive Layout:** On screens narrower than the `md` breakpoint (768 px), the editor fills the screen and FABs open a bottom-sheet overlay for chat or the workspace panel. Touch targets must be at minimum 44 × 44 px. The Monaco editor renders in a flex-fill container so it uses available height without overflow.
