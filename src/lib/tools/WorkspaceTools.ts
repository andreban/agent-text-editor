// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { AgentConfig, ToolRegistry } from "@mast-ai/core";
import { v4 as uuidv4 } from "uuid";
import { WorkspaceDocument } from "../workspace";
import type { WorkspaceActionRequest } from "../store";
import type { AgentRunnerFactory } from "../agents/factory";
import { DOC_QUERIER_SYSTEM_PROMPT, runResearch } from "../agents/researcher";

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

export function registerWorkspaceTools(
  registry: ToolRegistry,
  tools: WorkspaceTools,
): void {
  registry.register({
    definition: () => ({
      name: "get_active_doc_info",
      description:
        "Returns the id and title of the document currently open in the editor.",
      parameters: { type: "object", properties: {} },
      scope: "read" as const,
    }),
    call: async () => tools.get_active_doc_info(),
  });

  registry.register({
    definition: () => ({
      name: "list_workspace_docs",
      description:
        "Lists all documents in the workspace. Returns an array of { id, title } objects.",
      parameters: { type: "object", properties: {} },
      scope: "read" as const,
    }),
    call: async () => tools.list_workspace_docs(),
  });

  registry.register({
    definition: () => ({
      name: "read_workspace_doc",
      description:
        "Reads the full content of a specific document. Returns { title, content } or { error }.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "The document ID to read." },
        },
        required: ["id"],
      },
      scope: "read" as const,
    }),
    call: async (args: { id: string }) => tools.read_workspace_doc(args),
  });

  registry.register({
    definition: () => ({
      name: "query_workspace_doc",
      description:
        "Asks a question about a specific document using a sub-agent. Returns { summary, excerpt } where excerpt is the most relevant verbatim passage.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "The document ID to query." },
          query: {
            type: "string",
            description: "The question about the document.",
          },
        },
        required: ["id", "query"],
      },
      scope: "read" as const,
    }),
    call: async (args: { id: string; query: string }) =>
      tools.query_workspace_doc(args),
  });

  registry.register({
    definition: () => ({
      name: "query_workspace",
      description:
        "Asks a question spanning all workspace documents and synthesizes the results. Returns { summary, sources: [{ id, title, excerpt }] }.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The question to answer across all documents.",
          },
        },
        required: ["query"],
      },
      scope: "read" as const,
    }),
    call: async (args: { query: string }) => tools.query_workspace(args),
  });

  registry.register({
    definition: () => ({
      name: "create_document",
      description:
        "Creates a new document in the workspace with the given title and optional initial content. Providing content avoids a separate write step. Pauses for user authorization before creating.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "The title for the new document.",
          },
          content: {
            type: "string",
            description:
              "Optional initial content for the new document. If omitted the document is created blank.",
          },
        },
        required: ["title"],
      },
      scope: "write" as const,
    }),
    call: async (args: { title: string; content?: string }) =>
      tools.create_document(args),
  });

  registry.register({
    definition: () => ({
      name: "rename_document",
      description:
        "Renames an existing document in the workspace. Pauses for user authorization before renaming.",
      parameters: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "The document ID to rename.",
          },
          title: {
            type: "string",
            description: "The new title for the document.",
          },
        },
        required: ["id", "title"],
      },
      scope: "write" as const,
    }),
    call: async (args: { id: string; title: string }) =>
      tools.rename_document(args),
  });

  registry.register({
    definition: () => ({
      name: "delete_document",
      description:
        "Deletes a document from the workspace. Pauses for user authorization before deleting. If the deleted document was active, a different document becomes active.",
      parameters: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "The document ID to delete.",
          },
        },
        required: ["id"],
      },
      scope: "write" as const,
    }),
    call: async (args: { id: string }) => tools.delete_document(args),
  });

  registry.register({
    definition: () => ({
      name: "switch_active_document",
      description:
        "Switches the active document in the editor. Saves the current document content before switching. Does not require user authorization.",
      parameters: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "The document ID to switch to.",
          },
        },
        required: ["id"],
      },
      scope: "write" as const,
    }),
    call: async (args: { id: string }) => tools.switch_active_document(args),
  });
}

