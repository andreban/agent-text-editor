// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, act } from "@testing-library/react";
import React from "react";
import { ThemeProvider, useTheme, Theme } from "./ThemeProvider";

function makeMatchMedia(prefersDark: boolean) {
  return vi.fn().mockImplementation((query: string) => ({
    matches: query === "(prefers-color-scheme: dark)" ? prefersDark : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function ThemeConsumer({
  onRender,
}: {
  onRender: (value: {
    theme: Theme;
    toggleTheme: () => void;
    setTheme: (t: Theme) => void;
  }) => void;
}) {
  const ctx = useTheme();
  onRender(ctx);
  return null;
}

describe("ThemeProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
    vi.restoreAllMocks();
  });

  it("defaults to light when no saved preference and system is light", () => {
    window.matchMedia = makeMatchMedia(false);
    let theme!: Theme;
    render(
      <ThemeProvider>
        <ThemeConsumer onRender={(v) => (theme = v.theme)} />
      </ThemeProvider>,
    );
    expect(theme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("defaults to dark when no saved preference and system is dark", () => {
    window.matchMedia = makeMatchMedia(true);
    let theme!: Theme;
    render(
      <ThemeProvider>
        <ThemeConsumer onRender={(v) => (theme = v.theme)} />
      </ThemeProvider>,
    );
    expect(theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("saved preference overrides system preference", () => {
    window.matchMedia = makeMatchMedia(true);
    localStorage.setItem("theme", "light");
    let theme!: Theme;
    render(
      <ThemeProvider>
        <ThemeConsumer onRender={(v) => (theme = v.theme)} />
      </ThemeProvider>,
    );
    expect(theme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("toggleTheme flips theme, updates localStorage, and toggles html class", () => {
    window.matchMedia = makeMatchMedia(false);
    let ctx!: {
      theme: Theme;
      toggleTheme: () => void;
      setTheme: (t: Theme) => void;
    };
    render(
      <ThemeProvider>
        <ThemeConsumer onRender={(v) => (ctx = v)} />
      </ThemeProvider>,
    );
    expect(ctx.theme).toBe("light");

    act(() => ctx.toggleTheme());
    expect(ctx.theme).toBe("dark");
    expect(localStorage.getItem("theme")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    act(() => ctx.toggleTheme());
    expect(ctx.theme).toBe("light");
    expect(localStorage.getItem("theme")).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("setTheme sets theme directly and persists it", () => {
    window.matchMedia = makeMatchMedia(false);
    let ctx!: {
      theme: Theme;
      toggleTheme: () => void;
      setTheme: (t: Theme) => void;
    };
    render(
      <ThemeProvider>
        <ThemeConsumer onRender={(v) => (ctx = v)} />
      </ThemeProvider>,
    );

    act(() => ctx.setTheme("dark"));
    expect(ctx.theme).toBe("dark");
    expect(localStorage.getItem("theme")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("second ThemeProvider mount reads the saved value", () => {
    window.matchMedia = makeMatchMedia(false);
    localStorage.setItem("theme", "dark");
    let theme!: Theme;
    render(
      <ThemeProvider>
        <ThemeConsumer onRender={(v) => (theme = v.theme)} />
      </ThemeProvider>,
    );
    expect(theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("useTheme throws when used outside ThemeProvider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<ThemeConsumer onRender={() => {}} />)).toThrow(
      "useTheme must be used within a ThemeProvider",
    );
    spy.mockRestore();
  });
});
