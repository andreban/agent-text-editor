# SPEC: Migrate chat UI to `@mast-ai/react-ui`

Companion to [PRD.md](./PRD.md). Tracking issue: [#82](https://github.com/andreban/agent-text-editor/issues/82).

## Current state (what we're replacing)

| File                                  | Lines | Role                                                                                                                                                                                                                                                                                     |
| ------------------------------------- | ----: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/ChatSidebar.tsx`      |   364 | Sidebar chrome (header, theme toggle, settings/skills buttons, approve-all switch) **plus** virtualised message list, mention picker, chip-based input, streaming state machine, scroll-to-bottom, `expandedThoughts` set.                                                               |
| `src/components/ChatItem.tsx`         |   300 | Renders one user/assistant message: streaming text, collapsible thinking chunks, tool call/result events.                                                                                                                                                                                |
| `src/lib/mentionUtils.ts`             |    48 | `Segment`, `DocRef`, `extractMentionQuery`, `buildPromptWithMentions`.                                                                                                                                                                                                                   |
| `src/context/AgentContext.tsx`        |   228 | Custom React context: builds `AgentRunnerFactory`, `EditorContext`, `WorkspaceContext`, `ToolRegistry` (with `DelegateToSkillTool`, delegation tools, web MCP, built-in AI tools), constructs `AgentModel`, exposes `items`, `isLoading`, `sendMessage(prompt, displayText?)`, `cancel`. |
| `src/components/ChatSidebar.test.tsx` |   172 | Tests for the bespoke sidebar.                                                                                                                                                                                                                                                           |
| `src/components/ChatItem.test.tsx`    |    88 | Tests for the bespoke message renderer.                                                                                                                                                                                                                                                  |

Other affected entry points:

- `src/App.tsx` mounts `<AgentContextProvider>` and `<ChatSidebar>`.
- `src/components/PlanConfirmationWidget.tsx` is rendered by `ChatSidebar` and reads pending plan-confirmation state from `useEditorUI()`.

## Target state (what it becomes)

| Today                                                                | Replacement (`@mast-ai/react-ui`)                                                                                                                                                            |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<ChatSidebar>` (compound: header + list + plan widget + input)      | A thin sidebar component in this repo containing the existing header chrome, `<MessageList>`, `<PlanConfirmationWidget>`, and `<ChatInput>`.                                                 |
| `ChatItem` (user/assistant rendering, thinking, tool calls)          | Library's `<UserMessage>`, `<AssistantMessage>`, `<ThinkingBlock>`, `<ToolCallBlock>` (consumed by `<MessageList>`'s default renderer; override via `renderToolCall` for our bespoke tools). |
| Virtualiser + `expandedThoughts` + scroll-to-bottom in `ChatSidebar` | `<MessageList>` + `useAgent()`.                                                                                                                                                              |
| `mentionUtils.ts` + segment/picker state                             | `<ChatInput mentions={{ items, buildPrompt }}>` from the library.                                                                                                                            |
| `AgentContext` + `useAgentContext()`                                 | `<AgentProvider runner={...} agent={...} icons={...} onApprovalRequired={...}>` + `useAgent()`.                                                                                              |
| Skill / approve-all + plan confirmation + custom approval routing    | `onApprovalRequired` callback returning `INLINE_APPROVAL` for inline cases; falling through to existing `<PlanConfirmationWidget>` modal for plan approvals.                                 |

## Implementation phases

Each phase is one issue, one PR against `feat/react-ui-migration`. They are sequential — earlier phases unblock later ones.

### Phase 1 — Add deps + wire `<AgentProvider>` (replaces step 1+2 in #82)

- Add `@mast-ai/react-ui` to `dependencies`.
- Mount `<AgentProvider>` at the app root via a new `src/context/AgentProviderShim.tsx` wired with: the existing `runner`/`agent` constructed from `DefaultAgentRunnerFactory`, the existing `usageCallback`, lucide icon overrides to keep current visuals, and an `onApprovalRequired` that delegates to existing approve-all + plan-confirmation logic. The `mentions` config is a `<ChatInput>` prop and is wired in Phase 3, not here.
- Keep `AgentContext` in place behind the new provider so the bespoke `ChatSidebar` continues to work. No UI change in this phase.
- Acceptance: app builds, chat works exactly as before, `useAgent()` is callable from inside the provider.

