// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { useState, useRef, useEffect } from "react";
import { Button } from "./ui/button";
import { Trash2, Plus, Pencil } from "lucide-react";
import { useWorkspaces } from "@/lib/WorkspacesContext";
import { WorkspaceDocument } from "@/lib/workspace";

function DocRow({
  doc,
  isActive,
  onSelect,
}: {
  doc: WorkspaceDocument;
  isActive: boolean;
  onSelect: () => void;
}) {
  const { updateDocument, deleteDocument, activeWorkspace } = useWorkspaces();
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(doc.title);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const startEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditValue(doc.title);
    setEditing(true);
  };

  const commitEdit = () => {
    const trimmed = (inputRef.current?.value ?? editValue).trim();
    if (trimmed && trimmed !== doc.title) {
      updateDocument(doc.id, { title: trimmed });
    }
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.stopPropagation();
      commitEdit();
    }
    if (e.key === "Escape") setEditing(false);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    const hasContent = doc.content.trim().length > 0;
    const docCount = activeWorkspace?.documents.length ?? 0;
    if (hasContent && docCount > 1) {
      setConfirmDelete(true);
    } else {
      deleteDocument(doc.id);
    }
  };

  const cancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDelete(false);
  };

  const confirmAndDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    deleteDocument(doc.id);
  };

  if (confirmDelete) {
    return (
      <div
        className="flex items-center gap-1 px-2 py-2 rounded border border-destructive/50 bg-destructive/10"
        role="group"
        aria-label={`Confirm delete ${doc.title || "document"}`}
      >
        <span className="flex-1 text-xs text-destructive truncate">
          Delete &ldquo;{doc.title || "Untitled"}&rdquo;?
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs text-destructive hover:bg-destructive/20"
          onClick={confirmAndDelete}
          aria-label="Confirm delete"
        >
          Delete
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={cancelDelete}
          aria-label="Cancel delete"
        >
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <div
      className={`group flex items-center gap-1 px-2 py-2 rounded cursor-pointer ${
        isActive
          ? "bg-primary/15 text-primary font-medium"
          : "hover:bg-muted/60 text-foreground"
      }`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onSelect()}
      aria-label={`Open ${doc.title || "Untitled"}`}
      aria-current={isActive ? "true" : undefined}
    >
      {editing ? (
        <input
          ref={inputRef}
          className="flex-1 min-w-0 text-sm bg-transparent border-b border-primary focus:outline-none"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={handleKeyDown}
          onClick={(e) => e.stopPropagation()}
          aria-label="Rename document"
        />
      ) : (
        <span className="flex-1 min-w-0 text-sm truncate">
          {doc.title || "Untitled"}
        </span>
      )}
      {!editing && (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"
            onClick={startEdit}
            aria-label={`Rename ${doc.title || "document"}`}
          >
            <Pencil className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
            onClick={handleDelete}
            aria-label={`Delete ${doc.title || "document"}`}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </>
      )}
    </div>
  );
}

export function WorkspacePanel() {
  const {
    activeWorkspace,
    activeDocument,
    addDocument,
    setActiveDocumentId,
    index,
    activeWorkspaceId,
  } = useWorkspaces();
  const docs = activeWorkspace?.documents ?? [];
  const workspaceName =
    index.find((m) => m.id === activeWorkspaceId)?.name ?? "Workspace";

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b shrink-0">
        <span className="text-xs font-medium text-muted-foreground truncate flex-1">
          {workspaceName}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={addDocument}
          aria-label="New document"
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-0.5">
        {docs.length === 0 ? (
          <p className="text-xs text-muted-foreground italic text-center mt-4">
            No documents yet.
          </p>
        ) : (
          docs.map((doc) => (
            <DocRow
              key={doc.id}
              doc={doc}
              isActive={doc.id === activeDocument?.id}
              onSelect={() => setActiveDocumentId(doc.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
