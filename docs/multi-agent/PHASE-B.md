# Phase B: Tool Registry Refactor

## Goal

Enforce the write access policy in code. All sub-agent creation sites use named registry builders; `delegate_to_skill` returns `ProposedEdit[]` instead of calling `edit`/`write` directly. No user-visible features — purely infrastructure.

---

## Context

Phase A delivered:

- `AgentRunnerFactory` + `DefaultAgentRunnerFactory`
- `DelegationTools.ts` with `invoke_agent` — sub-agents receive `"workspace_readonly"` tool group
- `delegate_to_skill` in `EditorTools.ts` — currently gives skills a **full read+write** registry (includes `edit`, `write`, `create_document`, `switch_active_document`)

The problem: skills can call `edit`/`write` directly, bypassing the Orchestrator's approval workflow context, and concurrent sub-agents could race on document state. Phase B fixes this structurally.

---

## What changes

### 1. `src/lib/tools/EditorTools.ts` — add `registerReadonlyEditorTools`

`registerEditorTools` registers all tools including `edit`, `write`, `request_switch_to_editor`. There is no read-only variant yet. Add one, following the same pattern as `registerReadonlyWorkspaceTools` in `WorkspaceTools.ts`:

```ts
export function registerReadonlyEditorTools(
  registry: ToolRegistry,
  tools: EditorTools,
): void;
```

Registers only: `read`, `read_selection`, `search`, `get_metadata`, `get_current_mode`. Does **not** register `edit`, `write`, or `request_switch_to_editor`.

---

### 2. `src/lib/tools/registries.ts` (new file)

Export the `ProposedEdit` interface, two named registry builder functions, and nothing else:

```ts
// Apache-2.0 license header required (all source files in this project carry it)

export interface ProposedEdit {
  originalText: string;
  replacementText: string;
  reason?: string;
}

export function buildReadonlyRegistry(
  editorTools: EditorTools,
  workspaceTools: WorkspaceTools,
): ToolRegistry;

export function buildReadWriteRegistry(
  editorTools: EditorTools,
  workspaceTools: WorkspaceTools,
): ToolRegistry;
```

**`buildReadonlyRegistry`** calls `registerReadonlyEditorTools` (new, see above) and `registerReadonlyWorkspaceTools`. Read-only tool names: `read`, `read_selection`, `search`, `get_metadata`, `get_current_mode`, `get_active_doc_info`, `list_workspace_docs`, `read_workspace_doc`, `query_workspace_doc`, `query_workspace`.

**`buildReadWriteRegistry`** calls `registerEditorTools` (all tools including `edit`, `write`, `request_switch_to_editor`) and `registerWorkspaceTools` (all tools including `create_document`, `rename_document`, `delete_document`, `switch_active_document`).

Note on `switch_active_document`: it mutates editor state (changes active doc, calls `setEditorValueFn`) without user approval. It belongs in the write registry despite not going through `applyWorkspaceAction`.

---

### 3. `src/lib/tools/EditorTools.ts` — update `createDelegateToSkillHandler`

- Replace the inline `childRegistry` construction (currently calls `registerEditorTools` giving skills full write access) with `buildReadonlyRegistry(editorTools, workspaceTools)`. The `workspaceTools` parameter becomes non-nullable (drop the `= null` default).
- Inject the output format instruction into `agentConfig.instructions`. Currently the code sets `instructions: skill.instructions`; change it to:

  ```ts
  const outputFormat =
    "\n\nOUTPUT FORMAT: Respond only with a JSON array of ProposedEdit objects:\n" +
    '[{ "originalText": "...", "replacementText": "...", "reason": "..." }]\n' +
    "If no changes are needed, return an empty array: []";

  const agentConfig: AgentConfig = {
    name: skill.name,
    instructions: skill.instructions + outputFormat,
    tools: [...readonlyToolNames],
  };
  ```

- The handler parses the skill's `done` event output as `ProposedEdit[]` and returns it as a JSON string. On parse failure, return an error string (e.g. `"Error: skill returned non-JSON response: ..."`).

- `ProposedEdit` is imported from `./registries` (not redeclared here).

---

### 4. `src/lib/tools/DelegationTools.ts`

**`buildRegistryForGroups`** is replaced by a call to `buildReadonlyRegistry`. The `"workspace_readonly"` string group remains supported for the `invoke_agent` API, but internally it now always routes through `buildReadonlyRegistry`.

`workspaceTools` is non-nullable here too — `registerDelegationTools` is always called with a real `WorkspaceTools` instance (see App.tsx). Drop the `| null` from its signature. Since `_editorTools` is currently unused (prefixed with `_`), pass it through to `buildReadonlyRegistry` so editor read tools are also available to `invoke_agent` sub-agents when needed in future phases. For now, only include them if an `"editor_readonly"` group is requested — keep the current behaviour for the existing test suite.

