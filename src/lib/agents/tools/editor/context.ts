// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type * as monaco from "monaco-editor";
import type { Suggestion } from "../../../store";

export interface EditorContext {
  editorRef: { current: monaco.editor.IStandaloneCodeEditor | null };
  editorContentRef: { current: string };
  activeTabRef: { current: "editor" | "preview" };
  requestTabSwitch: () => Promise<boolean>;
  setSuggestions: (fn: (prev: Suggestion[]) => Suggestion[]) => void;
  approveAllRef: { current: boolean };
}
