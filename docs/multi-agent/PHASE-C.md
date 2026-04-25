# Phase C: Planner Agent

## Goal

Implement the LLM agent that decomposes a task into a structured `Plan` and wire it as an invokable `invoke_planner` tool. `invoke_planner` returns the plan as a JSON string and the Orchestrator proceeds immediately. Sub-agent progress is already rendered by the existing `invoke_agent` event infrastructure — no new UI or store state needed here.

---

## Context

Phase B delivered:

- Named registry builders (`buildReadonlyRegistry`, `buildReadWriteRegistry`)
- `delegate_to_skill` returns the skill's raw string response; Orchestrator interprets and acts
- `invoke_agent` creates generic sub-agents with a read-only registry; their streaming output is already attributed and rendered in `ChatSidebar` via the `"agent"` `StreamItem` kind
- Write access policy enforced structurally — Orchestrator is the sole writer

What's missing: the Orchestrator has no way to decompose a complex task into discrete steps before dispatching sub-agents. Without a plan, the Orchestrator either guesses the right sequence or collapses everything into a single `invoke_agent` call. Phase C fixes this with a dedicated Planner that reasons over text and produces a machine-readable work plan.

---

## What changes

### 1. `src/lib/agents/planner.ts` (new)

Exports the `Plan` type hierarchy, the system prompt constant, and the factory function.

**Types:**

```ts
export interface PlanStep {
  id: string; // e.g. "step_1"
  instruction: string; // what needs to happen in this step
  dependsOn: string[]; // IDs of steps whose output is needed as input
}

export interface Plan {
  goal: string;
  steps: PlanStep[];
}
```

**System prompt** (`PLANNER_SYSTEM_PROMPT`):

> You are a planning agent. Given a writing task and optional context, produce a structured JSON plan.
>
> - Output ONLY valid JSON matching the Plan schema below. No prose, no markdown fences, no explanation.
> - Steps that can run independently must declare `dependsOn: []`. Steps that need prior output must list the prerequisite step IDs.
> - Keep steps focused — one outcome per step. Simple tasks warrant 1–2 steps.
>
> Schema: `{ "goal": "string", "steps": [{ "id": "step_1", "instruction": "...", "dependsOn": [] }] }`

**`createPlannerAgent(factory: AgentRunnerFactory): AgentRunner`** — constructs a runner with an empty `ToolRegistry` (no tools registered). The Planner reasons over text only.

---

### 2. `src/lib/tools/DelegationTools.ts` — `invoke_planner`

New tool registration alongside `invoke_agent`. No new parameters on `registerDelegationTools`.

**Parameters:**

| Name      | Type     | Required | Description                                                                      |
| --------- | -------- | -------- | -------------------------------------------------------------------------------- |
| `task`    | `string` | yes      | The high-level task to decompose into a plan.                                    |
| `context` | `string` | no       | Optional additional context (e.g. current document summary, workspace doc list). |

**Execution sequence:**

1. Call `createPlannerAgent(factory)` — runner with empty registry, planner system prompt.
2. Build the prompt: the `task` string, with `context` appended on a new line if provided.
3. Run the agent and collect the `done` event's output string.
4. Parse the output as `Plan` JSON. Throw a descriptive error if parsing fails or the shape is invalid (missing `goal`, missing `steps` array).
5. Return `JSON.stringify(plan)` — the Orchestrator reads step IDs, agent roles, and instructions to orchestrate subsequent execution.

---

### 3. `src/lib/agents/index.ts`

Add re-exports from the new `planner.ts` module:

```ts
export type { Plan, PlanStep } from "./planner";
export { createPlannerAgent, PLANNER_SYSTEM_PROMPT } from "./planner";
```

---

## Files modified

| File                               | Change                                                                      |
| ---------------------------------- | --------------------------------------------------------------------------- |
| `src/lib/tools/DelegationTools.ts` | Register `invoke_planner` tool                                              |
| `src/lib/agents/index.ts`          | Re-export `Plan`, `PlanStep`, `createPlannerAgent`, `PLANNER_SYSTEM_PROMPT` |

## Files created

| File                        | Purpose                                                     |
| --------------------------- | ----------------------------------------------------------- |
| `src/lib/agents/planner.ts` | `Plan` types, `PLANNER_SYSTEM_PROMPT`, `createPlannerAgent` |

---

## Tests

### `planner.test.ts` (new)

```
createPlannerAgent
  ✓ creates runner using the provided factory
  ✓ passes PLANNER_SYSTEM_PROMPT as the agent's system prompt
  ✓ registers no tools (tool list is empty)
```

### `DelegationTools.test.ts` additions

```
invoke_planner
  ✓ returns a JSON string that parses to a Plan with a goal and steps array
  ✓ appends context to the task prompt when context is provided
  ✓ throws when agent output is not valid JSON
  ✓ throws when parsed JSON is missing required Plan fields
```

---

## Working state

Orchestrator can call `invoke_planner(task, context?)` and receive a structured `Plan` as a JSON string. It then dispatches steps via existing tools (`invoke_agent`, `delegate_to_skill`, etc.), whose streaming output is already rendered in the chat. No store or UI changes needed.
