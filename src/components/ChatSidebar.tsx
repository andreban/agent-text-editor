// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0
import { useMemo, useState } from "react";
import {
  ChatInput,
  InlineApproval,
  MessageList,
  ToolCallBlock,
  useAgent,
  type MentionItem,
  type MentionSegment,
  type PendingApproval,
  type ToolEventEntry,
} from "@mast-ai/react-ui";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";
import { Label } from "./ui/label";
import { Settings, Wand2, Sun, Moon } from "lucide-react";
import { useEditorUI } from "@/lib/store";
import { useTheme } from "@/lib/ThemeProvider";
import { useWorkspaces } from "@/lib/WorkspacesContext";
import { SettingsDialog } from "./SettingsDialog";
import { SkillsDialog } from "./SkillsDialog";
import { PlanConfirmationWidget } from "./PlanConfirmationWidget";

function workspaceApprovalDescription(
  entry: ToolEventEntry,
  docs: { id: string; title: string }[],
): string | null {
  if (entry.name === "create_document") {
    const args = entry.args as { title?: string } | undefined;
    if (args?.title) return `Create document "${args.title}"`;
  }
  if (entry.name === "rename_document") {
    const args = entry.args as { id?: string; title?: string } | undefined;
    const doc = docs.find((d) => d.id === args?.id);
    if (doc && args?.title)
      return `Rename document "${doc.title}" to "${args.title}"`;
  }
  if (entry.name === "delete_document") {
    const args = entry.args as { id?: string } | undefined;
    const doc = docs.find((d) => d.id === args?.id);
    if (doc) return `Delete document "${doc.title}"`;
  }
  return null;
}

function WorkspaceApprovalCard({
  description,
  approval,
}: {
  description: string;
  approval: PendingApproval;
}) {
  return (
    <div className="my-2 rounded-md border border-border bg-muted/30 p-3 text-sm">
      <p className="mb-3">{description}</p>
      <div className="flex gap-2">
        <Button size="sm" onClick={approval.approve}>
          Approve
        </Button>
        <Button size="sm" variant="outline" onClick={approval.reject}>
          Reject
        </Button>
      </div>
    </div>
  );
}

function renderToolCallWithDocs(docs: { id: string; title: string }[]) {
  return (entry: ToolEventEntry, approval?: PendingApproval) => {
    if (approval) {
      const description = workspaceApprovalDescription(entry, docs);
      if (description) {
        return (
          <WorkspaceApprovalCard
            description={description}
            approval={approval}
          />
        );
      }
      return (
        <InlineApproval
          entry={entry}
          approve={approval.approve}
          reject={approval.reject}
          respondWith={approval.respondWith}
        />
      );
    }
    if (entry.name === "delegate_to_skill") {
      const args = entry.args as { skillName?: string } | undefined;
      if (args?.skillName) {
        return <ToolCallBlock entry={{ ...entry, name: args.skillName }} />;
      }
    }
    return <ToolCallBlock entry={entry} />;
  };
}

// Prepend a "the user has referenced..." preamble so the LLM can use
// document IDs directly without calling list_workspace_docs. Mirrors the
// previous bespoke `buildPromptWithMentions` exactly.
function buildPrompt(segments: MentionSegment[], trailing: string): string {
  const inlineText =
    segments.map((s) => `${s.text}@${s.item.label}`).join("") + trailing;
  if (segments.length === 0) return inlineText;
  const docList = segments
    .map((s) => `"${s.item.label}" (id: ${s.item.id})`)
    .join(", ");
  return `The user has referenced the following documents: ${docList}.\n\n${inlineText}`;
}

export function ChatSidebar() {
  const { messages } = useAgent();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const { approveAll, setApproveAll } = useEditorUI();
  const { theme, toggleTheme } = useTheme();
  const { activeWorkspace } = useWorkspaces();

  const mentionItems = useMemo<MentionItem[]>(
    () =>
      (activeWorkspace?.documents ?? []).map((d) => ({
        id: d.id,
        label: d.title,
      })),
    [activeWorkspace],
  );

  const renderToolCall = useMemo(
    () =>
      renderToolCallWithDocs(
        (activeWorkspace?.documents ?? []).map((d) => ({
          id: d.id,
          title: d.title,
        })),
      ),
    [activeWorkspace],
  );

  return (
    <div
      data-mast-root
      data-mast-theme={theme}
      className="flex flex-col h-full bg-muted/20 border-l"
    >
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <SkillsDialog open={skillsOpen} onOpenChange={setSkillsOpen} />
      <div className="p-4 border-b flex justify-between items-center gap-4">
        <span className="text-sm font-medium whitespace-nowrap">
          AI Assistant
        </span>
        <div className="flex items-center gap-2 text-xs text-muted-foreground ml-auto">
          <div className="flex items-center space-x-2 min-h-11">
            <Switch
              id="approve-all"
              checked={approveAll}
              onCheckedChange={setApproveAll}
            />
            <Label htmlFor="approve-all" className="text-xs">
              Approve All
            </Label>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11"
            onClick={toggleTheme}
            aria-label={
              theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
            }
          >
            {theme === "dark" ? (
              <Sun className="w-4 h-4" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11"
            onClick={() => setSkillsOpen(true)}
            aria-label="Open skills"
          >
            <Wand2 className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11"
            onClick={() => setSettingsOpen(true)}
            aria-label="Open settings"
          >
            <Settings className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        {messages.length === 0 ? (
          <div className="text-sm text-muted-foreground italic text-center mt-4 p-4">
            Start a conversation with the editor assistant.
          </div>
        ) : (
          <MessageList renderToolCall={renderToolCall} />
        )}
      </div>

      <PlanConfirmationWidget />

      <ChatInput
        placeholder="Ask the editor... (@ to reference a doc)"
        mentions={{ items: mentionItems, buildPrompt }}
      />
    </div>
  );
}
