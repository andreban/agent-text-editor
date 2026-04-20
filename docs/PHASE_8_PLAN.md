# Phase 8 Implementation Plan: Sub-Agents & Custom Skills

## Goal

Enable the main agent to delegate tasks to specialized sub-agents called **Skills**. Each Skill carries its own system instructions and an optional model override, and runs as a child `AgentRunner`. Token usage is always aggregated into the session counter regardless of which model the skill uses. Skills can call the same editor tools as the main agent, so edits proposed by a sub-agent go through the normal suggestion approval workflow.

---

## Architecture overview

```
┌────────────────────────────────────────────────────────┐
│  Main AgentRunner                                      │
│  instructions: "senior editorial assistant...          │
│                Available skills: Proofreader, ..."     │
│  tools: read, read_selection, search, get_metadata,    │
│         edit, write, delegate_to_skill                 │
│                                                        │
│   calls delegate_to_skill({ skillName, task })         │
│                        │                               │
│          ┌─────────────▼────────────────────────────┐  │
│          │  Child AgentRunner (per invocation)       │  │
│          │  adapter: same adapter if no model set;   │  │
│          │           new adapter if skill.model set  │  │
│          │  registry: fresh, with editor tools       │  │
│          │  instructions: skill.instructions         │  │
│          │  run(task) → output string                │  │
│          └───────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

Key decisions:

- **Per-skill model** — a `Skill` may specify an optional `model` field. When set, `delegate_to_skill` creates a new `GoogleGenAIAdapter` for that model. When unset, the parent adapter is reused directly.
- **Fresh registry** — each child gets its own `ToolRegistry` with the editor tools registered. `delegate_to_skill` is intentionally excluded to prevent recursion.
- **`run()` not `runStream()`** — the child agent runs synchronously (from the parent's perspective). Edits proposed by the child still flow through the suggestion approval UI as normal.
- **localStorage** — skills are persisted under the key `"skills"`. The `delegate_to_skill` tool reads skills directly from storage so it stays decoupled from React state.

---

## Data model

```typescript
interface Skill {
  id: string; // uuid, stable across renames
  name: string; // displayed to user and injected into main agent prompt
  description: string; // one-line, injected into main agent prompt
  instructions: string; // full system prompt for the sub-agent
  model?: string; // optional override; falls back to the session model when absent
}
```

Stored as `localStorage.setItem("skills", JSON.stringify(Skill[]))`.

---

## Default Skills

Seeded on first load (when the `"skills"` key is absent):

| Name                   | Description                                                                | Instructions (abbreviated)                                                                                                                                            |
| ---------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Proofreader**        | Fix grammar, spelling, and punctuation while preserving the author's voice | "You are a meticulous proofreader. Use the `read` tool to read the document, then use `edit` to fix spelling, grammar, and punctuation errors…"                       |
| **Summarizer**         | Produce a concise summary of the document                                  | "You are a summarizer. Use `read` to read the document and return a concise summary. Do not edit the document."                                                       |
| **Markdown Formatter** | Clean up and enforce consistent Markdown formatting                        | "You are a Markdown formatter. Use `read` to read the document, then use `edit` or `write` to apply consistent heading levels, list style, and code-fence languages…" |

---

## Task 1 — Skills data module

**New file:** `src/lib/skills.ts`

Exports:

```typescript
export interface Skill {
  id: string;
  name: string;
  description: string;
  instructions: string;
}

export const DEFAULT_SKILLS: Skill[] = [
  /* Proofreader, Summarizer, Markdown Formatter */
];

const STORAGE_KEY = "skills";

export function loadSkills(): Skill[] {
  /* read + JSON.parse from localStorage */
}
export function saveSkills(skills: Skill[]): void {
  /* JSON.stringify + setItem */
}

