// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import type { AgentEvent } from "@mast-ai/core";
import type { WorkspaceContext, EditorLike } from "./context";
import type { WorkspaceDocument } from "../../../workspace";
import type { AgentRunnerFactory } from "../..";
import { GetActiveDocInfoTool } from "./get_active_doc_info";
import { ListWorkspaceDocsTool } from "./list_workspace_docs";
import { ReadWorkspaceDocTool } from "./read_workspace_doc";
import { QueryWorkspaceDocTool } from "./query_workspace_doc";
import { QueryWorkspaceTool } from "./query_workspace";
import { CreateDocumentTool } from "./create_document";
import { RenameDocumentTool } from "./rename_document";
import { DeleteDocumentTool } from "./delete_document";
import { SwitchActiveDocumentTool } from "./switch_active_document";

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

function makeCtx(overrides: Partial<WorkspaceContext> = {}): WorkspaceContext {
  const mockRun = vi.fn().mockResolvedValue({ output: "mock answer" });
  const mockFactory: AgentRunnerFactory = {
    create: vi.fn().mockReturnValue({ run: mockRun }),
  };
  return {
    docsRef: { current: [] },
    activeDocRef: { current: null },
    factory: mockFactory,
    createDocumentFn: vi.fn().mockReturnValue(""),
    renameDocumentFn: vi.fn(),
    deleteDocumentFn: vi.fn(),
    setActiveDocumentIdFn: vi.fn(),
    saveDocContentFn: vi.fn(),
    editorRef: { current: null },
    editorContentRef: { current: "" },
    setPendingWorkspaceAction: vi.fn(),
    approveAllRef: { current: false },
    ...overrides,
  };
}

describe("GetActiveDocInfoTool", () => {
  it("returns id and title of the active document", async () => {
    const ctx = makeCtx({
      activeDocRef: { current: { id: "x", title: "My Essay" } },
    });
    const result = JSON.parse(await new GetActiveDocInfoTool(ctx).call({}, {}));
    expect(result).toEqual({ id: "x", title: "My Essay" });
  });

  it("returns error when no document is active", async () => {
    const result = JSON.parse(
      await new GetActiveDocInfoTool(makeCtx()).call({}, {}),
    );
    expect(result).toEqual({ error: "No active document" });
  });
});

describe("ListWorkspaceDocsTool", () => {
  it("returns id and title only — no content", async () => {
    const docs = [
      makeDoc({ id: "a", title: "Alpha", content: "secret" }),
      makeDoc({ id: "b", title: "Beta", content: "also secret" }),
    ];
    const ctx = makeCtx({ docsRef: { current: docs } });
    const result = JSON.parse(
      await new ListWorkspaceDocsTool(ctx).call({}, {}),
    );
    expect(result).toEqual([
      { id: "a", title: "Alpha" },
      { id: "b", title: "Beta" },
    ]);
  });

  it("returns empty array when workspace has no documents", async () => {
    expect(
      JSON.parse(await new ListWorkspaceDocsTool(makeCtx()).call({}, {})),
    ).toEqual([]);
  });
});

describe("ReadWorkspaceDocTool", () => {
  it("returns title and content for a valid id", async () => {
    const doc = makeDoc({ id: "x", title: "My Doc", content: "content here" });
    const ctx = makeCtx({ docsRef: { current: [doc] } });
    const result = JSON.parse(
      await new ReadWorkspaceDocTool(ctx).call({ id: "x" }, {}),
    );
    expect(result).toEqual({ title: "My Doc", content: "content here" });
  });

  it("returns error for an unknown id", async () => {
    const ctx = makeCtx({ docsRef: { current: [makeDoc()] } });
    const result = JSON.parse(
      await new ReadWorkspaceDocTool(ctx).call({ id: "unknown" }, {}),
    );
    expect(result).toEqual({ error: "Document not found" });
  });
});

