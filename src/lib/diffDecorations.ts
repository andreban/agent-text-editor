// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0
import { diff_match_patch, DIFF_EQUAL, DIFF_DELETE, DIFF_INSERT } from "diff-match-patch";
import type * as monaco from "monaco-editor";
import type { Suggestion } from "./store";

function buildPositionMap(
  text: string,
  startLine: number,
  startColumn: number,
): Array<{ lineNumber: number; column: number }> {
  const map: Array<{ lineNumber: number; column: number }> = [];
  let line = startLine;
  let col = startColumn;
  for (const ch of text) {
    map.push({ lineNumber: line, column: col });
    if (ch === "\n") {
      line++;
      col = 1;
    } else {
      col++;
    }
  }
  map.push({ lineNumber: line, column: col });
  return map;
}

function escapeNewlines(text: string): string {
  return text.replace(/\n/g, "↵");
}

export function computeDiffDecorations(
  suggestion: Suggestion,
): monaco.editor.IModelDeltaDecoration[] {
  const dmp = new diff_match_patch();
  const diffs = dmp.diff_main(suggestion.originalText, suggestion.replacementText);
  dmp.diff_cleanupSemantic(diffs);

  const posMap = buildPositionMap(
    suggestion.originalText,
    suggestion.range.startLineNumber,
    suggestion.range.startColumn,
  );

  const decorations: monaco.editor.IModelDeltaDecoration[] = [];
  let originalOffset = 0;

  for (let i = 0; i < diffs.length; i++) {
    const [op, text] = diffs[i];

    const nextOp = diffs[i + 1];
    const insertAfter = nextOp && nextOp[0] === DIFF_INSERT ? nextOp[1] : null;
    if (insertAfter !== null) {
      i++;
    }

    if (op === DIFF_INSERT) {
      const pos = posMap[originalOffset];
      decorations.push({
        range: {
          startLineNumber: pos.lineNumber,
          startColumn: pos.column,
          endLineNumber: pos.lineNumber,
          endColumn: pos.column,
        },
        options: {
          after: {
            content: " " + escapeNewlines(text),
            inlineClassName: "suggestion-insert",
          },
        },
      });
      continue;
    }

    const segEnd = originalOffset + text.length;
    const startPos = posMap[originalOffset];
    const endPos = posMap[segEnd];

    const range: monaco.IRange = {
      startLineNumber: startPos.lineNumber,
      startColumn: startPos.column,
      endLineNumber: endPos.lineNumber,
      endColumn: endPos.column,
    };

    if (op === DIFF_DELETE) {
      decorations.push({
        range,
        options: {
          inlineClassName: "suggestion-delete",
          ...(insertAfter !== null
            ? {
                after: {
                  content: " " + escapeNewlines(insertAfter),
                  inlineClassName: "suggestion-insert",
                },
              }
            : {}),
        },
      });
    } else {
      // EQUAL — only needs a decoration if followed by an INSERT
      if (insertAfter !== null) {
        decorations.push({
          range,
          options: {
            after: {
              content: " " + escapeNewlines(insertAfter),
              inlineClassName: "suggestion-insert",
            },
          },
        });
      }
    }

    originalOffset = segEnd;
  }

  if (decorations.length === 0 && suggestion.replacementText.length > 0) {
    const pos = posMap[0];
    decorations.push({
      range: {
        startLineNumber: pos.lineNumber,
        startColumn: pos.column,
        endLineNumber: pos.lineNumber,
        endColumn: pos.column,
      },
      options: {
        after: {
          content: " " + escapeNewlines(suggestion.replacementText),
          inlineClassName: "suggestion-insert",
        },
      },
    });
  }

  return decorations;
}
