# Phase E: Eval Infrastructure

## Goal

Add the two-tier eval harness and the first eval suite. Phase E establishes the infrastructure all subsequent phases drop eval files into: a separate Vitest config for evals, a shared LLM-as-judge helper, and the first concrete eval measuring planning quality.

---

## Context

Phase D delivered:

- `PlanConfirmationRequest` type and `pendingPlanConfirmation` state in the store
- `invoke_planner` now awaits user confirmation before returning the plan
- `PlanConfirmationWidget` renders inline in `ChatSidebar`

The eval tier is separate from the unit test tier. Unit tests mock the LLM and verify structure; evals call the real API and measure output quality. Phase E puts the infrastructure in place so later phases add eval files without any setup work.

---

## What changes

### 1. `vitest.evals.config.ts` (new)

A standalone Vitest config that picks up only `*.eval.ts` files. No React plugin, no `jsdom`, no setup files — evals run in Node and call the real API.

```ts
// vitest.evals.config.ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    include: ["src/**/*.eval.ts"],
    testTimeout: 60_000,
    retry: 1,
    poolOptions: { threads: { maxThreads: 2 } },
  },
});
```

The `@` alias is included so eval files can import from `@/lib/agents/...` consistently with the rest of the codebase. The 2-thread limit caps concurrent real API calls.

---

### 2. `package.json` — `evals` script

Add one entry to `scripts`:

```json
"evals": "vitest run --config vitest.evals.config.ts"
```

---

### 3. `src/lib/agents/evals/judge.ts` (new)

A shared scoring helper used by all quality evals. Takes the text to evaluate, a task-specific rubric, and a criteria string. Returns `Promise<number>` — an integer 1–5.

**Signature:**

```ts
export async function judge(
  text: string,
  rubric: string,
  criteria: string,
  adapter: LlmAdapter,
): Promise<number>;
```

**Implementation notes:**

- Accepts an `LlmAdapter` instance rather than reading env vars itself. This keeps `judge.ts` adapter-agnostic and straightforward to test with a mock adapter.
- Calls `adapter.generate({ messages: [{ role: "user", content: prompt }], tools: [] })` — a single-turn request with no tool use. `LlmAdapter.generate()` is the right level of abstraction: it's a single round-trip without the agent loop or tool dispatch that `AgentRunner` adds. The response text is parsed as an integer score.
- **Not** `AgentRunner` — `AgentRunner` is designed for multi-turn loops with tool dispatch; a judge is a single-turn prompt → integer call and has no need for that machinery.
- Prompt structure:

  ```
  You are an evaluator. Score the following output on a scale of 1–5.

  Criteria: {criteria}

  Rubric:
  1 – Completely fails to meet the criteria.
  2 – Partially meets criteria; significant issues.
  3 – Meets criteria; some minor issues.
  4 – Meets all criteria well; negligible issues.
  5 – Fully meets all criteria with no issues.

  Task-specific rubric:
  {rubric}

  Output to evaluate:
  {text}

  Respond with ONLY a single integer: 1, 2, 3, 4, or 5. No explanation.
  ```

- Parse the trimmed response with `parseInt`. Throw if the result is `NaN` or outside `[1, 5]`: `"judge: unexpected response: {raw}"`.

The prompt structure is fixed inside `judge.ts` so all evals stay consistent. Only `text`, `rubric`, and `criteria` vary per call.

---

### 4. `src/lib/agents/evals/fixtures/planning.json` (new)

Five planning fixtures. Each entry has a `task` (sent to the Planner verbatim) and a `rubric` (task-specific scoring guidance for the judge). The shared `criteria` string passed to `judge` for all planning fixtures is defined as a constant in `planning.eval.ts`:

```
The plan is concrete and properly ordered. Each step has a clear,
self-contained instruction. Steps that can run independently declare
dependsOn: []. Redundant or empty steps are absent.
```

Fixture coverage:

