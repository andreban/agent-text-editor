// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0
import { useState, useCallback, useRef, Fragment } from "react";
import {
  MessageList,
  ToolCallBlock,
  useAgent,
  type ToolEventEntry,
} from "@mast-ai/react-ui";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";
import { Label } from "./ui/label";
import { Settings, Wand2, Sun, Moon, X } from "lucide-react";
import { useAgentConfig, useEditorUI } from "@/lib/store";
import { useTheme } from "@/lib/ThemeProvider";
import { useWorkspaces } from "@/lib/WorkspacesContext";
import { SettingsDialog } from "./SettingsDialog";
import { SkillsDialog } from "./SkillsDialog";
import { PlanConfirmationWidget } from "./PlanConfirmationWidget";
import {
  DocRef,
  Segment,
  buildPromptWithMentions,
  extractMentionQuery,
} from "@/lib/mentionUtils";

function renderToolCall(entry: ToolEventEntry) {
  if (entry.name === "delegate_to_skill") {
    const args = entry.args as { skillName?: string } | undefined;
    if (args?.skillName) {
      return <ToolCallBlock entry={{ ...entry, name: args.skillName }} />;
    }
  }
  return <ToolCallBlock entry={entry} />;
}

export function ChatSidebar() {
  const { messages, isRunning, sendMessage, cancel } = useAgent();
  const { apiKey } = useAgentConfig();

  const [trailingInput, setTrailingInput] = useState("");
  const [segments, setSegments] = useState<Segment[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [pickerIndex, setPickerIndex] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const { approveAll, setApproveAll } = useEditorUI();
  const { theme, toggleTheme } = useTheme();
  const { activeWorkspace } = useWorkspaces();

  const workspaceDocs = activeWorkspace?.documents ?? [];

  const filteredDocs =
    mentionQuery !== null
      ? workspaceDocs.filter(
          (d) =>
            !segments.some((s) => s.doc.id === d.id) &&
            d.title.toLowerCase().includes(mentionQuery.toLowerCase()),
        )
      : [];

  const selectDoc = (doc: DocRef) => {
    if (segments.some((s) => s.doc.id === doc.id)) return;
    const atIdx = trailingInput.lastIndexOf("@");
    const textBefore =
      atIdx >= 0 ? trailingInput.slice(0, atIdx) : trailingInput;
    setSegments((prev) => [...prev, { text: textBefore, doc }]);
    setTrailingInput("");
    setMentionQuery(null);
    setPickerIndex(0);
    inputRef.current?.focus();
  };

  const removeChip = (id: string) => {
    const idx = segments.findIndex((s) => s.doc.id === id);
    if (idx === -1) return;
    const removedText = segments[idx].text;
    const without = [...segments.slice(0, idx), ...segments.slice(idx + 1)];
    if (idx < without.length) {
      without[idx] = { ...without[idx], text: removedText + without[idx].text };
      setSegments(without);
    } else {
      setSegments(without);
      setTrailingInput((t) => removedText + t);
    }
  };

  const resizeTextarea = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setTrailingInput(value);
    const query = extractMentionQuery(value);
    setMentionQuery(query);
    setPickerIndex(0);
    resizeTextarea();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionQuery !== null && filteredDocs.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setPickerIndex((i) => (i + 1) % filteredDocs.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setPickerIndex((i) => (i === 0 ? filteredDocs.length - 1 : i - 1));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        selectDoc(filteredDocs[pickerIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionQuery(null);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    const displayText =
      segments.map((s) => `${s.text}@${s.doc.title}`).join("") + trailingInput;
    if (!displayText.trim() || isRunning || !apiKey) return;

    const prompt = buildPromptWithMentions(segments, trailingInput);

    setTrailingInput("");
    setSegments([]);
    setMentionQuery(null);
    if (inputRef.current) inputRef.current.style.height = "";

    sendMessage(prompt, displayText.trim());
  };

  const canSend =
    (trailingInput.trim().length > 0 || segments.length > 0) &&
    !isRunning &&
    !!apiKey;

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

      <div className="p-4 border-t bg-background/50 backdrop-blur-sm flex items-end gap-2">
        <div className="relative flex-1">
          {/* Document picker dropdown */}
          {mentionQuery !== null && filteredDocs.length > 0 && (
            <div
              className="absolute bottom-full mb-1 left-0 right-0 z-50 bg-popover border rounded-md shadow-md overflow-hidden"
              role="listbox"
              aria-label="Document picker"
            >
              {filteredDocs.map((doc, idx) => (
                <button
                  key={doc.id}
                  role="option"
                  aria-selected={idx === pickerIndex}
                  className={`w-full text-left px-3 py-2 text-sm truncate ${
                    idx === pickerIndex
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-muted"
                  }`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectDoc(doc);
                  }}
                >
                  {doc.title}
                </button>
              ))}
            </div>
          )}

          {/* Compound input: inline segment chips + trailing text field */}
          <div className="flex flex-wrap items-start gap-1 border rounded-md bg-background px-3 py-2 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-0">
            {segments.map((seg) => (
              <Fragment key={seg.doc.id}>
                {seg.text && <span className="text-sm">{seg.text}</span>}
                <span className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs font-medium rounded px-2 py-0.5">
                  @{seg.doc.title}
                  <button
                    type="button"
                    aria-label={`Remove reference to ${seg.doc.title}`}
                    onClick={() => removeChip(seg.doc.id)}
                    className="hover:text-destructive"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              </Fragment>
            ))}
            <textarea
              ref={inputRef}
              rows={4}
              placeholder={
                segments.length === 0
                  ? "Ask the editor... (@ to reference a doc)"
                  : ""
              }
              value={trailingInput}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              disabled={isRunning}
              className="w-full min-w-0 bg-transparent outline-none text-sm placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 resize-none overflow-hidden"
              aria-label="Chat input"
            />
          </div>
        </div>
        {isRunning ? (
          <Button variant="outline" onClick={cancel} className="min-h-11">
            Cancel
          </Button>
        ) : (
          <Button onClick={handleSend} disabled={!canSend} className="min-h-11">
            Send
          </Button>
        )}
      </div>
    </div>
  );
}
