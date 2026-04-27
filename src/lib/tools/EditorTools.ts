// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import * as monaco from "monaco-editor";
import {
  AgentConfig,
  AgentEvent,
  ToolContext,
  ToolProvider,
  ToolRegistry,
} from "@mast-ai/core";
import { Suggestion } from "../store";
import type { AgentRunnerFactory } from "../agents";
import { loadSkills } from "../skills";
import { WorkspaceTools } from "./WorkspaceTools";
import { buildReadonlyRegistry } from "./registries";
import { v4 as uuidv4 } from "uuid";

export class EditorTools {
  constructor(
    private editorRef: { current: monaco.editor.IStandaloneCodeEditor | null },
    private setSuggestions: (fn: (prev: Suggestion[]) => Suggestion[]) => void,
    private approveAllRef: { current: boolean },
    private editorContentRef: { current: string } = { current: "" },
    private activeTabRef: { current: "editor" | "preview" } = {
      current: "editor",
    },
    private requestTabSwitch: () => Promise<boolean> = () =>
      Promise.resolve(false),
  ) {}

  read(): string {
    const editor = this.editorRef.current;
    if (!editor) return this.editorContentRef.current;
    const value = editor.getValue();
    return value || this.editorContentRef.current;
  }

  get_current_mode(): string {
    return this.activeTabRef.current;
  }

  async request_switch_to_editor(): Promise<string> {
    if (this.activeTabRef.current === "editor") {
      return "Already in editor mode.";
    }
    const accepted = await this.requestTabSwitch();
    if (accepted) {
      return "Switched to editor mode.";
    }
    return "User declined to switch to editor mode.";
  }

  read_selection(): string {
    const editor = this.editorRef.current;
    if (!editor) return "";
    const selection = editor.getSelection();
    if (!selection) return "";
    return editor.getModel()?.getValueInRange(selection) || "";
  }

  search({ query }: { query: string }): string {
    const editor = this.editorRef.current;
    if (!editor) return "Error: Editor not initialized.";
    if (!query) return "Error: query parameter is required.";
    const model = editor.getModel();
    if (!model) return "Error: Model not found.";

    const matches = model.findMatches(query, true, false, false, null, false);
    if (matches.length === 0) return `No occurrences of "${query}" found.`;

    const locations = matches
      .map((m) => `line ${m.range.startLineNumber}, col ${m.range.startColumn}`)
      .join("; ");
    return `Found ${matches.length} occurrence(s) of "${query}": ${locations}.`;
  }

  get_metadata(): string {
    const editor = this.editorRef.current;
    if (!editor) return "Error: Editor not initialized.";
    const text = editor.getValue();
    const charCount = text.length;
    const lineCount = text === "" ? 0 : text.split("\n").length;
    const wordCount = text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
    return `Characters: ${charCount}, Words: ${wordCount}, Lines: ${lineCount}.`;
  }

  edit({
    originalText,
    replacementText,
  }: {
    originalText: string;
    replacementText: string;
  }): Promise<string> {
    const editor = this.editorRef.current;
    if (!editor) return Promise.resolve("Error: Editor not initialized.");

    const model = editor.getModel();
    if (!model) return Promise.resolve("Error: Model not found.");

    const fullText = editor.getValue();

    // Enforce targeted edits: Prevent originalText from being too large.
    // If the edit is replacing more than 80% of a non-trivial document, or just generally over 3000 characters, block it.
    if (
      originalText.length > 3000 ||
      (fullText.length > 200 && originalText.length > fullText.length * 0.8)
    ) {
      return Promise.resolve(
        "Error: `originalText` is too large. The `edit()` tool is for targeted changes. If you must rewrite the entire document, use `write()`. Otherwise, provide a smaller snippet of text to replace.",
      );
    }

    const matches = model.findMatches(
      originalText,
      true,
      false,
      true,
      null,
      false,
    );

    if (matches.length === 0) {
      return Promise.resolve(
        `Error: Could not find the text "${originalText}" in the document.`,
      );
    }

    // We take the first match for simplicity in this version
    const range = matches[0].range;

    return this.applySuggestion(
      {
        originalText,
        replacementText,
        range: {
          startLineNumber: range.startLineNumber,
          startColumn: range.startColumn,
          endLineNumber: range.endLineNumber,
          endColumn: range.endColumn,
        },
      },
      () =>
        model.pushEditOperations(
          [],
          [{ range: range, text: replacementText }],
          () => null,
        ),
      "Change applied automatically (Approve All is ON).",
    );
  }

  write({ content }: { content: string }): Promise<string> {
    const editor = this.editorRef.current;
    if (!editor) return Promise.resolve("Error: Editor not initialized.");

    const model = editor.getModel();
    if (!model) return Promise.resolve("Error: Model not found.");

    const fullRange = model.getFullModelRange();

    return this.applySuggestion(
      {
        originalText: editor.getValue(),
        replacementText: content,
        range: {
          startLineNumber: fullRange.startLineNumber,
          startColumn: fullRange.startColumn,
          endLineNumber: fullRange.endLineNumber,
          endColumn: fullRange.endColumn,
        },
      },
      () => editor.setValue(content),
      "Document updated automatically (Approve All is ON).",
    );
  }

