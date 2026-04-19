// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0
import { render, screen } from "@testing-library/react";
import App from "./App";
import { describe, it, expect, vi } from "vitest";

// Mock Monaco Editor as it doesn't render well in JSDOM out of the box
vi.mock("@monaco-editor/react", () => ({
  Editor: () => <div data-testid="mock-monaco-editor">Mock Editor</div>,
}));

describe("App", () => {
  it("renders the editor panel", () => {
    render(<App />);
    expect(screen.getByTestId("mock-monaco-editor")).toBeInTheDocument();
  });

  it("renders the chat sidebar", () => {
    render(<App />);
    expect(screen.getByText("AI Assistant")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Type a message..."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
  });
});
