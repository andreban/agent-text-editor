// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import { MarkdownContent } from "./MarkdownContent";

describe("MarkdownContent", () => {
  it("renders markdown content", () => {
    const { container } = render(<MarkdownContent content="**bold text**" />);
    expect(container.querySelector("strong")).toBeTruthy();
  });

  it("strips script tags to prevent XSS", () => {
    const malicious = '<script>alert("xss")</script>Hello';
    const { container } = render(<MarkdownContent content={malicious} />);
    expect(container.querySelector("script")).toBeNull();
  });

  it("strips onclick attributes to prevent XSS", () => {
    const malicious = '<a href="#" onclick="alert(1)">click</a>';
    const { container } = render(<MarkdownContent content={malicious} />);
    const link = container.querySelector("a");
    // rehype-sanitize either removes the element or strips the unsafe attribute
    expect(link === null || link.getAttribute("onclick") === null).toBe(true);
  });

  it("renders inline SVG elements", () => {
    const svgContent =
      '<svg viewBox="0 0 100 100" width="100" height="100"><circle cx="50" cy="50" r="40" fill="red" /></svg>';
    const { container } = render(<MarkdownContent content={svgContent} />);
    expect(container.querySelector("svg")).toBeTruthy();
    expect(container.querySelector("circle")).toBeTruthy();
  });

  it("strips SVG event handlers to prevent XSS", () => {
    const malicious =
      '<svg onload="alert(1)" viewBox="0 0 10 10"><rect width="10" height="10" /></svg>';
    const { container } = render(<MarkdownContent content={malicious} />);
    const svg = container.querySelector("svg");
    expect(svg === null || svg.getAttribute("onload") === null).toBe(true);
  });
});
