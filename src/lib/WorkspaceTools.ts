// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { AgentRunner, LlmAdapter, ToolRegistry } from "@mast-ai/core";
import type { AgentConfig } from "@mast-ai/core";
import { WorkspaceDocument } from "./workspace";

type RunnerLike = {
  run: (agent: AgentConfig, input: string) => Promise<{ output: string }>;
};

export type AdapterFactory = () => LlmAdapter;
export type SubAgentFactory = (adapter: LlmAdapter) => RunnerLike;

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
