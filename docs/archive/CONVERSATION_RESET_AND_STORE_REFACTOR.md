# Conversation Reset Bug & Store Decoupling Plan

## Problem

The main agent conversation resets to a blank slate on every message (and even on every
keystroke). The agent has no memory of what was said earlier in the session.

### Root Cause — Cascade Recreation

The bug is a chain of `useMemo` dependencies in `App.tsx`:

```
editorContent (changes on every keystroke)
  → editorTools (useMemo dep: editorContent)
      → runner   (useMemo dep: editorTools)
          → conversation (useMemo dep: runner)
```

1. **`editorTools`** lists `editorContent` and `activeTab` as `useMemo` dependencies.
   Those values are only read inside tool call callbacks, not at memo creation time, so
   they don't need to be deps — but as reactive state they trigger a full recreation on
   every keystroke.

2. **`runner`** lists `editorTools` as a dep. When `editorTools` is replaced, `runner`
   is replaced.

3. **`conversation`** lists `runner` and `activeWorkspaceId` as deps. When `runner` is
   replaced the `Conversation` object is discarded and a new one is created, erasing all
   history. The `activeWorkspaceId` dep means switching workspaces also resets history.

### Secondary Cause — Monolithic Store

`store.tsx` puts all application state into a single React context:

| State slice                                                                         | Change frequency       |
| ----------------------------------------------------------------------------------- | ---------------------- |
| `editorInstance`                                                                    | Once (editor mounts)   |
| `apiKey`, `modelName`, `skills`                                                     | Rarely (user settings) |
| `editorContent`                                                                     | Every keystroke        |
| `activeTab`                                                                         | On tab switch          |
| `suggestions`, `pendingTabSwitchRequest`, `pendingWorkspaceAction`, `workflowState` | Per agent turn         |
| `approveAll`, `totalTokens`                                                         | Occasionally           |

Every keystroke triggers a re-render of every consumer of `useApp()`. More critically,
anything in this single context can accidentally land in a `useMemo` dependency array and
cause expensive object recreation.

---

## Fixes

### Fix 1 — Pass Ref Objects to Tools Instead of Getter Closures

`editorContent`, `activeTab`, `editorInstance`, and `approveAll` are only read inside
`EditorTools` and `WorkspaceTools` callbacks — they are never needed at memo creation
time. The naive fix is to create getter closures `() => ref.current` inside `useMemo`,
but the `react-hooks/refs` ESLint rule flags any `.current` access in render-phase code
(including inside arrow functions defined in `useMemo`), because the linter can't tell
the difference between reading a ref _during_ render vs. creating a closure that _will_
read it later.

**The correct approach**: change `EditorTools` and `WorkspaceTools` constructors to
accept ref-like objects (`{ current: X }`) directly. Class methods read `.current` when
they execute — in tool call handlers, well outside the React render phase — which the
linter permits.

```typescript
// EditorTools constructor (before → after)
// Before: getEditor: () => editor | null
// After:  editorRef: { current: editor | null }

// In App.tsx — no .current access during render:
const editorTools = useMemo(
  () =>
    new EditorTools(
      editorInstanceRef, // the ref object itself
      setSuggestions,
      approveAllRef,
      editorContentRef,
      activeTabRef,
      requestTabSwitchFn,
    ),
  [setSuggestions, requestTabSwitchFn],
);
```

The same pattern applies to `WorkspaceTools`. Because `getEditorContent` and
`setEditorValueFn` were getter/setter pairs that both needed the editor instance, they
are replaced by a single `editorRef` (plus a `editorContentRef` fallback):

```typescript
// WorkspaceTools constructor (before → after)
// Before: getEditorContent: () => string, setEditorValueFn: (v: string) => void
// After:  editorRef: { current: { getValue(): string; setValue(v: string): void } | null }
//         editorContentRef: { current: string }
```

**Files changed:** `EditorTools.ts`, `WorkspaceTools.ts`, `App.tsx`, all related test
files.

### Fix 2 — Stabilize the `conversation` Object

Remove `activeWorkspaceId` from the `conversation` `useMemo` dependencies. The
conversation should survive workspace switches — workspace context reaches the agent
through tool results and system-prompt text, not through conversation identity.

If a workspace switch must reset the conversation, do it explicitly (e.g., call a
`reset()` method or recreate on a button press) rather than implicitly via a dep.

### Fix 3 — Split the Store

Divide `AppContext` into two separate contexts by change frequency:

**`AgentConfigContext`** — changes infrequently; triggers `runner`/`conversation`
recreation only when truly necessary:

- `apiKey`, `setApiKey`
- `modelName`, `setModelName`
- `skills`, `setSkills`
- `totalTokens`, `setTotalTokens`

**`EditorUIContext`** — high-frequency UI state that should never appear in agent
construction deps:

- `editorInstance`, `setEditorInstance`
- `editorContent`, `setEditorContent`
- `activeTab`, `setActiveTab`
- `suggestions`, `setSuggestions`
- `pendingTabSwitchRequest`, `setPendingTabSwitchRequest`
- `pendingWorkspaceAction`, `setPendingWorkspaceAction`
- `approveAll`, `setApproveAll`
- `workflowState`, `setWorkflowState`

A combined `useApp()` hook (merging both contexts) is retained for backward
compatibility. Components that only need one slice should use `useAgentConfig()` or
`useEditorUI()` directly to avoid unnecessary re-renders.

---

## Implementation Order

1. **Fix 2** — remove `activeWorkspaceId` from `conversation` deps. One-liner.
2. **Fix 1** — change `EditorTools`/`WorkspaceTools` constructors to accept ref objects;
   update `App.tsx` to pass refs directly. Breaks the cascade and fixes the reset bug.
3. **Fix 3** — split the store. More invasive but structurally enforces the invariant
   that agent construction deps never include high-frequency UI state.
