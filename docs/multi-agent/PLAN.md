# Multi-Agent System Plan: Orchestration & Specialized Agents

## Motivation

The current agent is a single generalist loop: it reads, edits, and delegates to user-defined skills. For complex writing tasks — "research my notes, write a new section, then proofread it" — this creates a long, brittle chain of tool calls in a single context window. A structured multi-agent system breaks that work into composable, testable units with clear handoffs.

---

## Branching Strategy

All multi-agent work lives off a long-running `multi-agent` branch. Each phase gets its own short-lived branch and a PR back to `multi-agent`. The `multi-agent` branch is only merged to `main` when the full feature is complete.

**Branch naming:** `multi-agent-phase-a`, `multi-agent-phase-b`, …, `multi-agent-phase-g`.

**Workflow per phase:**

```
# Start of each phase
git checkout multi-agent
git pull origin multi-agent
git checkout -b multi-agent-phase-<x>

# ... implement the phase ...

# End of each phase
gh pr create --base multi-agent --head multi-agent-phase-<x>
```

**PR target:** always `multi-agent`, never `main`.

---

## Existing Codebase Context

Sub-plans are written against these existing files. Each phase lists which of these it modifies.

| File                                 | Current role                                                                                                                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/App.tsx`                        | Constructs `AgentRunner` inline; wires `EditorTools` and `WorkspaceTools` into `ToolRegistry`; holds global React state (API key, model, suggestions, skills).                                                |
| `src/lib/store.tsx`                  | React Context providing the Monaco editor instance, pending `Suggestion[]`, API key, model, token counts.                                                                                                     |
| `src/lib/tools/EditorTools.ts`       | Registers `read`, `read_selection`, `search`, `get_metadata`, `edit`, `write`, `delegate_to_skill`. `edit`/`write` create a `Suggestion` and return a Promise that resolves when the user accepts or rejects. |
| `src/lib/tools/WorkspaceTools.ts`    | Registers workspace tools including `query_workspace_doc` and `query_workspace`, which spin up short-lived `AgentRunner` instances via `AgentRunnerFactory`.                                                  |
| `src/lib/tools/DelegationTools.ts`   | Registers `invoke_agent` and future `invoke_*` tools for the Orchestrator.                                                                                                                                    |
| `src/adapters/GoogleGenAIAdapter.ts` | Implements `LlmAdapter` for `@google/genai`; handles streaming text/thought deltas and tool calls; fires `onEvent` callbacks.                                                                                 |
| `src/components/ChatSidebar.tsx`     | Renders the message list (virtualised), chat input, and `@`-mention autocomplete. Each message is rendered by `ChatItem.tsx`.                                                                                 |
| `src/components/ChatItem.tsx`        | Renders a single message: streaming text, collapsible thinking chunks, tool call/result events.                                                                                                               |

---

## MAST API Surface

These are the relevant interfaces from `@mast-ai/core` that the implementation depends on.

```ts
// Construct an agent runner — adapter provides the LLM, registry provides tools
class AgentRunner {
  constructor(adapter: LlmAdapter, tools?: ToolRegistry);

  // Build a bound runner for a specific agent config, then stream its output
  runBuilder(agentConfig: AgentConfig): {
    runStream(input: string): AsyncIterable<AgentEvent>;
  };

  // One-shot run — awaits the full response and returns { output: string }
  run(agentConfig: AgentConfig, input: string): Promise<{ output: string }>;
}

// Passed to runBuilder / run to configure a single agent invocation
interface AgentConfig {
  name: string; // identifies the agent in events (agentRole)
  instructions: string; // system prompt for this invocation
  tools: string[]; // names of tools from the registry to expose
}

// Register a tool with an object form (definition factory + async call handler)
class ToolRegistry {
  register(tool: {
    definition: () => {
      name: string;
      description: string;
      parameters: JsonSchema;
    };
    call: (args: unknown, context: ToolContext) => Promise<string>;
  }): void;

  definitions(): Array<{
    name: string;
    description: string;
    parameters: JsonSchema;
  }>;
}

interface ToolContext {
  onEvent?: (event: AgentEvent) => void;
}

// Events streamed from runStream()
type AgentEvent =
  | { type: "text_delta"; delta: string; agentName?: string }
  | { type: "thinking_delta"; delta: string }
  | { type: "tool_call"; name: string; args: unknown }
  | { type: "tool_result"; name: string; result: unknown }
  | { type: "done"; output: string };