---

### 5. `src/App.tsx` — wire `buildReadWriteRegistry` and update `delegate_to_skill` description

Two changes in the `useMemo` that builds the runner (around line 390–428):

1. **Replace inline registry construction** with `buildReadWriteRegistry`:

   ```ts
   // Before:
   const registry = new ToolRegistry();
   registerEditorTools(registry, editorTools);
   registerWorkspaceTools(registry, workspaceTools);

   // After:
   const registry = buildReadWriteRegistry(editorTools, workspaceTools);
   ```

   `workspaceTools` is always a `WorkspaceTools` instance at this call site (constructed unconditionally in its own `useMemo`). `addAllBuiltInAITools`, `registerDelegationTools`, and the `delegate_to_skill` registration are appended to this registry after construction, unchanged.

2. **Update `delegate_to_skill` tool description** — currently says "The skill runs with its own instructions and can read and edit the document." Change to: "The skill runs with read-only access and returns a JSON array of ProposedEdit objects for the Orchestrator to apply."

---

### 6. `src/lib/agents/orchestrator.ts`

Extend `BASE_INSTRUCTIONS` to describe how `delegate_to_skill` results should be applied:

```
delegate_to_skill returns a JSON array of ProposedEdit objects. Apply each edit via your own edit() call so the user sees and approves each change.
```

---

## Files modified

| File                               | Change                                                                                                                                                                                              |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/tools/EditorTools.ts`     | Add `registerReadonlyEditorTools`; update `createDelegateToSkillHandler` to use `buildReadonlyRegistry`, inject output format into `agentConfig.instructions`, parse `ProposedEdit[]` from response |
| `src/lib/tools/DelegationTools.ts` | Replace `buildRegistryForGroups` body with `buildReadonlyRegistry` call                                                                                                                             |
| `src/lib/agents/orchestrator.ts`   | Extend `BASE_INSTRUCTIONS` with `delegate_to_skill` result-application instruction                                                                                                                  |
| `src/App.tsx`                      | Replace inline registry build with `buildReadWriteRegistry`; update `delegate_to_skill` tool description                                                                                            |

## Files created

| File                          | Purpose                                                                   |
| ----------------------------- | ------------------------------------------------------------------------- |
| `src/lib/tools/registries.ts` | Exports `ProposedEdit`, `buildReadonlyRegistry`, `buildReadWriteRegistry` |

---

## Tests

All tests live in `src/lib/tools/registries.test.ts` (new) and updates to `src/lib/tools/EditorTools.test.ts`.

### `registries.test.ts`

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
  ✓ wraps skill instructions with ProposedEdit JSON output format requirement
  ✓ returns JSON-serialised ProposedEdit[] parsed from skill's final response
  ✓ returns empty array when skill returns []
  ✓ returns error string when skill final response is not valid JSON
```

### `DelegationTools.test.ts` additions

```
invoke_agent (Phase B)
  ✓ existing tests still pass unchanged
  ✓ workspace_readonly group yields only read workspace tools (no create_document etc.)
```

---

## Step-by-step implementation order

1. Add `registerReadonlyEditorTools` to `src/lib/tools/EditorTools.ts`.
2. Create `src/lib/tools/registries.ts` — export `ProposedEdit`, `buildReadonlyRegistry`, `buildReadWriteRegistry`.
3. Write `src/lib/tools/registries.test.ts` — run tests, confirm they pass.
4. Update `createDelegateToSkillHandler` in `EditorTools.ts` — use `buildReadonlyRegistry`, inject output format into `agentConfig.instructions`, parse `ProposedEdit[]` from response, import `ProposedEdit` from `./registries`.
5. Update `EditorTools.test.ts` with Phase B cases — run tests.
6. Update `DelegationTools.ts` — replace `buildRegistryForGroups` body with `buildReadonlyRegistry` call.
7. Update `DelegationTools.test.ts` — add workspace write-tool exclusion assertion.
8. Update `orchestrator.ts` — extend `BASE_INSTRUCTIONS`.
9. Update `App.tsx` — replace inline `new ToolRegistry()` + `registerEditorTools` + `registerWorkspaceTools` with `buildReadWriteRegistry`; update `delegate_to_skill` description.
10. Run `npm run lint && npm run format && npm run test` — all green.

---

## Working state

After Phase B:

- Skills are structurally read-only. No code path can give a skill `edit` or `write`.
- `delegate_to_skill` returns `ProposedEdit[]`; the Orchestrator applies each via `edit()`, preserving the approval workflow.
- `invoke_agent` sub-agents remain read-only via `buildReadonlyRegistry`.
- The Orchestrator remains the sole writer, making Phase G's parallel fan-out safe by construction.
