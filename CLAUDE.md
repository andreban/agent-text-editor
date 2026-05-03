# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

An AI-powered collaborative text editor: a React SPA where an LLM agent assists with editing text in a Monaco editor. The agent runs in the browser via [`@mast-ai/core`](../mast-ai/packages/core), reads and edits the active document through tools, and routes mutating operations through a user-approval workflow before they touch the editor buffer.

## Commands

```bash
npm run dev       # Start Vite dev server
npm run build     # Type-check + build for production
npm run lint      # Run ESLint
npm run format    # Format with Prettier
npm run test      # Run Vitest tests
npm run preview   # Preview production build
```

## Architecture

This is an AI-powered collaborative text editor: a React SPA where an LLM agent assists with editing text in a Monaco editor.

**Data flow:**

1. User submits a prompt in `ChatSidebar`
2. `App.tsx` creates an `AgentRunner` (from `@mast-ai/core`) backed by `GoogleGenAIAdapter`
3. The LLM decides to respond or invoke tools (`read`, `read_selection`, `edit`, `write`)
4. Mutating tools (`edit`/`write`) create a `Suggestion` entry in store state — the UI pauses and prompts the user to accept or reject unless "Approve All" is enabled
5. The tool resolves with the user's decision, and the agent loop continues until a final text response

**Key modules:**

- `src/adapters/GoogleGenAIAdapter.ts` — implements `LlmAdapter` for Google Gen AI SDK; maps MAST message/tool formats, enables thinking mode (`ThinkingLevel.HIGH`), streams deltas, and reports token usage via callback
- `src/lib/EditorTools.ts` — registers the four editor tools with `ToolRegistry`; `edit` and `write` create suggestions and await user resolution
- `src/lib/store.tsx` — React Context holding the Monaco editor instance, pending `Suggestion[]`, API key, model selection, and aggregated token counts
- `src/components/EditorPanel.tsx` — Monaco editor with decorations (strikethrough + replacement text) rendered for each pending suggestion; hosts `SuggestionWidget` accept/reject buttons
- `src/components/ChatSidebar.tsx` — streaming chat UI that renders thinking chunks (collapsible), text deltas, and tool call/result events
- `src/App.tsx` — assembles the agent runner, sets the system prompt ("helpful senior editorial assistant"), and manages API key/model localStorage persistence

**MAST dependency:** `@mast-ai/core` is resolved from a local sibling path (`../mast-ai/packages/core`) via `vite.config.ts` alias. If that path is missing the dev server will fail.

## Documentation

Docs live in `docs/`. The library-level `PRD.md`, `SPEC.md`, and `IMPLEMENTATION_PLAN.md` sit in the `docs/` root. Each in-flight feature has its own subdirectory containing a `PRD.md` (product requirements) and `SPEC.md` (technical specification); completed work lives under `docs/archive/`.

- Before starting work on a feature, check its subdirectory in `docs/` for context.
- When creating docs for a new feature, create a subdirectory under `docs/` and write a `PRD.md` and `SPEC.md` there.
- Never write doc files directly into `docs/` root — use a subdirectory (the existing root-level files are the library-level master docs).
- Do not rewrite or restructure files in `docs/archive/`.
- When all issues for a feature are closed (or the feature is otherwise considered complete), move its `docs/<feature>/` directory to `docs/archive/<feature>/`.
- **PRD.md and SPEC.md must be kept up to date throughout implementation.** Any change to requirements, technical decisions, or architecture must be reflected in the relevant doc before or alongside the code change. Both files must be current before opening a pull request.

## GitHub Issues

- Each feature has a GitHub label matching its `docs/` subdirectory name (e.g. `multi-agent`).
- All issues belonging to a feature must carry that label. Create the label first if it doesn't exist (`gh label create <feature-name>`).
- To see all issues for a feature: `gh issue list --label <feature-name>`.
- Issues must contain enough information to implement the task without needing to ask for clarification: relevant context, constraints, acceptance criteria, and any non-obvious decisions.
- Reference the PRD and SPEC by file path and section rather than repeating their content. Reference related issues by number where dependencies or shared context exist.
- Explicitly state dependencies with "Depends on #N" in the issue body so the implementation order is human-readable. Before starting work on an issue, check that all its dependencies are merged.
- Implementation details (key decisions, non-obvious choices, patterns introduced) belong in the PR description, not in issue comments. When starting work on an issue with dependencies, read the PRs that closed those issues for implementation context.
- Always include `Closes #N` in the PR description so GitHub auto-closes the issue on merge.

### Relationships

In addition to the prose "Depends on #N" reference, wire the structural link using GitHub's Relationships feature so it shows up in the issue sidebar and project views. `gh` has no first-class command for this yet; use `gh api graphql`. Relationship mutations take node IDs, not issue numbers — resolve the ID with `gh issue view <number> --json id --jq .id` first.

```bash
# Resolve node IDs
PARENT_ID=$(gh issue view 100 --json id --jq .id)
CHILD_ID=$(gh issue view 101 --json id --jq .id)
BLOCKER_ID=$(gh issue view 99 --json id --jq .id)

# Make #101 a sub-issue of #100
gh api graphql -f query='
  mutation($parent: ID!, $child: ID!) {
    addSubIssue(input: { issueId: $parent, subIssueId: $child }) { issue { number } }
  }' -f parent="$PARENT_ID" -f child="$CHILD_ID"

# Mark #101 as blocked by #99
gh api graphql -f query='
  mutation($issue: ID!, $blocker: ID!) {
    addBlockedBy(input: { issueId: $issue, blockingIssueId: $blocker }) { issue { number } }
  }' -f issue="$CHILD_ID" -f blocker="$BLOCKER_ID"
```

Apply these whenever the relationship exists:

- **Parent / sub-issue** — when an issue is a concrete piece of a larger tracking issue, link it via `addSubIssue` (parent → child). Use `removeSubIssue` to undo.
- **Blocked by / blocking** — when an issue cannot start until another lands, link it via `addBlockedBy` (the blocked issue holds the relationship to its blocker). Use `removeBlockedBy` to undo.

## Git Conventions

- Do not add `Co-Authored-By` trailers to commit messages.
- All source files must carry the Apache-2.0 license header.
- All new logic requires Vitest test coverage.
- Always run `npm run lint`, `npm run format`, `npm run build`, and `npm run test` before committing and fix any failures.
- Always use `Edit` to modify existing files — never rewrite them wholesale with `Write`. Small diffs make reviews easier.
- Always ask the user to manually test before committing. Never commit or open a pull request until the user has confirmed the test passed.
- **Branch strategy:**
  1. Before starting work on an issue, check out `main` and pull the latest (`git checkout main && git pull`).
  2. Create a branch off `main` for the issue's work, namespacing by feature (e.g. `git checkout -b feat/multi-agent/fact-checker`).
  3. Open the PR against `main` (`gh pr create --base main`).
