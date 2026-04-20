# Workspaces Plan

## Goal

Replace the current single-document editor model with a **workspace** — a persistent, named collection of documents. The user can create, open, and delete workspaces. Within a workspace, any document can be opened in the Monaco editor, and every document is available to the agent (list, read, query). This renders the "supporting documents" concept (Phase 10) obsolete and supersedes Phases 10b–10d.

---

## Motivation

The current design has two broken assumptions:

| Current                       | Problem                                                    |
| ----------------------------- | ---------------------------------------------------------- |
| `AppState.editorContent`      | Ephemeral — lost on page reload. Only one document exists. |
| `SupportingDocsContext` (10a) | Persistent, but second-class "reference" — not editable.   |

A workspace collapses these into a single model: all documents are peers, any can be edited, all persist, and multiple independent workspaces can be created and switched between.

---

## Data model

```ts
interface WorkspaceDocument {
  id: string; // crypto.randomUUID()
  title: string;
  content: string; // raw text / markdown
  updatedAt: number; // Date.now()
}

interface WorkspaceMeta {
  id: string; // crypto.randomUUID()
  name: string;
  createdAt: number;
  updatedAt: number;
}

interface WorkspaceData {
  documents: WorkspaceDocument[];
  activeDocumentId: string | null;
}
```

`localStorage` layout — workspaces are stored separately to keep the index small and avoid loading all document content on start:

| Key                   | Value                                  |
| --------------------- | -------------------------------------- |
| `workspaces_index`    | `JSON.stringify(WorkspaceMeta[])`      |
| `workspace_{id}`      | `JSON.stringify(WorkspaceData)`        |
| `active_workspace_id` | the ID of the currently open workspace |

---

## Architecture

```
WorkspacesContext  (global)
│   index: WorkspaceMeta[]           — all workspace names/IDs
│   activeWorkspaceId: string | null
│   activeWorkspace: WorkspaceData | null   (loaded on demand)
│   activeDocument: WorkspaceDocument | null  (derived)
│
│   createWorkspace(name) → WorkspaceMeta
│   openWorkspace(id)
│   deleteWorkspace(id)
│
│   addDocument()
│   updateDocument(id, patch)
│   deleteDocument(id)
│   setActiveDocumentId(id)
│
├── WorkspacePicker  (shown when no active workspace)
│   ├── List of workspaces — name, last modified, open / delete
│   └── "New Workspace" button → name prompt → creates and opens
│
├── Editor view  (shown when a workspace is active)
│   ├── Header — workspace name + "Switch Workspace" button
│   ├── Left drawer: WorkspacePanel
│   │   ├── Document list — title, active indicator, rename, delete
│   │   └── "New Document" button
│   ├── EditorPanel — bound to activeDocument.content
│   └── Right sidebar: ChatSidebar
│
└── Agent Tool Registry (scoped to activeWorkspace)
    ├── list_workspace_docs   → [{ id, title }]
    ├── read_workspace_doc    → { title, content } | { error }
    ├── query_workspace_doc   → { summary } via sub-agent
    └── query_workspace       → { answer }  synthesized via sub-agents
```

---

## Migration from current state

On first load after deployment (when `workspaces_index` does not exist):

1. Create a default workspace named `"My Workspace"`.
2. Read `localStorage["supporting_docs"]` (Phase 10a data); import each entry as a `WorkspaceDocument` in that workspace.
3. Create one additional `WorkspaceDocument` titled `"Untitled Document"` with empty content, set as `activeDocumentId`.
4. Delete `localStorage["supporting_docs"]`.
5. Set `active_workspace_id` to the new workspace's ID so the user lands directly in the editor.

If `workspaces_index` already exists, skip migration entirely.

---

## Subphases

### ✅ Phase 11a: Data model & context

**Goal:** Establish the multi-workspace data model. The app continues to work as before (single implicit workspace), but data is now persisted correctly.

**Tasks:**

