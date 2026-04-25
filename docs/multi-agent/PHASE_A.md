# Phase A: Foundation — Implementation Plan

## Context

The current app has a single orchestrator agent with ad-hoc skill delegation via `createDelegateToSkillHandler` in `EditorTools.ts`. Phase A introduces the shared infrastructure that all future specialized agents (Planner, Researcher, Writer, Reviewer) will depend on:

- A proper `AgentRunnerFactory` abstraction so sub-agent creation is testable and model-agnostic
- A generic `invoke_agent` delegation tool that works for any ad-hoc sub-task
- `WorkflowState` in the store for future plan execution tracking
- UI attribution so sub-agent activity streams into labeled chat blocks

**Working state at end of Phase A:** The Orchestrator can delegate any ad-hoc task to a generic sub-agent and its output streams into an attributed chat block.

---

## Files Created

| File                             | Purpose                                                                 |
| -------------------------------- | ----------------------------------------------------------------------- |
| `src/lib/agents/factory.ts`      | `AgentRunnerFactory` interface + `DefaultAgentRunnerFactory`            |
| `src/lib/agents/orchestrator.ts` | `buildOrchestratorPrompt(skills, hasWorkspace): string`                 |
| `src/lib/agents/generic.ts`      | `createGenericAgent(factory, systemPrompt, tools?): AgentRunner`        |
| `src/lib/agents/index.ts`        | Re-exports from all agent files                                         |
| `src/lib/DelegationTools.ts`     | `registerDelegationTools(registry, factory, ...)` + `invoke_agent` tool |

---

## Files Modified

| File                             | Change                                                                                                               |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `src/lib/WorkspaceTools.ts`      | Replace `AdapterFactory + SubAgentFactory` with `AgentRunnerFactory`                                                 |
| `src/lib/EditorTools.ts`         | Update `createDelegateToSkillHandler` to accept `AgentRunnerFactory` instead of `(apiKey, adapter)`                  |
| `src/lib/store.tsx`              | Add `WorkflowState` interface + `workflowState`/`setWorkflowState` to `AppState`                                     |
| `src/components/ChatItem.tsx`    | Add `"agent"` `StreamItem` kind + `AgentItem` component; add `agentRole?` / `parentMessageId?` to `"assistant"` kind |
| `src/components/ChatSidebar.tsx` | Detect `invoke_agent` tool calls → create attributed agent blocks; route child events to `childItems`                |
| `src/App.tsx`                    | Construct `DefaultAgentRunnerFactory`; inject into tools; use `buildOrchestratorPrompt`; register `DelegationTools`  |

---

## Step-by-Step Implementation

### Step 1 — `src/lib/agents/factory.ts`

```ts
interface AgentRunnerFactory {
  create(options: {
    systemPrompt: string;
    tools?: ToolRegistry;
    onEvent?: (event: AgentEvent) => void;
  }): AgentRunner;
}
```

`DefaultAgentRunnerFactory` is constructed with `(apiKey: string, modelName: string, usageCallback?)`. Its `create()` method builds a fresh `GoogleGenAIAdapter` and returns `new AgentRunner(adapter, tools)`. The `usageCallback` (for `setTotalTokens`) is wired into every adapter the factory creates. The `onEvent` param in `create()` is reserved for later phases — not wired in Phase A.

### Step 2 — `src/lib/agents/orchestrator.ts`

Move `BASE_INSTRUCTIONS` string out of `App.tsx`. Export:

```ts
export function buildOrchestratorPrompt(
  skills: Skill[],
  hasWorkspace: boolean,
): string;
```

Assembles the base instructions + optional skills list + optional workspace tool guidance.

### Step 3 — `src/lib/agents/generic.ts`

```ts
export function createGenericAgent(
  factory: AgentRunnerFactory,
  systemPrompt: string,
  tools?: ToolRegistry,
): AgentRunner;
```

Thin wrapper: `return factory.create({ systemPrompt, tools })`.

### Step 4 — `src/lib/agents/index.ts`

Re-export `AgentRunnerFactory`, `DefaultAgentRunnerFactory`, `buildOrchestratorPrompt`, `createGenericAgent`.

### Step 5 — `src/lib/DelegationTools.ts`

Export `registerDelegationTools(registry, factory, editorTools, workspaceTools)`.

Registers the `invoke_agent` tool:

- **Parameters:** `systemPrompt: string`, `task: string`, `tools?: string[]` (tool group names, e.g. `["workspace_readonly"]`)
- **Behavior:** Creates a generic agent via `createGenericAgent(factory, systemPrompt, resolvedRegistry)`. Runs it using the same streaming pattern as `createDelegateToSkillHandler` in `EditorTools.ts`:
  ```ts
  for await (const event of runner.runBuilder(agentConfig).runStream(task)) {
    if (event.type === "done") return event.output;
    context.onEvent?.(event);
  }
  ```
  Returns `{ result: string }`.
- Tool group resolution: only `"workspace_readonly"` in Phase A (registers read-only workspace tools).

### Step 6 — `src/lib/WorkspaceTools.ts`

Replace constructor params:

- Remove: `adapterFactory: AdapterFactory`, `runnerFactory: SubAgentFactory`
- Add: `factory: AgentRunnerFactory`

Two methods create sub-agents and must be updated:

- `query_document` (line ~83) — calls `this.adapterFactory()` + `this.runnerFactory(adapter)` then `runner.run(agent, input)`
- `query_workspace` (line ~203) — same pattern for the synthesizer step