describe("QueryWorkspaceDocTool", () => {
  it("returns error for unknown doc id", async () => {
    const result = JSON.parse(
      await new QueryWorkspaceDocTool(makeCtx()).call(
        { id: "nope", query: "anything" },
        {},
      ),
    );
    expect(result).toEqual({ error: "Document not found" });
  });

  it("creates a sub-agent runner with doc content and query, returns summary and excerpt", async () => {
    const mockRun = vi.fn().mockResolvedValue({
      output: '{"summary":"A concise summary.","excerpt":"The sky is blue."}',
    });
    const mockFactory: AgentRunnerFactory = {
      create: vi.fn().mockReturnValue({ run: mockRun }),
    };
    const doc = makeDoc({
      id: "d1",
      title: "Brief",
      content: "The sky is blue.",
    });
    const ctx = makeCtx({ docsRef: { current: [doc] }, factory: mockFactory });

    const result = JSON.parse(
      await new QueryWorkspaceDocTool(ctx).call(
        { id: "d1", query: "What color is the sky?" },
        {},
      ),
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
});

describe("CreateDocumentTool", () => {
  let createDocumentFn: Mock;
  let setEditorValueFn: Mock;
  let mockEditorRef: { current: EditorLike };
  let setPendingWorkspaceAction: Mock;

  beforeEach(() => {
    createDocumentFn = vi.fn().mockReturnValue("new-doc-id");
    setEditorValueFn = vi.fn();
    mockEditorRef = {
      current: {
        getValue: vi.fn().mockReturnValue(""),
        setValue: setEditorValueFn,
      },
    };
    setPendingWorkspaceAction = vi.fn();
  });

  function makeTool(approveAll = false) {
    return new CreateDocumentTool(
      makeCtx({
        createDocumentFn,
        editorRef: mockEditorRef,
        setPendingWorkspaceAction,
        approveAllRef: { current: approveAll },
      }),
    );
  }

  it("returns error when title is empty", async () => {
    const result = JSON.parse(await makeTool().call({ title: "" }, {}));
    expect(result).toEqual({ error: "title is required" });
    expect(setPendingWorkspaceAction).not.toHaveBeenCalled();
  });

  it("creates document immediately when approveAll is true", async () => {
    const result = await makeTool(true).call({ title: "My Doc" }, {});
    expect(createDocumentFn).toHaveBeenCalledWith("My Doc");
    expect(setEditorValueFn).toHaveBeenCalledWith("");
    expect(result).toContain("Approve All");
  });

  it("sets pending workspace action when approveAll is false", async () => {
    const promise = makeTool().call({ title: "Draft" }, {});
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
    const promise = makeTool().call({ title: "Draft" }, {});
    const request = setPendingWorkspaceAction.mock.calls[0][0];
    request.resolve("Action rejected by user.");
    expect(await promise).toBe("Action rejected by user.");
    expect(createDocumentFn).not.toHaveBeenCalled();
  });

  it("sets editor to provided content and saves it when approveAll is true", async () => {
    const saveDocContentFn = vi.fn();
    const tool = new CreateDocumentTool(
      makeCtx({
        createDocumentFn,
        saveDocContentFn,
        editorRef: mockEditorRef,
        setPendingWorkspaceAction,
        approveAllRef: { current: true },
      }),
    );
    await tool.call({ title: "My Doc", content: "Hello world" }, {});
    expect(setEditorValueFn).toHaveBeenCalledWith("Hello world");
    expect(saveDocContentFn).toHaveBeenCalledWith("new-doc-id", "Hello world");
  });

  it("uses empty string for editor when no content provided", async () => {
    const saveDocContentFn = vi.fn();
    const tool = new CreateDocumentTool(
      makeCtx({
        createDocumentFn,
        saveDocContentFn,
        editorRef: mockEditorRef,
        setPendingWorkspaceAction,
        approveAllRef: { current: true },
      }),
    );
    await tool.call({ title: "My Doc" }, {});
    expect(setEditorValueFn).toHaveBeenCalledWith("");
    expect(saveDocContentFn).not.toHaveBeenCalledWith(
      "new-doc-id",
      expect.anything(),
    );
  });
});

describe("RenameDocumentTool", () => {
  let renameDocumentFn: Mock;
  let setPendingWorkspaceAction: Mock;

  beforeEach(() => {
    renameDocumentFn = vi.fn();
    setPendingWorkspaceAction = vi.fn();
  });

  function makeTool(docs: WorkspaceDocument[], approveAll = false) {
    return new RenameDocumentTool(
      makeCtx({
        docsRef: { current: docs },
        renameDocumentFn,
        setPendingWorkspaceAction,
        approveAllRef: { current: approveAll },
      }),
    );
  }

  it("returns error when document is not found", async () => {
    const result = JSON.parse(
      await makeTool([]).call({ id: "nope", title: "New" }, {}),
    );
    expect(result).toEqual({ error: "Document not found" });
  });

  it("returns error when title is empty", async () => {
    const result = JSON.parse(
      await makeTool([makeDoc({ id: "d1" })]).call({ id: "d1", title: "" }, {}),
    );
    expect(result).toEqual({ error: "title is required" });
  });

  it("renames immediately when approveAll is true", async () => {
    await makeTool([makeDoc({ id: "d1", title: "Old" })], true).call(
      { id: "d1", title: "New" },
      {},
    );
    expect(renameDocumentFn).toHaveBeenCalledWith("d1", "New");
  });

  it("sets pending workspace action and renames on accept", async () => {
    const promise = makeTool([makeDoc({ id: "d1", title: "Old" })]).call(
      { id: "d1", title: "New" },
      {},
    );
    const request = setPendingWorkspaceAction.mock.calls[0][0];
    expect(request.description).toContain("Old");
    expect(request.description).toContain("New");

    request.apply();
    expect(renameDocumentFn).toHaveBeenCalledWith("d1", "New");

    request.resolve("Action applied successfully.");
    expect(await promise).toBe("Action applied successfully.");
  });

  it("does not rename on rejection", async () => {
    const promise = makeTool([makeDoc({ id: "d1", title: "Old" })]).call(
      { id: "d1", title: "New" },
      {},
    );
    const request = setPendingWorkspaceAction.mock.calls[0][0];
    request.resolve("Action rejected by user.");
    expect(await promise).toBe("Action rejected by user.");
    expect(renameDocumentFn).not.toHaveBeenCalled();
  });
});

describe("DeleteDocumentTool", () => {
  let deleteDocumentFn: Mock;
  let setPendingWorkspaceAction: Mock;

  beforeEach(() => {
    deleteDocumentFn = vi.fn();
    setPendingWorkspaceAction = vi.fn();
  });

  function makeTool(docs: WorkspaceDocument[], approveAll = false) {
    return new DeleteDocumentTool(
      makeCtx({
        docsRef: { current: docs },
        deleteDocumentFn,
        setPendingWorkspaceAction,
        approveAllRef: { current: approveAll },
      }),
    );
  }

  it("returns error when document is not found", async () => {
    const result = JSON.parse(await makeTool([]).call({ id: "nope" }, {}));
    expect(result).toEqual({ error: "Document not found" });
  });

  it("deletes immediately when approveAll is true", async () => {
    await makeTool([makeDoc({ id: "d1" })], true).call({ id: "d1" }, {});
    expect(deleteDocumentFn).toHaveBeenCalledWith("d1");
  });

  it("sets pending workspace action and deletes on accept", async () => {
    const promise = makeTool([makeDoc({ id: "d1", title: "My Essay" })]).call(
      { id: "d1" },
      {},
    );
    const request = setPendingWorkspaceAction.mock.calls[0][0];
    expect(request.description).toContain("My Essay");

    request.apply();
    expect(deleteDocumentFn).toHaveBeenCalledWith("d1");

    request.resolve("Action applied successfully.");
    expect(await promise).toBe("Action applied successfully.");
  });

  it("does not delete on rejection", async () => {
    const promise = makeTool([makeDoc({ id: "d1" })]).call({ id: "d1" }, {});
    const request = setPendingWorkspaceAction.mock.calls[0][0];
    request.resolve("Action rejected by user.");
    expect(await promise).toBe("Action rejected by user.");
    expect(deleteDocumentFn).not.toHaveBeenCalled();
  });
});

describe("SwitchActiveDocumentTool", () => {
  let setActiveDocumentIdFn: Mock;
  let saveDocContentFn: Mock;
  let setEditorValueFn: Mock;
  let mockEditorRef: { current: EditorLike };

  beforeEach(() => {
    setActiveDocumentIdFn = vi.fn();
    saveDocContentFn = vi.fn();
    setEditorValueFn = vi.fn();
    mockEditorRef = {
      current: {
        getValue: vi.fn().mockReturnValue("editor content"),
        setValue: setEditorValueFn,
      },
    };
  });

  function makeTool(
    docs: WorkspaceDocument[],
    activeDoc: { id: string; title: string } | null = null,
  ) {
    return new SwitchActiveDocumentTool(
      makeCtx({
        docsRef: { current: docs },
        activeDocRef: { current: activeDoc },
        setActiveDocumentIdFn,
        saveDocContentFn,
        editorRef: mockEditorRef,
      }),
    );
  }

  it("returns error when document is not found", async () => {
    const result = JSON.parse(await makeTool([]).call({ id: "nope" }, {}));
    expect(result).toEqual({ error: "Document not found" });
  });

  it("switches document without authorization", async () => {
    const result = JSON.parse(
      await makeTool([makeDoc({ id: "d1", title: "Doc 1" })]).call(
        { id: "d1" },
        {},
      ),
    );
    expect(result).toEqual({ switched: true, id: "d1", title: "Doc 1" });
    expect(setActiveDocumentIdFn).toHaveBeenCalledWith("d1");
  });

  it("saves current document content before switching", async () => {
    await makeTool([makeDoc({ id: "d2", title: "Target" })], {
      id: "d1",
      title: "Current",
    }).call({ id: "d2" }, {});
    expect(saveDocContentFn).toHaveBeenCalledWith("d1", "editor content");
    expect(setActiveDocumentIdFn).toHaveBeenCalledWith("d2");
  });

  it("does not save content when no active document", async () => {
    await makeTool([makeDoc({ id: "d1" })], null).call({ id: "d1" }, {});
    expect(saveDocContentFn).not.toHaveBeenCalled();
  });

  it("syncs editor value to new document content immediately", async () => {
    await makeTool([makeDoc({ id: "d1", content: "new content" })]).call(
      { id: "d1" },
      {},
    );
    expect(setEditorValueFn).toHaveBeenCalledWith("new content");
  });
});

describe("QueryWorkspaceTool", () => {
  let mockRunStream: Mock;
  let mockRunBuilder: Mock;
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

    const ctx = makeCtx({ docsRef: { current: docs }, factory: streamFactory });
    const result = JSON.parse(
      await new QueryWorkspaceTool(ctx).call(
        { query: "What do the docs say?" },
        {},
      ),
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

    const ctx = makeCtx({
      docsRef: { current: [makeDoc()] },
      factory: streamFactory,
    });
    const result = JSON.parse(
      await new QueryWorkspaceTool(ctx).call({ query: "q" }, {}),
    );
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

    const ctx = makeCtx({ docsRef: { current: docs }, factory: streamFactory });
    const result = JSON.parse(
      await new QueryWorkspaceTool(ctx).call({ query: "q" }, {}),
    );
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].id).toBe("d1");
  });
});
