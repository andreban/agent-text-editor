# Phase H: Review Agent + Iterative Refinement

## Goal

Implement the Review Agent as a specialist that evaluates draft text against explicit criteria and returns structured feedback. Phase H introduces `reviewer.ts`, the `invoke_reviewer` delegation tool, and eval coverage for review quality. The Orchestrator can loop Writer → Reviewer at most 3 times to improve a draft before presenting it for user approval.

---

## Context

Phase G delivered:

- `src/lib/agents/writer.ts` — `WRITER_SYSTEM_PROMPT`, `createWriterAgent`, `runWriter`.
- `invoke_writer` delegation tool in `DelegationTools.ts`.
- `writing.eval.ts` + `fixtures/writing.json` — writing quality evals.

The Orchestrator can now delegate content generation to the Writer, which returns a raw draft for the Orchestrator to apply. Phase H closes the feedback loop: a dedicated Reviewer evaluates a draft against explicit criteria and returns structured issues, enabling the Orchestrator to iterate before presenting the final result to the user.

---

## What changes

### 1. `src/lib/agents/reviewer.ts` (new)

Contains the system prompt, factory function, `ReviewResult` / `ReviewIssue` types, and `runReview` helper.

**Types:**

```ts
export interface ReviewIssue {
  severity: "error" | "warning" | "suggestion";
  location?: string; // quoted excerpt where the issue occurs
  description: string;
  fix?: string; // optional suggested fix
}

export interface ReviewResult {
  passed: boolean;
  issues: ReviewIssue[];
  summary: string;
}
```

**System prompt:**

```
You are a review specialist. You evaluate text against the provided criteria and return structured feedback.

- Output ONLY valid JSON matching the ReviewResult schema. No prose outside the JSON.
- Schema: { "passed": boolean, "issues": [{ "severity": "error"|"warning"|"suggestion", "location"?: string, "description": string, "fix"?: string }], "summary": string }
- Set "location" to a short quoted excerpt from the text where each issue occurs.
- Use severity "error" for clear mistakes, "warning" for debatable issues, "suggestion" for improvements.
- "passed" is true only when there are no "error"-severity issues.
- If no issues are found, return { "passed": true, "issues": [], "summary": "No issues found." }
```

**Factory function** (same pattern as `createWriterAgent`):

```ts
export function createReviewerAgent(factory: AgentRunnerFactory): AgentRunner;
```

**Core review logic:**

```ts
export async function runReview(
  text: string,
  criteria: string[],
  factory: AgentRunnerFactory,
): Promise<ReviewResult>;
```

- Builds a single prompt with the text under review and the criteria list.
- Runs the reviewer `AgentRunner` (no tools) and collects the full output from the `done` event.
- Parses the output as JSON into `ReviewResult`; throws a descriptive error if parsing fails or required fields (`passed`, `issues`, `summary`) are missing.
- Returns the `ReviewResult`.

**Prompt construction:**

```
Review the following text against the listed criteria and return a ReviewResult JSON object.

Criteria:
- <criterion 1>
- <criterion 2>
...

Text:
<text>
```

---

### 2. `DelegationTools.ts` — add `invoke_reviewer` tool

```ts
registry.register({
  definition: () => ({
    name: "invoke_reviewer",
    description:
      "Evaluates a draft against explicit criteria and returns structured feedback. " +
      "Returns JSON: { passed: boolean, issues: [{ severity, location?, description, fix? }], summary }. " +
      "Use after invoke_writer to check a draft before applying it. " +
      "If passed is false and error-severity issues remain after 3 Writer→Reviewer cycles, " +
      "present the best available draft via edit() or write() and summarise remaining issues in your response.",
    parameters: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "The draft text to review.",
        },
        criteria: {
          type: "array",
          items: { type: "string" },
          description:
            "Review criteria to check against (e.g. 'grammatical correctness', 'consistent use of past tense', 'no unsupported factual claims').",
        },
      },
      required: ["text", "criteria"],
    },
  }),
  call: async (args: { text: string; criteria: string[] }) => {
    const result = await runReview(args.text, args.criteria, factory);
    return JSON.stringify(result);
  },
});
```

---

### 3. Orchestrator system prompt update (`src/lib/agents/orchestrator.ts`)

Append to `BASE_INSTRUCTIONS`:

> Use `invoke_reviewer` after `invoke_writer` to evaluate a draft before applying it. If `passed` is false and the issues include errors, revise the instruction and call `invoke_writer` again incorporating the feedback. Loop at most 3 times. If errors remain after 3 cycles, apply the best available draft via `edit()` or `write()` and summarise the remaining issues in your response so the user can decide how to proceed.

---

### 4. `src/lib/agents/index.ts` — re-export from `reviewer.ts`

```ts
export type { ReviewResult, ReviewIssue } from "./reviewer";
export { createReviewerAgent, REVIEWER_SYSTEM_PROMPT } from "./reviewer";
```

---

### 5. `src/lib/agents/evals/fixtures/reviewing.json` (new)

Eight reviewing fixtures. Each entry:

```json
{
  "text": "string — text to review",
  "criteria": ["list", "of", "criteria"],
  "knownErrors": [
    { "description": "description of the expected error", "severity": "error" | "warning" }
  ] | null,
  "rubric": "string — what a good review looks like for this fixture",
  "passingThreshold": 0.7
}
```

