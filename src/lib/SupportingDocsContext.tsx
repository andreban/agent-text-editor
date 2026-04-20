// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import React, { createContext, useContext, useEffect, useState } from "react";

export interface SupportingDoc {
  id: string;
  title: string;
  content: string;
  updatedAt: number;
}

interface SupportingDocsContextValue {
  docs: SupportingDoc[];
  addDoc: () => void;
  updateDoc: (
    id: string,
    updates: Partial<Pick<SupportingDoc, "title" | "content">>,
  ) => void;
  deleteDoc: (id: string) => void;
}

const STORAGE_KEY = "supporting_docs";

const SupportingDocsContext = createContext<
  SupportingDocsContextValue | undefined
>(undefined);

export function SupportingDocsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [docs, setDocs] = useState<SupportingDoc[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(docs));
  }, [docs]);

  const addDoc = () => {
    const doc: SupportingDoc = {
      id: crypto.randomUUID(),
      title: "New Document",
      content: "",
      updatedAt: Date.now(),
    };
    setDocs((prev) => [...prev, doc]);
  };

  const updateDoc = (
    id: string,
    updates: Partial<Pick<SupportingDoc, "title" | "content">>,
  ) => {
    setDocs((prev) =>
      prev.map((d) =>
        d.id === id ? { ...d, ...updates, updatedAt: Date.now() } : d,
      ),
    );
  };

  const deleteDoc = (id: string) => {
    setDocs((prev) => prev.filter((d) => d.id !== id));
  };

  return (
    <SupportingDocsContext.Provider
      value={{ docs, addDoc, updateDoc, deleteDoc }}
    >
      {children}
    </SupportingDocsContext.Provider>
  );
}

export function useSupportingDocs(): SupportingDocsContextValue {
  const ctx = useContext(SupportingDocsContext);
  if (!ctx)
    throw new Error(
      "useSupportingDocs must be used within a SupportingDocsProvider",
    );
  return ctx;
}
