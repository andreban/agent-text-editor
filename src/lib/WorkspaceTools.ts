// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { AgentRunner, LlmAdapter, ToolRegistry } from "@mast-ai/core";
import type { AgentConfig } from "@mast-ai/core";
import { v4 as uuidv4 } from "uuid";
import { WorkspaceDocument } from "./workspace";
import type { WorkspaceActionRequest } from "./store";

type RunnerLike = {
  run: (agent: AgentConfig, input: string) => Promise<{ output: string }>;
};

export type AdapterFactory = () => LlmAdapter;
export type SubAgentFactory = (adapter: LlmAdapter) => RunnerLike;
export type CreateDocumentFn = (title: string) => string;
export type RenameDocumentFn = (id: string, title: string) => void;
export type DeleteDocumentFn = (id: string) => void;
export type SetActiveDocumentIdFn = (id: string) => void;
export type SaveDocContentFn = (id: string, content: string) => void;
export type GetEditorContentFn = () => string;
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

const defaultRunnerFactory: SubAgentFactory = (adapter) =>
  new AgentRunner(adapter);

export class WorkspaceTools {
  constructor(
    private docsRef: DocsRef,
    private activeDocRef: ActiveDocRef,
    private adapterFactory: AdapterFactory,
    private runnerFactory: SubAgentFactory = defaultRunnerFactory,
    private createDocumentFn: CreateDocumentFn = () => "",
    private renameDocumentFn: RenameDocumentFn = () => {},
    private deleteDocumentFn: DeleteDocumentFn = () => {},
    private setActiveDocumentIdFn: SetActiveDocumentIdFn = () => {},
    private saveDocContentFn: SaveDocContentFn = () => {},
    private getEditorContent: GetEditorContentFn = () => "",
    private setPendingWorkspaceAction: SetPendingWorkspaceActionFn = () => {},
    private approveAll: boolean = false,
  ) {}

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

    const adapter = this.adapterFactory();
    const runner = this.runnerFactory(adapter);
    const agent: AgentConfig = {
      name: "DocQuerier",
      instructions:
        "You are a helpful assistant. Answer the user's question based solely on the provided document. Reply with a concise summary or direct answer.",
      tools: [],
    };
    const input = `Document title: ${doc.title}\n\nDocument content:\n${doc.content}\n\nQuestion: ${query}`;
    const result = await runner.run(agent, input);
    return JSON.stringify({ summary: result.output });
  }

  create_document({ title }: { title: string }): Promise<string> {
    if (!title?.trim()) {
      return Promise.resolve(JSON.stringify({ error: "title is required" }));
    }
    return this.applyWorkspaceAction(
      `Create document "${title}"`,
      () => this.createDocumentFn(title),
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
    return JSON.stringify({ switched: true, id, title: doc.title });
  }

  private applyWorkspaceAction(
    description: string,
    apply: () => void,
    autoMessage: string,
  ): Promise<string> {
    if (this.approveAll) {
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
    const docs = this.docsRef.current;
    const summaries: string[] = [];

    for (const doc of docs) {
      const raw = await this.query_workspace_doc({ id: doc.id, query });
      const parsed: { summary?: string; error?: string } = JSON.parse(raw);
      if (parsed.summary) {
        summaries.push(`Document "${doc.title}": ${parsed.summary}`);
      }
    }

    const adapter = this.adapterFactory();
    const runner = this.runnerFactory(adapter);
    const agent: AgentConfig = {
      name: "WorkspaceSynthesizer",
      instructions:
        "You are a helpful assistant. Synthesize the provided per-document summaries to give a comprehensive answer to the user's question.",
      tools: [],
    };
    const input = `Summaries from workspace documents:\n\n${summaries.join("\n\n")}\n\nQuestion: ${query}`;
    const result = await runner.run(agent, input);
    return JSON.stringify({ answer: result.output });
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
        "Returns the id and title of the document currently open in the editor. Use this when the user references 'this document', 'the current document', or a document by name without specifying an id.",
      parameters: { type: "object", properties: {} },
    }),
    call: async () => tools.get_active_doc_info(),
  });

  registry.register({
    definition: () => ({
      name: "list_workspace_docs",
      description:
        "Lists all documents in the current workspace. Returns an array of { id, title } objects. Use this to discover what documents exist before reading or querying them.",
      parameters: { type: "object", properties: {} },
    }),
    call: async () => tools.list_workspace_docs(),
  });

  registry.register({
    definition: () => ({
      name: "read_workspace_doc",
      description:
        "Reads the full content of a specific document in the workspace. Returns { title, content } or { error } if not found.",
      parameters: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description:
              "The document ID to read. Use list_workspace_docs first to get IDs.",
          },
        },
        required: ["id"],
      },
    }),
    call: async (args: { id: string }) => tools.read_workspace_doc(args),
  });

  registry.register({
    definition: () => ({
      name: "query_workspace_doc",
      description:
        "Asks a question about a specific document in the workspace using a sub-agent. Returns { summary } with a concise answer. Prefer this over read_workspace_doc when you need a targeted answer rather than raw content.",
      parameters: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "The document ID to query.",
          },
          query: {
            type: "string",
            description: "The question or query about the document.",
          },
        },
        required: ["id", "query"],
      },
    }),
    call: async (args: { id: string; query: string }) =>
      tools.query_workspace_doc(args),
  });

  registry.register({
    definition: () => ({
      name: "create_document",
      description:
        "Creates a new blank document in the workspace with the given title. Pauses for user authorization before creating.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "The title for the new document.",
          },
        },
        required: ["title"],
      },
    }),
    call: async (args: { title: string }) => tools.create_document(args),
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
    }),
    call: async (args: { id: string }) => tools.switch_active_document(args),
  });

  registry.register({
    definition: () => ({
      name: "query_workspace",
      description:
        "Asks a question that spans all documents in the workspace. Queries each document individually then synthesizes the results. Returns { answer }.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "The question to answer across all workspace documents.",
          },
        },
        required: ["query"],
      },
    }),
    call: async (args: { query: string }) => tools.query_workspace(args),
  });
}
