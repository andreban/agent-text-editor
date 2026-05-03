# Plan: Word-Level Diff Decorations (Option A)

## Context

The current decoration system highlights the entire `originalText` span with a red strikethrough and appends the entire `replacementText` as a single green blob via an `after` decoration. This makes it hard to see exactly which words changed.

This plan replaces that with a character-level diff (using `diff-match-patch`) that highlights only the changed characters — deleted words in red strikethrough, inserted words in green ghost text — identical in visual quality to Monaco's own inline diff editor, but without the lifecycle problems that come with mounting a `DiffEditor` component.

See `INLINE_DIFF_EDITOR_PLAN.md` for the full write-up on why `DiffEditor` was abandoned.

---

## Current State (starting point for this plan)

### `src/lib/store.tsx`

`Suggestion` is clean:

```ts
export interface Suggestion {
  id: string;
  originalText: string;
  replacementText: string;
  status: "pending" | "accepted" | "rejected";
  range: monaco.IRange;
  resolve: (value: string) => void;
}
```

No changes needed to `store.tsx`.

### `src/lib/EditorTools.ts`

`edit()` and `write()` are clean — no offset computation, no document snapshot fields. No changes needed.

### `src/components/EditorPanel.tsx`

Uses the old decoration system:

- `decorationsRef` typed as `useRef<string[]>([])` — holds IDs from `deltaDecorations` (deprecated API).
- `contentWidgetsRef` — a `Map<string, monaco.editor.IContentWidget>` that manages per-suggestion Accept/Reject popup widgets positioned inside the editor.
- `suggestionNodes` state — `{ id, node }[]` for React portals that render `SuggestionWidget` into each content widget's DOM node.
- The decoration effect maps each pending suggestion to a single decoration that strikes through the entire `originalText` range and appends the entire `replacementText` as `after` content.
- `handleAccept` correctly uses `model.pushEditOperations`.
- `handleReject` is correct.

### `src/components/SuggestionWidget.tsx`

Exists. Renders the icon-only Accept/Reject buttons (Check/X icons) that appear as floating content widgets inside the editor. Will be **deleted** — replaced by a simpler toolbar overlay in the EditorPanel JSX.

### `src/index.css`

Has `.suggestion-original` (red strikethrough on entire original span) and `.suggestion-new` (green color on entire replacement blob). These will be replaced with per-character decoration classes.

### `src/test/setup.ts`

Monaco mock has `IContentWidget` and `ContentWidgetPositionPreference` (used by the content widget system). The `Editor` mock does not call `onMount`, so `editorInstance` is always null in tests.

### `src/components/EditorPanel.test.tsx`

Has three `describe` blocks:

1. `"EditorPanel"` — basic editor/preview tab tests. These stay.
2. `"SuggestionWidget"` — direct component tests for the Accept/Reject widget. These will be **replaced** with toolbar tests on `EditorPanel`.
3. `"EditorPanel tab switch dialog"` — unchanged.

---

## Goal

Keep the `Editor` always mounted. When a suggestion is pending:

1. Compute a character-level diff between `originalText` and `replacementText` using `diff-match-patch`.
2. Apply Monaco decorations that highlight exactly which characters are deleted (red strikethrough) and which are inserted (green ghost text).
3. Show a floating toolbar overlay (Accept/Reject) inside the editor area — replacing the content widget + portal mechanism.

When accepted: apply the edit via `pushEditOperations`. When rejected: clear decorations, no document change.

---

## Decoration Strategy

`diff-match-patch` produces a list of operations over the two strings:

```
EQUAL  "The "
DELETE "old"
INSERT "new"
EQUAL  " text is here."
```

### Mapping diff segments to Monaco ranges

`originalText` starts at `suggestion.range` in the document. Walk the string character by character, tracking `lineNumber` and `column`, to build a position map. Each EQUAL/DELETE segment in the diff corresponds to a contiguous span of characters in `originalText` and therefore maps to a Monaco `IRange`.

INSERT segments have no position in the original document — they are rendered as `after` ghost text attached to the decoration that immediately precedes them.

### Decoration rules

| Diff op  | Rendering                                                                                                                                                                                                                      |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `EQUAL`  | No decoration by default. If the _next_ op is `INSERT`, add an `after` showing the inserted text in green (`suggestion-insert`).                                                                                               |
| `DELETE` | `inlineClassName: "suggestion-delete"` (red strikethrough). If the _next_ op is `INSERT`, also add `after` with inserted text in green.                                                                                        |
| `INSERT` | Never creates its own decoration — always absorbed as `after` content on the preceding segment's decoration. An INSERT at position 0 (no preceding segment) is attached at the start of the range via a zero-width decoration. |

