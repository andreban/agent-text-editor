// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { WorkspaceDocument } from "../../../workspace";
import type { WorkspaceActionRequest } from "../../../store";
import type { AgentRunnerFactory } from "../../";

export interface EditorLike {
  getValue(): string;
  setValue(content: string): void;
}

export interface WorkspaceContext {
  docsRef: { current: WorkspaceDocument[] };
  activeDocRef: { current: { id: string; title: string } | null };
  factory: AgentRunnerFactory;
  createDocumentFn: (title: string) => string;
  renameDocumentFn: (id: string, title: string) => void;
  deleteDocumentFn: (id: string) => void;
  setActiveDocumentIdFn: (id: string) => void;
  saveDocContentFn: (id: string, content: string) => void;
  editorRef: { current: EditorLike | null };
  editorContentRef: { current: string };
  setPendingWorkspaceAction: (action: WorkspaceActionRequest | null) => void;
  approveAllRef: { current: boolean };
}
