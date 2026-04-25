# Phase D: Plan Confirmation

## Goal

Gate plan execution behind explicit user approval. After `invoke_planner` produces a plan it pauses and waits for the user to confirm or cancel — the same await-and-resolve pattern used by `pendingTabSwitchRequest` and `pendingWorkspaceAction`. A new `PlanConfirmationWidget` rendered inline in `ChatSidebar` shows the plan goal and step list with Confirm/Cancel buttons.

---

## Context

Phase C delivered:

- `createPlannerAgent` and `PLANNER_SYSTEM_PROMPT` in `src/lib/agents/planner.ts`
- `invoke_planner` in `DelegationTools.ts` — parses the LLM output into a typed `Plan` and returns it immediately as a JSON string
- `Plan` and `PlanStep` types re-exported from `src/lib/agents/index.ts`

What's missing: the Orchestrator proceeds immediately after receiving the plan, with no opportunity for the user to review or reject it. A multi-step plan that restructures a document can have significant consequences — users need to be able to say "yes, proceed" or "no, stop". Phase D adds that gate.

---

## What changes

### 1. `src/lib/store.tsx` — `PlanConfirmationRequest`

**New type** (add at the top of the file, alongside `TabSwitchRequest`):

```ts
import type { Plan } from "./agents/planner";

export interface PlanConfirmationRequest {
  plan: Plan;
  resolve: (accepted: boolean) => void;
}
```

**`EditorUIState` additions:**

```ts
pendingPlanConfirmation: PlanConfirmationRequest | null;
setPendingPlanConfirmation: (req: PlanConfirmationRequest | null) => void;
```

Add a matching `useState<PlanConfirmationRequest | null>(null)` in `AppProvider` and include both in `editorUIValue`.

---

### 2. `src/lib/tools/DelegationTools.ts` — confirmation await in `invoke_planner`

One new parameter on `registerDelegationTools`:

| Parameter                    | Type                                             | Purpose                          |
| ---------------------------- | ------------------------------------------------ | -------------------------------- |
| `setPendingPlanConfirmation` | `(req: PlanConfirmationRequest \| null) => void` | Triggers the confirmation widget |

Import `PlanConfirmationRequest` from `../store` as a type-only import.

Updated `invoke_planner` execution sequence (replaces the current "parse and return" step 5):

1. Parse the plan JSON and validate shape — unchanged from Phase C.
2. Create a `Promise<boolean>` and pass its `resolve` callback into `setPendingPlanConfirmation({ plan, resolve })`.
3. Await the promise.
4. Call `setPendingPlanConfirmation(null)` to dismiss the widget.
5. **If rejected:** throw `new Error("Plan rejected by user.")`.
6. **If accepted:** return `JSON.stringify(plan)` as before.

---

### 3. `src/App.tsx` — thread new callbacks into `registerDelegationTools`

Destructure `setPendingPlanConfirmation` from `useEditorUI()` and pass it to `registerDelegationTools`:

```ts
registerDelegationTools(
  registry,
  factory,
  editorTools,
  workspaceTools,
  setPendingPlanConfirmation,
);
```

---

### 4. `src/components/PlanConfirmationWidget.tsx` (new)

A self-contained widget that reads `pendingPlanConfirmation` from `useEditorUI()` and renders `null` when it is unset.

When set, renders a bordered card containing:

- A heading: **"Confirm Plan"**
- The plan `goal` as a short descriptive paragraph
- A numbered list of steps, each showing `step.instruction`
- Two action buttons: **Confirm** (`resolve(true)`) and **Cancel** (`resolve(false)`)

Both buttons only call `resolve` — `invoke_planner` is responsible for clearing state and handling the workflow transition after the promise settles.

---

### 5. `src/components/ChatSidebar.tsx` — render widget when a plan is pending

Import `PlanConfirmationWidget` and insert it between the virtualised message list and the input area:

```tsx
{
  /* Plan confirmation gate — shown inline when invoke_planner is awaiting approval */
}
<PlanConfirmationWidget />;
```

No state changes or additional props are required; the widget reads directly from `useEditorUI()`.

---

## Files modified

| File                               | Change                                                                                                                     |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/store.tsx`                | Add `PlanConfirmationRequest` type; add `pendingPlanConfirmation` + setter to `EditorUIState` and `AppProvider`            |
| `src/lib/tools/DelegationTools.ts` | Add `setPendingPlanConfirmation` param; update `invoke_planner` to await confirmation, clear state, and throw on rejection |
| `src/App.tsx`                      | Destructure and pass `setPendingPlanConfirmation` to `registerDelegationTools`                                             |
| `src/components/ChatSidebar.tsx`   | Import and render `PlanConfirmationWidget` between message list and input area                                             |

## Files created

| File                                        | Purpose                                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `src/components/PlanConfirmationWidget.tsx` | Renders plan goal + step list + Confirm/Cancel buttons; self-contained via `useEditorUI()` |

---

## Tests

### `DelegationTools.test.ts` additions

```
invoke_planner (Phase D)
  ✓ calls setPendingPlanConfirmation with the plan before awaiting
  ✓ returns plan JSON when the confirmation callback resolves with true
  ✓ clears pendingPlanConfirmation after resolution regardless of outcome
  ✓ throws "Plan rejected by user." when confirmation resolves with false
```

### `PlanConfirmationWidget.test.tsx` (new)

```
PlanConfirmationWidget
  ✓ renders nothing when pendingPlanConfirmation is null
  ✓ renders the plan goal when pendingPlanConfirmation is set
  ✓ renders one list item per step showing the instruction text
  ✓ calls resolve(true) when the Confirm button is clicked
  ✓ calls resolve(false) when the Cancel button is clicked
```

---

## Working state

When the Orchestrator calls `invoke_planner`, the user sees a step-by-step plan card appear inline in the chat sidebar. Clicking **Confirm** lets the Orchestrator proceed; clicking **Cancel** clears the workflow state and lets the Orchestrator handle the rejection gracefully.
