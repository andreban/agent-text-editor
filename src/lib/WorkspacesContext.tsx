// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import React, { createContext, useContext, useState } from "react";
import { WorkspaceDocument, WorkspaceMeta, WorkspaceData } from "./workspace";

const WORKSPACES_INDEX_KEY = "workspaces_index";
const ACTIVE_WORKSPACE_KEY = "active_workspace_id";

function workspaceKey(id: string) {
  return `workspace_${id}`;
}

function saveIndex(index: WorkspaceMeta[]) {
  localStorage.setItem(WORKSPACES_INDEX_KEY, JSON.stringify(index));
}

function saveWorkspaceData(id: string, data: WorkspaceData) {
  localStorage.setItem(workspaceKey(id), JSON.stringify(data));
}

function loadWorkspaceData(id: string): WorkspaceData | null {
  try {
    const raw = localStorage.getItem(workspaceKey(id));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

interface SupportingDocLike {
  id: string;
  title: string;
  content: string;
  updatedAt: number;
}

function runMigration(): {
  index: WorkspaceMeta[];
  activeId: string;
  workspaceData: WorkspaceData;
} {
  const workspaceId = crypto.randomUUID();
  const now = Date.now();

  const meta: WorkspaceMeta = {
    id: workspaceId,
    name: "My Workspace",
    createdAt: now,
    updatedAt: now,
  };

  let supportingDocs: SupportingDocLike[] = [];
  try {
    supportingDocs = JSON.parse(
      localStorage.getItem("supporting_docs") ?? "[]",
    );
  } catch {
    // keep the empty array default
  }

  const importedDocs: WorkspaceDocument[] = supportingDocs.map((doc) => ({
    id: doc.id,
    title: doc.title,
    content: doc.content,
    updatedAt: doc.updatedAt,
  }));

  const untitledDoc: WorkspaceDocument = {
    id: crypto.randomUUID(),
    title: "Untitled Document",
    content: "",
    updatedAt: now,
  };

  const documents = [...importedDocs, untitledDoc];
  const workspaceData: WorkspaceData = {
    documents,
    activeDocumentId: untitledDoc.id,
  };

  const index = [meta];
  saveIndex(index);
  saveWorkspaceData(workspaceId, workspaceData);
  localStorage.setItem(ACTIVE_WORKSPACE_KEY, workspaceId);
  localStorage.removeItem("supporting_docs");

  return { index, activeId: workspaceId, workspaceData };
}

function initState(): {
  index: WorkspaceMeta[];
  activeWorkspaceId: string | null;
  activeWorkspace: WorkspaceData | null;
} {
  const raw = localStorage.getItem(WORKSPACES_INDEX_KEY);
  if (!raw) {
    const { index, activeId, workspaceData } = runMigration();
    return {
      index,
      activeWorkspaceId: activeId,
      activeWorkspace: workspaceData,
    };
  }

  let index: WorkspaceMeta[] = [];
  try {
    index = JSON.parse(raw);
  } catch {
    // keep the empty array default
  }

  const activeWorkspaceId = localStorage.getItem(ACTIVE_WORKSPACE_KEY);
  const activeWorkspace = activeWorkspaceId
    ? loadWorkspaceData(activeWorkspaceId)
    : null;

  return { index, activeWorkspaceId, activeWorkspace };
}

interface WorkspacesContextValue {
  index: WorkspaceMeta[];
  activeWorkspaceId: string | null;
  activeWorkspace: WorkspaceData | null;
  activeDocument: WorkspaceDocument | null;

  createWorkspace: (name: string) => WorkspaceMeta;
  openWorkspace: (id: string) => void;
  deleteWorkspace: (id: string) => void;
  renameWorkspace: (id: string, newName: string) => void;
  closeWorkspace: () => void;

  addDocument: () => void;
  createDocumentWithTitle: (title: string) => string;
  updateDocument: (
    id: string,
    patch: Partial<Pick<WorkspaceDocument, "title" | "content">>,
  ) => void;
  deleteDocument: (id: string) => void;
  setActiveDocumentId: (id: string) => void;
}

const WorkspacesContext = createContext<WorkspacesContextValue | undefined>(
  undefined,
);

export function WorkspacesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const initial = initState();
  const [index, setIndex] = useState<WorkspaceMeta[]>(initial.index);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(
    initial.activeWorkspaceId,
  );
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceData | null>(
    initial.activeWorkspace,
  );

  const activeDocument =
    activeWorkspace?.documents.find(
      (d) => d.id === activeWorkspace.activeDocumentId,
    ) ?? null;

  const createWorkspace = (name: string): WorkspaceMeta => {
    const now = Date.now();
    const meta: WorkspaceMeta = {
      id: crypto.randomUUID(),
      name,
      createdAt: now,
      updatedAt: now,
    };
    const untitled: WorkspaceDocument = {
      id: crypto.randomUUID(),
      title: "Untitled Document",
      content: "",
      updatedAt: now,
    };
    const data: WorkspaceData = {
      documents: [untitled],
      activeDocumentId: untitled.id,
    };

    const newIndex = [...index, meta];
    setIndex(newIndex);
    saveIndex(newIndex);
    saveWorkspaceData(meta.id, data);
    setActiveWorkspaceId(meta.id);
    setActiveWorkspace(data);
    localStorage.setItem(ACTIVE_WORKSPACE_KEY, meta.id);
    return meta;
  };

  const openWorkspace = (id: string) => {
    const data = loadWorkspaceData(id);
    setActiveWorkspaceId(id);
    setActiveWorkspace(data);
    localStorage.setItem(ACTIVE_WORKSPACE_KEY, id);
  };

  const closeWorkspace = () => {
    setActiveWorkspaceId(null);
    setActiveWorkspace(null);
    localStorage.removeItem(ACTIVE_WORKSPACE_KEY);
  };

  const renameWorkspace = (id: string, newName: string) => {
    const newIndex = index.map((m) =>
      m.id === id ? { ...m, name: newName, updatedAt: Date.now() } : m,
    );
    setIndex(newIndex);
    saveIndex(newIndex);
  };

  const deleteWorkspace = (id: string) => {
    const newIndex = index.filter((m) => m.id !== id);
    setIndex(newIndex);
    saveIndex(newIndex);
    localStorage.removeItem(workspaceKey(id));

    if (activeWorkspaceId === id) {
      const next = newIndex[0] ?? null;
      if (next) {
        openWorkspace(next.id);
      } else {
        setActiveWorkspaceId(null);
        setActiveWorkspace(null);
        localStorage.removeItem(ACTIVE_WORKSPACE_KEY);
      }
    }
  };

  function mutateActiveWorkspace(fn: (data: WorkspaceData) => WorkspaceData) {
    if (!activeWorkspaceId || !activeWorkspace) return;
    const updated = fn(activeWorkspace);
    setActiveWorkspace(updated);
    saveWorkspaceData(activeWorkspaceId, updated);

    const now = Date.now();
    const newIndex = index.map((m) =>
      m.id === activeWorkspaceId ? { ...m, updatedAt: now } : m,
    );
    setIndex(newIndex);
    saveIndex(newIndex);
  }

  const addDocument = () => {
    const doc: WorkspaceDocument = {
      id: crypto.randomUUID(),
      title: "Untitled Document",
      content: "",
      updatedAt: Date.now(),
    };
    mutateActiveWorkspace((data) => ({
      ...data,
      documents: [...data.documents, doc],
      activeDocumentId: doc.id,
    }));
  };

  const createDocumentWithTitle = (title: string): string => {
    const doc: WorkspaceDocument = {
      id: crypto.randomUUID(),
      title,
      content: "",
      updatedAt: Date.now(),
    };
    mutateActiveWorkspace((data) => ({
      ...data,
      documents: [...data.documents, doc],
      activeDocumentId: doc.id,
    }));
    return doc.id;
  };

  const updateDocument = (
    id: string,
    patch: Partial<Pick<WorkspaceDocument, "title" | "content">>,
  ) => {
    mutateActiveWorkspace((data) => ({
      ...data,
      documents: data.documents.map((d) =>
        d.id === id ? { ...d, ...patch, updatedAt: Date.now() } : d,
      ),
    }));
  };

  const deleteDocument = (id: string) => {
    mutateActiveWorkspace((data) => {
      const remaining = data.documents.filter((d) => d.id !== id);
      let newActiveId = data.activeDocumentId;
      if (newActiveId === id) {
        newActiveId = remaining[0]?.id ?? null;
      }
      return { documents: remaining, activeDocumentId: newActiveId };
    });
  };

  const setActiveDocumentId = (id: string) => {
    mutateActiveWorkspace((data) => ({ ...data, activeDocumentId: id }));
  };

  return (
    <WorkspacesContext.Provider
      value={{
        index,
        activeWorkspaceId,
        activeWorkspace,
        activeDocument,
        createWorkspace,
        openWorkspace,
        deleteWorkspace,
        renameWorkspace,
        closeWorkspace,
        addDocument,
        createDocumentWithTitle,
        updateDocument,
        deleteDocument,
        setActiveDocumentId,
      }}
    >
      {children}
    </WorkspacesContext.Provider>
  );
}

export function useWorkspaces(): WorkspacesContextValue {
  const ctx = useContext(WorkspacesContext);
  if (!ctx)
    throw new Error("useWorkspaces must be used within a WorkspacesProvider");
  return ctx;
}