This means at most one `after` decoration per diff segment, with the inserted text shown immediately after the deleted (or equal) text that precedes it in the original.

### Multi-line considerations

`originalText` may span multiple lines. The position-map approach handles this correctly because it tracks `\n` characters and increments the line number. INSERT content shown in `after` uses `"↵"` in place of newlines since Monaco's `after.content` is rendered in a single inline span.

---

## Implementation Steps

### Step 1 — Install `diff-match-patch`

```bash
npm install diff-match-patch
npm install --save-dev @types/diff-match-patch
```

### Step 2 — Add a `computeDiffDecorations` helper

Create `src/lib/diffDecorations.ts`:

```ts
// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0
import {
  diff_match_patch,
  DIFF_EQUAL,
  DIFF_DELETE,
  DIFF_INSERT,
} from "diff-match-patch";
import type * as monaco from "monaco-editor";
import type { Suggestion } from "./store";

/**
 * Builds a position map from a string + its starting Monaco position.
 * posMap[i] is the {lineNumber, column} of text[i] in the document.
 * posMap[text.length] is the position just after the last character.
 */
function buildPositionMap(
  text: string,
  startLine: number,
  startColumn: number,
): Array<{ lineNumber: number; column: number }> {
  const map: Array<{ lineNumber: number; column: number }> = [];
  let line = startLine;
  let col = startColumn;
  for (const ch of text) {
    map.push({ lineNumber: line, column: col });
    if (ch === "\n") {
      line++;
      col = 1;
    } else {
      col++;
    }
  }
  map.push({ lineNumber: line, column: col });
  return map;
}

function escapeNewlines(text: string): string {
  return text.replace(/\n/g, "↵");
}

/**
 * Given a pending suggestion, returns Monaco decorations that highlight
 * deleted characters (red strikethrough) and inserted characters (green
 * ghost text) at word/character level.
 */
export function computeDiffDecorations(
  suggestion: Suggestion,
): monaco.editor.IModelDeltaDecoration[] {
  const dmp = new diff_match_patch();
  const diffs = dmp.diff_main(
    suggestion.originalText,
    suggestion.replacementText,
  );
  dmp.diff_cleanupSemantic(diffs);

  const posMap = buildPositionMap(
    suggestion.originalText,
    suggestion.range.startLineNumber,
    suggestion.range.startColumn,
  );

  const decorations: monaco.editor.IModelDeltaDecoration[] = [];
  let originalOffset = 0; // current position within originalText

  for (let i = 0; i < diffs.length; i++) {
    const [op, text] = diffs[i];

    // Collect any INSERT immediately following this op (absorbed as `after` content)
    const nextOp = diffs[i + 1];
    const insertAfter = nextOp && nextOp[0] === DIFF_INSERT ? nextOp[1] : null;
    if (insertAfter !== null) {
      i++; // consume the INSERT
    }

    if (op === DIFF_INSERT) {
      // Pure INSERT with no preceding segment in this iteration —
      // attach to a zero-width range at the current original position.
      const pos = posMap[originalOffset];
      decorations.push({
        range: {
          startLineNumber: pos.lineNumber,
          startColumn: pos.column,
          endLineNumber: pos.lineNumber,
          endColumn: pos.column,
        },
        options: {
          description: "suggestion-insert-only",
          after: {
            content: " " + escapeNewlines(text),
            inlineClassName: "suggestion-insert",
          },
        },
      });
      continue; // originalOffset does not advance for inserts
    }

    // EQUAL or DELETE: spans characters in originalText
    const segEnd = originalOffset + text.length;
    const startPos = posMap[originalOffset];
    const endPos = posMap[segEnd];

    const range: monaco.IRange = {
      startLineNumber: startPos.lineNumber,
      startColumn: startPos.column,
      endLineNumber: endPos.lineNumber,
      endColumn: endPos.column,
    };

    if (op === DIFF_DELETE) {
      decorations.push({
        range,
        options: {
          description: "suggestion-delete",
          inlineClassName: "suggestion-delete",
          ...(insertAfter !== null
            ? {
                after: {
                  content: " " + escapeNewlines(insertAfter),
                  inlineClassName: "suggestion-insert",
                },
              }
            : {}),
        },
      });
    } else {
      // EQUAL — only needs a decoration if there is an INSERT after it
      if (insertAfter !== null) {
        decorations.push({
          range,
          options: {
            description: "suggestion-equal-with-insert",
            after: {
              content: " " + escapeNewlines(insertAfter),
              inlineClassName: "suggestion-insert",
            },
          },
        });
      }
    }

    originalOffset = segEnd;
  }

  // Fallback: if the diff produced no decorations at all (e.g. empty originalText
  // with a pure insertion), attach the full replacementText as `after` at the
  // start of the range.
  if (decorations.length === 0 && suggestion.replacementText.length > 0) {
    const pos = posMap[0];
    decorations.push({
      range: {
        startLineNumber: pos.lineNumber,
        startColumn: pos.column,
        endLineNumber: pos.lineNumber,
        endColumn: pos.column,
      },
      options: {
        description: "suggestion-insert-fallback",
        after: {
          content: " " + escapeNewlines(suggestion.replacementText),
          inlineClassName: "suggestion-insert",
        },
      },
    });
  }

  return decorations;
}
```

