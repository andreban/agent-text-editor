// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { EditorPanel } from "./EditorPanel";
import { AppProvider } from "@/lib/store";
import { ThemeProvider } from "@/lib/ThemeProvider";

describe("EditorPanel", () => {
  it("renders editor tab by default", () => {
    render(
      <ThemeProvider>
        <AppProvider>
          <EditorPanel />
        </AppProvider>
      </ThemeProvider>,
    );
    expect(screen.getByTestId("mock-monaco-editor")).toBeInTheDocument();
  });

  it("can switch to the preview tab and render markdown", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <AppProvider>
          <EditorPanel />
        </AppProvider>
      </ThemeProvider>,
    );

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
    render(
      <ThemeProvider>
        <AppProvider>
          <EditorPanel />
        </AppProvider>
      </ThemeProvider>,
    );

    const editor = screen.getByTestId("mock-monaco-editor");
    fireEvent.change(editor, { target: { value: "# New Markdown Heading" } });

    const previewTab = screen.getByRole("tab", { name: "Preview" });
    await user.click(previewTab);

    expect(
      await screen.findByRole("heading", { name: "New Markdown Heading" }),
    ).toBeInTheDocument();
  });
});
