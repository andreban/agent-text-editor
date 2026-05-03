# Plan: Skill Execution Transparency

## Problem

When the main agent invokes a skill via `delegate_to_skill`, the chat window shows only a single collapsed tool call entry. The skill subagent's internal activity — its thinking, the editor tools it calls, any partial output — is entirely invisible. Users have no feedback during what can be a multi-step, multi-second operation.

## Current Behavior

1. Main agent emits `tool_call_started` → a "delegate_to_skill" tool item appears in chat (pending spinner)
2. `EditorTools.ts` creates a child `AgentRunner` and calls `childRunner.run(agentConfig, task)` — blocking, no events propagate
3. When done, `tool_call_completed` fires and the tool item shows the text result
4. The skill's thinking, tool calls (`edit`, `write`, `read`, etc.), and intermediate output are never shown

## Proposed UI Design

Replace the single flat tool item for `delegate_to_skill` with an expandable **skill panel** that shows:

- Skill name and status badge (running / done / failed)
- A collapsible nested activity log containing:
  - Thinking chunks (same collapsible style as top-level thinking)
  - Each tool call the skill made (same `ToolItem` style, indented)
  - The skill's final text output

The panel should **auto-expand while running** and **collapse (but remain openable) once complete**, following the same UX pattern used for top-level thinking.

## Technical Approach

### 1. Switch child runner to streaming (`EditorTools.ts`)

`delegate_to_skill` currently calls `childRunner.run(...)`. Change this to `childRunner.runStream(...)` and iterate the event stream. This unblocks event collection without any changes to `@mast-ai/core`.

Collect each child `AgentEvent` into an array. To surface them in the parent chat UI, use the **`onProgress` callback approach** described below.

### 2. Thread progress events through `ToolContext`

`ToolContext` is passed to every tool handler. Add an optional `onSkillEvent` callback to the context:

```typescript
// In the ToolContext extension point (App.tsx, where tools are registered)
onSkillEvent?: (skillName: string, event: AgentEvent) => void;
```

`delegate_to_skill`'s handler calls `context.onSkillEvent?.(skillName, event)` for each child event as they stream in.

`App.tsx` wires this callback to a new store action / dispatch that pushes events into the chat stream.

### 3. New `StreamItem` kind: `"skill"`

Add a `skill` variant to the `StreamItem` union in `ChatSidebar.tsx` / `ChatItem.tsx`:

```typescript
{
  kind: "skill";
  id: string;
  name: string;
  task: string;
  pending: boolean;
  events: ChildStreamItem[];   // thinking, tool, assistant text
}
```

`ChildStreamItem` is the same `StreamItem` union minus `user` and `skill` (no nesting beyond one level).

### 4. Render `SkillItem` in `ChatItem.tsx`

A new `SkillItem` component:

- Header: wrench icon + skill name + spinner or check + `task` summary
- Body (collapsible, open while pending): renders each `ChildStreamItem` using the existing `ThinkingItem` / `ToolItem` / assistant bubble components, indented with a left border
- Auto-collapses on completion (same logic as `thought` collapsing in `ChatSidebar.tsx:285`)

### 5. Event wiring in `ChatSidebar.tsx`

When a `tool_call_started` event arrives for `delegate_to_skill`:

- Create a `skill` StreamItem instead of a `tool` item
- Subsequent `onSkillEvent` callbacks append child events into that item's `events` array
- `tool_call_completed` marks it `pending: false` and triggers collapse

## Files Changed

| File                                                 | Change                                                                  |
| ---------------------------------------------------- | ----------------------------------------------------------------------- |
| `src/lib/EditorTools.ts`                             | Switch to `runStream`, call `onSkillEvent` per child event              |
| `src/App.tsx`                                        | Wire `onSkillEvent` callback into chat event dispatch                   |
| `src/components/ChatSidebar.tsx`                     | Detect `delegate_to_skill` tool calls, create/update `skill` StreamItem |
| `src/components/ChatItem.tsx`                        | Add `skill` to `StreamItem` union; add `SkillItem` component            |
| `src/components/ChatItem.test.tsx` (new or existing) | Tests for `SkillItem` render states                                     |

## Implementation Steps

1. **`EditorTools.ts`** — switch `childRunner.run` → `runStream`, collect and forward events via `context.onSkillEvent`
2. **`App.tsx`** — add `onSkillEvent` to the context passed to `EditorTools`; forward to a `dispatchSkillEvent` callback that `ChatSidebar` provides
3. **`ChatItem.tsx`** — add `skill` StreamItem type and `SkillItem` component
4. **`ChatSidebar.tsx`** — route `tool_call_started` for `delegate_to_skill` into a `skill` item; handle child events via the new dispatch path
5. **Tests** — cover `SkillItem` in pending and completed states; cover event routing in `ChatSidebar`

## Open Questions

- **Depth limit**: Skills already strip `delegate_to_skill` from child tool registries (preventing recursion). No additional guard needed.
- **Error state**: If the child runner throws, the existing `tool_call_completed` result already contains the error string. The `SkillItem` should show a red "failed" badge in that case.
- **ToolContext extension**: `ToolContext` is defined in `@mast-ai/core`. Rather than modifying the upstream package, the callback can be injected via closure (the tool handler captures it from its enclosing scope in `EditorTools.ts` / `App.tsx`).