`knownErrors: null` means the text is clean — the reviewer should return `passed: true` with no errors (tests precision). Non-null `knownErrors` requires the reviewer to identify at least these issues (tests recall).

Coverage:

| #   | Scenario                                            | Known Errors?         |
| --- | --------------------------------------------------- | --------------------- |
| 1   | Paragraph with two clear grammar errors             | Yes (2 errors)        |
| 2   | Paragraph with inconsistent verb tense throughout   | Yes (1 error)         |
| 3   | Text with an unsupported factual claim              | Yes (1 error)         |
| 4   | Text with a logical non-sequitur between sentences  | Yes (1 warning)       |
| 5   | Text missing a required section stated in criteria  | Yes (1 error)         |
| 6   | Clean, well-written paragraph (grammar check)       | None                  |
| 7   | Clean text that fully satisfies all stated criteria | None                  |
| 8   | Text with suggestions only — no errors              | None (suggestions OK) |

---

### 6. `src/lib/agents/evals/reviewing.eval.ts` (new)

Scores each fixture using the `judge` helper and verifies recall and precision.

**Setup:**

- Reads `GEMINI_API_KEY` and `GEMINI_MODEL` from `process.env`.
- Uses `describe.skipIf(!apiKey)` so the suite is skipped cleanly when no key is present.
- Creates a `GoogleGenAIAdapter` and `DefaultAgentRunnerFactory`.

**Per-fixture test (`it.each`):**

1. Call `runReview(fixture.text, fixture.criteria, factory)`.
2. Assert the result has `passed`, `issues`, and `summary` fields.
3. For fixtures with `knownErrors`: assert `passed === false` and that each known error description has a matching issue in `result.issues` (recall check by substring or keyword overlap).
4. For clean fixtures (`knownErrors === null`): assert `passed === true` and no `error`-severity issues (precision check).
5. Pass the full result to `judge(JSON.stringify(result), fixture.rubric, REVIEWING_CRITERIA, adapter)` and assert `score >= 3`.

**Aggregate test:**

One final `it("average reviewing quality score ≥ 4")` counts scores and asserts the mean is at least 4.

`REVIEWING_CRITERIA` constant used for all fixtures:

```
The review accurately identifies all genuine errors in the text. It does not
flag correct text as erroneous. Each issue quotes the relevant excerpt in
"location". Severity levels are applied consistently. The summary gives a
clear overall verdict. Output is valid ReviewResult JSON with no prose outside it.
```

---

## Files modified

| File                               | Change                                                                                    |
| ---------------------------------- | ----------------------------------------------------------------------------------------- |
| `src/lib/tools/DelegationTools.ts` | Add `invoke_reviewer` tool registration; import `runReview` from `reviewer.ts`.           |
| `src/lib/agents/index.ts`          | Re-export `ReviewResult`, `ReviewIssue`, `createReviewerAgent`, `REVIEWER_SYSTEM_PROMPT`. |
| `src/lib/agents/orchestrator.ts`   | Add Writer→Reviewer loop guidance and 3-iteration cap to `BASE_INSTRUCTIONS`.             |

## Files created

| File                                           | Purpose                                                                                      |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `src/lib/agents/reviewer.ts`                   | `ReviewResult`, `ReviewIssue`, `REVIEWER_SYSTEM_PROMPT`, `createReviewerAgent`, `runReview`. |
| `src/lib/agents/evals/reviewing.eval.ts`       | Reviewing quality eval suite (recall + precision).                                           |
| `src/lib/agents/evals/fixtures/reviewing.json` | Eight reviewing fixtures.                                                                    |

---

## Tests

New unit tests in `src/lib/agents/reviewer.test.ts`:

- `runReview` prompt includes all provided criteria.
- `runReview` prompt includes the full text under review.
- `runReview` parses valid `ReviewResult` JSON returned by the agent.
- `runReview` throws a descriptive error when the LLM returns invalid JSON.
- `runReview` throws when result is missing required fields (`passed`, `issues`, `summary`).
- The reviewer agent factory creates an `AgentRunner` with an empty `ToolRegistry` (no tools).
- `invoke_reviewer` passes `text` and `criteria` to `runReview` and returns the result as a JSON string.
- `invoke_reviewer` result is valid JSON with `passed`, `issues`, and `summary` fields.

All existing tests must remain green.

---

## Evals

`npm run evals` now runs `planning.eval.ts` (Phase E), `routing.eval.ts` (Phase F), `writing.eval.ts` (Phase G), and `reviewing.eval.ts` (Phase H). No infrastructure changes needed.

---

## Branch & PR

```
git checkout multi-agent && git pull origin multi-agent
git checkout -b multi-agent-phase-h
# ... implement ...
gh pr create --base multi-agent --head multi-agent-phase-h
```

---

## Working state

`invoke_reviewer` is available to the Orchestrator as a delegation tool. Calling it runs a no-tool reviewer agent that returns structured `ReviewResult` JSON. The Orchestrator loops Writer → Reviewer up to 3 times to improve a draft before applying it via `edit()` / `write()` for user approval. If errors remain after the iteration cap, the Orchestrator presents the best draft with a summary of outstanding issues. Reviewing evals confirm recall (known errors are caught) and precision (clean text is not falsely flagged).
