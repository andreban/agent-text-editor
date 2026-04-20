// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import React from "react";
import { SupportingDocsProvider } from "@/lib/SupportingDocsContext";
import { ReferenceTab } from "./ReferenceTab";

function renderTab() {
  return render(
    <SupportingDocsProvider>
      <ReferenceTab />
    </SupportingDocsProvider>,
  );
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

  it("shows empty state when no documents", () => {
    renderTab();
    expect(screen.getByText(/no reference documents yet/i)).toBeTruthy();
  });

  it("adds a document when New is clicked", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: /new document/i }));
    expect(screen.getByText("New Document")).toBeTruthy();
  });

  it("expands a doc when its row is clicked", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: /new document/i }));
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
    expect(screen.getByText("New Document")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /delete/i }));
    expect(screen.queryByText("New Document")).toBeNull();
    expect(screen.getByText(/no reference documents yet/i)).toBeTruthy();
  });

  it("auto-saves title after debounce", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: /new document/i }));

    const expandBtn = screen
      .getAllByRole("button")
      .find((b) => b.getAttribute("aria-expanded") !== null)!;
    fireEvent.click(expandBtn);

    const titleInput = screen.getByRole("textbox", { name: /document title/i });
    fireEvent.change(titleInput, { target: { value: "My Notes" } });

    // Before debounce fires, localStorage still has old title
    const beforeFlush = JSON.parse(localStorage.getItem("supporting_docs")!);
    expect(beforeFlush[0].title).toBe("New Document");

    act(() => {
      vi.advanceTimersByTime(500);
    });

    const stored = JSON.parse(localStorage.getItem("supporting_docs")!);
    expect(stored[0].title).toBe("My Notes");
  });

  it("auto-saves content after debounce", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: /new document/i }));

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

    const stored = JSON.parse(localStorage.getItem("supporting_docs")!);
    expect(stored[0].content).toBe("# Hello");
  });

  it("renders multiple documents", () => {
    renderTab();
    const newBtn = screen.getByRole("button", { name: /new document/i });
    fireEvent.click(newBtn);
    fireEvent.click(newBtn);
    fireEvent.click(newBtn);
    const expandBtns = screen
      .getAllByRole("button")
      .filter((b) => b.getAttribute("aria-expanded") !== null);
    expect(expandBtns).toHaveLength(3);
  });
});
