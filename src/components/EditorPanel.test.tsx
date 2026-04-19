// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { EditorPanel } from "./EditorPanel";

// Mock Monaco Editor
vi.mock("@monaco-editor/react", () => ({
  Editor: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (val: string) => void;
  }) => (
    <textarea
      data-testid="mock-monaco-editor"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

describe("EditorPanel", () => {
  it("renders editor tab by default", () => {
    render(<EditorPanel />);
    expect(screen.getByTestId("mock-monaco-editor")).toBeInTheDocument();
  });

  it("can switch to the preview tab and render markdown", async () => {
    const user = userEvent.setup();
    render(<EditorPanel />);

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
    render(<EditorPanel />);

    const editor = screen.getByTestId("mock-monaco-editor");
    fireEvent.change(editor, { target: { value: "# New Markdown Heading" } });

    const previewTab = screen.getByRole("tab", { name: "Preview" });
    await user.click(previewTab);

    expect(
      await screen.findByRole("heading", { name: "New Markdown Heading" }),
    ).toBeInTheDocument();
  });
});
