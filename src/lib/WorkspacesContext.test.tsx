// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, act } from "@testing-library/react";
import React from "react";
import { WorkspacesProvider, useWorkspaces } from "./WorkspacesContext";
import { WorkspaceMeta, WorkspaceData } from "./workspace";

function Consumer({
  onRender,
}: {
  onRender: (value: ReturnType<typeof useWorkspaces>) => void;
}) {
  const ctx = useWorkspaces();
  onRender(ctx);
  return null;
}

function renderWithProvider() {
  let ctx!: ReturnType<typeof useWorkspaces>;
  render(
    <WorkspacesProvider>
      <Consumer onRender={(v) => (ctx = v)} />
    </WorkspacesProvider>,
  );
  return () => ctx;
}

function getWorkspaceData(id: string): WorkspaceData {
  return JSON.parse(localStorage.getItem(`workspace_${id}`)!);
}

function getIndex(): WorkspaceMeta[] {
  return JSON.parse(localStorage.getItem("workspaces_index")!);
}

describe("WorkspacesContext — migration", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("creates a default workspace on first load (no prior data)", () => {
    const getCtx = renderWithProvider();
    const ctx = getCtx();
    expect(ctx.index).toHaveLength(1);
    expect(ctx.index[0].name).toBe("My Workspace");
    expect(ctx.activeWorkspaceId).toBe(ctx.index[0].id);
    expect(ctx.activeWorkspace).not.toBeNull();
  });

  it("creates an Untitled Document as the active doc on first load", () => {
    const getCtx = renderWithProvider();
    const ctx = getCtx();
    const docs = ctx.activeWorkspace!.documents;
    expect(docs).toHaveLength(1);
    expect(docs[0].title).toBe("Untitled Document");
    expect(ctx.activeDocument?.id).toBe(docs[0].id);
  });

  it("imports supporting_docs entries during migration", () => {
    localStorage.setItem(
      "supporting_docs",
      JSON.stringify([
        { id: "d1", title: "Notes", content: "hello", updatedAt: 1000 },
      ]),
    );
    const getCtx = renderWithProvider();
    const docs = getCtx().activeWorkspace!.documents;
    // imported doc + "Untitled Document"
    expect(docs).toHaveLength(2);
    expect(docs.find((d) => d.title === "Notes")).toBeTruthy();
  });

  it("removes supporting_docs from localStorage after migration", () => {
    localStorage.setItem(
      "supporting_docs",
      JSON.stringify([{ id: "d1", title: "A", content: "", updatedAt: 1 }]),
    );
    renderWithProvider();
    expect(localStorage.getItem("supporting_docs")).toBeNull();
  });

  it("skips migration when workspaces_index already exists", () => {
    // Pre-populate workspace storage
    const meta: WorkspaceMeta = {
      id: "ws1",
      name: "Existing",
      createdAt: 1,
      updatedAt: 1,
    };
    localStorage.setItem("workspaces_index", JSON.stringify([meta]));
    localStorage.setItem("active_workspace_id", "ws1");
    const data: WorkspaceData = {
      documents: [{ id: "d1", title: "Doc", content: "hi", updatedAt: 1 }],
      activeDocumentId: "d1",
    };
    localStorage.setItem("workspace_ws1", JSON.stringify(data));

    const getCtx = renderWithProvider();
    expect(getCtx().index[0].name).toBe("Existing");
    expect(getCtx().activeWorkspace!.documents[0].title).toBe("Doc");
  });
});

