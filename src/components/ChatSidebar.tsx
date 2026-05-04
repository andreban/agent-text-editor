// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0
import { useMemo, useState } from "react";
import { diffWords } from "diff";
import {
  ChatInput,
  InlineApproval,
  MessageList,
  useAgent,
  type MentionItem,
  type MentionSegment,
  type PendingApproval,
  type ToolEventEntry,
} from "@mast-ai/react-ui";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";
import { Label } from "./ui/label";
import { Settings, Wand2, Sun, Moon, ArrowRightToLine } from "lucide-react";
import { useEditorUI } from "@/lib/store";
import type { Suggestion } from "@/lib/store";
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

function renderApprovalWithDocs(docs: { id: string; title: string }[]) {
  return (entry: ToolEventEntry, approval: PendingApproval) => {
    const description = workspaceApprovalDescription(entry, docs);
    if (description) {
      return (
        <WorkspaceApprovalCard description={description} approval={approval} />
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
  };
}

function getToolLabel(entry: ToolEventEntry) {
  if (entry.name === "delegate_to_skill") {
    return (entry.args as { skillName?: string } | undefined)?.skillName;
  }
  return undefined;
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

function lineCount(text: string): number {
  if (text === "") return 0;
  return text.split("\n").length;
}

function lineRangeLabel(startLine: number, count: number): string {
  if (count <= 1) return `Line ${startLine}`;
  return `Lines ${startLine}–${startLine + count - 1}`;
}

function SuggestionDiff({ suggestion }: { suggestion: Suggestion }) {
  const {
    originalText,
    replacementText,
    contextBefore,
    contextAfter,
    startLine,
    revealInEditor,
  } = suggestion;
  const beforeCount = lineCount(originalText);
  const afterCount = lineCount(replacementText);
  const contextBeforeCount = lineCount(contextBefore);
  const contextBeforeStart = startLine - contextBeforeCount;
  const contextAfterStart = startLine + beforeCount;

  const changes = diffWords(originalText, replacementText);
  const beforeParts = changes.filter((c) => !c.added);
  const afterParts = changes.filter((c) => !c.removed);

  const gutterWidth = "w-10";

  return (
    <div className="overflow-hidden rounded border font-mono text-xs">
      <div className="bg-muted/50 flex items-center justify-between gap-2 border-b px-2 py-1">
        <span className="text-muted-foreground">
          {beforeCount === 0 && afterCount > 0
            ? lineRangeLabel(startLine, afterCount)
            : lineRangeLabel(startLine, beforeCount)}
        </span>
        {revealInEditor && (
          <button
            type="button"
            onClick={revealInEditor}
            className="text-muted-foreground hover:text-foreground hover:bg-accent inline-flex items-center gap-1 rounded px-1.5 py-0.5"
            title="Scroll editor to this location"
          >
            <ArrowRightToLine className="size-3" />
            <span>Reveal</span>
          </button>
        )}
      </div>
      {contextBefore && (
        <div className="bg-muted/30 text-muted-foreground/70 flex break-all whitespace-pre-wrap">
          <span
            className={`${gutterWidth} text-muted-foreground/60 shrink-0 border-r px-2 py-1.5 text-right select-none`}
          >
            {Array.from(
              { length: contextBeforeCount },
              (_, i) => contextBeforeStart + i,
            ).join("\n")}
          </span>
          <span className="px-2 py-1.5">{contextBefore}</span>
        </div>
      )}
      <div className="flex bg-red-50 break-all whitespace-pre-wrap dark:bg-red-950/30">
        <span
          className={`${gutterWidth} shrink-0 border-r border-red-200 px-2 py-1.5 text-right text-red-400 select-none dark:border-red-900`}
        >
          {Array.from({ length: beforeCount }, (_, i) => startLine + i).join(
            "\n",
          )}
        </span>
        <span className="flex gap-2 px-2 py-1.5 text-red-800 dark:text-red-300">
          <span className="shrink-0 text-red-400 select-none">-</span>
          <span>
            {beforeParts.map((part, i) =>
              part.removed ? (
                <mark
                  key={i}
                  className="rounded-[2px] bg-red-200 px-[1px] text-red-900 dark:bg-red-800/70 dark:text-red-100"
                >
                  {part.value}
                </mark>
              ) : (
                <span key={i}>{part.value}</span>
              ),
            )}
          </span>
        </span>
      </div>
      <div className="flex bg-green-50 break-all whitespace-pre-wrap dark:bg-green-950/30">
        <span
          className={`${gutterWidth} shrink-0 border-r border-green-200 px-2 py-1.5 text-right text-green-500 select-none dark:border-green-900`}
        >
          {Array.from({ length: afterCount }, (_, i) => startLine + i).join(
            "\n",
          )}
        </span>
        <span className="flex gap-2 px-2 py-1.5 text-green-800 dark:text-green-300">
          <span className="shrink-0 text-green-500 select-none">+</span>
          <span>
            {afterParts.map((part, i) =>
              part.added ? (
                <mark
                  key={i}
                  className="rounded-[2px] bg-green-200 px-[1px] text-green-900 dark:bg-green-800/70 dark:text-green-100"
                >
                  {part.value}
                </mark>
              ) : (
                <span key={i}>{part.value}</span>
              ),
            )}
          </span>
        </span>
      </div>
      {contextAfter && (
        <div className="bg-muted/30 text-muted-foreground/70 flex break-all whitespace-pre-wrap">
          <span
            className={`${gutterWidth} text-muted-foreground/60 shrink-0 border-r px-2 py-1.5 text-right select-none`}
          >
            {Array.from(
              { length: lineCount(contextAfter) },
              (_, i) => contextAfterStart + i,
            ).join("\n")}
          </span>
          <span className="px-2 py-1.5">{contextAfter}</span>
        </div>
      )}
    </div>
  );
}

export function ChatSidebar() {
  const { messages } = useAgent();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const { approveAll, setApproveAll, suggestions, setSuggestions } =
    useEditorUI();
  const { theme, toggleTheme } = useTheme();
  const { activeWorkspace } = useWorkspaces();

  const pendingSuggestion =
    suggestions.find((s) => s.status === "pending") ?? null;

  const mentionItems = useMemo<MentionItem[]>(
    () =>
      (activeWorkspace?.documents ?? []).map((d) => ({
        id: d.id,
        label: d.title,
      })),
    [activeWorkspace],
  );

  const renderApproval = useMemo(
    () =>
      renderApprovalWithDocs(
        (activeWorkspace?.documents ?? []).map((d) => ({
          id: d.id,
          title: d.title,
        })),
      ),
    [activeWorkspace],
  );

  const handleAccept = () => {
    if (!pendingSuggestion) return;
    pendingSuggestion.resolve("applied");
  };

  const handleReject = () => {
    if (!pendingSuggestion) return;
    pendingSuggestion.resolve("rejected");
    setSuggestions((prev) =>
      prev.map((s) =>
        s.id === pendingSuggestion.id ? { ...s, status: "rejected" } : s,
      ),
    );
  };

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
          <MessageList
            getToolLabel={getToolLabel}
            renderApproval={renderApproval}
          />
        )}
      </div>

      <PlanConfirmationWidget />

      {pendingSuggestion && (
        <div className="space-y-2 border-t p-3">
          <p className="text-xs font-semibold">Proposed Edit</p>
          <div className="max-h-56 overflow-y-auto">
            <SuggestionDiff suggestion={pendingSuggestion} />
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" onClick={handleAccept}>
              Accept
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={handleReject}
            >
              Reject
            </Button>
          </div>
        </div>
      )}

      <ChatInput
        placeholder="Ask the editor... (@ to reference a doc)"
        mentions={{ items: mentionItems, buildPrompt }}
      />
    </div>
  );
}