```

Sub-agents are created by constructing a new `AgentRunner` with a fresh `ToolRegistry`, then calling `runner.runBuilder(agentConfig).runStream(task)` or `runner.run(agentConfig, task)`. Tool names in `AgentConfig.tools` must match names registered on the same registry. Streaming events from sub-agents are forwarded to the parent via `context.onEvent?.()` inside the tool handler.

---

## Approval Workflow Pattern

`edit()` and `write()` in `EditorTools.ts` use a Promise-pause pattern to suspend the agent loop until the user acts:

```ts
// Simplified from EditorTools.ts
registry.register("edit", ..., async ({ originalText, replacementText }) => {
  return new Promise((resolve) => {
    // Adds suggestion to React state; UI renders Accept/Reject buttons
    addSuggestion({ originalText, replacementText, resolve });
  });
  // Promise resolves with "accepted" | "rejected" when the user clicks
});
```

The `invoke_planner` Plan Confirmation Widget uses the same pattern — `invoke_planner` returns a Promise that resolves only after the user confirms or cancels the plan in the UI. The `WorkflowState` update (step statuses) happens as a side-effect when the Promise resolves.

---

## Iteration Loop Enforcement

The 3-cycle Writer → Reviewer cap is enforced in the **tool execution layer**, not the system prompt. `invoke_reviewer` tracks iteration count in a closure over the active `WorkflowState` step. On the third failed review, instead of returning `ReviewResult`, it returns a sentinel that tells the Orchestrator to present the current draft to the user for manual review. The Orchestrator's system prompt instructs it to respect this sentinel rather than retrying.

This split (hard limit in code, soft guidance in prompt) prevents the LLM from reasoning its way around the cap.

---

## Write Access Policy

Only the Orchestrator can perform write operations. All sub-agents — whether invoked via `invoke_agent`, `invoke_planner`, `invoke_researcher`, `invoke_writer`, `invoke_reviewer`, or `delegate_to_skill` — are **read-only**.

Two named registry builders in `src/lib/tools/` enforce this boundary:

- **Read-only registry** — `read`, `read_selection`, `search`, `get_metadata`, `get_active_doc_info`, `list_workspace_docs`, `read_workspace_doc`, `query_workspace_doc`, `query_workspace`. Safe to give to any sub-agent, including concurrently running ones.
- **Read+write registry** — adds `edit`, `write`, `create_document`, `rename_document`, `delete_document`, `switch_active_document`. Used exclusively by the Orchestrator.

### Why this matters

Without this boundary, two concurrently running sub-agents could both read the same document state, compute edits independently, and then race to apply them. The first edit changes the document; the second targets text that no longer exists. The approval workflow (`applySuggestion`) is designed for sequential use and does not protect against this race.

By making all sub-agents read-only, parallel fan-out (Phase F) is safe by construction — no locking or sequencing is required.

### Skills return responses, not direct edits

`delegate_to_skill` follows the same rule. Skills receive a read-only registry and return their response as a plain string. The Orchestrator interprets the response and decides what to do — apply edits via `edit()`, present a summary, ask follow-up questions, etc. This keeps write operations and approval at the Orchestrator level, where it has full conversational context.

---

## Design Goals

1. **Composability** — small, focused agents that do one thing well and can be recombined.
2. **Context efficiency** — each sub-agent gets only the context it needs; main context stays lean.
3. **Human oversight** — the user can see what each agent is doing and approve/reject at key checkpoints.
4. **Incrementalism** — each phase delivers working value without requiring the whole system to be complete.
5. **Write safety** — only the Orchestrator writes; all sub-agents are read-only, making concurrent execution safe by construction.

---

## Agent Roster

### 1. Orchestrator (the current main agent, extended)

**Role:** Receives user intent, decomposes it into a plan, dispatches to specialists, and assembles the final result.

**New responsibilities:**

- Recognise when a task is multi-step and invoke the Planner before acting.
- Route sub-tasks to the appropriate specialist via new delegation tools.
- Aggregate specialist outputs and surface them to the user.
- Gate on user approval at meaningful workflow checkpoints (not just individual edits).

**System prompt additions:**

- Explains when to invoke each specialist.
- Instructs the orchestrator to show the user a plan before beginning multi-step work.

---

### 2. Planner Agent

**Role:** Given a high-level task description, produces a structured, step-by-step work plan. Does **not** execute any steps — planning only.

**Inputs:** Task description, optional context (document list, current document content summary).

**Output:**

```ts
interface Plan {
  goal: string;
  steps: Array<{
    id: string; // e.g. "step_1"
    agent: AgentRole; // "researcher" | "writer" | "reviewer" | "editor" | "generic"
    instruction: string; // what that agent should do
    dependsOn: string[]; // IDs of steps whose output is needed as input
  }>;
}
```

**System prompt sketch:**

> You are a planning agent. Given a writing task and optional context, produce a structured JSON plan.
>
> - Output ONLY valid JSON matching the `Plan` schema. No prose, no markdown fences.
> - Each step must name one agent role: "researcher", "writer", "reviewer", or "generic".
> - Steps that can run independently should declare no `dependsOn`. Steps that need prior output must list the IDs they depend on.
> - Keep steps focused — one agent, one outcome per step.
> - Do not plan more than 6 steps. If the task is simple, 1–2 steps is correct.

**Design notes:**

- The Planner has no tool access; it only reasons over text.
- The Orchestrator presents the plan to the user and asks for confirmation before executing.
- Uses the user's globally selected model.

---

### 3. Research Agent

**Role:** Queries workspace documents and synthesizes relevant information for a given question or task context. Enhancement of the existing `query_workspace_doc` / `query_workspace` pattern.

**Inputs:** Query string, optional list of doc IDs to target (if omitted, queries all).

**Output:**

```ts
interface ResearchResult {
  summary: string; // synthesized answer
  sources: Array<{
    // which docs contributed
    id: string;
    title: string;
    excerpt: string; // most relevant snippet
  }>;
}
```

**System prompt sketch (per-doc sub-agent):**

> You are a document research assistant. You will be given a document's content and a query.
> Return a JSON object: `{ "summary": "...", "excerpt": "..." }` where `summary` answers the query from the document's perspective, and `excerpt` is the most relevant verbatim passage (≤ 200 chars). If the document contains nothing relevant, return `{ "summary": "No relevant content.", "excerpt": "" }`.

**System prompt sketch (synthesizer sub-agent):**

> You are a research synthesizer. You will be given a query and a list of per-document summaries.
> Combine them into a single coherent answer. Cite the source document title for any claim. Return JSON: `{ "summary": "..." }`.

**Design notes:**

- Internally runs the existing map-reduce pattern (per-doc query → synthesizer).
- Returns structured output so the Orchestrator and Writer can consume it reliably.
- Source excerpts allow the Writer to attribute claims without re-querying.
- Can run in parallel with other agents when the plan has no dependency.
- **No specialized chat UI.** `invoke_researcher` doesn't stream child events, so it renders as a plain ToolItem showing params + result. The Orchestrator's text response conveys attribution naturally.

---

### 4. Writer Agent

**Role:** Produces draft text (a section, paragraph, or full document) given explicit instructions and structured context from the Planner and Research Agent.

**Inputs:** Writing instruction, optional research result, optional style context (e.g. existing document excerpt for tone matching).

**Output:** Plain text draft.

**System prompt sketch:**

> You are a writing specialist. You produce draft text based on explicit instructions and provided context.
>
> - Write only the requested content — no preamble, no explanation, no markdown fences unless the content itself is markdown.
> - If research context is provided, use it and attribute claims where appropriate.
> - If style context is provided, match its tone, voice, and formatting conventions.
> - Do not call any tools. Return the draft text directly as your response.

**Design notes:**

- The Writer does **not** call `edit()` or `write()` directly; it returns raw text to the Orchestrator.
- The Orchestrator then calls `edit()` / `write()` with the draft, triggering the normal approval workflow.
- Separating generation from application keeps the approval model clean.
- Uses the user's globally selected model.
- **No specialized chat UI.** `invoke_writer` renders as a plain ToolItem. The user sees the result when the Orchestrator surfaces it through the edit/write approval flow.

---

### 5. Generic Agent

**Role:** A general-purpose, context-isolated sub-agent the Orchestrator can spin up on the fly with a dynamically constructed system prompt. Acts as an escape hatch for tasks that don't fit any pre-optimized specialist.

**Inputs:** `systemPrompt: string`, `task: string`, optional `tools?: ToolRegistry`.

**Output:** `{ result: string }` — raw text response.

**Design notes:**

- The pre-optimized specialists (Planner, Researcher, Writer, Reviewer) should be preferred when they fit — their prompts are tuned and their outputs are structured.
- The Generic Agent is for one-off reasoning tasks the Orchestrator can't anticipate: transforming data into a specific format, answering a narrow question from injected context, running an ad-hoc classification, etc.
- Because the system prompt is constructed at runtime, the Orchestrator bears responsibility for quality — it should be explicit and constrained in what it asks for.
- Context isolation is the primary value: work stays out of the main context window regardless of how novel the task is.
- No tool access by default; tools can be injected when needed (e.g. giving a generic agent read-only workspace access for a one-off lookup).

---

### 6. Review Agent

**Role:** Evaluates a piece of text against a set of criteria and returns structured feedback. Can be specialised by injecting different criteria.

**Inputs:** Text to review, review criteria (list of strings or a skill instruction).

**Output:**

```ts
interface ReviewResult {
  passed: boolean;
  issues: Array<{
    severity: "error" | "warning" | "suggestion";
    location?: string; // quoted excerpt where the issue occurs
    description: string;
    fix?: string; // optional suggested fix
  }>;
  summary: string;
}
```

**Specialisations (via criteria injection):**

- **Proofreader** — grammar, spelling, punctuation.
- **Style enforcer** — adherence to a user-provided style guide doc.
- **Fact-checker** — consistency with workspace reference documents.
- **Structural reviewer** — outline completeness, logical flow.

**System prompt sketch:**

> You are a review specialist. You evaluate text against the provided criteria and return structured feedback.
>
> - Output ONLY valid JSON matching the `ReviewResult` schema. No prose outside the JSON.
> - For each issue, quote the exact excerpt where it occurs in `location`.
> - Use severity "error" for clear mistakes, "warning" for debatable issues, "suggestion" for improvements.
> - If no issues are found, return `{ "passed": true, "issues": [], "summary": "No issues found." }`.

**Design notes:**

- The Orchestrator decides whether to apply fixes automatically or present them to the user.
- If `passed: false` with `errors`, the Orchestrator can re-invoke the Writer with the feedback before presenting to the user.
- The existing user-defined Skills can map cleanly onto this interface.
- **No specialized chat UI.** `invoke_reviewer` renders as a plain ToolItem showing the `ReviewResult` JSON.

---

## Orchestration Patterns

### Sequential Pipeline

```
User: "Write a new conclusion for my essay, checking my notes for the key points"

