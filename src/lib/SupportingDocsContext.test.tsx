// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import React from "react";
import {
  SupportingDocsProvider,
  useSupportingDocs,
  SupportingDoc,
} from "./SupportingDocsContext";

function Consumer({
  onRender,
}: {
  onRender: (value: ReturnType<typeof useSupportingDocs>) => void;
}) {
  const ctx = useSupportingDocs();
  onRender(ctx);
  return null;
}

function renderWithProvider() {
  let ctx!: ReturnType<typeof useSupportingDocs>;
  render(
    <SupportingDocsProvider>
      <Consumer onRender={(v) => (ctx = v)} />
    </SupportingDocsProvider>,
  );
  return () => ctx;
}

describe("SupportingDocsContext", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("starts empty when localStorage has no data", () => {
    const getCtx = renderWithProvider();
    expect(getCtx().docs).toEqual([]);
  });

  it("loads existing docs from localStorage on mount", () => {
    const existing: SupportingDoc[] = [
      { id: "1", title: "Notes", content: "hello", updatedAt: 1000 },
    ];
    localStorage.setItem("supporting_docs", JSON.stringify(existing));
    const getCtx = renderWithProvider();
    expect(getCtx().docs).toHaveLength(1);
    expect(getCtx().docs[0].title).toBe("Notes");
  });

  it("addDoc creates a new document with defaults and persists it", () => {
    const getCtx = renderWithProvider();
    act(() => getCtx().addDoc());
    const docs = getCtx().docs;
    expect(docs).toHaveLength(1);
    expect(docs[0].title).toBe("New Document");
    expect(docs[0].content).toBe("");
    expect(typeof docs[0].id).toBe("string");
    expect(JSON.parse(localStorage.getItem("supporting_docs")!)).toHaveLength(
      1,
    );
  });

  it("updateDoc changes title and content", () => {
    const getCtx = renderWithProvider();
    act(() => getCtx().addDoc());
    const id = getCtx().docs[0].id;
    act(() =>
      getCtx().updateDoc(id, { title: "My Notes", content: "## Heading" }),
    );
    const doc = getCtx().docs[0];
    expect(doc.title).toBe("My Notes");
    expect(doc.content).toBe("## Heading");
  });

  it("updateDoc bumps updatedAt", () => {
    const getCtx = renderWithProvider();
    act(() => getCtx().addDoc());
    const id = getCtx().docs[0].id;
    const before = getCtx().docs[0].updatedAt;
    act(() => getCtx().updateDoc(id, { title: "Changed" }));
    expect(getCtx().docs[0].updatedAt).toBeGreaterThanOrEqual(before);
  });

  it("deleteDoc removes the document", () => {
    const getCtx = renderWithProvider();
    act(() => getCtx().addDoc());
    act(() => getCtx().addDoc());
    expect(getCtx().docs).toHaveLength(2);
    const id = getCtx().docs[0].id;
    act(() => getCtx().deleteDoc(id));
    expect(getCtx().docs).toHaveLength(1);
    expect(getCtx().docs[0].id).not.toBe(id);
  });

  it("persists updates to localStorage", () => {
    const getCtx = renderWithProvider();
    act(() => getCtx().addDoc());
    const id = getCtx().docs[0].id;
    act(() => getCtx().updateDoc(id, { title: "Persisted" }));
    const stored: SupportingDoc[] = JSON.parse(
      localStorage.getItem("supporting_docs")!,
    );
    expect(stored[0].title).toBe("Persisted");
  });

  it("persists deletions to localStorage", () => {
    const getCtx = renderWithProvider();
    act(() => getCtx().addDoc());
    const id = getCtx().docs[0].id;
    act(() => getCtx().deleteDoc(id));
    const stored = JSON.parse(localStorage.getItem("supporting_docs")!);
    expect(stored).toHaveLength(0);
  });

  it("useSupportingDocs throws when used outside provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Consumer onRender={() => {}} />)).toThrow(
      "useSupportingDocs must be used within a SupportingDocsProvider",
    );
    spy.mockRestore();
  });
});
