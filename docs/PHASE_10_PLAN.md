# Phase 10 Implementation Plan: Supporting Documents Workspace

## Goal

Give users a place to store reference notes (character sheets, style guides, outlines, research) and give the agent tools to query them without loading every document into the context window.

---

## Architecture overview

```
localStorage["supporting_docs"]  →  SupportingDocsContext
│   list: [{ id, title, content }]
│   exposes: docs, addDoc, updateDoc, deleteDoc
│
├── Sidebar "Reference" tab
│   ├── DocList — title + delete button per entry
│   ├── DocEditor — inline title + Monaco/textarea for editing content
│   └── "New Document" button
│
└── Tool Registry
    ├── list_supporting_docs   → returns [{id, title}] only
    ├── read_supporting_doc    → returns full content of one doc by ID
    ├── query_supporting_doc   → queries a single doc; sub-agent reads
                                  the doc and returns a focused summary
    └── query_supporting_docs  → calls query_supporting_doc for each doc,
                                  then a synthesizer agent combines the
                                  summaries into one answer
```

---

## Key design decision: sub-agent delegation for doc queries

The naive implementation would return all document content to the main agent. For a workspace with several large notes this floods the context with irrelevant material.

There are two layers of sub-agent delegation:

1. **`query_supporting_doc` (singular)** — given a doc ID and a query, spins up a sub-agent that reads the single document and returns a focused summary of what's relevant to the query.
2. **`query_supporting_docs` (plural)** — calls `list_supporting_docs` to enumerate all docs, then calls `query_supporting_doc` for each one (collecting per-doc summaries), and finally passes all summaries to a synthesizer sub-agent that produces a single coherent answer.

```
Main agent
  → calls query_supporting_docs(query="what are the traits of character X?")
       │
       ├─ calls list_supporting_docs()  →  [{id: "1", title: "Character Notes"}, ...]
       │
       ├─ calls query_supporting_doc(id="1", query="...")
       │     └─ Doc sub-agent: reads doc, returns "Character X is brave and..."
       │
       ├─ calls query_supporting_doc(id="2", query="...")
       │     └─ Doc sub-agent: reads doc, returns "No relevant info found."
       │
       └─ Synthesizer sub-agent
              input: query + all per-doc summaries
              returns: "Based on your notes, character X is..."
  ← tool result: "Based on your notes, character X is..."
```

All sub-agents use `gemini-2.5-flash` — they are retrieval utilities, not creative engines.

Sub-agent creation should be injected via a factory parameter so tests can mock it without hitting the real API.

This mirrors the `delegate_to_skill` pattern from Phase 8, with sub-agents created dynamically by the tool rather than being user-defined.

---

## Data model

```ts
interface SupportingDoc {
  id: string;        // crypto.randomUUID()
  title: string;
  content: string;   // raw markdown
  updatedAt: number; // Date.now()
}
```

Stored as `JSON.stringify(SupportingDoc[])` under the key `"supporting_docs"` in `localStorage`.

---

## Tool definitions

### `list_supporting_docs`

- **Input:** none
- **Output:** `{ docs: Array<{ id: string; title: string }> }`
- Returns titles only — no content.

### `read_supporting_doc`

- **Input:** `id: string`
- **Output:** `{ title: string; content: string }` or `{ error: "Document not found" }`
- Returns the full raw content of a single doc.

### `query_supporting_doc`

- **Input:** `id: string`, `query: string`
- **Output:** `{ summary: string }` or `{ error: "Document not found" }`
- Spins up a short-lived `AgentRunner` with the doc content and the query; returns a focused summary of what's relevant.

### `query_supporting_docs`

- **Input:** `query: string`
- **Output:** `{ answer: string }` — synthesized across all docs
- Calls `list_supporting_docs`, then `query_supporting_doc` for each doc, then passes the collected summaries to a synthesizer `AgentRunner` that returns a single coherent answer.

---

## UI: Reference tab

The sidebar gains a third tab alongside Chat and Settings.

```
[ Chat ]  [ Settings ]  [ Reference ]
                              │
                    ┌─────────┴──────────┐
                    │  + New Document    │
                    ├────────────────────┤
                    │ > Character Notes  │ ✕
                    │   Style Guide      │ ✕
                    │   Outline          │ ✕
                    └────────────────────┘
                    (click to expand inline editor)
```

