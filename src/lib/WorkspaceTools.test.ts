// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from "vitest";
import { WorkspaceTools } from "./WorkspaceTools";
import type { AdapterFactory, SubAgentFactory } from "./WorkspaceTools";
import type { WorkspaceDocument } from "./workspace";
import type { LlmAdapter } from "@mast-ai/core";

function makeDoc(
  overrides: Partial<WorkspaceDocument> = {},
): WorkspaceDocument {
  return {
    id: "doc-1",
    title: "Test Doc",
    content: "Hello world",
    updatedAt: 1000,
    ...overrides,
  };
}

function makeRef(docs: WorkspaceDocument[]): { current: WorkspaceDocument[] } {
  return { current: docs };
}

function makeActiveDocRef(
  doc: { id: string; title: string } | null,
): { current: { id: string; title: string } | null } {
  return { current: doc };
}

const noActiveDoc = makeActiveDocRef(null);

describe("WorkspaceTools", () => {
  let mockRun: ReturnType<typeof vi.fn>;
  let adapterFactory: AdapterFactory;
  let runnerFactory: SubAgentFactory;

  beforeEach(() => {
    mockRun = vi.fn().mockResolvedValue({ output: "mock answer" });
    adapterFactory = vi.fn().mockReturnValue({} as LlmAdapter) as AdapterFactory;
    runnerFactory = vi.fn().mockReturnValue({ run: mockRun }) as SubAgentFactory;
  });

  describe("get_active_doc_info", () => {
    it("returns id and title of the active document", () => {
      const activeRef = makeActiveDocRef({ id: "x", title: "My Essay" });
      const tools = new WorkspaceTools(makeRef([]), activeRef, adapterFactory);
      const result = JSON.parse(tools.get_active_doc_info());
      expect(result).toEqual({ id: "x", title: "My Essay" });
    });

    it("returns error when no document is active", () => {
      const tools = new WorkspaceTools(makeRef([]), noActiveDoc, adapterFactory);
      const result = JSON.parse(tools.get_active_doc_info());
      expect(result).toEqual({ error: "No active document" });
    });
  });

  describe("list_workspace_docs", () => {
    it("returns id and title only — no content", () => {
      const docs = [
        makeDoc({ id: "a", title: "Alpha", content: "secret" }),
        makeDoc({ id: "b", title: "Beta", content: "also secret" }),
      ];
      const tools = new WorkspaceTools(makeRef(docs), noActiveDoc, adapterFactory);
      const result = JSON.parse(tools.list_workspace_docs());
      expect(result).toEqual([
        { id: "a", title: "Alpha" },
        { id: "b", title: "Beta" },
      ]);
    });

    it("returns empty array when workspace has no documents", () => {
      const tools = new WorkspaceTools(makeRef([]), noActiveDoc, adapterFactory);
      expect(JSON.parse(tools.list_workspace_docs())).toEqual([]);
    });
  });

  describe("read_workspace_doc", () => {
    it("returns title and content for a valid id", () => {
      const doc = makeDoc({
        id: "x",
        title: "My Doc",
        content: "content here",
      });
      const tools = new WorkspaceTools(makeRef([doc]), noActiveDoc, adapterFactory);
      const result = JSON.parse(tools.read_workspace_doc({ id: "x" }));
      expect(result).toEqual({ title: "My Doc", content: "content here" });
    });

    it("returns error for an unknown id", () => {
      const tools = new WorkspaceTools(makeRef([makeDoc()]), noActiveDoc, adapterFactory);
      const result = JSON.parse(tools.read_workspace_doc({ id: "unknown" }));
      expect(result).toEqual({ error: "Document not found" });
    });
  });

  describe("query_workspace_doc", () => {
    it("returns error for unknown doc id", async () => {
      const tools = new WorkspaceTools(
        makeRef([]),
        noActiveDoc,
        adapterFactory,
        runnerFactory,
      );
      const result = JSON.parse(
        await tools.query_workspace_doc({ id: "nope", query: "anything" }),
      );
      expect(result).toEqual({ error: "Document not found" });
      expect(runnerFactory).not.toHaveBeenCalled();
    });

    it("creates a sub-agent runner with doc content and query, returns summary", async () => {
      mockRun.mockResolvedValue({ output: "A concise summary." });
      const doc = makeDoc({
        id: "d1",
        title: "Brief",
        content: "The sky is blue.",
      });
      const tools = new WorkspaceTools(
        makeRef([doc]),
        noActiveDoc,
        adapterFactory,
        runnerFactory,
      );

      const result = JSON.parse(
        await tools.query_workspace_doc({
          id: "d1",
          query: "What color is the sky?",
        }),
      );

      expect(result).toEqual({ summary: "A concise summary." });
      expect(runnerFactory).toHaveBeenCalledOnce();

      const [agentConfig, input] = mockRun.mock.calls[0];
      expect(agentConfig.name).toBe("DocQuerier");
      expect(input).toContain("Brief");
      expect(input).toContain("The sky is blue.");
      expect(input).toContain("What color is the sky?");
    });

    it("calls adapterFactory to create the sub-agent adapter", async () => {
      const doc = makeDoc();
      const tools = new WorkspaceTools(
        makeRef([doc]),
        noActiveDoc,
        adapterFactory,
        runnerFactory,
      );
      await tools.query_workspace_doc({ id: "doc-1", query: "q" });
      expect(adapterFactory).toHaveBeenCalledOnce();
    });
  });

  describe("query_workspace", () => {
    it("calls query_workspace_doc for each document and passes summaries to synthesizer", async () => {
      const docs = [
        makeDoc({ id: "d1", title: "Doc 1", content: "content 1" }),
        makeDoc({ id: "d2", title: "Doc 2", content: "content 2" }),
      ];

      mockRun
        .mockResolvedValueOnce({ output: "Summary of doc 1." })
        .mockResolvedValueOnce({ output: "Summary of doc 2." })
        .mockResolvedValueOnce({ output: "Final synthesized answer." });

      const tools = new WorkspaceTools(
        makeRef(docs),
        noActiveDoc,
        adapterFactory,
        runnerFactory,
      );
      const result = JSON.parse(
        await tools.query_workspace({ query: "What do the docs say?" }),
      );

      expect(result).toEqual({ answer: "Final synthesized answer." });
      expect(mockRun).toHaveBeenCalledTimes(3);

      const [synthAgent, synthInput] = mockRun.mock.calls[2];
      expect(synthAgent.name).toBe("WorkspaceSynthesizer");
      expect(synthInput).toContain("Summary of doc 1.");
      expect(synthInput).toContain("Summary of doc 2.");
      expect(synthInput).toContain("What do the docs say?");
    });

    it("returns an answer even with a single document", async () => {
      mockRun
        .mockResolvedValueOnce({ output: "Single doc summary." })
        .mockResolvedValueOnce({ output: "Final answer." });

      const tools = new WorkspaceTools(
        makeRef([makeDoc()]),
        noActiveDoc,
        adapterFactory,
        runnerFactory,
      );
      const result = JSON.parse(await tools.query_workspace({ query: "q" }));
      expect(result).toEqual({ answer: "Final answer." });
    });

    it("skips docs that return an error from query_workspace_doc", async () => {
      const docs = [
        makeDoc({ id: "d1", title: "Good", content: "good content" }),
        makeDoc({ id: "d2", title: "Bad", content: "" }),
      ];

      const spy = vi.spyOn(WorkspaceTools.prototype, "query_workspace_doc");
      spy.mockImplementation(async ({ id }) => {
        if (id === "d2") return JSON.stringify({ error: "Document not found" });
        return JSON.stringify({ summary: "Good summary." });
      });

      mockRun.mockResolvedValueOnce({ output: "Only good doc answer." });

      const tools = new WorkspaceTools(
        makeRef(docs),
        noActiveDoc,
        adapterFactory,
        runnerFactory,
      );
      const result = JSON.parse(await tools.query_workspace({ query: "q" }));

      const [, synthInput] = mockRun.mock.calls[0];
      expect(synthInput).toContain("Good summary.");
      expect(synthInput).not.toContain("Document not found");
      expect(result).toEqual({ answer: "Only good doc answer." });

      spy.mockRestore();
    });
  });
});