describe("WorkspacesContext — workspace CRUD", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("createWorkspace adds to index and opens the new workspace", () => {
    const getCtx = renderWithProvider();
    act(() => {
      getCtx().createWorkspace("Project Alpha");
    });
    expect(getCtx().index).toHaveLength(2);
    const newMeta = getCtx().index.find((m) => m.name === "Project Alpha")!;
    expect(newMeta).toBeTruthy();
    expect(getCtx().activeWorkspaceId).toBe(newMeta.id);
    expect(getCtx().activeWorkspace!.documents).toHaveLength(1);
  });

  it("createWorkspace persists to localStorage", () => {
    const getCtx = renderWithProvider();
    act(() => {
      getCtx().createWorkspace("Alpha");
    });
    const stored = getIndex();
    expect(stored.find((m) => m.name === "Alpha")).toBeTruthy();
  });

  it("openWorkspace loads the correct workspace data", () => {
    const getCtx = renderWithProvider();
    let ws2Id!: string;
    act(() => {
      ws2Id = getCtx().createWorkspace("Second").id;
    });
    // Go back to first workspace
    const firstId = getCtx().index.find((m) => m.name === "My Workspace")!.id;
    act(() => {
      getCtx().openWorkspace(firstId);
    });
    expect(getCtx().activeWorkspaceId).toBe(firstId);
    // Go to second
    act(() => {
      getCtx().openWorkspace(ws2Id);
    });
    expect(getCtx().activeWorkspaceId).toBe(ws2Id);
  });

  it("deleteWorkspace removes it from index and localStorage", () => {
    const getCtx = renderWithProvider();
    let ws2Id!: string;
    act(() => {
      ws2Id = getCtx().createWorkspace("ToDelete").id;
    });
    act(() => {
      getCtx().deleteWorkspace(ws2Id);
    });
    expect(getCtx().index.find((m) => m.id === ws2Id)).toBeUndefined();
    expect(localStorage.getItem(`workspace_${ws2Id}`)).toBeNull();
  });

  it("deleteWorkspace on active workspace switches to another", () => {
    const getCtx = renderWithProvider();
    const firstId = getCtx().activeWorkspaceId!;
    act(() => {
      getCtx().createWorkspace("Second");
    });
    act(() => {
      getCtx().deleteWorkspace(firstId);
    });
    expect(getCtx().activeWorkspaceId).not.toBe(firstId);
    expect(getCtx().activeWorkspaceId).not.toBeNull();
  });

  it("deleteWorkspace on last workspace sets activeWorkspaceId to null", () => {
    const getCtx = renderWithProvider();
    const onlyId = getCtx().activeWorkspaceId!;
    act(() => {
      getCtx().deleteWorkspace(onlyId);
    });
    expect(getCtx().activeWorkspaceId).toBeNull();
    expect(getCtx().activeWorkspace).toBeNull();
    expect(localStorage.getItem("active_workspace_id")).toBeNull();
  });
});

describe("WorkspacesContext — document CRUD", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("addDocument creates a new doc and makes it active", () => {
    const getCtx = renderWithProvider();
    act(() => {
      getCtx().addDocument();
    });
    const docs = getCtx().activeWorkspace!.documents;
    expect(docs).toHaveLength(2);
    const newDoc = docs[docs.length - 1];
    expect(newDoc.title).toBe("Untitled Document");
    expect(getCtx().activeWorkspace!.activeDocumentId).toBe(newDoc.id);
  });

  it("updateDocument changes title and content", () => {
    const getCtx = renderWithProvider();
    const docId = getCtx().activeDocument!.id;
    act(() => {
      getCtx().updateDocument(docId, { title: "My Doc", content: "# Hi" });
    });
    const doc = getCtx().activeWorkspace!.documents.find(
      (d) => d.id === docId,
    )!;
    expect(doc.title).toBe("My Doc");
    expect(doc.content).toBe("# Hi");
  });

  it("updateDocument bumps updatedAt", () => {
    const getCtx = renderWithProvider();
    const docId = getCtx().activeDocument!.id;
    const before = getCtx().activeDocument!.updatedAt;
    act(() => {
      getCtx().updateDocument(docId, { title: "Changed" });
    });
    expect(getCtx().activeDocument!.updatedAt).toBeGreaterThanOrEqual(before);
  });

  it("deleteDocument removes the document", () => {
    const getCtx = renderWithProvider();
    act(() => {
      getCtx().addDocument();
    });
    expect(getCtx().activeWorkspace!.documents).toHaveLength(2);
    const firstId = getCtx().activeWorkspace!.documents[0].id;
    act(() => {
      getCtx().deleteDocument(firstId);
    });
    expect(getCtx().activeWorkspace!.documents).toHaveLength(1);
    expect(getCtx().activeWorkspace!.documents[0].id).not.toBe(firstId);
  });

  it("deleteDocument on active doc reassigns activeDocumentId", () => {
    const getCtx = renderWithProvider();
    act(() => {
      getCtx().addDocument();
    });
    const activeId = getCtx().activeWorkspace!.activeDocumentId!;
    act(() => {
      getCtx().deleteDocument(activeId);
    });
    const newActiveId = getCtx().activeWorkspace!.activeDocumentId;
    expect(newActiveId).not.toBe(activeId);
  });

  it("setActiveDocumentId changes the active doc", () => {
    const getCtx = renderWithProvider();
    act(() => {
      getCtx().addDocument();
    });
    const firstId = getCtx().activeWorkspace!.documents[0].id;
    act(() => {
      getCtx().setActiveDocumentId(firstId);
    });
    expect(getCtx().activeWorkspace!.activeDocumentId).toBe(firstId);
  });

  it("activeDocument reflects activeDocumentId", () => {
    const getCtx = renderWithProvider();
    act(() => {
      getCtx().addDocument();
    });
    const firstId = getCtx().activeWorkspace!.documents[0].id;
    act(() => {
      getCtx().setActiveDocumentId(firstId);
    });
    expect(getCtx().activeDocument?.id).toBe(firstId);
  });
});

