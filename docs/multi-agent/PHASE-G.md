# Phase G: Writer Agent

## Goal

Implement the Writer Agent as a specialist that generates draft text from explicit instructions and structured context. Phase G introduces `writer.ts`, the `invoke_writer` delegation tool, and eval coverage for writing quality. The Writer returns raw text to the Orchestrator, which then applies it via `edit()` / `write()` through the normal approval workflow.

---

## Context

Phase F delivered:

- `src/lib/agents/researcher.ts` — `ResearchResult` / `ResearchSource` types, `runResearch` helper.
- `invoke_researcher` delegation tool in `DelegationTools.ts`.
- `routing.eval.ts` + `fixtures/routing.json` — Orchestrator routing accuracy evals.

The Orchestrator can now research across workspace documents and return structured, attributable results. Phase G adds the next pipeline stage: a dedicated writing specialist that accepts those results as input and produces draft text for the Orchestrator to apply.

---

## What changes

### 1. `src/lib/agents/writer.ts` (new)

Contains the system prompt, factory function, and `runWriter` helper.

**System prompt:**

```
You are a writing specialist. You produce draft text based on explicit instructions and provided context.

- Write only the requested content — no preamble, no explanation, no markdown fences unless the content itself is markdown.
- If research context is provided, use it and attribute claims where appropriate (e.g. "According to 'Source Title', ...").
- If style context is provided, match its tone, voice, and formatting conventions.
- Do not call any tools. Return the draft text directly as your response.
```

**Factory function** (same pattern as `createPlannerAgent`):

```ts
export function createWriterAgent(factory: AgentRunnerFactory): AgentRunner;
```

**Core writing logic:**

```ts
export async function runWriter(
  instruction: string,
  factory: AgentRunnerFactory,
  researchContext?: ResearchResult,
  styleContext?: string,
): Promise<string>;
```

- Builds a single prompt that injects `researchContext` (formatted as a source list) and `styleContext` (a verbatim excerpt) when provided.
- Runs the writer `AgentRunner` (no tools) and collects the full text output from the `done` event.
- Returns the raw draft string.

**Prompt construction:**

```
Instruction: <instruction>

[Research context:
Summary: <researchContext.summary>
Sources:
- "<title>": <excerpt>
...]

[Style reference (match tone, voice, and formatting):
<styleContext>]
```

Sections in brackets are only included when the corresponding input is provided.

---

### 2. `DelegationTools.ts` — add `invoke_writer` tool

```ts
registry.register({
  definition: () => ({
    name: "invoke_writer",
    description:
      "Generates draft text from an instruction and optional research/style context. " +
      "Returns { draft: string } — raw text only, no edits applied. " +
      "After receiving the draft, apply it to the document using edit() or write().",
    parameters: {
      type: "object",
      properties: {
        instruction: {
          type: "string",
          description:
            "What to write. Be explicit: specify the target section, desired length, and any constraints.",
        },
        researchContext: {
          type: "string",
          description:
            "JSON-encoded ResearchResult from invoke_researcher. Inject when the draft should cite workspace sources.",
        },
        styleContext: {
          type: "string",
          description:
            "A verbatim excerpt from the document the Writer should match in tone, voice, and formatting.",
        },
      },
      required: ["instruction"],
    },
  }),
  call: async (args: {
    instruction: string;
    researchContext?: string;
    styleContext?: string;
  }) => {
    let parsedResearch: ResearchResult | undefined;
    if (args.researchContext) {
      try {
        parsedResearch = JSON.parse(args.researchContext) as ResearchResult;
      } catch {
        // malformed JSON — ignore and write without research context
      }
    }
    const draft = await runWriter(
      args.instruction,
      factory,
      parsedResearch,
      args.styleContext,
    );
    return JSON.stringify({ draft });
  },
});
```

`researchContext` is passed as a JSON string (not a nested object) so the Orchestrator can forward the raw `invoke_researcher` result without a parse/re-encode step.

---

### 3. Orchestrator system prompt update (`src/lib/agents/orchestrator.ts`)

Append to `BASE_INSTRUCTIONS`:

> Use `invoke_writer` to delegate content generation to a writing specialist. Pass the result of `invoke_researcher` as `researchContext` when the draft should cite workspace sources. After receiving the `draft`, apply it to the document using `edit()` or `write()` — the Writer does not apply edits directly.

---

### 4. `src/lib/agents/index.ts` — re-export from `writer.ts`

```ts
export { createWriterAgent, WRITER_SYSTEM_PROMPT } from "./writer";
```

No new exported types — `runWriter` returns a plain `string`.

---

### 5. `src/lib/agents/evals/fixtures/writing.json` (new)

Ten writing fixtures. Each entry:

