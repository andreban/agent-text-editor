// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useTheme, Theme } from "@/lib/ThemeProvider";
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
import { useAgentConfig } from "@/lib/store";

const MODELS = [
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  {
    id: "gemini-3.1-flash-lite-preview",
    label: "Gemini 3.1 Flash Lite (Preview)",
  },
  { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (Preview)" },
  { id: "gemini-3-flash-preview", label: "Gemini 3 Flash (Preview)" },
];

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Rendered only while open — mounts fresh each time so state initialises from the store.
function SettingsForm({
  onOpenChange,
}: {
  onOpenChange: (open: boolean) => void;
}) {
  const { apiKey, setApiKey, modelName, setModelName } = useAgentConfig();
  const { theme: currentTheme, setTheme } = useTheme();
  const [draftKey, setDraftKey] = useState(apiKey ?? "");
  const [draftModel, setDraftModel] = useState(modelName);
  const [draftTheme, setDraftTheme] = useState<Theme>(currentTheme);
  const [showKey, setShowKey] = useState(false);

  const handleSave = () => {
    setApiKey(draftKey.trim() || null);
    setModelName(draftModel);
    setTheme(draftTheme);
    onOpenChange(false);
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Settings</DialogTitle>
      </DialogHeader>

      <div className="flex flex-col gap-4 py-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="settings-api-key">Gemini API Key</Label>
          <div className="relative">
            <Input
              id="settings-api-key"
              type={showKey ? "text" : "password"}
              placeholder="Enter your API key"
              value={draftKey}
              onChange={(e) => setDraftKey(e.target.value)}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={showKey ? "Hide API key" : "Show API key"}
            >
              {showKey ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="settings-model">Model</Label>
          <select
            id="settings-model"
            value={draftModel}
            onChange={(e) => setDraftModel(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <Label>Theme</Label>
          <div className="flex gap-2">
            {(["light", "dark"] as Theme[]).map((t) => (
              <Button
                key={t}
                variant={draftTheme === t ? "default" : "outline"}
                onClick={() => setDraftTheme(t)}
                className="flex-1 capitalize"
              >
                {t}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button onClick={handleSave}>Save</Button>
      </DialogFooter>
    </DialogContent>
  );
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <SettingsForm onOpenChange={onOpenChange} />}
    </Dialog>
  );
}