describe("WorkspacesContext — localStorage persistence", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("persists workspace data after updateDocument", () => {
    const getCtx = renderWithProvider();
    const workspaceId = getCtx().activeWorkspaceId!;
    const docId = getCtx().activeDocument!.id;
    act(() => {
      getCtx().updateDocument(docId, { title: "Saved" });
    });
    const data = getWorkspaceData(workspaceId);
    expect(data.documents.find((d) => d.id === docId)?.title).toBe("Saved");
  });

  it("persists index after createWorkspace", () => {
    const getCtx = renderWithProvider();
    act(() => {
      getCtx().createWorkspace("New WS");
    });
    const stored = getIndex();
    expect(stored.find((m) => m.name === "New WS")).toBeTruthy();
  });

  it("active_workspace_id is updated when opening a workspace", () => {
    const getCtx = renderWithProvider();
    let secondId!: string;
    act(() => {
      secondId = getCtx().createWorkspace("Second").id;
    });
    act(() => {
      getCtx().openWorkspace(secondId);
    });
    expect(localStorage.getItem("active_workspace_id")).toBe(secondId);
  });
});

describe("WorkspacesContext — renameWorkspace / closeWorkspace", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("renameWorkspace updates name in index", () => {
    const getCtx = renderWithProvider();
    const id = getCtx().activeWorkspaceId!;
    act(() => {
      getCtx().renameWorkspace(id, "Renamed");
    });
    expect(getCtx().index.find((m) => m.id === id)?.name).toBe("Renamed");
    expect(getIndex().find((m) => m.id === id)?.name).toBe("Renamed");
  });

  it("renameWorkspace bumps updatedAt", () => {
    const getCtx = renderWithProvider();
    const id = getCtx().activeWorkspaceId!;
    const before = getCtx().index.find((m) => m.id === id)!.updatedAt;
    act(() => {
      getCtx().renameWorkspace(id, "New Name");
    });
    expect(
      getCtx().index.find((m) => m.id === id)!.updatedAt,
    ).toBeGreaterThanOrEqual(before);
  });

  it("closeWorkspace sets activeWorkspaceId to null", () => {
    const getCtx = renderWithProvider();
    expect(getCtx().activeWorkspaceId).not.toBeNull();
    act(() => {
      getCtx().closeWorkspace();
    });
    expect(getCtx().activeWorkspaceId).toBeNull();
    expect(getCtx().activeWorkspace).toBeNull();
    expect(localStorage.getItem("active_workspace_id")).toBeNull();
  });
});

describe("WorkspacesContext — error guard", () => {
  it("useWorkspaces throws when used outside provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Consumer onRender={() => {}} />)).toThrow(
      "useWorkspaces must be used within a WorkspacesProvider",
    );
    spy.mockRestore();
  });
});