Both become: `const runner = this.factory.create({ systemPrompt: agent.instructions }); await runner.run(agent, input)`.

Remove the exported `AdapterFactory` and `SubAgentFactory` types (no external callers after `App.tsx` is updated).

### Step 7 — `src/lib/EditorTools.ts`

Update `createDelegateToSkillHandler` signature:

- Remove: `(apiKey: string, adapter: LlmAdapter, editorTools, workspaceTools)`
- Add: `(factory: AgentRunnerFactory, editorTools, workspaceTools)`

Internally, when a skill specifies a custom model, call `factory.create(...)` (no need to construct a new `GoogleGenAIAdapter` manually — the factory handles model config).

### Step 8 — `src/lib/store.tsx`

Add to the file:

```ts
export interface WorkflowState {
  planId: string;
  steps: Array<{
    id: string;
    status: "pending" | "running" | "done" | "failed" | "skipped";
    result?: unknown;
  }>;
}
```

Add to `AppState`:

```ts
workflowState: WorkflowState | null;
setWorkflowState: (state: WorkflowState | null) => void;
```

Initialize to `null`.

### Step 9 — `src/components/ChatItem.tsx`

**Extend `StreamItem` union:**

```ts
| {
    kind: "agent";
    id: string;
    agentRole: string;
    task: string;
    pending: boolean;
    childItems: ChildItem[];
    parentMessageId?: string;
  }
```

Add `agentRole?: string` and `parentMessageId?: string` to the `"assistant"` kind.

**Add `AgentItem` component** (modeled after `SkillItem`):

- Header: role badge icon (Bot from lucide) + `agentRole` label + truncated `task`
- Collapsible `childItems` with the same thought/text/tool child rendering as `SkillItem`
- Pending: pulsing icon; done: green check

Wire `AgentItem` into `ChatItem`'s switch on `item.kind`.

### Step 10 — `src/components/ChatSidebar.tsx`

In the `tool_call_started` branch inside `handleSend`:

```ts
if (event.name === "invoke_agent") {
  const args = event.args as { systemPrompt: string; task: string };
  const agentItemId = `agent-${crypto.randomUUID()}`;
  activeSkillRef.id = agentItemId;
  setItems((prev) => [
    ...prev,
    {
      kind: "agent",
      id: agentItemId,
      agentRole: "Agent", // generic label for Phase A
      task: args.task,
      pending: true,
      childItems: [],
    },
  ]);
}
```

The existing `onToolEvent` callback already routes child events to `childItems` via `activeSkillRef.id` — it works for `"agent"` items without changes since the mapping is by ID, not by kind.

In `tool_call_completed` for `invoke_agent`: mark the agent item `pending: false` (same as skill completion logic).

### Step 11 — `src/App.tsx`

```ts
// Construct once with baked-in model + usage tracking
const factory = useMemo(
  () =>
    new DefaultAgentRunnerFactory(apiKey!, modelName, (usage) =>
      setTotalTokens((prev) => prev + (usage.totalTokenCount || 0)),
    ),
  [apiKey, modelName, setTotalTokens],
);
```

- Pass `factory` to `WorkspaceTools` constructor (replacing `adapterFactory + runnerFactory`).
- Pass `factory` to `createDelegateToSkillHandler(factory, editorTools, workspaceTools)`.
- Call `registerDelegationTools(registry, factory, editorTools, workspaceTools)` inside `runner` memo.
- Use `buildOrchestratorPrompt(skills, !!activeWorkspaceId)` for `agent.instructions`.
- The main `AgentRunner` is still `new AgentRunner(adapter, registry)` — the factory is for sub-agents.

---

## Tests to Write

| File                                         | What to test                                                                                                                            |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/agents/factory.test.ts`             | `DefaultAgentRunnerFactory.create()` returns an `AgentRunner`; creates a new instance per call; passes `tools` correctly                |
| `src/lib/DelegationTools.test.ts`            | `invoke_agent` calls `factory.create` with the provided `systemPrompt`; relays child events via `context.onEvent`; returns `{ result }` |
| Store test additions                         | `workflowState` initializes as `null`; `setWorkflowState` updates correctly                                                             |
| `src/components/ChatItem.test.tsx` additions | `"agent"` kind renders `agentRole` label; `childItems` render inside collapsed panel                                                    |
| `src/lib/WorkspaceTools.test.ts` updates     | Update constructor calls to pass a mock `AgentRunnerFactory` instead of `adapterFactory`/`runnerFactory`                                |
| `src/lib/EditorTools.test.ts` updates        | Update `createDelegateToSkillHandler` calls to pass a mock `AgentRunnerFactory` instead of `(apiKey, adapter)`                          |

All files must carry the Apache-2.0 license header.

---

## Verification

1. `npm run lint && npm run format` — no errors
2. `npm run test` — all existing + new tests pass
3. `npm run dev` — start the dev server, open the app
4. Set API key, enter a prompt asking the orchestrator to delegate a generic task (e.g. "Use invoke_agent to summarize a topic"). Verify:
   - An attributed "Agent" chat block appears while the sub-agent streams
   - Child thinking/text/tool events appear inside the block
   - The block collapses when done
   - The orchestrator's final reply references the sub-agent's output
5. Verify the existing skill delegation (`delegate_to_skill`) still works correctly