### Step 3 — Rewrite `EditorPanel.tsx`

Remove all content widget, portal, and `SuggestionWidget` code. Replace the old `deltaDecorations` effect with one that uses `createDecorationsCollection` + `computeDiffDecorations`. Add a floating toolbar overlay for Accept/Reject.

**Imports** — remove `SuggestionWidget`, `createPortal`; add `computeDiffDecorations`:

```ts
import { computeDiffDecorations } from "@/lib/diffDecorations";
import { Check, X } from "lucide-react";
```

**State/refs** — remove:

- `suggestionNodes` state
- `contentWidgetsRef`

Change `decorationsRef`:

```ts
const decorationsRef =
  useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
```

**Decoration effect** — replace the old `deltaDecorations` + content widget management block:

```ts
useEffect(() => {
  if (!editorInstance) return;

  const pendingSuggestion =
    suggestions.find((s) => s.status === "pending") ?? null;

  if (!pendingSuggestion) {
    decorationsRef.current?.clear();
    return;
  }

  const decorations = computeDiffDecorations(pendingSuggestion);

  if (!decorationsRef.current) {
    decorationsRef.current =
      editorInstance.createDecorationsCollection(decorations);
  } else {
    decorationsRef.current.set(decorations);
  }

  editorInstance.revealLineInCenterIfOutsideViewport(
    pendingSuggestion.range.startLineNumber,
  );
}, [suggestions, editorInstance]);
```

**`handleAccept`** — unchanged (already uses `pushEditOperations` correctly).

**`handleReject`** — unchanged.

**Derive `pendingSuggestion`** in render (needed for toolbar conditional):

```ts
const pendingSuggestion =
  suggestions.find((s) => s.status === "pending") ?? null;
```

**JSX** — replace the content widget portal block with a toolbar overlay, and adjust editor `padding`:

```tsx
<div className="flex-1 relative">
  <Editor
    height="100%"
    defaultLanguage="markdown"
    value={localContent}
    onChange={handleChange}
    onMount={handleEditorDidMount}
    theme={monacoTheme}
    options={{
      minimap: { enabled: false },
      wordWrap: "on",
      padding: { top: pendingSuggestion ? 48 : 16 },
      scrollBeyondLastLine: false,
      renderLineHighlight: "none",
    }}
  />

  {pendingSuggestion && (
    <div className="absolute top-2 left-0 right-0 z-10 flex justify-center pointer-events-none">
      <div className="flex items-center gap-2 pointer-events-auto bg-background border rounded-lg px-3 py-1.5 shadow-md text-sm">
        <span className="text-muted-foreground text-xs mr-1">
          Proposed edit
        </span>
        <button
          onClick={() => handleAccept(pendingSuggestion.id)}
          className="flex items-center gap-1 text-green-600 hover:text-green-700 font-medium"
        >
          <Check size={14} />
          Accept
        </button>
        <span className="text-muted-foreground">|</span>
        <button
          onClick={() => handleReject(pendingSuggestion.id)}
          className="flex items-center gap-1 text-red-500 hover:text-red-600 font-medium"
        >
          <X size={14} />
          Reject
        </button>
      </div>
    </div>
  )}
</div>
```

Note: `padding: { top: pendingSuggestion ? 48 : 16 }` changes without unmounting `Editor` — `@monaco-editor/react` calls `updateOptions`, which does not reset the model or scroll position.

### Step 4 — Update `index.css`

Replace `.suggestion-original` / `.suggestion-new` with the new per-character classes:

```css
/* Deleted characters: red strikethrough */
.suggestion-delete {
  color: #ef4444 !important;
  text-decoration: line-through !important;
  background-color: rgba(239, 68, 68, 0.12);
}

/* Inserted characters: green ghost text (shown via `after` decoration) */
.suggestion-insert {
  color: #10b981 !important;
  background-color: rgba(16, 185, 129, 0.15);
  font-style: normal;
  border-radius: 2px;
}

.dark .suggestion-delete {
  color: #f87171 !important;
  background-color: rgba(248, 113, 113, 0.15);
}

.dark .suggestion-insert {
  color: #34d399 !important;
  background-color: rgba(52, 211, 153, 0.2);
}
```