```json
{
  "instruction": "string — writing instruction passed to invoke_writer",
  "researchContext": { "summary": "...", "sources": [...] } | null,
  "styleContext": "string | null",
  "rubric": "string — prose description of what a good response looks like",
  "criteria": [
    { "name": "relevance", "description": "Draft addresses the instruction" },
    { "name": "coherence", "description": "Draft reads as a single cohesive unit" },
    { "name": "attribution", "description": "Claims from research context are attributed to their source" },
    { "name": "style_match", "description": "Tone, voice, and formatting match the style reference when provided" },
    { "name": "no_preamble", "description": "Response contains no preamble, explanation, or markdown fences (unless content is markdown)" }
  ],
  "passingThreshold": 0.7
}
```

Coverage (4 with research context, 3 with style context, 3 plain):

| #   | Scenario                                                      | Research? | Style? |
| --- | ------------------------------------------------------------- | --------- | ------ |
| 1   | Write an intro paragraph citing two workspace sources         | Yes       | No     |
| 2   | Draft a conclusion synthesising research findings             | Yes       | No     |
| 3   | Write a product description using research + match doc style  | Yes       | Yes    |
| 4   | Summarise research results in a bullet list                   | Yes       | No     |
| 5   | Rewrite an excerpt in a formal academic tone (style provided) | No        | Yes    |
| 6   | Continue a sentence in the same voice (style provided)        | No        | Yes    |
| 7   | Match a conversational blog style (style provided)            | No        | Yes    |
| 8   | Write a three-sentence summary of a concept                   | No        | No     |
| 9   | Produce a one-line headline                                   | No        | No     |
| 10  | Generate a transition sentence between two paragraphs         | No        | No     |

---

### 6. `src/lib/agents/evals/writing.eval.ts` (new)

Scores each fixture against its criteria using the `judge` helper.

**Setup:**

- Reads `GEMINI_API_KEY` and `GEMINI_MODEL` from `process.env`.
- Uses `describe.skipIf(!apiKey)` so the suite is skipped cleanly when no key is present.
- Creates a `GoogleGenAIAdapter` and `DefaultAgentRunnerFactory`.

**Per-fixture test (`it.each`):**

1. Call `runWriter(fixture.instruction, factory, fixture.researchContext ?? undefined, fixture.styleContext ?? undefined)`.
2. Pass the returned `draft` to `judge(draft, fixture.rubric, fixture.criteria, adapter)`.
3. Assert `result.score >= fixture.passingThreshold` and log per-criterion breakdown on failure.

**Aggregate test:**

One final `it("writing quality ≥ 70% pass rate")` counts fixtures where `score >= passingThreshold` and asserts the pass rate is at least 70%.

---

## Files modified

| File                               | Change                                                                  |
| ---------------------------------- | ----------------------------------------------------------------------- |
| `src/lib/tools/DelegationTools.ts` | Add `invoke_writer` tool registration.                                  |
| `src/lib/agents/index.ts`          | Re-export `createWriterAgent`, `WRITER_SYSTEM_PROMPT` from `writer.ts`. |
| `src/lib/agents/orchestrator.ts`   | Add `invoke_writer` guidance to `BASE_INSTRUCTIONS`.                    |

## Files created

| File                                         | Purpose                                                   |
| -------------------------------------------- | --------------------------------------------------------- |
| `src/lib/agents/writer.ts`                   | `WRITER_SYSTEM_PROMPT`, `createWriterAgent`, `runWriter`. |
| `src/lib/agents/evals/writing.eval.ts`       | Writing quality eval suite.                               |
| `src/lib/agents/evals/fixtures/writing.json` | Ten writing fixtures.                                     |

---

## Tests

New unit tests in `src/lib/agents/writer.test.ts`:

- `runWriter` with only `instruction` returns a non-empty string.
- `runWriter` with `researchContext` includes the summary and at least one source title in the prompt passed to the agent (spy on `AgentRunner`).
- `runWriter` with `styleContext` includes the style excerpt in the prompt.
- `runWriter` with both `researchContext` and `styleContext` includes both sections.
- `invoke_writer` with a valid `researchContext` JSON string parses and passes it through to `runWriter`.
- `invoke_writer` with malformed `researchContext` JSON falls back gracefully (calls `runWriter` without research context, does not throw).
- The writer agent factory creates an `AgentRunner` with an empty `ToolRegistry` (no tools).
- `invoke_writer` result is `JSON.stringify({ draft: string })`.

All existing tests must remain green.

---

## Evals

`npm run evals` now runs `planning.eval.ts` (Phase E), `routing.eval.ts` (Phase F), and `writing.eval.ts` (Phase G). No infrastructure changes needed.

---

## Branch & PR

```
git checkout multi-agent && git pull origin multi-agent
git checkout -b multi-agent-phase-g
# ... implement ...
gh pr create --base multi-agent --head multi-agent-phase-g
```

---

## Working state

`invoke_writer` is available to the Orchestrator as a delegation tool. Calling it runs a no-tool writing agent that returns raw draft text. The Orchestrator applies the draft via `edit()` / `write()`, which triggers the normal user approval flow. When a `researchContext` is provided, the Writer attributes claims to their source documents. Writing evals confirm that drafts are relevant, coherent, properly attributed, and style-matched.
