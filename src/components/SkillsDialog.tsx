// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";
import { v4 as uuidv4 } from "uuid";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApp } from "@/lib/store";
import { Skill } from "@/lib/skills";
import { Pencil, Trash2 } from "lucide-react";

interface SkillsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface EditState {
  skill: Partial<Skill> & { id?: string };
  isNew: boolean;
}

function SkillsForm({
  onOpenChange,
}: {
  onOpenChange: (open: boolean) => void;
}) {
  const { skills, setSkills, modelName } = useApp();
  const [editState, setEditState] = useState<EditState | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const openCreate = () => {
    setEditState({
      skill: { name: "", description: "", instructions: "", model: "" },
      isNew: true,
    });
    setValidationError(null);
  };

  const openEdit = (skill: Skill) => {
    setEditState({ skill: { ...skill }, isNew: false });
    setValidationError(null);
  };

  const cancelEdit = () => {
    setEditState(null);
    setValidationError(null);
  };

  const handleSave = () => {
    if (!editState) return;
    const { skill, isNew } = editState;
    const name = skill.name?.trim() ?? "";
    const description = skill.description?.trim() ?? "";
    const instructions = skill.instructions?.trim() ?? "";

    if (!name) {
      setValidationError("Name is required.");
      return;
    }
    const duplicate = skills.some((s) => s.name === name && s.id !== skill.id);
    if (duplicate) {
      setValidationError(`A skill named "${name}" already exists.`);
      return;
    }
    if (!description) {
      setValidationError("Description is required.");
      return;
    }
    if (!instructions) {
      setValidationError("Instructions are required.");
      return;
    }

    const saved: Skill = {
      id: isNew ? uuidv4() : skill.id!,
      name,
      description,
      instructions,
      model: skill.model?.trim() || undefined,
    };

    if (isNew) {
      setSkills([...skills, saved]);
    } else {
      setSkills(skills.map((s) => (s.id === saved.id ? saved : s)));
    }
    setEditState(null);
    setValidationError(null);
  };

  const handleDelete = (id: string) => {
    setSkills(skills.filter((s) => s.id !== id));
    setDeleteConfirmId(null);
  };

  if (editState) {
    const { skill, isNew } = editState;
    return (
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isNew ? "New Skill" : "Edit Skill"}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="skill-name">Name</Label>
            <Input
              id="skill-name"
              value={skill.name ?? ""}
              onChange={(e) =>
                setEditState((prev) =>
                  prev
                    ? {
                        ...prev,
                        skill: { ...prev.skill, name: e.target.value },
                      }
                    : prev,
                )
              }
              placeholder="e.g. Style Guide Reviewer"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="skill-description">Description</Label>
            <Input
              id="skill-description"
              value={skill.description ?? ""}
              onChange={(e) =>
                setEditState((prev) =>
                  prev
                    ? {
                        ...prev,
                        skill: { ...prev.skill, description: e.target.value },
                      }
                    : prev,
                )
              }
              placeholder="One-line description of what this skill does"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="skill-model">Model override (optional)</Label>
            <Input
              id="skill-model"
              value={skill.model ?? ""}
              onChange={(e) =>
                setEditState((prev) =>
                  prev
                    ? {
                        ...prev,
                        skill: { ...prev.skill, model: e.target.value },
                      }
                    : prev,
                )
              }
              placeholder={`Leave blank to use session model (${modelName})`}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="skill-instructions">Instructions</Label>
            <textarea
              id="skill-instructions"
              value={skill.instructions ?? ""}
              onChange={(e) =>
                setEditState((prev) =>
                  prev
                    ? {
                        ...prev,
                        skill: { ...prev.skill, instructions: e.target.value },
                      }
                    : prev,
                )
              }
              rows={8}
              placeholder="System instructions for the sub-agent…"
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
            />
          </div>

          {validationError && (
            <p className="text-sm text-destructive">{validationError}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={cancelEdit}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    );
  }

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Skills</DialogTitle>
      </DialogHeader>

      <div className="flex flex-col gap-2 py-2 max-h-[60vh] overflow-y-auto">
        {skills.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No skills yet. Add one to get started.
          </p>
        )}
        {skills.map((skill) => (
          <div
            key={skill.id}
            className="flex items-start justify-between gap-2 rounded-lg border border-border p-3"
          >
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{skill.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                {skill.description}
              </p>
              {skill.model && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Model: <code className="font-mono">{skill.model}</code>
                </p>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {deleteConfirmId === skill.id ? (
                <>
                  <span className="text-xs text-destructive mr-1">Delete?</span>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-8 px-2 text-xs"
                    onClick={() => handleDelete(skill.id)}
                  >
                    Yes
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-2 text-xs"
                    onClick={() => setDeleteConfirmId(null)}
                  >
                    No
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => openEdit(skill)}
                    aria-label={`Edit ${skill.name}`}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => setDeleteConfirmId(skill.id)}
                    aria-label={`Delete ${skill.name}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <DialogFooter className="justify-between sm:justify-between">
        <Button variant="outline" onClick={openCreate}>
          Add Skill
        </Button>
        <Button onClick={() => onOpenChange(false)}>Done</Button>
      </DialogFooter>
    </DialogContent>
  );
}

export function SkillsDialog({ open, onOpenChange }: SkillsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <SkillsForm onOpenChange={onOpenChange} />}
    </Dialog>
  );
}