### Step 5 — Delete `SuggestionWidget.tsx`

Delete `src/components/SuggestionWidget.tsx`. The toolbar in `EditorPanel` replaces it.

### Step 6 — Update tests

#### `src/lib/diffDecorations.test.ts` (new file)

Unit tests for `computeDiffDecorations`:

- Single-word substitution: `"old"` → `"new"` produces one DELETE decoration with an `after` insert.
- Pure insertion (empty `originalText`): produces a zero-width decoration with `after` content.
- Pure deletion (empty `replacementText`): produces a DELETE decoration with no `after`.
- EQUAL + INSERT: the EQUAL segment gets a decoration carrying the `after` insert content.
- Multi-line `originalText`: verify that line numbers increment correctly in the position map.
- Newlines in insert text are escaped as `↵`.

#### `src/components/EditorPanel.test.tsx`

Remove the `"SuggestionWidget"` describe block entirely (component deleted).

Add a new `"EditorPanel suggestion toolbar"` describe block that sets a pending suggestion via store and asserts on the rendered toolbar:

```ts
function makeSuggestion(overrides?: Partial<Suggestion>): Suggestion {
  return {
    id: "test-id",
    originalText: "old text",
    replacementText: "new text",
    status: "pending",
    range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 8 },
    resolve: vi.fn(),
    ...overrides,
  };
}

function SetPendingSuggestion({ suggestion }: { suggestion: Suggestion }) {
  const { setSuggestions } = useApp();
  useEffect(() => {
    setSuggestions([suggestion]);
  }, []);
  return null;
}

function renderEditorWithSuggestion(suggestion: Suggestion) {
  return render(
    <ThemeProvider>
      <AppProvider>
        <WorkspacesProvider>
          <SetPendingSuggestion suggestion={suggestion} />
          <EditorPanel />
        </WorkspacesProvider>
      </AppProvider>
    </ThemeProvider>,
  );
}
```

Tests to include:

- Shows "Accept" and "Reject" buttons when a suggestion is pending.
- `resolve` is called with accepted message when Accept is clicked.
- `resolve` is called with rejected message when Reject is clicked.
- Toolbar disappears after suggestion is resolved.

Note: `handleAccept` calls `pushEditOperations` via `editorInstance`, which is null in tests (mock Editor doesn't call `onMount`). The implementation should handle this gracefully — either skip `pushEditOperations` when `editorInstance` is null, or the mock should be updated to call `onMount`. The simplest approach is to guard: `if (model) { model.pushEditOperations(...) }` and always call `resolve` regardless. This matches the intent: in tests `editorInstance` is null, but `resolve` should still be called.

#### `src/test/setup.ts`

Update the `monaco-editor` mock:

- Remove `IContentWidget` and `ContentWidgetPositionPreference` (no longer used).
- Add `createDecorationsCollection` to the editor mock used by `EditorPanel` tests (the collection returned should have `.clear()` and `.set()` stubs).

The `@monaco-editor/react` mock needs no changes — `Editor` stays as the textarea mock.

---

## Files Changed

| File                                  | Change                                                                                                                            |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`                        | Add `diff-match-patch` + `@types/diff-match-patch`                                                                                |
| `src/lib/diffDecorations.ts`          | New file — `computeDiffDecorations` helper                                                                                        |
| `src/components/EditorPanel.tsx`      | Remove content widgets + portals; restore `createDecorationsCollection` effect with `computeDiffDecorations`; add toolbar overlay |
| `src/components/SuggestionWidget.tsx` | Deleted                                                                                                                           |
| `src/index.css`                       | Replace `.suggestion-original`/`.suggestion-new` with `.suggestion-delete`/`.suggestion-insert`                                   |
| `src/lib/diffDecorations.test.ts`     | New file — unit tests for `computeDiffDecorations`                                                                                |
| `src/components/EditorPanel.test.tsx` | Remove `SuggestionWidget` describe block; add toolbar tests                                                                       |
| `src/test/setup.ts`                   | Remove content widget mock entries; update monaco mock                                                                            |

---

## Implementation Order

1. `npm install diff-match-patch` + `npm install --save-dev @types/diff-match-patch`
2. Create `src/lib/diffDecorations.ts`.
3. Create `src/lib/diffDecorations.test.ts`.
4. Rewrite `src/components/EditorPanel.tsx`.
5. Delete `src/components/SuggestionWidget.tsx`.
6. Update `src/index.css`.
7. Update `src/components/EditorPanel.test.tsx`.
8. Update `src/test/setup.ts`.
9. `npm run lint && npm run format && npm run test`.
