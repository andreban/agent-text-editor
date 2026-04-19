# Product Requirements Document: AI Agent Text Editor

## Goal

To provide a modern, AI-powered text editing experience where a browser-native AI agent assists the user in real-time. The agent should be able to read the editor's content, suggest improvements, and perform text manipulations directly within the editor.

## Key Features

- **Monaco Editor Integration:** A high-performance text editor for a seamless writing experience.
- **AI Agent (MAST):** A browser-native agent using the `mast-ai` library for low-latency, secure, and stateful interactions.
- **Google Gen AI Integration:** Utilizing the latest `@google/genai` SDK. Users can choose their preferred underlying model from a list of current models (defaulting to Gemini 2.5 Flash).
- **Editor-Aware Tools:** The agent will have access to tools that allow it to:
  - **Read:** Retrieve the entire document content.
  - **Read Selection:** Retrieve only the text currently highlighted by the user for focused tasks.
  - **Search:** Find specific words or phrases within the document without reading the whole file.
  - **Get Metadata:** Access document statistics like word count, character count, and current cursor position.
  - **Edit:** Suggest edits (insertions, removals, or replacements) by providing the original text to be replaced and the new text.
  - **Write:** Propose replacing the entire document content (e.g., when drafting a new document or completing a full rewrite).
  - **List Documents:** Retrieve a list of available supporting documents in the workspace.
  - **Read Document:** Retrieve the content of a specific supporting document to use as reference.
- **Supporting Documents:** Users can add multiple markdown documents to their workspace. These documents can hold project metadata, style guides, character bios, or general reference material to assist in the writing process.
- **Approval Workflow:** By default, all modifications proposed by the agent (via `edit` or `write`) require explicit user approval (accept, decline, or provide feedback) before being applied to the editor. The user can optionally enable an "approve all" mode to automatically accept changes for faster, autonomous editing.
- **Interactive Sidebar:** A chat-based interface for interacting with the AI agent.
- **Local Settings:** User preferences, credentials (like the Google AI Studio API key), and the selected AI model are securely saved in the browser's local storage to persist across sessions without requiring a backend.
- **Token Tracking:** The application tracks the number of tokens used (prompt and completion tokens) by the agent and any sub-agents. This provides transparency to the user regarding the cost or quota consumption of their API key. The total usage for the session is visible in the UI.
- **Custom Skills (Sub-Agents):** Users can define custom specialized agents by providing:
  - **Name:** The identifier for the skill (e.g., "Styleguide Reviewer").
  - **Description:** What the skill does and when to use it.
  - **Instructions:** The actual system instructions for the sub-agent.
  - The main agent's system prompt is dynamically injected with only the _names_ and _descriptions_ so it knows when to delegate. The _instructions_ are only loaded and used by the sub-agent when `delegate_to_skill` is invoked.
- **Default Skills:** The application comes pre-loaded with several useful skills to provide immediate value:
  - **Proofreader:** Checks for grammar, spelling, and punctuation errors.
  - **Summarizer:** Distills large blocks of text into concise summaries.
  - **Markdown Formatter:** Ensures content follows clean, standard Markdown formatting.
  - Users can edit or delete these default skills, or create their own.

## User Persona

- **Writers/Content Creators:** Who need assistance with brainstorming, drafting, and editing.
- **Developers:** Who want an AI-assisted notepad for quick notes or snippets.
- **AI Enthusiasts:** Who want to explore browser-native agent patterns using MAST.

## Success Metrics

- **Performance:** Low-latency response times for agent thoughts and tool executions.
- **Correctness:** The agent correctly identifies and executes editor operations.
- **Usability:** A simple, intuitive interface that balances the editor and the AI interaction.

## License

Apache-2.0
