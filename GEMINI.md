# AI Agent Text Editor Mandates

This file contains foundational mandates for the AI Agent Text Editor project. These instructions take absolute precedence over general workflows.

## Project Standards

- **License:** All source files must include the Apache-2.0 license header as specified in `docs/SPEC.md`.
- **Styling:** Use Tailwind CSS for utility styling and `shadcn/ui` for complex components.
- **Tools:** Modification of the main editor content MUST go through the `edit` or `write` tools to ensure the user approval workflow is respected (unless "Approve All" mode is active).
- **Sub-Agents:** Custom skills are stored in `localStorage` and injected into the main agent's system prompt for discovery.
- **Quality Assurance:** All new logic (tools, adapters, state management) MUST be covered by automated tests (Vitest).
- **Code Quality:** Code MUST be linted with ESLint (and issues fixed) and formatted with Prettier before every commit.

## Implementation Workflow

- Follow the phased approach in `docs/IMPLEMENTATION_PLAN.md`.
- Run tests (`npm run test`), lint (`npm run lint`), and format (`npm run format`).
- **CRITICAL:** NEVER commit code without explicit user approval. You must pause, ask the user to manually test the implementation, and wait for their confirmation before running `git commit`.
- Each phase must be marked as complete in the plan and committed to git (post-approval) before moving to the next.
- Maintain a working application state at the end of every phase.

## Tech Stack Reminders

- **Framework:** React 18 (TypeScript) + Vite.
- **Editor:** Monaco Editor via `@monaco-editor/react`.
- **AI:** `@mast-ai/core` for orchestration and `@google/genai` for the Gemini 2.5 Flash model.
