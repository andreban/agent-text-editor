# PRD: Migrate chat UI to `@mast-ai/react-ui`

Tracking issue: [#82](https://github.com/andreban/agent-text-editor/issues/82)

## Motivation

The agent-text-editor was one of the apps that motivated extracting `@mast-ai/react-ui` (see `andreban/mast-ai#43`). Now that the library has shipped, this repo should consume it instead of maintaining its own ~1200 lines of bespoke chat UI. The migration:

- Removes hundreds of lines of duplicated streaming / virtualisation / approval / mention code.
- Keeps this app aligned with future library improvements (new tool-event renderers, accessibility fixes, perf work).
- Lets the team focus on the parts that are unique to this app — the Monaco editor, diff decorations, workspace/document model, skills, and the `PlanConfirmationWidget` flow.

## Goals

1. Replace the bespoke chat UI (`ChatSidebar`, `ChatItem`, mention picker, streaming state machine, virtualised list) with `@mast-ai/react-ui` primitives.
2. Replace the bespoke `AgentContext` with the library's `<AgentProvider>` + `useAgent()`.
3. Preserve current chat UX (streaming, thinking, tool calls, mention picker, approval routing, dark mode, virtual scrolling) at parity.
4. Land the migration as a sequence of small PRs against a long-running feature branch so that each step is independently reviewable and bisectable.

## Non-goals

- Changes to the Monaco editor, diff decorations, workspace/document model, skills system, or the `PlanConfirmationWidget` modal flow. These stay in this app (they are explicit non-goals of `@mast-ai/react-ui`).
- New chat features. This is a like-for-like migration.
- Bundle-size optimisation beyond not regressing meaningfully.

## Acceptance criteria

- Chat UX matches today's behaviour: streaming text + thinking, tool call/result rendering, `@`-mention picker (keyboard navigation, chip removal, `displayText` vs prompt), virtualised scroll-to-bottom on new messages, approve-all toggle, plan-confirmation modal, dark mode.
- `npm run lint`, `npm run build`, `npm run test` all pass.
- No regressions in existing tests; library behaviours covered by `@mast-ai/react-ui`'s own tests are not re-tested here.
- Bundle size does not regress meaningfully (library externalises React; markdown rendering remains optional).
- `ChatItem.tsx`, `mentionUtils.ts`, and `AgentContext.tsx` are deleted once parity is verified. `ChatSidebar.tsx` is kept as the thin shell composing `@mast-ai/react-ui` primitives plus this app's sidebar chrome.

## Dependencies

All blockers in `andreban/mast-ai` are closed:

- `andreban/mast-ai#43` — `@mast-ai/react-ui` library (closed)
- `andreban/mast-ai#62` — `sendMessage(text, displayText?)` overload (closed)
- `andreban/mast-ai#63` — optional `@`-mention picker for `<ChatInput>` (closed)
- `andreban/mast-ai#51` — nested `ToolEventEntry` for sub-agent tool calls (closed)
- `andreban/mast-ai#41` — `docs/react-ui/USAGE.md` migration guide (closed)

## Rollout

Long-running feature branch `feat/react-ui-migration` off `main`. Each child issue lands as its own PR against the feature branch. Once all child issues are merged and parity is verified manually, the feature branch is merged to `main` in a single squash that closes #82.
