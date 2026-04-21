// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useEffect } from "react";
import { EditorPanel } from "./EditorPanel";
import { SuggestionWidget } from "./SuggestionWidget";
import { AppProvider, useApp } from "@/lib/store";
import { ThemeProvider } from "@/lib/ThemeProvider";
import { WorkspacesProvider } from "@/lib/WorkspacesContext";
import type { Suggestion } from "@/lib/store";

function renderEditor() {
  return render(
    <ThemeProvider>
      <AppProvider>
        <WorkspacesProvider>
          <EditorPanel />
        </WorkspacesProvider>
      </AppProvider>
    </ThemeProvider>,
  );
}

describe("EditorPanel", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders editor tab by default", () => {
    renderEditor();
    expect(screen.getByTestId("mock-monaco-editor")).toBeInTheDocument();
  });

  it("can switch to the preview tab and render markdown", async () => {
    const user = userEvent.setup();
    renderEditor();

    // Switch to preview tab
    const previewTab = screen.getByRole("tab", { name: "Preview" });
    await user.click(previewTab);

    // Default content contains a heading "Welcome to the AI Agent Text Editor"
    expect(
      await screen.findByRole("heading", {
        name: "Welcome to the AI Agent Text Editor",
      }),
    ).toBeInTheDocument();
  });

  it("updates preview when editor content changes", async () => {
    const user = userEvent.setup();
    renderEditor();

    const editor = screen.getByTestId("mock-monaco-editor");
    fireEvent.change(editor, { target: { value: "# New Markdown Heading" } });

    const previewTab = screen.getByRole("tab", { name: "Preview" });
    await user.click(previewTab);

    expect(
      await screen.findByRole("heading", { name: "New Markdown Heading" }),
    ).toBeInTheDocument();
  });
});

describe("SuggestionWidget", () => {
  function makeSuggestion(overrides?: Partial<Suggestion>): Suggestion {
    return {
      id: "test-id",
      originalText: "old text",
      replacementText: "new text",
      status: "pending",
      range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 8 },
      resolve: vi.fn(),
      ...overrides,
    };
  }

  it("renders accept and reject buttons", () => {
    const suggestion = makeSuggestion();
    render(
      <SuggestionWidget
        suggestion={suggestion}
        onAccept={vi.fn()}
        onReject={vi.fn()}
      />,
    );
    expect(screen.getByTitle("Accept")).toBeInTheDocument();
    expect(screen.getByTitle("Reject")).toBeInTheDocument();
  });

  it("calls onAccept with suggestion id when accept is clicked", async () => {
    const user = userEvent.setup();
    const suggestion = makeSuggestion();
    const onAccept = vi.fn();
    render(
      <SuggestionWidget
        suggestion={suggestion}
        onAccept={onAccept}
        onReject={vi.fn()}
      />,
    );
    await user.click(screen.getByTitle("Accept"));
    expect(onAccept).toHaveBeenCalledWith("test-id");
  });

  it("calls onReject with suggestion id when reject is clicked", async () => {
    const user = userEvent.setup();
    const suggestion = makeSuggestion();
    const onReject = vi.fn();
    render(
      <SuggestionWidget
        suggestion={suggestion}
        onAccept={vi.fn()}
        onReject={onReject}
      />,
    );
    await user.click(screen.getByTitle("Reject"));
    expect(onReject).toHaveBeenCalledWith("test-id");
  });
});

describe("EditorPanel tab switch dialog", () => {
  function SetTabSwitchRequest({
    resolve,
  }: {
    resolve: (accepted: boolean) => void;
  }) {
    const { setPendingTabSwitchRequest } = useApp();
    useEffect(() => {
      setPendingTabSwitchRequest({ resolve });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return null;
  }

  function renderEditorWithTabSwitch(resolve: (accepted: boolean) => void) {
    return render(
      <ThemeProvider>
        <AppProvider>
          <WorkspacesProvider>
            <SetTabSwitchRequest resolve={resolve} />
            <EditorPanel />
          </WorkspacesProvider>
        </AppProvider>
      </ThemeProvider>,
    );
  }

  beforeEach(() => {
    localStorage.clear();
  });

  it("shows the tab switch dialog when pendingTabSwitchRequest is set", async () => {
    const resolve = vi.fn();
    renderEditorWithTabSwitch(resolve);
    expect(await screen.findByText("Switch to Editor?")).toBeInTheDocument();
  });

  it("calls resolve(true) and closes dialog when Switch to Editor is clicked", async () => {
    const user = userEvent.setup();
    const resolve = vi.fn();
    renderEditorWithTabSwitch(resolve);
    await screen.findByText("Switch to Editor?");
    await user.click(screen.getByRole("button", { name: "Switch to Editor" }));
    expect(resolve).toHaveBeenCalledWith(true);
  });

  it("calls resolve(false) when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const resolve = vi.fn();
    renderEditorWithTabSwitch(resolve);
    await screen.findByText("Switch to Editor?");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(resolve).toHaveBeenCalledWith(false);
  });
});
