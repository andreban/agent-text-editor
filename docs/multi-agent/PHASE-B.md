# Phase B: Tool Registry Refactor ✅

## Goal

Enforce the write access policy in code. All sub-agent creation sites use named registry builders; skills receive a read-only registry and return their response as a plain string for the Orchestrator to act on. No user-visible features — purely infrastructure.

---

## Context

Phase A delivered:

- `AgentRunnerFactory` + `DefaultAgentRunnerFactory`
- `DelegationTools.ts` with `invoke_agent` — sub-agents receive `"workspace_readonly"` tool group
- `delegate_to_skill` in `EditorTools.ts` — gave skills a **full read+write** registry (includes `edit`, `write`, `create_document`, `switch_active_document`)

The problem: skills could call `edit`/`write` directly, bypassing the Orchestrator's approval workflow, and concurrent sub-agents could race on document state. Phase B fixes this structurally.

---

## What changed

### 1. `src/lib/tools/EditorTools.ts` — `registerReadonlyEditorTools`

Added `registerReadonlyEditorTools`, following the same pattern as `registerReadonlyWorkspaceTools`. `registerEditorTools` now calls it internally to eliminate duplication.

Registers only: `read`, `read_selection`, `search`, `get_metadata`, `get_current_mode`. Does **not** register `edit`, `write`, or `request_switch_to_editor`.

---

### 2. `src/lib/tools/WorkspaceTools.ts` — deduplication

`registerWorkspaceTools` now calls `registerReadonlyWorkspaceTools` first, then adds the four write tools (`create_document`, `rename_document`, `delete_document`, `switch_active_document`). The read-only registrations are no longer duplicated between the two functions.

---

### 3. `src/lib/tools/registries.ts` (new file)

Exports two named registry builder functions:

```ts
export function buildReadonlyRegistry(
  editorTools: EditorTools,
  workspaceTools: WorkspaceTools,
): ToolRegistry;

export function buildReadWriteRegistry(
  editorTools: EditorTools,
  workspaceTools: WorkspaceTools,
): ToolRegistry;
```

**`buildReadonlyRegistry`** — calls `registerReadonlyEditorTools` and `registerReadonlyWorkspaceTools`. Read-only tool names: `read`, `read_selection`, `search`, `get_metadata`, `get_current_mode`, `get_active_doc_info`, `list_workspace_docs`, `read_workspace_doc`, `query_workspace_doc`, `query_workspace`.

**`buildReadWriteRegistry`** — calls `registerEditorTools` and `registerWorkspaceTools`. Adds `edit`, `write`, `request_switch_to_editor`, `create_document`, `rename_document`, `delete_document`, `switch_active_document`.

---

### 4. `src/lib/tools/EditorTools.ts` — `createDelegateToSkillHandler`

- Replaced the inline `childRegistry` construction with `buildReadonlyRegistry(editorTools, workspaceTools)`. The `workspaceTools` parameter is now non-nullable.
- Skills receive `skill.instructions` unchanged — no output format is injected.
- The handler returns `event.output` directly as a plain string.

The Orchestrator receives the skill's response as a string and decides what to do: apply edits via `edit()`, present a summary, ask follow-up questions, etc. Keeping the output flexible lets skills return whatever is natural — a proofreader lists corrections, a summarizer returns prose, a skill author returns a definition — without forcing a rigid contract on all of them.

---

### 5. `src/lib/tools/DelegationTools.ts`

Replaced `buildRegistryForGroups` with a direct call to `buildReadonlyRegistry` when `"workspace_readonly"` is requested; falls back to an empty `ToolRegistry` when no groups are given. `workspaceTools` and `editorTools` parameters are now non-nullable.

---

### 6. `src/lib/agents/orchestrator.ts`

Updated `BASE_INSTRUCTIONS` to describe the flexible contract:

> `delegate_to_skill` returns the skill's response as a string — interpret it and decide what to do: apply edits via `edit()`, present a summary, ask follow-up questions, etc.

---

### 7. `src/App.tsx`

- Replaced inline `new ToolRegistry()` + `registerEditorTools` + `registerWorkspaceTools` with `buildReadWriteRegistry(editorTools, workspaceTools)`.
- Updated `delegate_to_skill` tool description to say the skill runs with read-only access and returns its response as a string.

---

### 8. `src/lib/skills.ts` — default skill instructions

Default skill instructions updated to be natural — no output format constraints. Skills describe their findings; the Orchestrator decides how to act on them:

- **Proofreader** — lists errors and the exact correction needed.
- **Summarizer** — returns a prose summary; no edits.
- **Markdown Formatter** — lists formatting issues and the exact fix needed.
- **Create Skill** — returns a complete skill definition as its response.

---

## Files modified

| File | Change |
| --- | --- |
| `src/lib/tools/EditorTools.ts` | Add `registerReadonlyEditorTools`; update `createDelegateToSkillHandler` to use `buildReadonlyRegistry` and return raw string output |
| `src/lib/tools/WorkspaceTools.ts` | `registerWorkspaceTools` calls `registerReadonlyWorkspaceTools` to eliminate duplication |
| `src/lib/tools/DelegationTools.ts` | Replace `buildRegistryForGroups` with `buildReadonlyRegistry`; non-nullable params |
| `src/lib/agents/orchestrator.ts` | Update `BASE_INSTRUCTIONS` for flexible skill response handling |
| `src/App.tsx` | Replace inline registry build with `buildReadWriteRegistry`; update `delegate_to_skill` description |
| `src/lib/skills.ts` | Update default skill instructions to be natural, no output format constraints |

## Files created

| File | Purpose |
| --- | --- |
| `src/lib/tools/registries.ts` | Exports `buildReadonlyRegistry`, `buildReadWriteRegistry` |

---

## Tests

### `registries.test.ts` (new)

```
buildReadonlyRegistry
  ✓ includes read, read_selection, search, get_metadata, get_current_mode
  ✓ excludes edit, write, request_switch_to_editor
  ✓ includes workspace read tools (get_active_doc_info, list_workspace_docs, read_workspace_doc, query_workspace_doc, query_workspace)
  ✓ excludes workspace write tools (create_document, rename_document, delete_document, switch_active_document)

buildReadWriteRegistry
  ✓ includes all read-only tools
  ✓ includes edit, write, request_switch_to_editor
  ✓ includes workspace write tools (create_document, rename_document, delete_document, switch_active_document)
```

### `EditorTools.test.ts` additions

```
createDelegateToSkillHandler (Phase B)
  ✓ gives skill a read-only registry (no edit, no write tool registered)
  ✓ gives skill read-only workspace tools (no create_document, switch_active_document)
  ✓ calls runBuilder with skill instructions and returns raw output
```

### `DelegationTools.test.ts` additions

```
invoke_agent (Phase B)
  ✓ workspace_readonly group yields only read workspace tools (no create_document etc.)
```

---

## Working state

- Skills are structurally read-only. No code path can give a skill `edit` or `write`.
- `delegate_to_skill` returns the skill's raw string response. The Orchestrator interprets it and acts accordingly.
- `invoke_agent` sub-agents remain read-only via `buildReadonlyRegistry`.
- The Orchestrator is the sole writer, making Phase G's parallel fan-out safe by construction.
