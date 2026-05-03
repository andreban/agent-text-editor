# Phase 5 Implementation Plan: Advanced Context Tools

## Status

`read_selection` is **already complete** — implemented in `EditorTools.ts` and registered in `App.tsx`. Phase 5 requires only the `search` and `get_metadata` tools.

---

## Task 1: `search` tool

**Goal:** Let the agent find all occurrences of a string in the document and return their locations.

### 1a. Add `search()` to `EditorTools`

Add to `src/lib/EditorTools.ts`:

```typescript
search({ query }: { query: string }): string {
  if (!this.editor) return "Error: Editor not initialized.";
  const model = this.editor.getModel();
  if (!model) return "Error: Model not found.";
  if (!query) return "Error: query parameter is required.";

  const matches = model.findMatches(query, true, false, false, null, false);
  if (matches.length === 0) return `No occurrences of "${query}" found.`;

  const locations = matches
    .map((m) => `line ${m.range.startLineNumber}, col ${m.range.startColumn}`)
    .join("; ");
  return `Found ${matches.length} occurrence(s) of "${query}": ${locations}.`;
}
```

- Uses `model.findMatches()` — already imported and used in `edit()`
- Returns a human-readable string the agent can reason about
- Case-insensitive search (4th arg `false`) — more useful for prose editing

### 1b. Register `search` in `App.tsx`

Add after the `read_selection` registration block:

```typescript
registry.register({
  definition: () => ({
    name: "search",
    description:
      "Finds all occurrences of a query string in the document. Returns the line and column of each match.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The text to search for.",
        },
      },
      required: ["query"],
    },
  }),
  call: async (args: any) => editorTools.search(args),
});
```

Add `"search"` to the agent tools array in `conversation()`.

### 1c. Tests for `search`

Add a `describe("search", ...)` block to `src/lib/EditorTools.test.ts`:

- No editor → returns error string
- Query with zero matches → returns "No occurrences" message
- Query with one match → returns correct line/col
- Query with multiple matches → returns all locations and count
- Empty query → returns error string

---

## Task 2: `get_metadata` tool

**Goal:** Give the agent document statistics so it can answer questions like "how long is this?" without reading the full content.

### 2a. Add `get_metadata()` to `EditorTools`

Add to `src/lib/EditorTools.ts`:

```typescript
get_metadata(): string {
  if (!this.editor) return "Error: Editor not initialized.";
  const text = this.editor.getValue();
  const charCount = text.length;
  const lineCount = text === "" ? 0 : text.split("\n").length;
  const wordCount =
    text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
  return `Characters: ${charCount}, Words: ${wordCount}, Lines: ${lineCount}.`;
}
```

- No parameters — always operates on the full document
- Returns a compact, agent-readable string

### 2b. Register `get_metadata` in `App.tsx`

```typescript
registry.register({
  definition: () => ({
    name: "get_metadata",
    description:
      "Returns metadata about the current document: character count, word count, and line count.",
    parameters: { type: "object", properties: {} },
  }),
  call: async () => editorTools.get_metadata(),
});
```

Add `"get_metadata"` to the agent tools array.

### 2c. Tests for `get_metadata`

Add a `describe("get_metadata", ...)` block to `src/lib/EditorTools.test.ts`:

- No editor → returns error string
- Empty document (`""`) → `Characters: 0, Words: 0, Lines: 0`
- Single line with words → correct counts
- Multi-line document → correct line count
- Document with leading/trailing whitespace → word count ignores it

---

## Task 3: Update system prompt

In `App.tsx`, extend `instructions` to mention the new tools so the agent knows when to use them:

> "Use `search()` to locate specific text before editing. Use `get_metadata()` to answer questions about document length without reading its full content."

---

## Execution order

1. Add `search()` and `get_metadata()` methods to `EditorTools.ts`
2. Register both in `App.tsx`; add to tools array; update system prompt
3. Write tests in `EditorTools.test.ts`
4. Run `npm run test`, `npm run lint`, `npm run format`
5. Manual test: "find where I mentioned X" and "how many words is this?"
6. Wait for user approval before committing

---

## Working state (acceptance criteria)

- Agent correctly uses `search` when asked "find where I mentioned X"
- Agent correctly uses `get_metadata` when asked about document length/word count
- `read_selection` continues to work for selection-scoped tasks
- All tests pass; no lint or type errors
