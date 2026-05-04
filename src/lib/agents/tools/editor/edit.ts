// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { Tool, ToolContext, ToolDefinition } from "@mast-ai/core";
import type { EditorContext } from "./context";
import { applySuggestion } from "./apply_suggestion";

interface EditArgs {
  originalText: string;
  replacementText: string;
}

function linesBefore(text: string, pos: number, n: number): string {
  if (pos === 0) return "";
  let start = pos;
  for (let i = 0; i < n; i++) {
    const prev = text.lastIndexOf("\n", start - 2);
    if (prev === -1) {
      start = 0;
      break;
    }
    start = prev + 1;
  }
  return text.slice(start, pos).trimEnd();
}

function linesAfter(text: string, pos: number, n: number): string {
  if (pos >= text.length) return "";
  let end = pos;
  for (let i = 0; i < n; i++) {
    const next = text.indexOf("\n", end);
    if (next === -1) {
      end = text.length;
      break;
    }
    end = next + 1;
  }
  return text.slice(pos, end).trimEnd();
}

export class EditTool implements Tool<EditArgs, string> {
  constructor(private ctx: EditorContext) {}

  definition(): ToolDefinition {
    return {
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
      scope: "write",
      requiresApproval: true,
    };
  }

  async call(args: EditArgs, _ctx: ToolContext): Promise<string> {
    const editor = this.ctx.editorRef.current;
    if (!editor) return "Error: Editor not initialized.";
    const model = editor.getModel();
    if (!model) return "Error: Model not found.";

    const fullText = editor.getValue();
    if (
      args.originalText.length > 3000 ||
      (fullText.length > 200 &&
        args.originalText.length > fullText.length * 0.8)
    ) {
      return "Error: `originalText` is too large. The `edit()` tool is for targeted changes. If you must rewrite the entire document, use `write()`. Otherwise, provide a smaller snippet of text to replace.";
    }

    const matches = model.findMatches(
      args.originalText,
      true,
      false,
      true,
      null,
      false,
    );
    if (matches.length === 0) {
      return `Error: Could not find the text "${args.originalText}" in the document.`;
    }

    const range = matches[0].range;
    const idx = model.getOffsetAt({
      lineNumber: range.startLineNumber,
      column: range.startColumn,
    });
    const endIdx = idx + args.originalText.length;

    // Expand match to full line boundaries for the diff display
    const lineStart = fullText.lastIndexOf("\n", idx) + 1;
    const lineEndNl = fullText.indexOf("\n", endIdx);
    const lineEnd = lineEndNl === -1 ? fullText.length : lineEndNl;

    const beforeLines = fullText.slice(lineStart, lineEnd);
    const afterLines =
      fullText.slice(lineStart, idx) +
      args.replacementText +
      fullText.slice(endIdx, lineEnd);

    const contextBefore = linesBefore(fullText, lineStart, 2);
    const contextAfter = linesAfter(fullText, lineEnd + 1, 2);
    const startLine =
      (fullText.slice(0, lineStart).match(/\n/g)?.length ?? 0) + 1;

    const revealInEditor = () => {
      const startPos = model.getPositionAt(idx);
      const endPos = model.getPositionAt(endIdx);
      const revealRange = {
        startLineNumber: startPos.lineNumber,
        startColumn: startPos.column,
        endLineNumber: endPos.lineNumber,
        endColumn: endPos.column,
      };
      editor.revealRangeInCenter(revealRange);
      const collection = editor.createDecorationsCollection([
        {
          range: revealRange,
          options: { inlineClassName: "agent-reveal-highlight" },
        },
      ]);
      setTimeout(() => collection.clear(), 1700);
    };

    return applySuggestion(
      {
        originalText: beforeLines,
        replacementText: afterLines,
        contextBefore,
        contextAfter,
        startLine,
        revealInEditor,
      },
      () =>
        model.pushEditOperations(
          [],
          [{ range, text: args.replacementText }],
          () => null,
        ),
      "Change applied automatically (Approve All is ON).",
      this.ctx.setSuggestions,
      this.ctx.approveAllRef,
    );
  }
}
