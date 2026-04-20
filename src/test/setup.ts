// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0
import "@testing-library/jest-dom";
import { vi } from "vitest";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
import React from "react";

// Mock Monaco Editor for JSDOM
vi.mock("monaco-editor", () => ({
  editor: {
    create: vi.fn(),
    IStandaloneCodeEditor: vi.fn(),
    IModelDeltaDecoration: vi.fn(),
    IContentWidget: vi.fn(),
    ContentWidgetPositionPreference: {
      BELOW: 0,
      EXACT: 1,
    },
  },
}));

// Mock @monaco-editor/react to prevent it from loading the real Monaco
vi.mock("@monaco-editor/react", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Editor: ({ onChange, value }: any) => {
    return React.createElement("textarea", {
      "data-testid": "mock-monaco-editor",
      value: value,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onChange: (e: any) => onChange?.(e.target.value),
    });
  },
}));
