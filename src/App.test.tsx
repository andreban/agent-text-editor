// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0
import { render, screen, fireEvent } from "@testing-library/react";
import App from "./App";
import { describe, it, expect, vi } from "vitest";
import { AppProvider } from "./lib/store";

// Mock Monaco Editor
vi.mock("@monaco-editor/react", () => ({
  Editor: () => <div data-testid="mock-monaco-editor">Mock Editor</div>,
}));

describe("App", () => {
  it("renders the API key dialog when no key is present", () => {
    render(
      <AppProvider>
        <App />
      </AppProvider>,
    );
    expect(screen.getByText("Enter Gemini API Key")).toBeInTheDocument();
  });

  it("renders the main layout when API key is provided", async () => {
    // We can simulate providing a key
    render(
      <AppProvider>
        <App />
      </AppProvider>,
    );

    const input = screen.getByPlaceholderText("API Key");
    fireEvent.change(input, { target: { value: "test-key" } });
    fireEvent.click(screen.getByText("Save Key"));

    // Now it should show the main content
    expect(screen.getByTestId("mock-monaco-editor")).toBeInTheDocument();
    expect(screen.getByText("AI Assistant")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Ask the editor..."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
  });
});
