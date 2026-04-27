// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import * as monaco from "monaco-editor";
import { Suggestion } from "../../store";
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
