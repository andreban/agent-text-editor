# Phase F: Research Agent

## Goal

Implement the Research Agent as a structured pipeline that replaces the ad-hoc `query_workspace` / `query_workspace_doc` calls. Phase F introduces `researcher.ts`, the `invoke_researcher` delegation tool, and wires it into the existing `AgentItem` chat block — no new UI components.

---

## Context

Phase E delivered:

- `vitest.evals.config.ts` and the `npm run evals` script.
- The shared `judge(text, rubric, criteria, adapter)` helper in `src/lib/agents/evals/judge.ts`.
- The first eval suite: `planning.eval.ts` + `fixtures/planning.json`.

The existing `query_workspace` and `query_workspace_doc` methods on `WorkspaceTools` already implement a map-reduce pattern: per-doc sub-agents produce summaries, a synthesizer sub-agent merges them. Phase F lifts this logic into a proper agent with a typed output (`ResearchResult`) and exposes it through a first-class delegation tool. The per-doc sub-agents are updated to also extract an `excerpt` field so the Orchestrator and Writer can attribute claims in their responses.

---

## What changes

### 1. `ResearchResult` type (in `src/lib/agents/researcher.ts`)

```ts
export interface ResearchSource {
  id: string;
  title: string;
  excerpt: string; // most relevant verbatim passage, ≤ 200 chars
}

export interface ResearchResult {
  summary: string;
  sources: ResearchSource[];
}
```

These types are exported from `researcher.ts` and re-exported through `src/lib/agents/index.ts`.

---

### 2. `src/lib/agents/researcher.ts` (new)

Contains the system prompts, factory functions, and the shared `runResearch` helper.

**Per-document querier system prompt:**

```
You are a document research assistant. You will be given a document's content and a query.
Return ONLY valid JSON: { "summary": "...", "excerpt": "..." }
- summary: a concise answer to the query from this document's perspective (1–3 sentences).
- excerpt: the single most relevant verbatim passage from the document (≤ 200 characters).
If the document contains nothing relevant, return { "summary": "No relevant content.", "excerpt": "" }.
```

**Synthesizer system prompt:**

```
You are a research synthesizer. You will be given a query and a list of per-document summaries with their source titles.
Produce ONLY valid JSON: { "summary": "..." }
- summary: a single coherent answer that combines the per-document summaries. Cite document titles for any claim (e.g. "According to 'Style Guide', ...").
- If all summaries say "No relevant content.", return { "summary": "No relevant content found in workspace." }.
```

**Factory functions** (same pattern as `createPlannerAgent`):

```ts
export function createDocQuerierAgent(factory: AgentRunnerFactory): AgentRunner
export function createSynthesizerAgent(factory: AgentRunnerFactory): AgentRunner
```

**Core research logic:**

```ts
export async function runResearch(
  query: string,
  docs: WorkspaceDocument[],
  factory: AgentRunnerFactory,
  docIds?: string[],
): Promise<ResearchResult>
```

- Filters `docs` to only those in `docIds` if provided; otherwise uses all docs.
- Runs each filtered doc through `createDocQuerierAgent` in series (parallel is Phase I). Collects `{ summary, excerpt }` per doc.
- Filters out docs where `summary === "No relevant content."` — these are excluded from `sources`.
- Passes the remaining summaries to `createSynthesizerAgent` to produce the final `summary`.
- Returns `ResearchResult` with the synthesized `summary` and a `sources` array of `{ id, title, excerpt }` for each contributing doc.

---

### 3. `WorkspaceTools.ts` — update `query_workspace_doc` and `query_workspace`

`query_workspace_doc` is updated to use the new per-doc querier system prompt and return `{ summary, excerpt }` instead of `{ summary }`. The tool registration description is updated to reflect the new `excerpt` field.

`query_workspace` is refactored to call `runResearch` internally so the two share the same prompt logic. Its return shape changes from `{ answer }` to `{ summary, sources }` to match `ResearchResult`. The tool registration description is updated accordingly.

`docsRef` is exposed as a public readonly property so `registerDelegationTools` can access it without widening the function signature.

---

### 4. `DelegationTools.ts` — add `invoke_researcher` tool

```ts
registry.register({
  definition: () => ({
    name: "invoke_researcher",
    description:
      "Queries workspace documents and synthesizes a structured answer. Returns JSON: { summary, sources: [{ id, title, excerpt }] }. Use this when the task requires finding information across workspace documents before writing or reviewing.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The question or information need to research.",
        },
        docIds: {
          type: "array",
          items: { type: "string" },
          description:
            "Optional list of document IDs to restrict the search to. If omitted, all workspace documents are queried.",
        },
      },
      required: ["query"],
    },
  }),
  call: async (args: { query: string; docIds?: string[] }) => {
    const docs = workspaceTools.docsRef.current;
    const result = await runResearch(args.query, docs, factory, args.docIds);
    return JSON.stringify(result);
  },
});
```

---

### 5. Orchestrator system prompt update (`src/lib/agents/orchestrator.ts`)

Add guidance for when to use `invoke_researcher` vs direct workspace tools:

