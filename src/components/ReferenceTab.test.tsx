// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import React from "react";
import { WorkspacesProvider } from "@/lib/WorkspacesContext";
import { WorkspaceMeta, WorkspaceData } from "@/lib/workspace";
import { ReferenceTab } from "./ReferenceTab";

function renderTab() {
  return render(
    <WorkspacesProvider>
      <ReferenceTab />
    </WorkspacesProvider>,
  );
}

function getActiveWorkspaceData(): WorkspaceData {
  const index: WorkspaceMeta[] = JSON.parse(
    localStorage.getItem("workspaces_index")!,
  );
  const id = localStorage.getItem("active_workspace_id")!;
  expect(index.find((m) => m.id === id)).toBeTruthy();
  return JSON.parse(localStorage.getItem(`workspace_${id}`)!);
}

describe("ReferenceTab", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it("shows empty state when no documents (only default Untitled deleted)", () => {
    renderTab();
    // After migration, one "Untitled Document" exists — delete it to test empty state
    fireEvent.click(screen.getByRole("button", { name: /delete/i }));
    expect(screen.getByText(/no reference documents yet/i)).toBeTruthy();
  });

  it("adds a document when New is clicked", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: /new document/i }));
    // Should now have 2 docs (Untitled from migration + newly added)
    const expandBtns = screen
      .getAllByRole("button")
      .filter((b) => b.getAttribute("aria-expanded") !== null);
    expect(expandBtns.length).toBeGreaterThanOrEqual(1);
  });

  it("expands a doc when its row is clicked", () => {
    renderTab();
    const expandBtn = screen
      .getAllByRole("button")
      .find((b) => b.getAttribute("aria-expanded") !== null);
    expect(expandBtn).toBeTruthy();
    fireEvent.click(expandBtn!);
    expect(
      screen.getByRole("textbox", { name: /document title/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole("textbox", { name: /document content/i }),
    ).toBeTruthy();
  });

  it("deletes a document when the delete button is clicked", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: /new document/i }));
    // Now 2 docs; delete the new one (last delete button)
    const deleteBtns = screen.getAllByRole("button", { name: /delete/i });
    fireEvent.click(deleteBtns[deleteBtns.length - 1]);
    // Back to 1 doc
    const expandBtns = screen
      .getAllByRole("button")
      .filter((b) => b.getAttribute("aria-expanded") !== null);
    expect(expandBtns).toHaveLength(1);
  });

  it("auto-saves title after debounce", () => {
    renderTab();
    const expandBtn = screen
      .getAllByRole("button")
      .find((b) => b.getAttribute("aria-expanded") !== null)!;
    fireEvent.click(expandBtn);

    const titleInput = screen.getByRole("textbox", { name: /document title/i });
    fireEvent.change(titleInput, { target: { value: "My Notes" } });

    act(() => {
      vi.advanceTimersByTime(500);
    });

    const data = getActiveWorkspaceData();
    expect(data.documents.some((d) => d.title === "My Notes")).toBe(true);
  });

  it("auto-saves content after debounce", () => {
    renderTab();
    const expandBtn = screen
      .getAllByRole("button")
      .find((b) => b.getAttribute("aria-expanded") !== null)!;
    fireEvent.click(expandBtn);

    const contentArea = screen.getByRole("textbox", {
      name: /document content/i,
    });
    fireEvent.change(contentArea, { target: { value: "# Hello" } });

    act(() => {
      vi.advanceTimersByTime(500);
    });

    const data = getActiveWorkspaceData();
    expect(data.documents.some((d) => d.content === "# Hello")).toBe(true);
  });

  it("renders multiple documents", () => {
    renderTab();
    const newBtn = screen.getByRole("button", { name: /new document/i });
    fireEvent.click(newBtn);
    fireEvent.click(newBtn);
    const expandBtns = screen
      .getAllByRole("button")
      .filter((b) => b.getAttribute("aria-expanded") !== null);
    // 1 from migration + 2 added = 3
    expect(expandBtns).toHaveLength(3);
  });
});
