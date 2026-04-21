// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from "vitest";
import { WorkspaceTools } from "./WorkspaceTools";
import type {
  AdapterFactory,
  SubAgentFactory,
  CreateDocumentFn,
  RenameDocumentFn,
  DeleteDocumentFn,
  SetActiveDocumentIdFn,
  SaveDocContentFn,
  GetEditorContentFn,
  SetPendingWorkspaceActionFn,
} from "./WorkspaceTools";
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

function makeActiveDocRef(doc: { id: string; title: string } | null): {
  current: { id: string; title: string } | null;
} {
  return { current: doc };
}

const noActiveDoc = makeActiveDocRef(null);

describe("WorkspaceTools", () => {
  let mockRun: ReturnType<typeof vi.fn>;
  let adapterFactory: AdapterFactory;
  let runnerFactory: SubAgentFactory;

  beforeEach(() => {
    mockRun = vi.fn().mockResolvedValue({ output: "mock answer" });
    adapterFactory = vi
      .fn()
      .mockReturnValue({} as LlmAdapter) as AdapterFactory;
    runnerFactory = vi
      .fn()
      .mockReturnValue({ run: mockRun }) as SubAgentFactory;
  });

  describe("get_active_doc_info", () => {
    it("returns id and title of the active document", () => {
      const activeRef = makeActiveDocRef({ id: "x", title: "My Essay" });
      const tools = new WorkspaceTools(makeRef([]), activeRef, adapterFactory);
      const result = JSON.parse(tools.get_active_doc_info());
      expect(result).toEqual({ id: "x", title: "My Essay" });
    });

    it("returns error when no document is active", () => {
      const tools = new WorkspaceTools(
        makeRef([]),
        noActiveDoc,
        adapterFactory,
      );
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
      const tools = new WorkspaceTools(
        makeRef(docs),
        noActiveDoc,
        adapterFactory,
      );
      const result = JSON.parse(tools.list_workspace_docs());
      expect(result).toEqual([
        { id: "a", title: "Alpha" },
        { id: "b", title: "Beta" },
      ]);
    });

    it("returns empty array when workspace has no documents", () => {
      const tools = new WorkspaceTools(
        makeRef([]),
        noActiveDoc,
        adapterFactory,
      );
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
      const tools = new WorkspaceTools(
        makeRef([doc]),
        noActiveDoc,
        adapterFactory,
      );
      const result = JSON.parse(tools.read_workspace_doc({ id: "x" }));
      expect(result).toEqual({ title: "My Doc", content: "content here" });
    });

    it("returns error for an unknown id", () => {
      const tools = new WorkspaceTools(
        makeRef([makeDoc()]),
        noActiveDoc,
        adapterFactory,
      );
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

  describe("create_document", () => {
    let createDocumentFn: ReturnType<typeof vi.fn> & CreateDocumentFn;
    let setPendingWorkspaceAction: ReturnType<typeof vi.fn> &
      SetPendingWorkspaceActionFn;

    beforeEach(() => {
      createDocumentFn = vi.fn().mockReturnValue("new-doc-id") as unknown as typeof createDocumentFn;
      setPendingWorkspaceAction = vi.fn() as unknown as typeof setPendingWorkspaceAction;
    });

    function makeTools(approveAll = false) {
      return new WorkspaceTools(
        makeRef([]),
        noActiveDoc,
        adapterFactory,
        runnerFactory,
        createDocumentFn,
        vi.fn(),
        vi.fn(),
        vi.fn(),
        vi.fn(),
        vi.fn().mockReturnValue(""),
        setPendingWorkspaceAction,
        approveAll,
      );
    }

    it("returns error when title is empty", async () => {
      const tools = makeTools();
      const result = JSON.parse(await tools.create_document({ title: "" }));
      expect(result).toEqual({ error: "title is required" });
      expect(setPendingWorkspaceAction).not.toHaveBeenCalled();
    });

    it("creates document immediately when approveAll is true", async () => {
      const tools = makeTools(true);
      const result = await tools.create_document({ title: "My Doc" });
      expect(createDocumentFn).toHaveBeenCalledWith("My Doc");
      expect(result).toContain("Approve All");
    });

    it("sets pending workspace action when approveAll is false", async () => {
      const tools = makeTools(false);
      const promise = tools.create_document({ title: "Draft" });
      expect(setPendingWorkspaceAction).toHaveBeenCalledOnce();

      const request = setPendingWorkspaceAction.mock.calls[0][0];
      expect(request.description).toContain("Draft");
      expect(typeof request.apply).toBe("function");
      expect(typeof request.resolve).toBe("function");

      request.apply();
      expect(createDocumentFn).toHaveBeenCalledWith("Draft");

      request.resolve("Action applied successfully.");
      expect(await promise).toBe("Action applied successfully.");
    });

    it("returns rejection message when user rejects", async () => {
      const tools = makeTools(false);
      const promise = tools.create_document({ title: "Draft" });
      const request = setPendingWorkspaceAction.mock.calls[0][0];
      request.resolve("Action rejected by user.");
      expect(await promise).toBe("Action rejected by user.");
      expect(createDocumentFn).not.toHaveBeenCalled();
    });
  });

  describe("rename_document", () => {
    let renameDocumentFn: ReturnType<typeof vi.fn> & RenameDocumentFn;
    let setPendingWorkspaceAction: ReturnType<typeof vi.fn> &
      SetPendingWorkspaceActionFn;

    beforeEach(() => {
      renameDocumentFn = vi.fn() as unknown as typeof renameDocumentFn;
      setPendingWorkspaceAction = vi.fn() as unknown as typeof setPendingWorkspaceAction;
    });

    function makeTools(docs: WorkspaceDocument[], approveAll = false) {
      return new WorkspaceTools(
        makeRef(docs),
        noActiveDoc,
        adapterFactory,
        runnerFactory,
        vi.fn(),
        renameDocumentFn,
        vi.fn(),
        vi.fn(),
        vi.fn(),
        vi.fn().mockReturnValue(""),
        setPendingWorkspaceAction,
        approveAll,
      );
    }

    it("returns error when document is not found", async () => {
      const tools = makeTools([]);
      const result = JSON.parse(
        await tools.rename_document({ id: "nope", title: "New" }),
      );
      expect(result).toEqual({ error: "Document not found" });
    });

    it("returns error when title is empty", async () => {
      const tools = makeTools([makeDoc({ id: "d1" })]);
      const result = JSON.parse(
        await tools.rename_document({ id: "d1", title: "" }),
      );
      expect(result).toEqual({ error: "title is required" });
    });

    it("renames immediately when approveAll is true", async () => {
      const tools = makeTools([makeDoc({ id: "d1", title: "Old" })], true);
      await tools.rename_document({ id: "d1", title: "New" });
      expect(renameDocumentFn).toHaveBeenCalledWith("d1", "New");
    });

    it("sets pending workspace action and renames on accept", async () => {
      const tools = makeTools([makeDoc({ id: "d1", title: "Old" })]);
      const promise = tools.rename_document({ id: "d1", title: "New" });
      const request = setPendingWorkspaceAction.mock.calls[0][0];
      expect(request.description).toContain("Old");
      expect(request.description).toContain("New");

      request.apply();
      expect(renameDocumentFn).toHaveBeenCalledWith("d1", "New");

      request.resolve("Action applied successfully.");
      expect(await promise).toBe("Action applied successfully.");
    });

    it("does not rename on rejection", async () => {
      const tools = makeTools([makeDoc({ id: "d1", title: "Old" })]);
      const promise = tools.rename_document({ id: "d1", title: "New" });
      const request = setPendingWorkspaceAction.mock.calls[0][0];
      request.resolve("Action rejected by user.");
      expect(await promise).toBe("Action rejected by user.");
      expect(renameDocumentFn).not.toHaveBeenCalled();
    });
  });

  describe("delete_document", () => {
    let deleteDocumentFn: ReturnType<typeof vi.fn> & DeleteDocumentFn;
    let setPendingWorkspaceAction: ReturnType<typeof vi.fn> &
      SetPendingWorkspaceActionFn;

    beforeEach(() => {
      deleteDocumentFn = vi.fn() as unknown as typeof deleteDocumentFn;
      setPendingWorkspaceAction = vi.fn() as unknown as typeof setPendingWorkspaceAction;
    });

    function makeTools(docs: WorkspaceDocument[], approveAll = false) {
      return new WorkspaceTools(
        makeRef(docs),
        noActiveDoc,
        adapterFactory,
        runnerFactory,
        vi.fn(),
        vi.fn(),
        deleteDocumentFn,
        vi.fn(),
        vi.fn(),
        vi.fn().mockReturnValue(""),
        setPendingWorkspaceAction,
        approveAll,
      );
    }

    it("returns error when document is not found", async () => {
      const tools = makeTools([]);
      const result = JSON.parse(await tools.delete_document({ id: "nope" }));
      expect(result).toEqual({ error: "Document not found" });
    });

    it("deletes immediately when approveAll is true", async () => {
      const tools = makeTools([makeDoc({ id: "d1" })], true);
      await tools.delete_document({ id: "d1" });
      expect(deleteDocumentFn).toHaveBeenCalledWith("d1");
    });

    it("sets pending workspace action and deletes on accept", async () => {
      const tools = makeTools([makeDoc({ id: "d1", title: "My Essay" })]);
      const promise = tools.delete_document({ id: "d1" });
      const request = setPendingWorkspaceAction.mock.calls[0][0];
      expect(request.description).toContain("My Essay");

      request.apply();
      expect(deleteDocumentFn).toHaveBeenCalledWith("d1");

      request.resolve("Action applied successfully.");
      expect(await promise).toBe("Action applied successfully.");
    });

    it("does not delete on rejection", async () => {
      const tools = makeTools([makeDoc({ id: "d1" })]);
      const promise = tools.delete_document({ id: "d1" });
      const request = setPendingWorkspaceAction.mock.calls[0][0];
      request.resolve("Action rejected by user.");
      expect(await promise).toBe("Action rejected by user.");
      expect(deleteDocumentFn).not.toHaveBeenCalled();
    });
  });

  describe("switch_active_document", () => {
    let setActiveDocumentIdFn: ReturnType<typeof vi.fn> & SetActiveDocumentIdFn;
    let saveDocContentFn: ReturnType<typeof vi.fn> & SaveDocContentFn;
    let getEditorContent: ReturnType<typeof vi.fn> & GetEditorContentFn;

    beforeEach(() => {
      setActiveDocumentIdFn = vi.fn() as unknown as typeof setActiveDocumentIdFn;
      saveDocContentFn = vi.fn() as unknown as typeof saveDocContentFn;
      getEditorContent = vi.fn().mockReturnValue("editor content") as unknown as typeof getEditorContent;
    });

    function makeTools(
      docs: WorkspaceDocument[],
      activeDoc: { id: string; title: string } | null = null,
    ) {
      return new WorkspaceTools(
        makeRef(docs),
        makeActiveDocRef(activeDoc),
        adapterFactory,
        runnerFactory,
        vi.fn(),
        vi.fn(),
        vi.fn(),
        setActiveDocumentIdFn,
        saveDocContentFn,
        getEditorContent,
        vi.fn(),
        false,
      );
    }

    it("returns error when document is not found", async () => {
      const tools = makeTools([]);
      const result = JSON.parse(
        await tools.switch_active_document({ id: "nope" }),
      );
      expect(result).toEqual({ error: "Document not found" });
    });

    it("switches document without authorization", async () => {
      const docs = [makeDoc({ id: "d1", title: "Doc 1" })];
      const tools = makeTools(docs);
      const result = JSON.parse(
        await tools.switch_active_document({ id: "d1" }),
      );
      expect(result).toEqual({ switched: true, id: "d1", title: "Doc 1" });
      expect(setActiveDocumentIdFn).toHaveBeenCalledWith("d1");
    });

    it("saves current document content before switching", async () => {
      const docs = [makeDoc({ id: "d2", title: "Target" })];
      const tools = makeTools(docs, { id: "d1", title: "Current" });
      await tools.switch_active_document({ id: "d2" });
      expect(saveDocContentFn).toHaveBeenCalledWith("d1", "editor content");
      expect(setActiveDocumentIdFn).toHaveBeenCalledWith("d2");
    });

    it("does not save content when no active document", async () => {
      const docs = [makeDoc({ id: "d1" })];
      const tools = makeTools(docs, null);
      await tools.switch_active_document({ id: "d1" });
      expect(saveDocContentFn).not.toHaveBeenCalled();
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