  private applySuggestion(
    data: Omit<Suggestion, "id" | "status" | "resolve">,
    autoApply: () => void,
    autoMessage: string,
  ): Promise<string> {
    if (this.approveAllRef.current) {
      autoApply();
      return Promise.resolve(autoMessage);
    }
    return new Promise((resolve) => {
      const newSuggestion: Suggestion = {
        id: uuidv4(),
        ...data,
        status: "pending",
        resolve,
      };
      this.setSuggestions((prev) => [...prev, newSuggestion]);
    });
  }
}

/** Registers the standard editor tools on a ToolRegistry. */
export function registerEditorTools(
  registry: ToolRegistry,
  tools: EditorTools,
): void {
  registry.register({
    definition: () => ({
      name: "read",
      description: "Reads the complete current editor content.",
      parameters: { type: "object", properties: {} },
      scope: "read" as const,
    }),
    call: async () => tools.read(),
  });

  registry.register({
    definition: () => ({
      name: "read_selection",
      description: "Reads the currently selected text in the editor.",
      parameters: { type: "object", properties: {} },
      scope: "read" as const,
    }),
    call: async () => tools.read_selection(),
  });

  registry.register({
    definition: () => ({
      name: "search",
      description:
        "Finds all occurrences of a query string in the document. Returns the line and column of each match.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The text to search for." },
        },
        required: ["query"],
      },
      scope: "read" as const,
    }),
    call: async (args: { query: string }) => tools.search(args),
  });

  registry.register({
    definition: () => ({
      name: "get_metadata",
      description:
        "Returns metadata about the current document: character count, word count, and line count.",
      parameters: { type: "object", properties: {} },
      scope: "read" as const,
    }),
    call: async () => tools.get_metadata(),
  });

  registry.register({
    definition: () => ({
      name: "get_current_mode",
      description:
        "Returns the current UI mode: 'editor' (Monaco editor is visible) or 'preview' (Markdown preview is visible). Check this before making edits to ensure the editor is accessible.",
      parameters: { type: "object", properties: {} },
      scope: "read" as const,
    }),
    call: async () => tools.get_current_mode(),
  });

  registry.register({
    definition: () => ({
      name: "edit",
      description:
        "Proposes a targeted edit. This tool pauses and waits for user approval. ONLY use this for small, localized changes (e.g., 1-2 sentences). Never pass the entire document.",
      parameters: {
        type: "object",
        properties: {
          originalText: {
            type: "string",
            description:
              "The exact, minimal string of text to replace. Must be short. Do NOT pass the whole document.",
          },
          replacementText: {
            type: "string",
            description: "The new text to replace the originalText with.",
          },
        },
        required: ["originalText", "replacementText"],
      },
      scope: "write" as const,
    }),
    call: async (args: { originalText: string; replacementText: string }) =>
      tools.edit(args),
  });

  registry.register({
    definition: () => ({
      name: "write",
      description:
        "Proposes a complete rewrite. This tool pauses and waits for user approval. ONLY use this when the user explicitly requests a total rewrite of the entire document.",
      parameters: {
        type: "object",
        properties: {
          content: {
            type: "string",
            description: "The full new document content.",
          },
        },
        required: ["content"],
      },
      scope: "write" as const,
    }),
    call: async (args: { content: string }) => tools.write(args),
  });

  registry.register({
    definition: () => ({
      name: "request_switch_to_editor",
      description:
        "Requests the user to switch from Preview mode to Editor mode. This will display a prompt to the user and pause until they accept or decline. Call this before attempting edits when in preview mode.",
      parameters: { type: "object", properties: {} },
      scope: "write" as const,
    }),
    call: async () => tools.request_switch_to_editor(),
  });
}

/**
 * Creates the delegate_to_skill tool call handler.
 * Extracted for testability; the factory parameter can be overridden in tests.
 */
type RunnerLike = {
  runBuilder: (agent: AgentConfig) => {
    runStream: (input: string) => AsyncIterable<AgentEvent>;
  };
};

export function createDelegateToSkillHandler(
  factory: AgentRunnerFactory,
  editorTools: EditorTools,
  workspaceTools: WorkspaceTools,
  runnerFactory: (registry: ToolProvider, model?: string) => RunnerLike = (
    registry,
    model,
  ) => factory.create({ tools: registry, model }),
): (
  args: { skillName: string; task: string },
  context: ToolContext,
) => Promise<string> {
  return async ({ skillName, task }, context) => {
    const skills = loadSkills();
    const skill = skills.find((s) => s.name === skillName);
    if (!skill) {
      const names = skills.map((s) => s.name).join(", ");
      return `Error: skill "${skillName}" not found. Available skills: ${names || "none"}`;
    }

    const childRegistry = buildReadonlyRegistry(editorTools, workspaceTools);
    const readonlyToolNames = childRegistry.getTools().map((d) => d.name);

    const childRunner = runnerFactory(childRegistry, skill.model);
    const agentConfig: AgentConfig = {
      name: skill.name,
      instructions: skill.instructions,
      tools: readonlyToolNames,
    };
    for await (const event of childRunner
      .runBuilder(agentConfig)
      .runStream(task)) {
      if (event.type === "done") {
        return event.output;
      }
      context.onEvent?.(event);
    }
    throw new Error("Child runner ended without a done event");
  };
}