Orchestrator
  → Planner: decompose task
  → [show plan to user, confirm]
  → Research Agent: query workspace for key points
  → Writer Agent: draft conclusion using research result
  → Review Agent: proofread the draft
  → Orchestrator: apply draft via edit() / write() → user approval
```

### Parallel Fan-Out

```
User: "Proofread section 2 and fact-check section 3 at the same time"

Orchestrator
  → Planner: split into parallel branches
  → [in parallel]
      Review Agent (proofreader) on section 2
      Review Agent (fact-checker) on section 3
  → Orchestrator: collect results, present combined issues
```

### Iterative Refinement

```
User: "Draft a new introduction and keep revising until it's clean"

Orchestrator
  → Writer Agent: initial draft
  → Review Agent: critique
  → [if issues] Writer Agent: revise with feedback  ← repeats up to N times
  → [if clean or N reached] present to user for approval
```

---

## New Delegation Tools (for the Orchestrator)

### `invoke_planner(task, context?)`

- **Input:** `task: string`, `context?: { docList?: {id, title}[], activeDocSummary?: string }`
- **Output:** `{ plan: Plan }`
- Creates a short-lived `AgentRunner` with no tools. Returns structured JSON plan.
- The Orchestrator must display this plan to the user and wait for confirmation before proceeding.

### `invoke_researcher(query, docIds?)`

- **Input:** `query: string`, `docIds?: string[]`
- **Output:** `{ result: ResearchResult }`
- Delegates to the Research Agent pipeline. Wraps the existing `query_workspace` logic with the richer structured output.

### `invoke_writer(instruction, researchContext?, styleContext?)`

- **Input:** `instruction: string`, `researchContext?: ResearchResult`, `styleContext?: string`
- **Output:** `{ draft: string }`
- Creates a short-lived writing-focused `AgentRunner`. Returns raw draft text — does **not** apply edits.

### `invoke_reviewer(text, criteria)`

- **Input:** `text: string`, `criteria: string[]` or `skillName: string`
- **Output:** `{ result: ReviewResult }`
- Creates a short-lived reviewing `AgentRunner`. Returns structured feedback.

### `invoke_agent(systemPrompt, task, tools?)`

- **Input:** `systemPrompt: string`, `task: string`, `tools?: string[]` (names of tool groups to inject, e.g. `["workspace_readonly"]`)
- **Output:** `{ result: string }`
- Spins up a one-shot `AgentRunner` with the provided system prompt. For tasks that don't fit a pre-optimized specialist. The Orchestrator is responsible for prompt quality; output is unstructured text.

---

## UI Changes

### Agent Attribution in Chat

Only delegation tools that stream child events get attributed `AgentItem` blocks in `ChatSidebar`:

- `invoke_agent` → `AgentItem` with `agentRole: "Agent"` (already implemented)
- `invoke_planner` → rendered as a plain ToolItem (the plan is surfaced via `PlanConfirmationWidget`, not a streaming block)

All other delegation tools (`invoke_researcher`, `invoke_writer`, `invoke_reviewer`) render as plain ToolItems showing their params and result. Attributed chat blocks add complexity only worth paying when there are streaming child events to display.

### Plan Confirmation Widget

When the Orchestrator invokes the Planner, the resulting plan is displayed as an interactive checklist in the chat. The user can:

- **Confirm** — proceed with all steps.
- **Cancel** — abort the workflow.

Step editing and removal are deferred — confirm/cancel is sufficient for now.

---

## Directory Structure

Agent definitions live under `src/lib/agents/`. Tool implementations live under `src/lib/tools/`. The delegation tools import from both.

```text
src/lib/agents/
├── index.ts          — re-exports all agent factories
├── factory.ts        — AgentRunnerFactory interface + DefaultAgentRunnerFactory
├── orchestrator.ts   — buildOrchestratorPrompt(skills): string
├── planner.ts        — PlannerAgent: system prompt + createPlannerAgent()
├── researcher.ts     — ResearchAgent: system prompt + createResearcherAgent()
├── writer.ts         — WriterAgent: system prompt + createWriterAgent()
├── reviewer.ts       — ReviewAgent: system prompt + createReviewerAgent()
└── generic.ts        — createGenericAgent(systemPrompt) — no fixed prompt