### Phase 2 — Swap message list to `<MessageList>` (step 3)

- Replace the virtualised list inside `ChatSidebar` with `<MessageList renderToolCall={...}>` consuming `useAgent()`.
- Map our bespoke tool renderings (e.g. `delegate_to_skill`, `query_workspace`, edit/write previews) via `renderToolCall`.
- Keep the existing sidebar header, theme toggle, settings/skills dialogs, and `<PlanConfirmationWidget>` outside the panel.
- Acceptance: streaming text, thinking blocks, tool call/result events, virtual scroll-to-bottom, dark mode all match current UX.

### Phase 3 — Swap chat input to `<ChatInput>` (step 4)

- Replace the textarea + chip + picker with `<ChatInput mentions={{ items: docs, buildPrompt }}>`.
- Wire `buildPrompt` to produce the same prompt format `buildPromptWithMentions` produces today; pass `displayText` through `sendMessage(text, displayText?)`.
- Delete `src/lib/mentionUtils.ts` and the segment / picker state in `ChatSidebar`.
- Acceptance: keyboard navigation (arrow keys, Enter to select, Esc to dismiss), chip removal, `displayText` vs prompt, Enter-to-send, Shift+Enter newline, multiline auto-resize all match.

### Phase 4 — Route approvals through `onApprovalRequired` (step 5)

- Move plan-confirmation and skill-approval routing from the bespoke flow into `onApprovalRequired`.
- Inline cases return `INLINE_APPROVAL` (rendered by the library inside the message); the plan-approval case still resolves through the existing `<PlanConfirmationWidget>` modal (the modal stays — only the trigger path changes).
- Acceptance: approve-all toggle still bypasses prompts; plan confirmation modal still appears for plan-mode delegations; inline approvals render inline.

### Phase 5 — Delete unused code (step 6)

- Keep `ChatSidebar.tsx` — Phases 2–4 already reduced it to the thin shell that composes `<MessageList>` / `<ChatInput>` / `<PlanConfirmationWidget>` plus the existing sidebar chrome (header, theme toggle, settings/skills dialogs, approve-all switch).
- Delete `ChatItem.tsx`, `ChatSidebar.test.tsx`, `ChatItem.test.tsx` — the bespoke renderers are gone and the library has its own coverage for the equivalent behaviour.
- Delete `AgentContext.tsx` and unwrap `<AgentContextProvider>` from `App.tsx` — replaced entirely by `<AgentProviderShim>` + `useAgent()`.
- Keep `MarkdownContent.tsx` — still used by `EditorPanel` for the Markdown preview tab. Chat-side markdown rendering moved to `<MessageList>`.
- Update imports across the app.
- Acceptance: `npm run lint`, `npm run build`, `npm run test` all pass; no dead exports; bundle size does not regress meaningfully.

## Non-obvious decisions

- **`<AgentProvider>` first.** Phase 1 adds the new provider _underneath_ the existing `AgentContext` so that subsequent phases can swap UI piecewise without ever leaving the app in a broken state. The two contexts coexist for phases 1–4.
- **`PlanConfirmationWidget` stays.** It's a modal owned by this app's domain (plan-mode delegations) and is explicitly out of scope for `@mast-ai/react-ui`. Only the trigger path moves into `onApprovalRequired`.
- **Tests as parity baseline.** `ChatSidebar.test.tsx` and `ChatItem.test.tsx` are kept until Phase 5. They exist to catch regressions during phases 2–4; they are deleted (not ported) in Phase 5 because the library has its own coverage for the equivalent behaviour.

## Out of scope

- Touching Monaco, diff decorations, workspace/document model, skills system.
- Adding new chat features.
- Bundle-size work beyond "do not regress".