| #   | Task type                                             | Expected shape                           |
| --- | ----------------------------------------------------- | ---------------------------------------- |
| 1   | Simple single-outcome task                            | 1–2 steps, no dependencies               |
| 2   | Compound multi-phase task (research → draft → polish) | 3+ sequential steps                      |
| 3   | Task with parallel opportunities                      | Multiple steps with `dependsOn: []`      |
| 4   | Revision task (editing existing text)                 | Steps scoped to diff, not full rewrite   |
| 5   | Research-then-write task                              | Research step(s) before drafting step(s) |

Example fixture shape:

```json
[
  {
    "task": "Write a blog post introducing our new async collaboration feature.",
    "rubric": "5 – Distinct research, drafting, and polish steps; each self-contained. 3 – Steps present but vague or a phase is missing. 1 – Single monolithic step or no logical ordering."
  }
]
```

---

### 5. `src/lib/agents/evals/planning.eval.ts` (new)

The planning quality eval suite. Runs with `npm run evals`.

**Setup:**

- Reads `GEMINI_API_KEY` and `GEMINI_MODEL` from `process.env` in a `beforeAll`. Calls `vi.skipAllTests()` with a message if the key is absent — keeps the suite skipped rather than failing when no key is available.
- Creates a `GoogleGenAIAdapter` with the API key and the resolved model (`GEMINI_MODEL ?? "gemini-3.1-flash-lite-preview"`). This single adapter instance is shared: passed to `judge()` for scoring and used directly to construct `new AgentRunner(adapter, new ToolRegistry())` for running the planner. No factory needed.

**Per-fixture tests (parameterized with `it.each`):**

For each fixture:

1. Instantiate a planner runner: `new AgentRunner(adapter, new ToolRegistry())`.
2. Build an `AgentConfig` with `name: "Planner"` and `tools: []`.
3. Stream `runner.runBuilder(agentConfig).runStream(fixture.task)` and capture the `done` event output.
4. Assert the output parses as valid JSON with `goal: string` and `steps: PlanStep[]`.
5. Call `judge(planJson, fixture.rubric, PLANNING_CRITERIA, adapter)` and store the score.
6. Assert `score >= 3` — a per-fixture floor to catch total failures immediately.

**Aggregate test:**

After all fixture tests, one final `it("average plan quality score ≥ 4")` computes the mean of collected scores and asserts `mean >= 4`. This catches systematic quality regressions that individual floors miss.

Scores are accumulated in a `beforeAll`-initialised shared array. Each fixture test pushes its score; the aggregate test reads the full array.

**Running the planner** uses the same streaming pattern as `DelegationTools.ts`:

```ts
for await (const event of runner
  .runBuilder(agentConfig)
  .runStream(fixture.task)) {
  if (event.type === "done") {
    output = event.output;
    break;
  }
}
```

---

## Files modified

| File           | Change               |
| -------------- | -------------------- |
| `package.json` | Add `"evals"` script |

## Files created

| File                                          | Purpose                                  |
| --------------------------------------------- | ---------------------------------------- |
| `vitest.evals.config.ts`                      | Separate Vitest config for the eval tier |
| `src/lib/agents/evals/judge.ts`               | Shared LLM-as-judge scoring helper       |
| `src/lib/agents/evals/planning.eval.ts`       | Planning quality eval suite              |
| `src/lib/agents/evals/fixtures/planning.json` | Five planning task fixtures              |

---

## Tests

Phase E introduces no new unit-testable logic. `judge.ts` makes live API calls and `planning.eval.ts` is itself an eval. No additions to `*.test.ts` files are needed.

---

## Working state

`npm run evals` runs the planning eval suite against the live Gemini API. Five planning tasks are scored 1–5 by an LLM judge; the suite passes when every fixture scores ≥ 3 and the average is ≥ 4. The `vitest.evals.config.ts` and `judge.ts` are the complete infrastructure — all subsequent phases add `*.eval.ts` + `fixtures/*.json` files without touching them.
