// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { useState, useRef } from "react";
import { Button } from "./ui/button";
import { Trash2, ChevronDown, ChevronRight, Plus } from "lucide-react";
import { useWorkspaces } from "@/lib/WorkspacesContext";
import { WorkspaceDocument } from "@/lib/workspace";

const DEBOUNCE_MS = 500;

function DocEditor({ doc }: { doc: WorkspaceDocument }) {
  const { updateDocument } = useWorkspaces();
  const [title, setTitle] = useState(doc.title);
  const [content, setContent] = useState(doc.content);
  const titleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTitleChange = (value: string) => {
    setTitle(value);
    if (titleTimerRef.current) clearTimeout(titleTimerRef.current);
    titleTimerRef.current = setTimeout(() => {
      updateDocument(doc.id, { title: value });
    }, DEBOUNCE_MS);
  };

  const handleContentChange = (value: string) => {
    setContent(value);
    if (contentTimerRef.current) clearTimeout(contentTimerRef.current);
    contentTimerRef.current = setTimeout(() => {
      updateDocument(doc.id, { content: value });
    }, DEBOUNCE_MS);
  };

  return (
    <div className="flex flex-col gap-2 mt-2 px-1">
      <input
        aria-label="Document title"
        className="w-full text-sm font-medium bg-transparent border-b border-border focus:outline-none focus:border-primary py-1"
        value={title}
        onChange={(e) => handleTitleChange(e.target.value)}
      />
      <textarea
        aria-label="Document content"
        className="w-full min-h-[160px] text-xs font-mono bg-muted/30 border border-border rounded p-2 resize-y focus:outline-none focus:ring-1 focus:ring-ring"
        value={content}
        onChange={(e) => handleContentChange(e.target.value)}
        placeholder="Write your notes here (Markdown supported)..."
      />
    </div>
  );
}

function DocRow({ doc }: { doc: WorkspaceDocument }) {
  const { deleteDocument } = useWorkspaces();
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-border rounded-md overflow-hidden">
      <div className="flex items-center gap-1 px-2 py-2 bg-muted/20 hover:bg-muted/40">
        <button
          className="flex-1 flex items-center gap-2 text-sm text-left min-w-0"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? (
            <ChevronDown className="w-3 h-3 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-3 h-3 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate">{doc.title || "Untitled"}</span>
        </button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={() => deleteDocument(doc.id)}
          aria-label={`Delete ${doc.title || "document"}`}
        >
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
      {expanded && <DocEditor doc={doc} />}
    </div>
  );
}

export function ReferenceTab() {
  const { activeWorkspace, addDocument } = useWorkspaces();
  const docs = activeWorkspace?.documents ?? [];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <span className="text-sm font-medium">Reference Documents</span>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1 text-xs"
          onClick={addDocument}
          aria-label="New document"
        >
          <Plus className="w-3 h-3" />
          New
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        {docs.length === 0 ? (
          <p className="text-xs text-muted-foreground italic text-center mt-4">
            No reference documents yet. Click &ldquo;New&rdquo; to create one.
          </p>
        ) : (
          docs.map((doc) => <DocRow key={doc.id} doc={doc} />)
        )}
      </div>
    </div>
  );
}
