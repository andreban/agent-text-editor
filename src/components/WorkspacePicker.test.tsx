// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import React from "react";
import { WorkspacesProvider } from "@/lib/WorkspacesContext";
import { WorkspaceMeta, WorkspaceData } from "@/lib/workspace";
import { WorkspacePicker } from "./WorkspacePicker";

function renderPicker() {
  return render(
    <WorkspacesProvider>
      <WorkspacePicker />
    </WorkspacesProvider>,
  );
}

function getIndex(): WorkspaceMeta[] {
  return JSON.parse(localStorage.getItem("workspaces_index")!);
}

function seedTwoWorkspaces() {
  const ws1: WorkspaceMeta = {
    id: "ws1",
    name: "Alpha",
    createdAt: 1000,
    updatedAt: 1000,
  };
  const ws2: WorkspaceMeta = {
    id: "ws2",
    name: "Beta",
    createdAt: 2000,
    updatedAt: 2000,
  };
  const data: WorkspaceData = {
    documents: [{ id: "d1", title: "Doc", content: "", updatedAt: 1000 }],
    activeDocumentId: "d1",
  };
  localStorage.setItem("workspaces_index", JSON.stringify([ws1, ws2]));
  localStorage.setItem("workspace_ws1", JSON.stringify(data));
  localStorage.setItem("workspace_ws2", JSON.stringify(data));
  // No active workspace — picker should be shown
  localStorage.removeItem("active_workspace_id");
}

describe("WorkspacePicker — rendering", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("renders workspace names in the list", () => {
    seedTwoWorkspaces();
    renderPicker();
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByText("Beta")).toBeTruthy();
  });

  it("shows empty state when no workspaces exist", () => {
    // Pre-seed workspaces_index as empty to skip migration
    localStorage.setItem("workspaces_index", JSON.stringify([]));
    renderPicker();
    expect(screen.getByText(/no workspaces yet/i)).toBeTruthy();
  });

  it("renders New Workspace button", () => {
    renderPicker();
    expect(screen.getByRole("button", { name: /new workspace/i })).toBeTruthy();
  });
});

describe("WorkspacePicker — create workspace", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("opens dialog when New Workspace is clicked", () => {
    renderPicker();
    fireEvent.click(screen.getByRole("button", { name: /new workspace/i }));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("creates a workspace and closes the dialog on confirm", () => {
    renderPicker();
    fireEvent.click(screen.getByRole("button", { name: /new workspace/i }));
    const input = screen.getByPlaceholderText(/workspace name/i);
    fireEvent.change(input, { target: { value: "My New WS" } });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));
    const idx = getIndex();
    expect(idx.find((w) => w.name === "My New WS")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("create button is disabled when name is empty", () => {
    renderPicker();
    fireEvent.click(screen.getByRole("button", { name: /new workspace/i }));
    const createBtn = screen.getByRole("button", { name: /^create$/i });
    expect(createBtn).toBeDisabled();
  });

  it("creates workspace via Enter key", () => {
    renderPicker();
    fireEvent.click(screen.getByRole("button", { name: /new workspace/i }));
    const input = screen.getByPlaceholderText(/workspace name/i);
    fireEvent.change(input, { target: { value: "Keyboard WS" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(getIndex().find((w) => w.name === "Keyboard WS")).toBeTruthy();
  });
});

describe("WorkspacePicker — rename workspace", () => {
  beforeEach(() => {
    localStorage.clear();
    seedTwoWorkspaces();
  });
  afterEach(() => localStorage.clear());

  it("shows rename input when pencil icon is clicked", () => {
    renderPicker();
    const renameBtn = screen.getAllByRole("button", { name: /rename/i })[0];
    fireEvent.click(renameBtn);
    expect(screen.getByDisplayValue("Alpha")).toBeTruthy();
  });

  it("saves renamed workspace on confirm", () => {
    renderPicker();
    fireEvent.click(screen.getAllByRole("button", { name: /rename/i })[0]);
    const input = screen.getByDisplayValue("Alpha");
    fireEvent.change(input, { target: { value: "Alpha Renamed" } });
    fireEvent.click(screen.getByRole("button", { name: /confirm rename/i }));
    expect(getIndex().find((w) => w.name === "Alpha Renamed")).toBeTruthy();
  });

  it("cancels rename without saving on cancel", () => {
    renderPicker();
    fireEvent.click(screen.getAllByRole("button", { name: /rename/i })[0]);
    const input = screen.getByDisplayValue("Alpha");
    fireEvent.change(input, { target: { value: "Discard Me" } });
    fireEvent.click(screen.getByRole("button", { name: /cancel rename/i }));
    expect(getIndex().find((w) => w.name === "Alpha")).toBeTruthy();
    expect(getIndex().find((w) => w.name === "Discard Me")).toBeUndefined();
  });
});

describe("WorkspacePicker — delete workspace", () => {
  beforeEach(() => {
    localStorage.clear();
    seedTwoWorkspaces();
  });
  afterEach(() => localStorage.clear());

  it("shows confirmation dialog when delete is clicked", () => {
    renderPicker();
    fireEvent.click(screen.getAllByRole("button", { name: /delete/i })[0]);
    expect(screen.getByText(/cannot be undone/i)).toBeTruthy();
  });

  it("deletes workspace after confirmation", () => {
    renderPicker();
    fireEvent.click(
      screen.getAllByRole("button", { name: /delete alpha/i })[0],
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /^delete$/i }));
    expect(getIndex().find((w) => w.name === "Alpha")).toBeUndefined();
  });

  it("cancels deletion when cancel is clicked in dialog", () => {
    renderPicker();
    fireEvent.click(
      screen.getAllByRole("button", { name: /delete alpha/i })[0],
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /cancel/i }));
    expect(getIndex().find((w) => w.name === "Alpha")).toBeTruthy();
  });

  it("deleting the last workspace leaves index empty", () => {
    // Remove ws2, keep only ws1
    const ws1: WorkspaceMeta = {
      id: "ws1",
      name: "Solo",
      createdAt: 1,
      updatedAt: 1,
    };
    const data: WorkspaceData = {
      documents: [],
      activeDocumentId: null,
    };
    localStorage.setItem("workspaces_index", JSON.stringify([ws1]));
    localStorage.setItem("workspace_ws1", JSON.stringify(data));
    renderPicker();
    fireEvent.click(screen.getByRole("button", { name: /delete solo/i }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /^delete$/i }));
    expect(getIndex()).toHaveLength(0);
    expect(screen.getByText(/no workspaces yet/i)).toBeTruthy();
  });
});
