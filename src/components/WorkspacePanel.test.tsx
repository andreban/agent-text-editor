// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { WorkspacesProvider } from "@/lib/WorkspacesContext";
import {
  WorkspaceMeta,
  WorkspaceData,
  WorkspaceDocument,
} from "@/lib/workspace";
import { WorkspacePanel } from "./WorkspacePanel";

function renderPanel() {
  return render(
    <WorkspacesProvider>
      <WorkspacePanel />
    </WorkspacesProvider>,
  );
}

function getActiveWorkspaceData(): WorkspaceData {
  const index: WorkspaceMeta[] = JSON.parse(
    localStorage.getItem("workspaces_index")!,
  );
  const id = localStorage.getItem("active_workspace_id")!;
  return JSON.parse(localStorage.getItem(`workspace_${id}`)!);
}

function setupWorkspace(docs: Partial<WorkspaceDocument>[], activeIdx = 0) {
  const wsId = "test-ws-id";
  const now = Date.now();
  const fullDocs: WorkspaceDocument[] = docs.map((d, i) => ({
    id: `doc-${i}`,
    title: `Doc ${i + 1}`,
    content: "",
    updatedAt: now,
    ...d,
  }));
  const data: WorkspaceData = {
    documents: fullDocs,
    activeDocumentId: fullDocs[activeIdx]?.id ?? null,
  };
  const index: WorkspaceMeta[] = [
    { id: wsId, name: "Test WS", createdAt: now, updatedAt: now },
  ];
  localStorage.setItem("workspaces_index", JSON.stringify(index));
  localStorage.setItem(`workspace_${wsId}`, JSON.stringify(data));
  localStorage.setItem("active_workspace_id", wsId);
  return { wsId, docs: fullDocs, data };
}

describe("WorkspacePanel", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it("renders the workspace name in the header", () => {
    renderPanel();
    expect(screen.getByText("My Workspace")).toBeTruthy();
  });

  it("renders workspace name from pre-populated state", () => {
    setupWorkspace([{ title: "First Doc" }]);
    renderPanel();
    expect(screen.getByText("Test WS")).toBeTruthy();
  });

  it("renders the default Untitled Document from migration", () => {
    renderPanel();
    expect(screen.getByText("Untitled Document")).toBeTruthy();
  });

  it("creates a new document when New button is clicked", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /new document/i }));
    const data = getActiveWorkspaceData();
    expect(data.documents.length).toBe(2);
  });

  it("sets the new document as active when created", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /new document/i }));
    const data = getActiveWorkspaceData();
    const lastDoc = data.documents[data.documents.length - 1];
    expect(data.activeDocumentId).toBe(lastDoc.id);
  });

  it("shows active document with aria-current", () => {
    renderPanel();
    const activeRow = screen.getByRole("button", {
      name: /open untitled document/i,
    });
    expect(activeRow.getAttribute("aria-current")).toBe("true");
  });

  it("switches active document when a doc row is clicked", () => {
    setupWorkspace(
      [
        { id: "doc-0", title: "First" },
        { id: "doc-1", title: "Second" },
      ],
      1,
    );
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: /open first/i }));

    const data = getActiveWorkspaceData();
    expect(data.activeDocumentId).toBe("doc-0");
  });

  it("deletes a document without confirmation when it has no content", () => {
    renderPanel();
    fireEvent.click(
      screen.getByRole("button", { name: /delete untitled document/i }),
    );
    const data = getActiveWorkspaceData();
    expect(data.documents.length).toBe(0);
  });

  it("shows confirmation before deleting a document with content", () => {
    setupWorkspace(
      [
        { id: "doc-0", title: "Rich Doc", content: "some content" },
        { id: "doc-1", title: "Empty Doc", content: "" },
      ],
      1,
    );
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: /delete rich doc/i }));

    expect(
      screen.getByRole("button", { name: /confirm delete/i }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /cancel delete/i })).toBeTruthy();
  });

  it("cancels deletion when Cancel is clicked in confirm dialog", () => {
    setupWorkspace(
      [
        { id: "doc-0", title: "Rich Doc", content: "some content" },
        { id: "doc-1", title: "Empty Doc", content: "" },
      ],
      1,
    );
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: /delete rich doc/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancel delete/i }));

    const data = getActiveWorkspaceData();
    expect(data.documents.length).toBe(2);
  });

  it("confirms deletion in confirm dialog", () => {
    setupWorkspace(
      [
        { id: "doc-0", title: "Rich Doc", content: "some content" },
        { id: "doc-1", title: "Empty Doc", content: "" },
      ],
      1,
    );
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: /delete rich doc/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm delete/i }));

    const data = getActiveWorkspaceData();
    expect(data.documents.length).toBe(1);
    expect(data.documents[0].id).toBe("doc-1");
  });

  it("renders multiple documents", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /new document/i }));
    fireEvent.click(screen.getByRole("button", { name: /new document/i }));
    const data = getActiveWorkspaceData();
    expect(data.documents.length).toBe(3);
  });
});