src/lib/tools/
├── EditorTools.ts       — editor tool implementations + registerEditorTools()
├── WorkspaceTools.ts    — workspace tool implementations + registerWorkspaceTools()
├── DelegationTools.ts   — invoke_agent and future invoke_* tools
├── registries.ts        — buildReadonlyRegistry() + buildReadWriteRegistry()
```

`orchestrator.ts` exports `buildOrchestratorPrompt(skills)` — workspace guidance is always included since the agent never runs without an active workspace. `registries.ts` exports the two named registry builders that enforce the write access policy across all sub-agent creation sites.

---

## Data Flow Changes

### `AgentMessage` type extension

Add optional `agentRole` and `parentMessageId` fields to the existing chat message type, enabling hierarchical display of sub-agent activity under the parent orchestrator message.

### `AgentRunnerFactory`

Extract the `AgentRunner` construction logic from `App.tsx` and `WorkspaceTools.ts` into `src/lib/agents/factory.ts`:

```ts
interface AgentRunnerFactory {
  create(options: {
    systemPrompt?: string;
    tools?: ToolRegistry;
    model?: string;
  }): AgentRunner;
}
```

The factory is constructed once in `App.tsx` with the user's selected model baked in, then injected into all tools that create sub-agents (`WorkspaceTools`, `EditorTools`, and the new delegation tools). Sub-agents always use the same model as the main agent unless overridden via `model`. This also makes tools testable without hitting the real API.

### Plan execution state

A `WorkflowState` object tracks the active plan during execution:

```ts
interface WorkflowState {
  planId: string;
  steps: Array<{
    id: string;
    status: "pending" | "running" | "done" | "failed" | "skipped";
    result?: unknown;
  }>;
}
```

This is held in React state (not localStorage) and drives the Plan Confirmation Widget and parallel progress UI.

---

## Implementation Phases

> **PR workflow reminder:** each phase uses `multi-agent-phase-<x>` branched off `multi-agent`, with a PR back to `multi-agent` — never to `main`. See the Branching Strategy section above for the exact commands.

### Phase A: Foundation ✅

**Goal:** Establish the shared infrastructure all agents depend on — factory, delegation tools, generic agent, streaming attribution, and `WorkflowState`.

**Completed:**

- `AgentRunnerFactory` interface + `DefaultAgentRunnerFactory` in `src/lib/agents/factory.ts`.
- `WorkspaceTools` and `EditorTools` refactored to accept the factory via dependency injection.
- Orchestrator system prompt extracted to `src/lib/agents/orchestrator.ts` as `buildOrchestratorPrompt(skills)` — `hasWorkspace` parameter removed (always true at runtime).
- `src/lib/tools/DelegationTools.ts` with `invoke_agent` tool; sub-agents receive `"workspace_readonly"` tool group only.
- `src/lib/agents/generic.ts` — thin `createGenericAgent()` wrapper.
- `WorkflowState` added to `store.tsx`.
- `"agent"` `StreamItem` kind + `AgentItem` component in `ChatItem.tsx`; `ChatSidebar.tsx` routes `invoke_agent` events to attributed blocks.
- Tool files reorganised from `src/lib/` into `src/lib/tools/`.

**Working state:** Orchestrator can delegate any ad-hoc task to a generic sub-agent and its output streams into an attributed chat block.

---

### Phase B: Tool Registry Refactor ✅

**Goal:** Enforce the write access policy in code. All sub-agent creation sites use named registry builders; skills receive a read-only registry and return their response as a plain string for the Orchestrator to act on. No user-visible features — purely infrastructure.

**Completed:**

- Created `src/lib/tools/registries.ts` exporting `buildReadonlyRegistry(editorTools, workspaceTools)` and `buildReadWriteRegistry(editorTools, workspaceTools)`.
- Added `registerReadonlyEditorTools` to `EditorTools.ts`; `registerWorkspaceTools` now calls `registerReadonlyWorkspaceTools` internally to eliminate duplication.
- Refactored `delegate_to_skill` in `EditorTools.ts` to give skills a read-only registry and return the skill's raw string response. The Orchestrator interprets the response and decides what to do — apply edits via `edit()`, present a summary, etc.
- Updated `invoke_agent` group resolution in `DelegationTools.ts` to use `buildReadonlyRegistry()`. `workspaceTools` parameter made non-nullable.
- Updated orchestrator system prompt to instruct the Orchestrator to interpret the skill's string response and act accordingly.
- Default skill instructions updated to be natural — no output format constraints, skills describe their findings and the Orchestrator acts on them.

**Files modified:** `src/lib/tools/DelegationTools.ts`, `src/lib/tools/EditorTools.ts`, `src/lib/tools/WorkspaceTools.ts`, `src/lib/agents/orchestrator.ts`, `src/App.tsx`, `src/lib/skills.ts`.

**Files created:** `src/lib/tools/registries.ts`.

**Tests:** `buildReadonlyRegistry` excludes write tools; `buildReadWriteRegistry` includes them; `delegate_to_skill` returns the skill's raw response string; existing `invoke_agent` tests still pass; `workspace_readonly` group excludes write tools.

**Working state:** Write access policy enforced in code. Skills and generic sub-agents are structurally read-only. Orchestrator is the sole writer and decides how to interpret and apply skill responses.

---

### Phase C: Planner Agent ✅

**Goal:** Implement the LLM agent that decomposes a task into a structured `Plan` and wire it as an invokable tool. No UI gate yet — `invoke_planner` returns the plan as a string and the Orchestrator proceeds immediately.

- Implement `src/lib/agents/planner.ts`: system prompt, no tool access, structured `Plan` output.
- Register `invoke_planner` in `DelegationTools.ts`: runs the planner agent and returns the `Plan` as a JSON string.
- Extend `WorkflowState.steps` to add `label: string` (needed by the confirmation widget in the next phase).

**Files modified:** `src/lib/tools/DelegationTools.ts`, `src/lib/agents/index.ts`, `src/lib/store.tsx` (add `label` to `WorkflowState.steps`).

**Files created:** `src/lib/agents/planner.ts`.

**Tests:** Planner factory sets correct system prompt and no tools; `invoke_planner` returns a valid `Plan` JSON string.

**Working state:** Orchestrator can call `invoke_planner` and receive a structured plan. Execution continues without pausing for user approval.

---

### Phase D: Plan Confirmation ✅

**Goal:** Gate plan execution behind explicit user approval. `invoke_planner` pauses after producing a plan, populates `WorkflowState`, and waits for the user to confirm or cancel — the same pattern as `pendingTabSwitchRequest`.

- Add `pendingPlanConfirmation: PlanConfirmationRequest | null` + setter to `EditorUIState` in `store.tsx`. `PlanConfirmationRequest` carries the plan and a `resolve(accepted: boolean)` callback.
- Update `invoke_planner` in `DelegationTools.ts` to: set `WorkflowState` with the plan steps, call the confirmation callback, and await the user's decision before returning.
- Pass the `setPendingPlanConfirmation` callback from `App.tsx` into `registerDelegationTools`.
- `PlanConfirmationWidget` reads `pendingPlanConfirmation` from `useEditorUI()` and renders the step list with confirm/cancel buttons.
- `ChatSidebar` renders the widget inline when a plan is pending.

**Files modified:** `src/lib/store.tsx` (add `PlanConfirmationRequest` + `pendingPlanConfirmation` to `EditorUIState`), `src/lib/tools/DelegationTools.ts` (add confirmation await to `invoke_planner`), `src/App.tsx` (pass `setPendingPlanConfirmation` into `registerDelegationTools`), `src/components/ChatSidebar.tsx` (render `PlanConfirmationWidget` when pending).

**Files created:** `src/components/PlanConfirmationWidget.tsx`.

**Tests:** `invoke_planner` resolves when confirmation callback is called with `true`; rejects/skips when called with `false`; `pendingPlanConfirmation` is cleared after resolution.

**Working state:** User sees a step-by-step plan and must confirm before the Orchestrator acts on it.

---

### Phase E: Eval Infrastructure ✅

**Goal:** Add the two-tier eval harness and the first eval suite (planning quality). All subsequent phases drop their eval files straight into this structure.

- Add `vitest.evals.config.ts` and `npm run evals` script to `package.json`.
- Implement the shared `judge(text, rubric, criteria)` helper in `src/lib/agents/evals/judge.ts`.
- Write the first eval: `planning.eval.ts` + `fixtures/planning.json` — score plan quality with LLM-as-judge.

**Files modified:** `package.json`.

**Files created:** `vitest.evals.config.ts`, `src/lib/agents/evals/judge.ts`, `src/lib/agents/evals/planning.eval.ts`, `src/lib/agents/evals/fixtures/planning.json`.

**Evals:** `src/lib/agents/evals/planning.eval.ts` + `fixtures/planning.json` — score plan quality with LLM-as-judge; target ≥ 4 average on 1–5 rubric.

**Working state:** `npm run evals` runs the planning eval suite against the live API. All future phases add eval files without touching infrastructure.

---

### Phase F: Research Agent ✅

**Goal:** Upgrade the existing workspace query pipeline to return structured, attributable `ResearchResult`.

- Implement `src/lib/agents/researcher.ts` + `invoke_researcher` tool in `DelegationTools.ts`, wrapping existing `query_workspace` logic.
- Update per-doc summaries to include source excerpt field.
- Research Agent block in chat (collapsible, source list inside).

**Files modified:** `src/lib/tools/DelegationTools.ts`, `src/lib/agents/index.ts`, `src/lib/tools/WorkspaceTools.ts` (extract query logic for reuse), `src/components/ChatItem.tsx`, `src/components/ChatSidebar.tsx` (detect `invoke_researcher` calls → create attributed researcher block).

**Files created:** `src/lib/agents/researcher.ts`, `src/lib/agents/evals/routing.eval.ts`, `src/lib/agents/evals/fixtures/routing.json`.

**Tests:** `invoke_researcher` returns valid `ResearchResult`; source excerpts present; falls back correctly when no docs match.

**Evals:** `fixtures/routing.json` + `routing.eval.ts` — now that Planner and Researcher both exist, assert Orchestrator routes to the right agent for a labelled set of prompts.

**Working state:** Orchestrator can research across workspace docs and return structured, attributable results.

---

### Phase G: Writer Agent

**Goal:** Separate content generation from content application.

- Implement `src/lib/agents/writer.ts` + `invoke_writer` tool in `DelegationTools.ts` (no tool access, text generation only).
- Orchestrator receives draft text and applies it via `edit()` / `write()` through the normal approval workflow.
- `invoke_writer` renders as a plain ToolItem — no specialized chat UI.

**Files modified:** `src/lib/tools/DelegationTools.ts`, `src/lib/agents/index.ts`.

**Files created:** `src/lib/agents/writer.ts`, `src/lib/agents/evals/writing.eval.ts`, `src/lib/agents/evals/fixtures/writing.json`.

**Tests:** Writer factory has no tools; `invoke_writer` returns raw text; Orchestrator correctly passes research context through to the prompt.

**Evals:** `fixtures/writing.json` + `writing.eval.ts` — score draft on relevance, coherence, and style match using the `judge` helper.

**Working state:** Orchestrator can delegate drafting to a specialist and apply the result through the approval workflow.

---

### Phase H: Review Agent + Iterative Refinement

**Goal:** Structured feedback loop before content is applied; Writer → Reviewer cycles guided by the Orchestrator's system prompt.

- Implement `src/lib/agents/reviewer.ts` + `invoke_reviewer` tool in `DelegationTools.ts`.
- Orchestrator loops Writer → Reviewer; the iteration cap and retry behaviour are expressed in the Orchestrator's system prompt ("loop at most 3 times; if a step fails twice, report to the user and stop"), not in application state.
- `invoke_reviewer` renders as a plain ToolItem — no specialized chat UI.

**Files modified:** `src/lib/tools/DelegationTools.ts`, `src/lib/agents/index.ts`, `src/lib/agents/orchestrator.ts` (add Writer → Reviewer loop guidance and iteration cap instruction).

**Files created:** `src/lib/agents/reviewer.ts`, `src/lib/agents/evals/reviewing.eval.ts`, `src/lib/agents/evals/fixtures/reviewing.json`.

**Tests:** Reviewer returns valid `ReviewResult`; `invoke_reviewer` passes criteria through to the agent prompt.

**Evals:** `fixtures/reviewing.json` + `reviewing.eval.ts` — score recall (missed errors) and precision (false positives) against known-error fixtures.

**Working state:** Orchestrator can proofread or fact-check a draft, iterate to fix issues, and present the final result for user approval.

---

### Phase I: Parallel Execution + Full Pipelines

**Goal:** Enable the Planner to express parallel branches and validate end-to-end pipelines against the single-agent baseline.

- Update `Plan.steps[].dependsOn` to support parallel fan-out; execute independent steps concurrently via `Promise.all`.
- No dedicated parallel progress UI — parallel tool calls appear as sequential ToolItems as they complete, which is sufficient.

**Files modified:** `src/lib/tools/DelegationTools.ts` (parallel step execution via `Promise.all`), `src/lib/store.tsx` (`WorkflowState` parallel branch tracking).

**Files created:** `src/lib/agents/evals/pipeline.eval.ts`, `src/lib/agents/evals/fixtures/pipeline.json`.

**Tests:** Parallel steps fire concurrently; dependent steps wait for their inputs.

**Evals:** `fixtures/pipeline.json` + `pipeline.eval.ts` — run representative end-to-end tasks through the full Orchestrator loop and compare output quality against the current single-agent baseline using LLM-as-judge.

**Working state:** Full orchestration pipelines with parallel branches and iterative refinement.

---

## Evaluation Strategy

### Two-tier test separation

| Tier       | File suffix | Command         | Hits API    | Runs in CI         |
| ---------- | ----------- | --------------- | ----------- | ------------------ |
| Unit tests | `*.test.ts` | `npm run test`  | No (mocked) | Every commit       |
| Evals      | `*.eval.ts` | `npm run evals` | Yes (real)  | Scheduled / manual |

Add a `vitest.evals.config.ts` alongside the existing Vitest config:

```ts
// vitest.evals.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.eval.ts"],
    testTimeout: 60_000, // evals can be slow
    retry: 1, // one retry for flaky network calls
    poolOptions: { threads: { maxThreads: 2 } }, // limit parallel API calls
  },
});
```

Add to `package.json`:

```json
"evals": "vitest run --config vitest.evals.config.ts"
```

### What each tier tests

**Unit tests (`*.test.ts`)** — structure and wiring, always mocked:

- Agent factory creates an `AgentRunner` with the correct system prompt and tools.
- Delegation tools (`invoke_planner`, `invoke_writer`, etc.) pass the right inputs to the factory.
- Structured outputs (`Plan`, `ResearchResult`, `ReviewResult`) parse without error.
- Orchestrator routing logic (which tool gets called for a given task shape).

**Evals (`*.eval.ts`)** — output quality, real API calls:

- **Routing eval** — given a set of labelled user prompts, assert the Orchestrator invokes the expected agent(s). Scored as pass/fail per prompt; target ≥ 90 % on the golden set.
- **Plan quality eval** — given a task description, run the Planner and score the output with an LLM-as-judge rubric (steps are concrete, ordered, non-redundant). Score 1–5; target ≥ 4 average.
- **Writer quality eval** — given an instruction + research context, run the Writer and score the draft on relevance, coherence, and style match. LLM-as-judge; target ≥ 4 average.
- **Reviewer accuracy eval** — inject text with known errors, run the Reviewer, assert the `issues` list catches them. Scored as recall (missed errors) and precision (false positives); targets ≥ 0.85 recall, ≤ 0.10 false-positive rate.
- **Pipeline eval** — run a small set of representative end-to-end tasks through the full Orchestrator loop and compare final output quality against the current single-agent baseline using LLM-as-judge.

### Golden set location

```text
src/lib/agents/evals/
├── fixtures/
│   ├── routing.json      — { prompt, expectedAgents }[]
│   ├── planning.json     — { task, rubric }[]
│   ├── writing.json      — { instruction, context, rubric }[]
│   └── reviewing.json    — { text, knownErrors, rubric }[]
├── routing.eval.ts
├── planning.eval.ts
├── writing.eval.ts
├── reviewing.eval.ts
└── pipeline.eval.ts
```

Fixtures are static JSON — they don't change with the code, so regressions are detectable when a prompt change causes a previously passing fixture to fail.

### LLM-as-judge helper

A shared `judge(text, rubric, criteria)` utility in `src/lib/agents/evals/judge.ts` calls the API with the rubric and returns a numeric score. All evals that need quality scoring import this helper so the judging model and prompt are consistent.

---

## Open Questions

1. **Model selection per agent** — All agents default to the user's globally selected model. Per-agent overrides are out of scope for now.
2. **Plan persistence** — In-progress plans are not persisted across page reloads. A reload cancels any active workflow.
3. **Max iteration guard** — Hard limit of 3 iterations (Writer → Reviewer cycles) before forcing user approval. Not configurable — beyond 3 passes the instructions or context are likely the problem, not the output.
4. **Streaming sub-agent output** — Sub-agent responses stream into the chat with agent attribution, same as the main agent. The `context.onEvent?.()` callback in each tool handler is the hook for this — tools that run sub-agents call `context.onEvent?.()` for each event so the parent agent can route streamed deltas into the correct attributed chat block.
5. **Skill → Reviewer mapping** — They serve different purposes and both remain. `invoke_reviewer` is an internal pipeline tool: it returns structured `ReviewResult` so the Orchestrator can act on it programmatically (loop back to the Writer, count errors, pass/fail). `delegate_to_skill` is the user-facing delegation path: it runs a user-defined skill with a read-only registry and returns `ProposedEdit[]` for the Orchestrator to apply. No unification needed.
6. **Error recovery** — If a mid-pipeline step fails, the Orchestrator retries it once. If it fails again, the step is skipped and the pipeline continues with the remaining steps. The skipped step and its error are reported to the user in chat.