/** Seeds defaults if the storage key is absent. Returns the loaded skills. */
export function initializeSkills(): Skill[] {
  if (localStorage.getItem(STORAGE_KEY) === null) {
    saveSkills(DEFAULT_SKILLS);
  }
  return loadSkills();
}
```

No React imports — pure storage utilities, easy to unit-test.

---

## Task 2 — Skills state in store

**File:** `src/lib/store.tsx`

Add to `AppState`:

```typescript
skills: Skill[];
setSkills: (skills: Skill[]) => void;
```

In the provider:

1. Call `initializeSkills()` for the initial value (replaces a bare `loadSkills()` call).
2. `setSkills` updates local state and calls `saveSkills(skills)`.

No changes to existing fields.

---

## Task 3 — SkillsDialog component

**New file:** `src/components/SkillsDialog.tsx`

A modal dialog (built on the existing shadcn `Dialog`) with three sub-views:

### List view (default)

- Renders each skill as a card: bold name, description, Edit and Delete buttons.
- "Add Skill" button in the dialog footer opens the Edit view with empty fields.
- Default skills can be edited or deleted like any other.

### Edit / Create view

Fields:

- **Name** — text input, required.
- **Description** — text input, required, one-line.
- **Model** — text input, optional. Placeholder shows the current session model as the default. Leave blank to inherit the session model.
- **Instructions** — `<textarea>` (or shadcn `Textarea`), required, multiline.

Validation:

- Name must be non-empty.
- Name must be unique among existing skills (excluding the skill being edited).

On save: call `setSkills(updatedList)` and return to list view.

### Delete confirmation

Inline confirmation within the card row ("Are you sure? Delete / Cancel") to prevent accidental deletions.

The dialog is controlled (`open` / `onOpenChange`) and receives no props beyond what it reads from context.

---

## Task 4 — Toolbar integration

**File:** `src/App.tsx`

Add a **Skills button** (wand icon from `lucide-react`) alongside the existing Settings gear icon in the toolbar. Clicking it sets `skillsOpen` state to `true`, rendering `<SkillsDialog open={skillsOpen} onOpenChange={setSkillsOpen} />`.

The button must meet the 44 × 44 px touch-target requirement (`h-11 w-11`).

---

## Task 5 — Dynamic system instructions

**File:** `src/App.tsx`

The `conversation` `useMemo` already depends on `runner`. Add `skills` to its dependency array and append a skills section to the system instructions:

```typescript
const skillsSection = skills.length
  ? `\n\nAvailable skills you can delegate to via the delegate_to_skill tool:\n` +
    skills.map((s) => `- ${s.name}: ${s.description}`).join("\n")
  : "";

