// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import * as monaco from "monaco-editor";
import { Suggestion } from "./store";
import { v4 as uuidv4 } from "uuid";

export class EditorTools {
  constructor(
    private editor: monaco.editor.IStandaloneCodeEditor | null,
    private setSuggestions: (fn: (prev: Suggestion[]) => Suggestion[]) => void,
    private approveAll: boolean,
    private setEditorContent: (content: string) => void,
  ) {}

  /**
   * Reads the entire content of the editor.
   */
  read(): string {
    if (!this.editor) return "";
    return this.editor.getValue();
  }

  /**
   * Reads the current selection.
   */
  read_selection(): string {
    if (!this.editor) return "";
    const selection = this.editor.getSelection();
    if (!selection) return "";
    return this.editor.getModel()?.getValueInRange(selection) || "";
  }

  search({ query }: { query: string }): string {
    if (!this.editor) return "Error: Editor not initialized.";
    if (!query) return "Error: query parameter is required.";
    const model = this.editor.getModel();
    if (!model) return "Error: Model not found.";

    const matches = model.findMatches(query, true, false, false, null, false);
    if (matches.length === 0) return `No occurrences of "${query}" found.`;

    const locations = matches
      .map((m) => `line ${m.range.startLineNumber}, col ${m.range.startColumn}`)
      .join("; ");
    return `Found ${matches.length} occurrence(s) of "${query}": ${locations}.`;
  }

  get_metadata(): string {
    if (!this.editor) return "Error: Editor not initialized.";
    const text = this.editor.getValue();
    const charCount = text.length;
    const lineCount = text === "" ? 0 : text.split("\n").length;
    const wordCount = text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
    return `Characters: ${charCount}, Words: ${wordCount}, Lines: ${lineCount}.`;
  }

  /**
   * Proposes an edit by replacing originalText with replacementText.
   * Returns a promise that resolves with the user's decision.
   */
  edit({
    originalText,
    replacementText,
  }: {
    originalText: string;
    replacementText: string;
  }): Promise<string> {
    const editor = this.editor;
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

    if (this.approveAll) {
      model.pushEditOperations(
        [],
        [
          {
            range: range,
            text: replacementText,
          },
        ],
        () => null,
      );
      return Promise.resolve(
        "Change applied automatically (Approve All is ON).",
      );
    }

    return new Promise((resolve) => {
      const newSuggestion: Suggestion = {
        id: uuidv4(),
        originalText,
        replacementText,
        status: "pending",
        range: {
          startLineNumber: range.startLineNumber,
          startColumn: range.startColumn,
          endLineNumber: range.endLineNumber,
          endColumn: range.endColumn,
        },
        resolve,
      };

      this.setSuggestions((prev) => [...prev, newSuggestion]);
    });
  }

  /**
   * Proposes a complete rewrite of the document.
   * Returns a promise that resolves with the user's decision.
   */
  write({ content }: { content: string }): Promise<string> {
    const editor = this.editor;
    if (!editor) return Promise.resolve("Error: Editor not initialized.");

    if (this.approveAll) {
      editor.setValue(content);
      return Promise.resolve(
        "Document updated automatically (Approve All is ON).",
      );
    }

    const model = editor.getModel();
    if (!model) return Promise.resolve("Error: Model not found.");

    const fullRange = model.getFullModelRange();

    return new Promise((resolve) => {
      const newSuggestion: Suggestion = {
        id: uuidv4(),
        originalText: editor.getValue(),
        replacementText: content,
        status: "pending",
        range: {
          startLineNumber: fullRange.startLineNumber,
          startColumn: fullRange.startColumn,
          endLineNumber: fullRange.endLineNumber,
          endColumn: fullRange.endColumn,
        },
        resolve,
      };

      this.setSuggestions((prev) => [...prev, newSuggestion]);
    });
  }
}
