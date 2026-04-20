// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AppProvider } from "./lib/store";
import { ThemeProvider } from "./lib/ThemeProvider";
import { SupportingDocsProvider } from "./lib/SupportingDocsContext";

// Mock Monaco Editor
vi.mock("@monaco-editor/react", () => ({
  Editor: () => <div data-testid="mock-monaco-editor">Mock Editor</div>,
}));

function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });
}

function renderApp() {
  return render(
    <ThemeProvider>
      <AppProvider>
        <SupportingDocsProvider>
          <App />
        </SupportingDocsProvider>
      </AppProvider>
    </ThemeProvider>,
  );
}

describe("App", () => {
  beforeEach(() => {
    localStorage.clear();
    mockMatchMedia(false);
  });

  it("renders the API key dialog when no key is present", () => {
    renderApp();
    expect(screen.getByText("Enter Gemini API Key")).toBeInTheDocument();
  });

  it("renders the main layout when API key is provided", async () => {
    renderApp();

    const input = screen.getByPlaceholderText("API Key");
    fireEvent.change(input, { target: { value: "test-key" } });
    fireEvent.click(screen.getByText("Save Key"));

    expect(screen.getByTestId("mock-monaco-editor")).toBeInTheDocument();
    expect(screen.getByText("AI Assistant")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Ask the editor..."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
  });
});

describe("App responsive layout", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders desktop side-by-side layout without FAB", () => {
    mockMatchMedia(false);
    renderApp();

    const input = screen.getByPlaceholderText("API Key");
    fireEvent.change(input, { target: { value: "test-key" } });
    fireEvent.click(screen.getByText("Save Key"));

    // No FAB on desktop
    expect(screen.queryByRole("button", { name: "Open chat" })).toBeNull();
    // Editor and sidebar both visible
    expect(screen.getByTestId("mock-monaco-editor")).toBeInTheDocument();
    expect(screen.getByText("AI Assistant")).toBeInTheDocument();
    // Reference drawer toggle button is present
    expect(
      screen.getByRole("button", { name: "Expand reference drawer" }),
    ).toBeInTheDocument();
  });

  it("renders mobile layout with chat and reference FABs", () => {
    mockMatchMedia(true);
    renderApp();

    const input = screen.getByPlaceholderText("API Key");
    fireEvent.change(input, { target: { value: "test-key" } });
    fireEvent.click(screen.getByText("Save Key"));

    expect(
      screen.getByRole("button", { name: "Open chat" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open reference" }),
    ).toBeInTheDocument();
  });

  it("opening the sheet shows the chat sidebar", async () => {
    const user = userEvent.setup();
    mockMatchMedia(true);
    renderApp();

    const input = screen.getByPlaceholderText("API Key");
    fireEvent.change(input, { target: { value: "test-key" } });
    fireEvent.click(screen.getByText("Save Key"));

    await user.click(screen.getByRole("button", { name: "Open chat" }));
    expect(
      screen.getByPlaceholderText("Ask the editor..."),
    ).toBeInTheDocument();
  });

  it("closing the sheet hides it", async () => {
    const user = userEvent.setup();
    mockMatchMedia(true);
    renderApp();

    const input = screen.getByPlaceholderText("API Key");
    fireEvent.change(input, { target: { value: "test-key" } });
    fireEvent.click(screen.getByText("Save Key"));

    await user.click(screen.getByRole("button", { name: "Open chat" }));
    await user.click(screen.getByRole("button", { name: "Close chat" }));

    // Sheet is translated off-screen (aria-hidden true)
    // The sheet element is still in DOM but hidden
    const sheet = document.querySelector("[aria-hidden='true']");
    expect(sheet).not.toBeNull();
  });

  it("FAB meets touch-target size (h-14 w-14)", () => {
    mockMatchMedia(true);
    renderApp();

    const input = screen.getByPlaceholderText("API Key");
    fireEvent.change(input, { target: { value: "test-key" } });
    fireEvent.click(screen.getByText("Save Key"));

    const fab = screen.getByRole("button", { name: "Open chat" });
    expect(fab.className).toContain("h-14");
    expect(fab.className).toContain("w-14");
  });
});
