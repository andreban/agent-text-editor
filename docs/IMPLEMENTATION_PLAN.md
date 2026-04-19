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

- [ ] Implement a responsive layout: below the `md` breakpoint the split-pane view collapses into a two-tab interface (Editor | Chat) using `shadcn/ui` `Tabs`.
- [ ] Ensure all interactive controls meet a 44 × 44 px minimum touch-target size on mobile.
- [ ] Verify the Monaco editor fills available height without horizontal overflow on narrow viewports.
- [ ] Write snapshot/interaction tests for the responsive layout breakpoint.
- **Working State:** On a mobile browser the editor and chat are accessible via tabs with no horizontal scrolling, and all controls are comfortably tappable.

## Phase 8: Supporting Documents Workspace

**Goal:** Provide the agent with reference material via workspace documents.

- [ ] Extend global state to manage a list of supporting markdown documents (title + content) synced with `localStorage`.
- [ ] Build a UI (e.g., a "Reference" tab in the sidebar) for the user to create, edit, and delete these documents.
- [ ] Implement `list_supporting_docs` and `read_supporting_doc` in the tool registry.
- **Working State:** The user can manage reference notes. The agent can be asked to "check my notes on character X" and successfully use the tools to retrieve the information before making edits to the main text.

## Phase 9: Dark Mode

**Goal:** Make the application comfortable to use in any lighting condition.

- [ ] Enable Tailwind CSS class-based dark mode (`darkMode: 'class'` in `tailwind.config`).
- [ ] Create a `ThemeProvider` context that reads the saved theme from `localStorage`, applies the `dark` class to `<html>`, and exposes a toggle function.
- [ ] Add a theme toggle button (sun/moon icon) to the toolbar/header, wired to `ThemeProvider`.
- [ ] Audit all components for hardcoded light-mode colors and replace with Tailwind dark-mode variants (`dark:` prefix).
- [ ] Pass the matching Monaco theme (`vs` / `vs-dark`) to the `MonacoEditor` component based on the active theme.
- [ ] Add the theme preference to the Settings dialog so it is surfaced alongside API key and model selection.
- [ ] Write tests for `ThemeProvider` (toggle, persistence).
- **Working State:** The user can switch between light and dark themes via a toolbar button; the preference survives a page reload and all UI components — including the Monaco editor — adapt accordingly.

## Phase 10: Sub-Agents & Custom Skills

**Goal:** Enable specialized workflows through multi-agent delegation.

- [ ] Implement initialization logic in `App.tsx` to populate `localStorage` with Default Skills (Proofreader, Summarizer, Markdown Formatter) if empty.
- [ ] Build a "Skills Manager" UI for CRUD operations on custom skills.
- [ ] Update `App.tsx` to dynamically inject skill names and descriptions into the main agent's `systemInstructions`.
- [ ] Implement the `delegate_to_skill` tool, which spins up a child `AgentRunner` with the skill's specific instructions.
- **Working State:** The user can ask the main agent to "proofread the document", and it successfully delegates the task to the Proofreader sub-agent. User can create a new custom skill and invoke it.