const agent: AgentConfig = {
  name: "EditorAssistant",
  instructions: BASE_INSTRUCTIONS + skillsSection,
  tools: [...existingTools, "delegate_to_skill"],
};
```

`BASE_INSTRUCTIONS` is the existing string literal extracted to a constant. When `skills` changes (user adds/removes/edits), the conversation is recreated — this is acceptable because skill edits happen outside an active agent turn.

---

## Task 6 — `delegate_to_skill` tool

**File:** `src/lib/EditorTools.ts`

Register alongside the existing tools. The tool needs access to:

- The parent `GoogleGenAIAdapter` instance (passed as a closure parameter like the existing tools).
- `apiKey` — to construct a new adapter when the skill specifies a different model.
- `EditorTools` instance (for child registry).
- `addSuggestion` / editor context (same as existing tools).

```typescript
registry.register({
  definition: () => ({
    name: "delegate_to_skill",
    description:
      "Delegates a task to a named skill (sub-agent). The skill runs with its own instructions and can read and edit the document. Returns the skill's final response.",
    parameters: {
      type: "object",
      properties: {
        skillName: {
          type: "string",
          description: "The exact name of the skill to invoke.",
        },
        task: {
          type: "string",
          description:
            "The specific task or instructions to pass to the skill.",
        },
      },
      required: ["skillName", "task"],
    },
  }),
  call: async ({ skillName, task }: { skillName: string; task: string }) => {
    const skills = loadSkills();
    const skill = skills.find((s) => s.name === skillName);
    if (!skill) {
      return `Error: skill "${skillName}" not found. Available skills: ${skills.map((s) => s.name).join(", ")}`;
    }

    const childAdapter = skill.model
      ? new GoogleGenAIAdapter(apiKey, skill.model)
      : adapter;

    const childRegistry = new ToolRegistry();
    // Register editor tools (excluding delegate_to_skill to prevent recursion)
    registerEditorTools(childRegistry, editorToolsInstance);

    const childRunner = new AgentRunner(childAdapter, childRegistry);
    const result = await childRunner.run(
      {
        name: skill.name,
        instructions: skill.instructions,
        tools: [
          "read",
          "read_selection",
          "search",
          "get_metadata",
          "edit",
          "write",
        ],
      },
      task,
    );

    return result.output;
  },
});
```

**Refactor note:** To support this, extract the tool registration loop in `EditorTools.ts` into a named `registerEditorTools(registry, tools)` helper so it can be called for both the parent and child registries.

---

## Task 7 — Tests

**`src/lib/skills.test.ts`** (new file):

1. `initializeSkills` seeds defaults when localStorage is empty.
2. `initializeSkills` does not overwrite existing skills.
3. `loadSkills` returns what `saveSkills` stored.
4. `saveSkills` / `loadSkills` round-trip preserves all fields.

**`src/components/SkillsDialog.test.tsx`** (new file):

1. Renders skill list from context.
2. Clicking "Add Skill" shows empty form.
3. Submitting a valid new skill calls `setSkills` with the new entry appended.
4. Editing a skill updates the entry in place (same `id`).
5. Confirming delete removes the skill.
6. Duplicate name shows a validation error.

**`src/lib/EditorTools.test.ts`** (extend existing):

1. `delegate_to_skill` returns error string when skill name is not found.
2. `delegate_to_skill` creates a child `AgentRunner`, calls `run`, and returns `result.output`.
3. `delegate_to_skill` does not register itself on the child registry (no recursion).
4. When the skill has no `model` field, the parent adapter instance is reused (no new adapter created).
5. When the skill specifies a `model`, a new `GoogleGenAIAdapter` is constructed with that model.

---

## Execution order

1. **Task 1** — create `src/lib/skills.ts` and write its unit tests
2. **Task 2** — extend `src/lib/store.tsx` with `skills` / `setSkills`
3. **Task 3** — create `src/components/SkillsDialog.tsx` and its tests
4. **Task 4** — add Skills toolbar button in `src/App.tsx`
5. **Task 5** — inject dynamic skill descriptions into system instructions
6. **Task 6** — register `delegate_to_skill` in `EditorTools.ts`; extend `EditorTools` tests
7. Run `npm run test`, `npm run lint`, `npm run format` — fix any failures
8. Start dev server (`npm run dev`) and verify manually:
   - Skills button opens dialog; default skills are pre-populated
   - Creating a new skill saves and appears in the list
   - Chat system prompt reflects current skills (inspect via browser devtools or a test log)
   - Asking the main agent to "proofread the document" triggers `delegate_to_skill` → child agent reads and proposes edits via the normal suggestion UI
9. Wait for user approval before committing

---

## Acceptance criteria

- On first load, three default skills (Proofreader, Summarizer, Markdown Formatter) are present in the Skills Manager.
- User can create, edit, and delete skills; changes persist across page reloads.
- The main agent's system prompt lists all current skills by name and description.
- Asking the main agent to invoke a skill results in a `delegate_to_skill` tool call in the chat UI.
- Sub-agent edits surface as suggestions the user must accept/reject — the approval workflow is unchanged.
- A skill with a `model` override runs against that model; a skill without one inherits the session model.
- All tests pass; no lint or type errors.
