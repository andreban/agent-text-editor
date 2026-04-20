// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";
import { Pencil, Trash2, FolderOpen, Check, X, Plus } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./ui/dialog";
import { useWorkspaces } from "@/lib/WorkspacesContext";
import { WorkspaceMeta } from "@/lib/workspace";

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function WorkspaceRow({
  workspace,
  onDelete,
}: {
  workspace: WorkspaceMeta;
  onDelete: (id: string) => void;
}) {
  const { openWorkspace, renameWorkspace } = useWorkspaces();
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(workspace.name);

  const commitRename = () => {
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== workspace.name) {
      renameWorkspace(workspace.id, trimmed);
    } else {
      setDraftName(workspace.name);
    }
    setEditing(false);
  };

  const cancelRename = () => {
    setDraftName(workspace.name);
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border bg-card hover:bg-muted/40 transition-colors">
      {editing ? (
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <Input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") cancelRename();
            }}
            className="h-8 text-sm"
          />
          <button
            onClick={commitRename}
            aria-label="Confirm rename"
            className="text-primary hover:text-primary/80 shrink-0"
          >
            <Check className="w-4 h-4" />
          </button>
          <button
            onClick={cancelRename}
            aria-label="Cancel rename"
            className="text-muted-foreground hover:text-foreground shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{workspace.name}</p>
            <p className="text-xs text-muted-foreground">
              Modified {formatDate(workspace.updatedAt)}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              aria-label={`Rename ${workspace.name}`}
              onClick={() => setEditing(true)}
            >
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              aria-label={`Delete ${workspace.name}`}
              onClick={() => onDelete(workspace.id)}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
            <Button
              size="sm"
              className="h-8 gap-1.5"
              aria-label={`Open ${workspace.name}`}
              onClick={() => openWorkspace(workspace.id)}
            >
              <FolderOpen className="w-3.5 h-3.5" />
              Open
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export function WorkspacePicker() {
  const { index, createWorkspace, deleteWorkspace } = useWorkspaces();
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newName, setNewName] = useState("");
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;
    createWorkspace(name);
    setNewName("");
    setShowNewDialog(false);
  };

  const handleDeleteConfirm = () => {
    if (deleteTargetId) {
      deleteWorkspace(deleteTargetId);
    }
    setDeleteTargetId(null);
  };

  const deleteTarget = index.find((w) => w.id === deleteTargetId);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background px-4">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Workspaces</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Select a workspace to open or create a new one.
          </p>
        </div>

        <div className="flex flex-col gap-2 mb-4">
          {index.length === 0 ? (
            <p className="text-sm text-muted-foreground italic text-center py-6">
              No workspaces yet. Create one to get started.
            </p>
          ) : (
            index.map((ws) => (
              <WorkspaceRow
                key={ws.id}
                workspace={ws}
                onDelete={(id) => setDeleteTargetId(id)}
              />
            ))
          )}
        </div>

        <Button className="w-full gap-2" onClick={() => setShowNewDialog(true)}>
          <Plus className="w-4 h-4" />
          New Workspace
        </Button>
      </div>

      {/* New workspace dialog */}
      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Workspace</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              autoFocus
              placeholder="Workspace name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!newName.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog
        open={deleteTargetId !== null}
        onOpenChange={(open) => !open && setDeleteTargetId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Workspace</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              Delete{" "}
              <span className="font-medium text-foreground">
                {deleteTarget?.name}
              </span>{" "}
              and all its documents? This cannot be undone.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTargetId(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