- Define `WorkspaceMeta`, `WorkspaceDocument`, `WorkspaceData` types in `src/lib/workspace.ts`.
- Create `WorkspacesContext` (`src/lib/WorkspacesContext.tsx`):
  - Reads `workspaces_index` and `active_workspace_id` from localStorage on init.
  - Loads `workspace_{id}` on demand when the active workspace changes.
  - Exposes `createWorkspace`, `openWorkspace`, `deleteWorkspace`, `addDocument`, `updateDocument`, `deleteDocument`, `setActiveDocumentId`.
  - Persists index and workspace data on every mutation.
  - Runs migration from `supporting_docs` on first load.
- Wrap the app with `WorkspacesProvider` in `main.tsx` or `App.tsx`.
- Replace `AppState.editorContent` / `setEditorContent` with reads/writes on `activeDocument.content` via `WorkspacesContext`. Remove those fields from `AppState`.
- Update `EditorPanel.tsx` to read initial content from `activeDocument.content` and call `updateDocument` on change (debounced 500 ms).
- Remove `SupportingDocsContext` and its provider.
- Update `ReferenceTab.tsx` to read from `WorkspacesContext` instead of `SupportingDocsContext` (minimal change; full UI redesign in Phase 11b/11c).

**Files:** `src/lib/workspace.ts` (new), `src/lib/WorkspacesContext.tsx` (new, replaces `SupportingDocsContext.tsx`), `src/components/EditorPanel.tsx`, `src/lib/store.tsx`, `src/components/ReferenceTab.tsx`, `src/App.tsx` / `src/main.tsx`

**Tests:**

- `WorkspacesContext`: create/open/delete workspace, document CRUD within a workspace, localStorage persistence, migration from `supporting_docs`, empty initial state.
- `EditorPanel`: content initialised from `activeDocument`, `updateDocument` called on editor change.

**Working state:** The editor reads/writes the active workspace document. Documents survive page reload. Existing supporting docs are migrated into the default workspace. The Reference drawer still renders (minimally updated to use the new context).

---

### ✅ Phase 11b: Workspace picker

**Goal:** The user can create, open, and delete workspaces via a dedicated UI.

**Tasks:**

- Create `WorkspacePicker` component (`src/components/WorkspacePicker.tsx`):
  - Shows the list of workspaces: name, last-modified date, **Open** button, **Rename** button (inline edit or prompt), **Delete** button (with confirmation dialog — deletes the workspace and all its documents).
  - **New Workspace** button: prompts for a name, creates the workspace, and opens it.
  - Shown full-screen when `activeWorkspaceId` is `null` (e.g. all workspaces deleted, or future sign-in flow).
  - Add `renameWorkspace(id, newName)` to `WorkspacesContext`.
- Add a **Switch Workspace** affordance in the editor view header (a small button next to the workspace name) that closes the current workspace (sets `activeWorkspaceId = null`) and shows `WorkspacePicker`.
- Show workspace name in the header bar when a workspace is open.
- Handle the edge case of deleting the currently active workspace: close it and show `WorkspacePicker`.

**Files:** `src/components/WorkspacePicker.tsx` (new), `src/App.tsx`

**Tests:**

- `WorkspacePicker`: renders workspace list, create interaction, open sets active workspace, rename updates the name in the index, delete with confirmation removes it from index.
- Edge: deleting the last workspace leaves `activeWorkspaceId` null.

**Working state:** Users can create named workspaces, switch between them, and delete them. The editor view shows the workspace name and provides a way to return to the picker.

---

### Phase 11c: Document navigator

**Goal:** The left drawer becomes a first-class document navigator for the active workspace.

**Tasks:**

- Replace `ReferenceTab.tsx` with `WorkspacePanel.tsx` (`src/components/WorkspacePanel.tsx`):
  - Lists all documents in the active workspace.
  - Active document is highlighted.
  - Click to open a document (sets `activeDocumentId`).
  - Inline rename on double-click (or small edit icon).
  - Delete button per document (with confirmation if document has content).
  - **New Document** button: creates `"Untitled Document"`, activates it.
  - Drawer header shows the workspace name (read-only — rename goes via a future workspace settings screen).
