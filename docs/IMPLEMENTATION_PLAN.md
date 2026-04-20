# Implementation Plan: AI Agent Text Editor

This document outlines the phased implementation strategy for the AI Agent Text Editor. Each phase is designed to be small, easily reviewable, and results in a working application state.

**Workflow per Phase:**

1. Execute the tasks defined in the phase, **including writing relevant automated tests**.
2. Ensure all new source files include the mandatory license header (see `SPEC.md`).
3. Run tests and ensure they pass.
4. Run ESLint (`npm run lint`) and fix any issues.
5. Format code with Prettier (`npm run format`).
6. Verify manual functionality and ensure no regressions (Agent self-check).
7. **Pause and ask the user to manually test the application.** Wait for their explicit approval.
8. Mark the phase as `[x] Complete` in this document.
9. Commit the code using `git commit` **only after user approval**.

---

## Phase 1: Foundation & UI Layout

**Goal:** Establish the project scaffolding and basic user interface.

- [x] Initialize a new React TypeScript project using Vite.
- [x] Install and configure Tailwind CSS.
- [x] Initialize `shadcn/ui` and add basic components (e.g., `Button`, `Input`, `Dialog`, `Tabs`).
- [x] Install `@monaco-editor/react` and set up the basic split-pane layout (Editor on left, Sidebar on right).
- [x] Create placeholder components for the `ChatSidebar`.
- **Working State:** The application runs locally, and the user can type in the Monaco editor. The layout is structurally complete.
- [x] Complete

## Phase 2: Markdown Preview

**Goal:** Add a preview tab to the EditorPanel to switch between raw text and rendered Markdown.

- [x] Install `react-markdown` and `remark-gfm`.
- [x] Update `EditorPanel.tsx` to use the `Tabs` component.
- [x] Implement state management to share the editor content with the preview.
- [x] Render the parsed Markdown in the preview tab.
- **Working State:** The user can toggle between the Monaco editor and a rendered Markdown preview of their text.
- [x] Complete

## Phase 3: Basic LLM Integration (MAST + Google Gen AI)

**Goal:** Connect the chat interface to Gemini 2.5 Flash using MAST.

- [x] Install `@mast-ai/core` and `@google/genai`.
- [x] Implement the `GoogleGenAIAdapter` to translate MAST requests to the Google AI SDK.
- [x] Set up global state for a temporary API key input.
- [x] Initialize the `AgentRunner` and `Conversation` in `App.tsx`.
- [x] Connect the `ChatSidebar` to the `Conversation` to send prompts and display the LLM's text responses.
- **Working State:** The user can enter an API key and hold a basic text conversation with the AI in the sidebar.
- [x] Complete

## Phase 4: Core Editor Tools & Approval Workflow

**Goal:** Give the agent the ability to interact with the editor content safely.

- [x] Create `EditorTools.ts` and implement the `read` tool.
- [x] Implement the `edit` and `write` tools, ensuring they do _not_ mutate the editor directly.
- [x] Create global state to track active `Suggestions`.
- [x] Implement Monaco `deltaDecorations` to highlight `originalText` (light red, squiggly).
- [x] Implement Monaco `changeViewZones` to display `replacementText` inline (green).
- [x] Build the `SuggestionWidget` as a Monaco `ContentWidget` containing the Accept/Reject/Feedback UI.
- [x] Implement the "Accept", "Decline", and "Provide Feedback" workflows, including the "Approve All" toggle logic.
- **Working State:** The agent can read the text and propose edits/rewrites. The user must approve them via the UI before the editor updates.
- [x] Complete

## Phase 5: Advanced Context Tools

**Goal:** Improve agent efficiency for large documents.

- [x] Add the `read_selection` tool to `EditorTools.ts` using the Monaco API.
- [x] Add the `search` tool to find occurrences of text.
- [x] Add the `get_metadata` tool (word count, etc.).
- **Working State:** The agent can be asked to "fix the spelling in my selection" or "find where I mentioned X" and successfully use the new tools.
- [x] Complete

## Phase 6: Persistence, Settings, & Token Tracking

**Goal:** Make the application usable across sessions and transparent about usage.