> Use `invoke_researcher` when a plan step calls for synthesized research across workspace documents — it returns a structured answer with source attributions the Writer can cite. Use `query_workspace_doc` for a quick targeted lookup of a single known document. Prefer `invoke_researcher` for any multi-document or open-ended information need.

---

### 7. `src/lib/agents/evals/fixtures/routing.json` (new)

Ten routing fixtures. Each entry has:

```json
{
  "prompt": "string — what the user typed",
  "expectedTool": "invoke_planner" | "invoke_researcher" | "none",
  "rationale": "string — why this tool is correct"
}
```

Coverage (5 researcher, 3 planner, 2 none/direct):

| # | Prompt type | Expected tool |
|---|-------------|--------------|
| 1 | "Find all mentions of the deadline in my notes" | `invoke_researcher` |
| 2 | "Summarise the key points from my research documents" | `invoke_researcher` |
| 3 | "What does the style guide say about headings?" | `invoke_researcher` |
| 4 | "Look up the background section in my outline" | `invoke_researcher` |
| 5 | "What do my docs say about the target audience?" | `invoke_researcher` |
| 6 | "Write a blog post about async collaboration" | `invoke_planner` |
| 7 | "Research my notes and draft a conclusion" | `invoke_planner` |
| 8 | "Edit this paragraph to be more concise" | `none` |
| 9 | "Fix the typos in the selection" | `none` |
| 10 | "Write a one-line summary of the active document" | `none` |

---

### 8. `src/lib/agents/evals/routing.eval.ts` (new)

Asserts that the Orchestrator routes each fixture to the expected tool (or makes no delegation call for `"none"` fixtures).

**Setup:**

- Reads `GEMINI_API_KEY` and `GEMINI_MODEL` from `process.env`.
- Uses `describe.skipIf(!apiKey)` so the suite is skipped cleanly when no key is present.
- Creates a `GoogleGenAIAdapter` and `DefaultAgentRunnerFactory`.

**Stub tools:**

Register lightweight stubs for `invoke_planner`, `invoke_researcher`, and `invoke_agent` that push their tool name to a `calledTools: string[]` array and return a minimal valid response (`"{}"` for planner, `'{"summary":"","sources":[]}'` for researcher) so the Orchestrator can continue without errors.

**Per-fixture test (`it.each`):**

1. Reset `calledTools = []`.
2. Build the orchestrator `AgentConfig` with the full tool set (including stubs).
3. Stream `runner.runBuilder(agentConfig).runStream(fixture.prompt)` until `done`.
4. Assert `calledTools` contains `fixture.expectedTool` (or is empty for `"none"` fixtures).

**Aggregate test:**

One final `it("routing accuracy ≥ 80%")` counts passing fixtures and asserts the pass rate is at least 80%, tolerating a few model misjudgements without hard-failing.

---

## Files modified

| File | Change |
|------|--------|
| `src/lib/tools/WorkspaceTools.ts` | Update `query_workspace_doc` to return `{ summary, excerpt }`. Refactor `query_workspace` to delegate to `runResearch`. Expose `docsRef` as public. |
| `src/lib/tools/DelegationTools.ts` | Add `invoke_researcher` tool registration. |
| `src/lib/agents/index.ts` | Re-export `ResearchResult`, `ResearchSource` from `researcher.ts`. |
| `src/lib/agents/orchestrator.ts` | Add guidance for `invoke_researcher` vs `query_workspace_doc`. |

## Files created

| File | Purpose |
|------|---------|
| `src/lib/agents/researcher.ts` | `ResearchResult` types, agent factory functions, `runResearch` helper. |
| `src/lib/agents/evals/routing.eval.ts` | Routing accuracy eval suite. |
| `src/lib/agents/evals/fixtures/routing.json` | Ten routing fixtures. |

---

## Tests

New unit tests in `src/lib/tools/DelegationTools.test.ts` (or a new `researcher.test.ts`):

- `invoke_researcher` with two docs returns a `ResearchResult` with `summary` string and `sources` array.
- Each source in `sources` has `id`, `title`, and `excerpt` fields.
- `invoke_researcher` with `docIds` filters to only the specified docs.
- When no docs contain relevant content, `sources` is empty and `summary` indicates no content was found.
- `query_workspace_doc` result now includes an `excerpt` field alongside `summary`.

Existing `WorkspaceTools.test.ts` tests must remain green; update assertions for `query_workspace_doc` to accept the new `{ summary, excerpt }` shape.

---

## Evals

`npm run evals` runs both `planning.eval.ts` (Phase E) and `routing.eval.ts` (Phase F). No infrastructure changes needed.

---

## Branch & PR

```
git checkout multi-agent && git pull origin multi-agent
git checkout -b multi-agent-phase-f
# ... implement ...
gh pr create --base multi-agent --head multi-agent-phase-f
```

---

## Working state

`invoke_researcher` is available to the Orchestrator as a first-class delegation tool. Calling it runs the map-reduce pipeline across workspace documents and returns a structured `ResearchResult`. The chat sidebar shows it as a collapsible `Researcher` agent block (reusing the existing `AgentItem`). The orchestrator system prompt guides the agent to prefer `invoke_researcher` for multi-document research needs. Routing evals confirm the Orchestrator calls the right agent for the right class of prompt.
