// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentEvent } from "@mast-ai/core";
import { WorkspaceTools } from "./WorkspaceTools";
import type {
  CreateDocumentFn,
  RenameDocumentFn,
  DeleteDocumentFn,
  SetActiveDocumentIdFn,
  SaveDocContentFn,
  SetPendingWorkspaceActionFn,
  EditorLike,
} from "./WorkspaceTools";
import type { WorkspaceDocument } from "../workspace";
import type { AgentRunnerFactory } from "../agents/factory";

function makeStream(output: string): AsyncIterable<AgentEvent> {
  return (async function* () {
    yield { type: "done" as const, output, history: [] };
  })();
}

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
  let mockFactory: AgentRunnerFactory;

  beforeEach(() => {
    mockRun = vi.fn().mockResolvedValue({ output: "mock answer" });
    mockFactory = {
      create: vi.fn().mockReturnValue({ run: mockRun }),
    };
  });

  describe("get_active_doc_info", () => {
    it("returns id and title of the active document", () => {
      const activeRef = makeActiveDocRef({ id: "x", title: "My Essay" });
      const tools = new WorkspaceTools(makeRef([]), activeRef, mockFactory);
      const result = JSON.parse(tools.get_active_doc_info());
      expect(result).toEqual({ id: "x", title: "My Essay" });
    });

    it("returns error when no document is active", () => {
      const tools = new WorkspaceTools(makeRef([]), noActiveDoc, mockFactory);
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
      const tools = new WorkspaceTools(makeRef(docs), noActiveDoc, mockFactory);
      const result = JSON.parse(tools.list_workspace_docs());
      expect(result).toEqual([
        { id: "a", title: "Alpha" },
        { id: "b", title: "Beta" },
      ]);
    });

    it("returns empty array when workspace has no documents", () => {
      const tools = new WorkspaceTools(makeRef([]), noActiveDoc, mockFactory);
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
        mockFactory,
      );
      const result = JSON.parse(tools.read_workspace_doc({ id: "x" }));
      expect(result).toEqual({ title: "My Doc", content: "content here" });
    });

    it("returns error for an unknown id", () => {
      const tools = new WorkspaceTools(
        makeRef([makeDoc()]),
        noActiveDoc,
        mockFactory,
      );
      const result = JSON.parse(tools.read_workspace_doc({ id: "unknown" }));
      expect(result).toEqual({ error: "Document not found" });
    });
  });

  describe("query_workspace_doc", () => {
    it("returns error for unknown doc id", async () => {
      const tools = new WorkspaceTools(makeRef([]), noActiveDoc, mockFactory);
      const result = JSON.parse(
        await tools.query_workspace_doc({ id: "nope", query: "anything" }),
      );
      expect(result).toEqual({ error: "Document not found" });
      expect(mockFactory.create).not.toHaveBeenCalled();
    });

    it("creates a sub-agent runner with doc content and query, returns summary and excerpt", async () => {
      mockRun.mockResolvedValue({
        output: '{"summary":"A concise summary.","excerpt":"The sky is blue."}',
      });
      const doc = makeDoc({
        id: "d1",
        title: "Brief",
        content: "The sky is blue.",
      });
      const tools = new WorkspaceTools(
        makeRef([doc]),
        noActiveDoc,
        mockFactory,
      );

      const result = JSON.parse(
        await tools.query_workspace_doc({
          id: "d1",
          query: "What color is the sky?",
        }),
      );

      expect(result).toEqual({
        summary: "A concise summary.",
        excerpt: "The sky is blue.",
      });
      expect(mockFactory.create).toHaveBeenCalledOnce();

      const [agentConfig, input] = mockRun.mock.calls[0];
      expect(agentConfig.name).toBe("DocQuerier");
      expect(input).toContain("Brief");
      expect(input).toContain("The sky is blue.");
      expect(input).toContain("What color is the sky?");
    });

    it("calls factory.create to create the sub-agent runner", async () => {
      const doc = makeDoc();
      const tools = new WorkspaceTools(
        makeRef([doc]),
        noActiveDoc,
        mockFactory,
      );
      await tools.query_workspace_doc({ id: "doc-1", query: "q" });
      expect(mockFactory.create).toHaveBeenCalledOnce();
    });
  });

  describe("create_document", () => {
    let createDocumentFn: ReturnType<typeof vi.fn> & CreateDocumentFn;
    let setEditorValueFn: ReturnType<typeof vi.fn>;
    let mockEditorRef: { current: EditorLike };
    let setPendingWorkspaceAction: ReturnType<typeof vi.fn> &
      SetPendingWorkspaceActionFn;

    beforeEach(() => {
      createDocumentFn = vi
        .fn()
        .mockReturnValue("new-doc-id") as unknown as typeof createDocumentFn;
      setEditorValueFn = vi.fn();
      mockEditorRef = {
        current: {
          getValue: vi.fn().mockReturnValue(""),
          setValue: setEditorValueFn,
        },
      };
      setPendingWorkspaceAction =
        vi.fn() as unknown as typeof setPendingWorkspaceAction;
    });

    function makeTools(approveAll = false) {
      return new WorkspaceTools(
        makeRef([]),
        noActiveDoc,
        mockFactory,
        createDocumentFn,
        vi.fn(),
        vi.fn(),
        vi.fn(),
        vi.fn(),
        mockEditorRef,
        { current: "" },
        setPendingWorkspaceAction,
        { current: approveAll },
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
      expect(setEditorValueFn).toHaveBeenCalledWith("");
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
      expect(setEditorValueFn).toHaveBeenCalledWith("");

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

    it("sets editor to provided content and saves it when approveAll is true", async () => {
      const saveDocContentFn = vi.fn();
      const tools = new WorkspaceTools(
        makeRef([]),
        noActiveDoc,
        mockFactory,
        createDocumentFn,
        vi.fn(),
        vi.fn(),
        vi.fn(),
        saveDocContentFn,
        mockEditorRef,
        { current: "" },
        setPendingWorkspaceAction,
        { current: true },
      );
      await tools.create_document({ title: "My Doc", content: "Hello world" });
      expect(setEditorValueFn).toHaveBeenCalledWith("Hello world");
      expect(saveDocContentFn).toHaveBeenCalledWith(
        "new-doc-id",
        "Hello world",
      );
    });

    it("uses empty string for editor when no content provided", async () => {
      const saveDocContentFn = vi.fn();
      const tools = new WorkspaceTools(
        makeRef([]),
        noActiveDoc,
        mockFactory,
        createDocumentFn,
        vi.fn(),
        vi.fn(),
        vi.fn(),
        saveDocContentFn,
        mockEditorRef,
        { current: "" },
        setPendingWorkspaceAction,
        { current: true },
      );
      await tools.create_document({ title: "My Doc" });
      expect(setEditorValueFn).toHaveBeenCalledWith("");
      expect(saveDocContentFn).not.toHaveBeenCalledWith(
        "new-doc-id",
        expect.anything(),
      );
    });

    it("applies content via pending action when approveAll is false", async () => {
      const saveDocContentFn = vi.fn();
      const tools = new WorkspaceTools(
        makeRef([]),
        noActiveDoc,
        mockFactory,
        createDocumentFn,
        vi.fn(),
        vi.fn(),
        vi.fn(),
        saveDocContentFn,
        mockEditorRef,
        { current: "" },
        setPendingWorkspaceAction,
        { current: false },
      );
      const promise = tools.create_document({
        title: "Draft",
        content: "Body text",
      });
      const request = setPendingWorkspaceAction.mock.calls[0][0];
      request.apply();
      expect(setEditorValueFn).toHaveBeenCalledWith("Body text");
      expect(saveDocContentFn).toHaveBeenCalledWith("new-doc-id", "Body text");
      request.resolve("Action applied successfully.");
      expect(await promise).toBe("Action applied successfully.");
    });
  });

  describe("rename_document", () => {
    let renameDocumentFn: ReturnType<typeof vi.fn> & RenameDocumentFn;
    let setPendingWorkspaceAction: ReturnType<typeof vi.fn> &
      SetPendingWorkspaceActionFn;

    beforeEach(() => {
      renameDocumentFn = vi.fn() as unknown as typeof renameDocumentFn;
      setPendingWorkspaceAction =
        vi.fn() as unknown as typeof setPendingWorkspaceAction;
    });

    function makeTools(docs: WorkspaceDocument[], approveAll = false) {
      return new WorkspaceTools(
        makeRef(docs),
        noActiveDoc,
        mockFactory,
        vi.fn(),
        renameDocumentFn,
        vi.fn(),
        vi.fn(),
        vi.fn(),
        { current: null },
        { current: "" },
        setPendingWorkspaceAction,
        { current: approveAll },
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
      setPendingWorkspaceAction =
        vi.fn() as unknown as typeof setPendingWorkspaceAction;
    });

    function makeTools(docs: WorkspaceDocument[], approveAll = false) {
      return new WorkspaceTools(
        makeRef(docs),
        noActiveDoc,
        mockFactory,
        vi.fn(),
        vi.fn(),
        deleteDocumentFn,
        vi.fn(),
        vi.fn(),
        { current: null },
        { current: "" },
        setPendingWorkspaceAction,
        { current: approveAll },
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
    let setEditorValueFn: ReturnType<typeof vi.fn>;
    let mockEditorRef: { current: EditorLike };

    beforeEach(() => {
      setActiveDocumentIdFn =
        vi.fn() as unknown as typeof setActiveDocumentIdFn;
      saveDocContentFn = vi.fn() as unknown as typeof saveDocContentFn;
      setEditorValueFn = vi.fn();
      mockEditorRef = {
        current: {
          getValue: vi.fn().mockReturnValue("editor content"),
          setValue: setEditorValueFn,
        },
      };
    });

    function makeTools(
      docs: WorkspaceDocument[],
      activeDoc: { id: string; title: string } | null = null,
    ) {
      return new WorkspaceTools(
        makeRef(docs),
        makeActiveDocRef(activeDoc),
        mockFactory,
        vi.fn(),
        vi.fn(),
        vi.fn(),
        setActiveDocumentIdFn,
        saveDocContentFn,
        mockEditorRef,
        { current: "" },
        vi.fn(),
        { current: false },
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

    it("syncs editor value to new document content immediately", async () => {
      const docs = [
        makeDoc({ id: "d1", title: "Doc 1", content: "new content" }),
      ];
      const tools = makeTools(docs);
      await tools.switch_active_document({ id: "d1" });
      expect(setEditorValueFn).toHaveBeenCalledWith("new content");
    });
  });

  describe("query_workspace", () => {
    let mockRunStream: ReturnType<typeof vi.fn>;
    let mockRunBuilder: ReturnType<typeof vi.fn>;
    let streamFactory: AgentRunnerFactory;

    beforeEach(() => {
      mockRunStream = vi.fn();
      mockRunBuilder = vi.fn().mockReturnValue({ runStream: mockRunStream });
      streamFactory = {
        create: vi.fn().mockReturnValue({ runBuilder: mockRunBuilder }),
      };
    });

    it("synthesizes results from multiple docs and returns ResearchResult shape", async () => {
      const docs = [
        makeDoc({ id: "d1", title: "Doc 1", content: "content 1" }),
        makeDoc({ id: "d2", title: "Doc 2", content: "content 2" }),
      ];

      mockRunStream
        .mockReturnValueOnce(
          makeStream('{"summary":"Summary 1.","excerpt":"excerpt 1"}'),
        )
        .mockReturnValueOnce(
          makeStream('{"summary":"Summary 2.","excerpt":"excerpt 2"}'),
        )
        .mockReturnValueOnce(makeStream('{"summary":"Combined answer."}'));

      const tools = new WorkspaceTools(
        makeRef(docs),
        noActiveDoc,
        streamFactory,
      );
      const result = JSON.parse(
        await tools.query_workspace({ query: "What do the docs say?" }),
      );

      expect(result.summary).toBe("Combined answer.");
      expect(Array.isArray(result.sources)).toBe(true);
      expect(result.sources).toHaveLength(2);
      expect(result.sources[0]).toMatchObject({
        id: "d1",
        title: "Doc 1",
        excerpt: "excerpt 1",
      });
      expect(result.sources[1]).toMatchObject({
        id: "d2",
        title: "Doc 2",
        excerpt: "excerpt 2",
      });
    });

    it("returns a ResearchResult even with a single document", async () => {
      mockRunStream
        .mockReturnValueOnce(
          makeStream('{"summary":"Single doc summary.","excerpt":"passage"}'),
        )
        .mockReturnValueOnce(makeStream('{"summary":"Final answer."}'));

      const tools = new WorkspaceTools(
        makeRef([makeDoc()]),
        noActiveDoc,
        streamFactory,
      );
      const result = JSON.parse(await tools.query_workspace({ query: "q" }));
      expect(result.summary).toBe("Final answer.");
      expect(result.sources).toHaveLength(1);
    });

    it("excludes docs with no relevant content from sources", async () => {
      const docs = [
        makeDoc({ id: "d1", title: "Useful", content: "good content" }),
        makeDoc({ id: "d2", title: "Empty", content: "" }),
      ];

      mockRunStream
        .mockReturnValueOnce(
          makeStream('{"summary":"Useful info.","excerpt":"good passage"}'),
        )
        .mockReturnValueOnce(
          makeStream('{"summary":"No relevant content.","excerpt":""}'),
        )
        .mockReturnValueOnce(makeStream('{"summary":"Only useful info."}'));

      const tools = new WorkspaceTools(
        makeRef(docs),
        noActiveDoc,
        streamFactory,
      );
      const result = JSON.parse(await tools.query_workspace({ query: "q" }));

      expect(result.sources).toHaveLength(1);
      expect(result.sources[0].id).toBe("d1");
    });

    it("returns empty sources and no-content summary when all docs have no relevant content", async () => {
      mockRunStream.mockReturnValueOnce(
        makeStream('{"summary":"No relevant content.","excerpt":""}'),
      );

      const tools = new WorkspaceTools(
        makeRef([makeDoc()]),
        noActiveDoc,
        streamFactory,
      );
      const result = JSON.parse(await tools.query_workspace({ query: "q" }));

      expect(result.sources).toHaveLength(0);
      expect(result.summary).toContain("No relevant content");
    });
  });
});