- [x] Update state management to sync the API key and selected model (default: `gemini-2.5-flash`) with `localStorage`.
- [x] Create a "Settings" UI (modal or sidebar tab) to manage credentials and model selection.
- [x] Update `GoogleGenAIAdapter` to capture `usageMetadata`.
- [x] Add a UI element to display cumulative session token usage.
- **Working State:** API keys and model choices survive page reloads. The UI clearly displays token consumption during chats.
- [x] Complete

## Phase 7: Mobile-Friendly Interface

**Goal:** Make the application fully usable on small-screen and touch devices.

- [x] Implement a responsive layout: below the `md` breakpoint the editor fills the screen and a FAB opens a bottom-sheet chat overlay (always keeping the editor mounted).
- [x] Ensure all interactive controls meet a 44 × 44 px minimum touch-target size on mobile.
- [x] Verify the Monaco editor fills available height without horizontal overflow on narrow viewports.
- [x] Write interaction tests for the responsive layout breakpoint.
- [x] Fix Monaco content widget touch handling so Accept/Reject buttons work on mobile.
- **Working State:** On a mobile browser the editor is always visible; a FAB opens a 70 vh chat sheet. All controls are comfortably tappable and agent tools work regardless of sheet state.

- [x] Complete

## Phase 8: Sub-Agents & Custom Skills

**Goal:** Enable specialized workflows through multi-agent delegation.

- [x] Implement initialization logic in `App.tsx` to populate `localStorage` with Default Skills (Proofreader, Summarizer, Markdown Formatter) if empty.
- [x] Build a "Skills Manager" UI for CRUD operations on custom skills.
- [x] Update `App.tsx` to dynamically inject skill names and descriptions into the main agent's `systemInstructions`.
- [x] Implement the `delegate_to_skill` tool, which spins up a child `AgentRunner` with the skill's specific instructions.
- **Working State:** The user can ask the main agent to "proofread the document", and it successfully delegates the task to the Proofreader sub-agent. User can create a new custom skill and invoke it.

- [x] Complete

## Phase 9: Dark Mode

**Goal:** Make the application comfortable to use in any lighting condition.

- [x] Enable Tailwind CSS class-based dark mode (`darkMode: 'class'` in `tailwind.config`).
- [x] Create a `ThemeProvider` context that reads the saved theme from `localStorage`, applies the `dark` class to `<html>`, and exposes a toggle function.
- [x] Add a theme toggle button (sun/moon icon) to the toolbar/header, wired to `ThemeProvider`.
- [x] Audit all components for hardcoded light-mode colors and replace with Tailwind dark-mode variants (`dark:` prefix).
- [x] Pass the matching Monaco theme (`vs` / `vs-dark`) to the `MonacoEditor` component based on the active theme.
- [x] Add the theme preference to the Settings dialog so it is surfaced alongside API key and model selection.
- [x] Write tests for `ThemeProvider` (toggle, persistence).
- **Working State:** The user can switch between light and dark themes via a toolbar button; the preference survives a page reload and all UI components — including the Monaco editor — adapt accordingly.

- [x] Complete

## Phase 10: Supporting Documents Workspace

**Goal:** Provide the agent with reference material via workspace documents.

### Phase 10a: Docs UI
- [ ] Add `SupportingDocsContext` with `localStorage` persistence.
- [ ] Build `ReferenceTab` (doc list, inline editor, auto-save) and add it to the sidebar.
- **Working State:** The user can create, edit, and delete reference documents in the sidebar. Documents survive a page reload.

### Phase 10b: Basic read tools
- [ ] Implement `list_supporting_docs` and `read_supporting_doc` in the tool registry.
- **Working State:** The agent can list and read documents directly.

### Phase 10c: Single-doc query
- [ ] Implement `query_supporting_doc`: delegates to a short-lived sub-agent that reads one doc and returns a focused summary.
- **Working State:** The agent can ask a focused question about a specific document without the full content entering its context.

### Phase 10d: Multi-doc synthesis
- [ ] Implement `query_supporting_docs`: calls `query_supporting_doc` for each doc, then passes the summaries to a synthesizer sub-agent.
- **Working State:** The agent can query across the entire workspace in a single tool call and receive a synthesized answer.
