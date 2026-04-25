// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SettingsDialog } from "./SettingsDialog";
import * as storeModule from "@/lib/store";
import { ThemeProvider } from "@/lib/ThemeProvider";
import React from "react";

const mockSetApiKey = vi.fn();
const mockSetModelName = vi.fn();

function mockStore(apiKey: string | null, modelName: string) {
  vi.spyOn(storeModule, "useAgentConfig").mockReturnValue({
    apiKey,
    setApiKey: mockSetApiKey,
    modelName,
    setModelName: mockSetModelName,
    totalTokens: 0,
    setTotalTokens: vi.fn(),
    skills: [],
    setSkills: vi.fn(),
  });
}

function renderDialog(open: boolean, onOpenChange = vi.fn()) {
  return render(
    <ThemeProvider>
      <SettingsDialog open={open} onOpenChange={onOpenChange} />
    </ThemeProvider>,
  );
}

describe("SettingsDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("renders API key input and model selector when open", () => {
    mockStore("test-key", "gemini-2.5-flash");
    renderDialog(true);

    expect(screen.getByLabelText("Gemini API Key")).toBeInTheDocument();
    expect(screen.getByLabelText("Model")).toBeInTheDocument();
  });

  it("does not render content when closed", () => {
    mockStore("test-key", "gemini-2.5-flash");
    renderDialog(false);

    expect(screen.queryByLabelText("Gemini API Key")).not.toBeInTheDocument();
  });

  it("saves API key and model when Save is clicked", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    mockStore("old-key", "gemini-2.5-flash");

    renderDialog(true, onOpenChange);

    const keyInput = screen.getByLabelText("Gemini API Key");
    await user.clear(keyInput);
    await user.type(keyInput, "new-key");

    const modelSelect = screen.getByLabelText("Model");
    await user.selectOptions(modelSelect, "gemini-2.5-pro");

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(mockSetApiKey).toHaveBeenCalledWith("new-key");
    expect(mockSetModelName).toHaveBeenCalledWith("gemini-2.5-pro");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("does not update store when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    mockStore("old-key", "gemini-2.5-flash");

    renderDialog(true, onOpenChange);

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(mockSetApiKey).not.toHaveBeenCalled();
    expect(mockSetModelName).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("toggles API key visibility when eye button is clicked", async () => {
    const user = userEvent.setup();
    mockStore("test-key", "gemini-2.5-flash");

    renderDialog(true);

    const keyInput = screen.getByLabelText("Gemini API Key");
    expect(keyInput).toHaveAttribute("type", "password");

    await user.click(screen.getByLabelText("Show API key"));
    expect(keyInput).toHaveAttribute("type", "text");

    await user.click(screen.getByLabelText("Hide API key"));
    expect(keyInput).toHaveAttribute("type", "password");
  });

  it("resets draft values to current store values when reopened", () => {
    const onOpenChange = vi.fn();
    mockStore("stored-key", "gemini-2.5-pro");

    const { rerender } = render(
      <ThemeProvider>
        <SettingsDialog open={false} onOpenChange={onOpenChange} />
      </ThemeProvider>,
    );

    rerender(
      <ThemeProvider>
        <SettingsDialog open={true} onOpenChange={onOpenChange} />
      </ThemeProvider>,
    );

    const keyInput = screen.getByLabelText(
      "Gemini API Key",
    ) as HTMLInputElement;
    const modelSelect = screen.getByLabelText("Model") as HTMLSelectElement;

    expect(keyInput.value).toBe("stored-key");
    expect(modelSelect.value).toBe("gemini-2.5-pro");
  });

  it("sets API key to null when saved with empty input", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    mockStore("old-key", "gemini-2.5-flash");

    renderDialog(true, onOpenChange);

    const keyInput = screen.getByLabelText("Gemini API Key");
    await user.clear(keyInput);
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(mockSetApiKey).toHaveBeenCalledWith(null);
  });
});