Selecting a doc expands an inline editor showing the title (editable `<input>`) and content (Monaco editor in markdown mode). Changes are auto-saved to `localStorage` on debounce (500 ms).

---

## State management

Add `SupportingDocsContext` (separate from `AppState`) following the same pattern as `ThemeProvider`:

```ts
// src/lib/SupportingDocsContext.tsx
const SupportingDocsContext = createContext<SupportingDocsContextValue>(...)

export function SupportingDocsProvider({ children }) {
  const [docs, setDocs] = useState<SupportingDoc[]>(() =>
    JSON.parse(localStorage.getItem("supporting_docs") ?? "[]")
  );
  // persist on change
  useEffect(() => {
    localStorage.setItem("supporting_docs", JSON.stringify(docs));
  }, [docs]);
  // addDoc, updateDoc, deleteDoc helpers ...
}
```

Tools receive a snapshot of `docs` at call time via a ref passed from `App.tsx`, same pattern as `EditorTools.ts` receiving the Monaco editor ref.

---

## Subphases

### Phase 10a: Docs UI

**Goal:** Users can manage supporting documents in the sidebar. No agent tools yet.

- Add `SupportingDoc` type and `SupportingDocsContext` with localStorage persistence.
- Wrap the app with `SupportingDocsProvider` in `App.tsx`.
- Build `ReferenceTab` component: doc list with add/delete, inline title + content editor, auto-save on debounce.
- Add "Reference" tab to `ChatSidebar`.

**Files:** `src/lib/SupportingDocsContext.tsx` (new), `src/components/ReferenceTab.tsx` (new), `src/components/ChatSidebar.tsx`, `src/App.tsx`

**Tests:** `SupportingDocsContext` CRUD, localStorage persistence, empty initial state; `ReferenceTab` renders list, add/delete interactions, auto-save debounce.

**Working state:** The user can create, edit, and delete reference documents in the "Reference" sidebar tab. Documents survive a page reload.

---

### Phase 10b: Basic read tools

**Goal:** The agent can enumerate and read documents directly.

- Register `list_supporting_docs` and `read_supporting_doc` in a new `SupportingDocTools.ts`.
- Wire the tools in `App.tsx`, passing the docs ref.

**Files:** `src/lib/SupportingDocTools.ts` (new), `src/App.tsx`

**Tests:** `list_supporting_docs` returns titles only; `read_supporting_doc` returns content for a valid ID and error for unknown.

**Working state:** The agent can be asked "what reference documents do I have?" or "read my style guide" and successfully use the tools.

---

### Phase 10c: Single-doc query

**Goal:** The agent can ask a focused question about a specific document without the full content entering the main context.

- Implement `query_supporting_doc` in `SupportingDocTools.ts`: looks up the doc, creates a short-lived `AgentRunner`, returns the focused summary.
- Inject the `AgentRunner` factory as a parameter for testability.

**Files:** `src/lib/SupportingDocTools.ts`

**Tests:** `query_supporting_doc` creates a child `AgentRunner` with the doc content and query, returns its text response; error returned for unknown ID; factory injection allows mocking.

**Working state:** The agent can be asked "what does my character sheet say about the antagonist?" and retrieve a concise summary without the raw doc appearing in its context.

---

### Phase 10d: Multi-doc synthesis

**Goal:** The agent can query across the entire workspace in a single tool call.

- Implement `query_supporting_docs` in `SupportingDocTools.ts`: calls `list_supporting_docs`, then `query_supporting_doc` for each doc, then feeds the summaries to a synthesizer `AgentRunner`.

**Files:** `src/lib/SupportingDocTools.ts`

**Tests:** `query_supporting_docs` calls `query_supporting_doc` for each doc, passes summaries to a synthesizer sub-agent, returns the final answer.

**Working state:** The agent can be asked "check all my notes for anything relevant to character X" and return a synthesized answer drawn from every document in the workspace.

---

## Open questions

1. **Streaming sub-agent answers** — The sub-agent response could stream back to `ChatSidebar` as a collapsible "Reading reference docs…" block, similar to how thinking chunks are displayed. Worth doing if the latency is noticeable.
2. **Doc size limit** — Should we warn the user if a doc exceeds a token threshold (e.g. ~50 k chars) where even the sub-agent would struggle?
3. **Parallelism in `query_supporting_docs`** — The per-doc `query_supporting_doc` calls could be issued in parallel rather than sequentially. Worth exploring if latency on large workspaces is noticeable.