- Update `App.tsx` `DesktopLayout` and `MobileLayout` to use `WorkspacePanel` in place of `ReferenceTab`.

**Files:** `src/components/WorkspacePanel.tsx` (replaces `ReferenceTab.tsx`), `src/App.tsx`

**Tests:**

- `WorkspacePanel`: renders doc list, create/delete/rename interactions, clicking a doc sets `activeDocumentId`.

**Working state:** Users can create multiple documents within a workspace, switch between them, rename and delete them. The Monaco editor always shows the active document's content.

---

### Phase 11d: Agent workspace tools

**Goal:** The agent can list, read, and query any document in the active workspace.

This phase supersedes Phases 10b, 10c, and 10d from the original Phase 10 plan.

**Tasks:**

- Create `src/lib/WorkspaceTools.ts` with four tools scoped to the active workspace:
  - `list_workspace_docs` — returns `[{ id, title }]` (no content).
  - `read_workspace_doc(id)` — returns `{ title, content }` or `{ error: "Document not found" }`.
  - `query_workspace_doc(id, query)` — spins up a short-lived sub-agent (`gemini-2.5-flash`) with the doc content and query; returns `{ summary }`. Sub-agent factory is injected for testability.
  - `query_workspace(query)` — calls `list_workspace_docs`, then `query_workspace_doc` per doc, passes all summaries to a synthesizer sub-agent; returns `{ answer }`.
- Wire tools in `App.tsx`, passing a `docsRef` snapshot of the active workspace's `documents`.
- Update `BASE_INSTRUCTIONS` in `App.tsx` and the agent `tools` array to include the four workspace tools.

**Files:** `src/lib/WorkspaceTools.ts` (new), `src/App.tsx`

**Tests:**

- `list_workspace_docs` returns `id` and `title` only.
- `read_workspace_doc` returns content for a valid ID, error for unknown.
- `query_workspace_doc` creates a child `AgentRunner` with doc content + query; factory injection allows mocking.
- `query_workspace` calls `query_workspace_doc` per doc, passes summaries to synthesizer, returns final answer.

**Working state:** The agent can list, read, and semantically query any document in the current workspace.

---

## Decisions

1. **Workspace rename** — Renaming is supported. Inline rename in `WorkspacePicker` (double-click on name or a pencil icon). The `WorkspacePanel` header can show the name but rename is initiated from the picker to keep one canonical place for workspace-level operations.
2. **Active document across workspace switches** — Restoring the last active document is the default. `activeDocumentId` is persisted inside `workspace_{id}`, so reopening a workspace automatically returns to where the user left off.
3. **Parallel sub-agent queries** — Deferred. `query_workspace` will call `query_workspace_doc` sequentially for now; parallelism can be added later if latency on large workspaces is noticeable.
4. **Document size warning** — Deferred. Can be added to `WorkspacePanel` later if needed.
5. **`read()` scope** — `read()`, `edit()`, and `write()` all operate exclusively on the open document, keeping the three tools symmetric. To access other documents the agent uses the workspace tools (`list_workspace_docs`, `read_workspace_doc`, etc.). No change to the existing editor tools.

---

## Impact on Phase 10

| Phase 10 subphase        | Status after Workspaces plan                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------- |
| 10a: Docs UI             | ✅ Complete — data migrated into `WorkspacesContext` (11a); UI replaced by `WorkspacePanel` (11c) |
| 10b: Basic read tools    | Superseded by `list_workspace_docs` + `read_workspace_doc` in Phase 11d                           |
| 10c: Single-doc query    | Superseded by `query_workspace_doc` in Phase 11d                                                  |
| 10d: Multi-doc synthesis | Superseded by `query_workspace` in Phase 11d                                                      |
