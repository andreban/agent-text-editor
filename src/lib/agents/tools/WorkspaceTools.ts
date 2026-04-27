// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { AgentConfig } from "@mast-ai/core";
import { v4 as uuidv4 } from "uuid";
import { WorkspaceDocument } from "../../workspace";
import type { WorkspaceActionRequest } from "../../store";
import type { AgentRunnerFactory } from "../";
import { DOC_QUERIER_SYSTEM_PROMPT, runResearch } from "../";

export type CreateDocumentFn = (title: string) => string;
export type RenameDocumentFn = (id: string, title: string) => void;
export type DeleteDocumentFn = (id: string) => void;
export type SetActiveDocumentIdFn = (id: string) => void;
export type SaveDocContentFn = (id: string, content: string) => void;
export type SetPendingWorkspaceActionFn = (
  action: WorkspaceActionRequest | null,
) => void;

/** Accepts any object with a `current` array — compatible with React.MutableRefObject. */
export interface DocsRef {
  current: WorkspaceDocument[];
}

export interface ActiveDocRef {
  current: { id: string; title: string } | null;
}

/** Minimal editor interface needed by WorkspaceTools. */
export interface EditorLike {
  getValue(): string;
  setValue(content: string): void;
}

export class WorkspaceTools {
  constructor(
    public readonly docsRef: DocsRef,
    private activeDocRef: ActiveDocRef,
    private factory: AgentRunnerFactory,
    private createDocumentFn: CreateDocumentFn = () => "",
    private renameDocumentFn: RenameDocumentFn = () => {},
    private deleteDocumentFn: DeleteDocumentFn = () => {},
    private setActiveDocumentIdFn: SetActiveDocumentIdFn = () => {},
    private saveDocContentFn: SaveDocContentFn = () => {},
    private editorRef: { current: EditorLike | null } = { current: null },
    private editorContentRef: { current: string } = { current: "" },
    private setPendingWorkspaceAction: SetPendingWorkspaceActionFn = () => {},
    private approveAllRef: { current: boolean } = { current: false },
  ) {}

  private getEditorContent(): string {
    return this.editorRef.current?.getValue() ?? this.editorContentRef.current;
  }

  private setEditorValue(content: string): void {
    this.editorRef.current?.setValue(content);
  }

  get_active_doc_info(): string {
    const doc = this.activeDocRef.current;
    if (!doc) return JSON.stringify({ error: "No active document" });
    return JSON.stringify({ id: doc.id, title: doc.title });
  }

  list_workspace_docs(): string {
    const docs = this.docsRef.current;
    return JSON.stringify(docs.map((d) => ({ id: d.id, title: d.title })));
  }

  read_workspace_doc({ id }: { id: string }): string {
    const doc = this.docsRef.current.find((d) => d.id === id);
    if (!doc) return JSON.stringify({ error: "Document not found" });
    return JSON.stringify({ title: doc.title, content: doc.content });
  }

  async query_workspace_doc({
    id,
    query,
  }: {
    id: string;
    query: string;
  }): Promise<string> {
    const doc = this.docsRef.current.find((d) => d.id === id);
    if (!doc) return JSON.stringify({ error: "Document not found" });

    const agent: AgentConfig = {
      name: "DocQuerier",
      instructions: DOC_QUERIER_SYSTEM_PROMPT,
      tools: [],
    };
    const runner = this.factory.create({ systemPrompt: agent.instructions });
    const input = `Document title: ${doc.title}\n\nDocument content:\n${doc.content}\n\nQuery: ${query}`;
    const result = await runner.run(agent, input);
    let parsed: { summary: string; excerpt: string };
    try {
      parsed = JSON.parse(result.output) as {
        summary: string;
        excerpt: string;
      };
    } catch {
      parsed = { summary: result.output, excerpt: "" };
    }
    return JSON.stringify({
      summary: parsed.summary,
      excerpt: parsed.excerpt ?? "",
    });
  }

  create_document({
    title,
    content,
  }: {
    title: string;
    content?: string;
  }): Promise<string> {
    if (!title?.trim()) {
      return Promise.resolve(JSON.stringify({ error: "title is required" }));
    }
    return this.applyWorkspaceAction(
      `Create document "${title}"`,
      () => {
        const currentDoc = this.activeDocRef.current;
        if (currentDoc) {
          this.saveDocContentFn(currentDoc.id, this.getEditorContent());
        }
        const newId = this.createDocumentFn(title);
        const initialContent = content ?? "";
        // Immediately sync Monaco so subsequent reads see the correct content
        // before React's async re-render cycle completes.
        this.setEditorValue(initialContent);
        if (content && newId) {
          this.saveDocContentFn(newId, content);
        }
      },
      `Document "${title}" created automatically (Approve All is ON).`,
    );
  }

  rename_document({
    id,
    title,
  }: {
    id: string;
    title: string;
  }): Promise<string> {
    const doc = this.docsRef.current.find((d) => d.id === id);
    if (!doc)
      return Promise.resolve(JSON.stringify({ error: "Document not found" }));
    if (!title?.trim()) {
      return Promise.resolve(JSON.stringify({ error: "title is required" }));
    }
    return this.applyWorkspaceAction(
      `Rename document "${doc.title}" to "${title}"`,
      () => this.renameDocumentFn(id, title),
      `Document renamed to "${title}" automatically (Approve All is ON).`,
    );
  }

  delete_document({ id }: { id: string }): Promise<string> {
    const doc = this.docsRef.current.find((d) => d.id === id);
    if (!doc)
      return Promise.resolve(JSON.stringify({ error: "Document not found" }));
    return this.applyWorkspaceAction(
      `Delete document "${doc.title}"`,
      () => this.deleteDocumentFn(id),
      `Document "${doc.title}" deleted automatically (Approve All is ON).`,
    );
  }

  async switch_active_document({ id }: { id: string }): Promise<string> {
    const doc = this.docsRef.current.find((d) => d.id === id);
    if (!doc) return JSON.stringify({ error: "Document not found" });
    const currentDoc = this.activeDocRef.current;
    if (currentDoc) {
      this.saveDocContentFn(currentDoc.id, this.getEditorContent());
    }
    this.setActiveDocumentIdFn(id);
    // Immediately sync Monaco so subsequent read/edit calls see the new content
    // before React's async re-render cycle completes.
    this.setEditorValue(doc.content);
    return JSON.stringify({ switched: true, id, title: doc.title });
  }

  private applyWorkspaceAction(
    description: string,
    apply: () => void,
    autoMessage: string,
  ): Promise<string> {
    if (this.approveAllRef.current) {
      apply();
      return Promise.resolve(autoMessage);
    }
    return new Promise((resolve) => {
      const request: WorkspaceActionRequest = {
        id: uuidv4(),
        description,
        apply,
        resolve,
      };
      this.setPendingWorkspaceAction(request);
    });
  }

  async query_workspace({ query }: { query: string }): Promise<string> {
    const result = await runResearch(query, this.docsRef.current, this.factory);
    return JSON.stringify(result);
  }
}
