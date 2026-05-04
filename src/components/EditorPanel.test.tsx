// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useEffect } from "react";
import { EditorPanel } from "./EditorPanel";
import { AppProvider, useApp } from "@/lib/store";
import { ThemeProvider } from "@/lib/ThemeProvider";
import { WorkspacesProvider } from "@/lib/WorkspacesContext";

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

    const previewTab = screen.getByRole("tab", { name: "Preview" });
    await user.click(previewTab);

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
