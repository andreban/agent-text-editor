// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0
import { useState, useCallback, useRef, useEffect, Fragment } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";
import { Label } from "./ui/label";
import { Conversation } from "@mast-ai/core";
import { Settings, Wand2, Sun, Moon, X } from "lucide-react";
import { useApp } from "@/lib/store";
import { useTheme } from "@/lib/ThemeProvider";
import { useWorkspaces } from "@/lib/WorkspacesContext";
import { SettingsDialog } from "./SettingsDialog";
import { SkillsDialog } from "./SkillsDialog";
import { ChatItem, ChildItem, StreamItem } from "./ChatItem";
import {
  DocRef,
  Segment,
  buildPromptWithMentions,
  extractMentionQuery,
} from "@/lib/mentionUtils";

interface ChatSidebarProps {
  conversation: Conversation | null;
  onBeforeSend?: () => void;
}

export function ChatSidebar({ conversation, onBeforeSend }: ChatSidebarProps) {
  const [trailingInput, setTrailingInput] = useState("");
  const [segments, setSegments] = useState<Segment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [items, setItems] = useState<StreamItem[]>([]);
  const [expandedThoughts, setExpandedThoughts] = useState<Set<string>>(
    new Set(),
  );
  const [prevConversation, setPrevConversation] = useState<Conversation | null>(
    null,
  );
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [pickerIndex, setPickerIndex] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const { approveAll, setApproveAll } = useApp();
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

  // Rebuild display items when the conversation instance changes (e.g. new session)
  if (conversation !== prevConversation) {
    setPrevConversation(conversation);
    if (conversation && conversation.history.length > 0) {
      const rebuilt: StreamItem[] = conversation.history.flatMap((m, i) => {
        if (m.content.type === "text") {
          return [
            {
              kind: m.role === "user" ? "user" : "assistant",
              id: `hist-${i}`,
              text: m.content.text,
              ...(m.role === "assistant"
                ? { thought: "", isStreaming: false }
                : {}),
            } as StreamItem,
          ];
        }
        if (m.content.type === "tool_calls") {
          return m.content.calls.map(
            (c, j): StreamItem => ({
              kind: "tool",
              id: `hist-${i}-${j}`,
              name: c.name,
              pending: false,
            }),
          );
        }
        return [];
      });
      setItems(rebuilt);
    }
  }

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 80,
    overscan: 5,
  });

  const scrollToBottom = useCallback(() => {
    if (items.length > 0) {
      virtualizer.scrollToIndex(items.length - 1, { align: "end" });
    }
  }, [items.length, virtualizer]);

  useEffect(() => {
    scrollToBottom();
  }, [items, scrollToBottom]);

  const toggleThought = (id: string) => {
    setExpandedThoughts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectDoc = (doc: DocRef) => {
    if (segments.some((s) => s.doc.id === doc.id)) return;
    const atIdx = trailingInput.lastIndexOf("@");
    const textBefore = atIdx >= 0 ? trailingInput.slice(0, atIdx) : trailingInput;
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

  const handleSend = async () => {
    const displayText =
      segments.map((s) => `${s.text}@${s.doc.title}`).join("") + trailingInput;
    if (!displayText.trim() || !conversation || isLoading) return;

    const prompt = buildPromptWithMentions(segments, trailingInput);

    setTrailingInput("");
    setSegments([]);
    setMentionQuery(null);
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    setIsLoading(true);
    if (inputRef.current) inputRef.current.style.height = "";

    setItems((prev) => [
      ...prev,
      {
        kind: "user",
        id: `user-${crypto.randomUUID()}`,
        text: displayText.trim(),
      },
    ]);

    // IDs of in-flight items — local vars are sufficient since this all runs
    // within a single async invocation.
    let assistantId: string | null = null;
    let toolId: string | null = null;

    // Tracks the active skill item and its pending child tool ID.
    const activeSkillRef = { id: null as string | null, toolId: null as string | null };

    const ensureAssistant = (): string => {
      if (assistantId) return assistantId;
      const id = `asst-${crypto.randomUUID()}`;
      assistantId = id;
      setItems((prev) => [
        ...prev,
        { kind: "assistant", id, text: "", thought: "", isStreaming: true },
      ]);
      setExpandedThoughts((prev) => new Set(prev).add(id));
      return id;
    };

    const onToolEvent = (_toolName: string, event: import("@mast-ai/core").AgentEvent) => {
      const skillId = activeSkillRef.id;
      if (!skillId) return;

      if (event.type === "thinking" || event.type === "text_delta") {
        const kind = event.type === "thinking" ? "thought" as const : "text" as const;
        const delta = event.delta;
        setItems((prev) =>
          prev.map((it) => {
            if (it.kind !== "skill" || it.id !== skillId) return it;
            const last = it.childItems[it.childItems.length - 1];
            if (last && last.kind === kind) {
              return {
                ...it,
                childItems: it.childItems.map((c, i) =>
                  i === it.childItems.length - 1 ? { ...c, text: (c as { text: string }).text + delta } : c,
                ),
              };
            }
            return {
              ...it,
              childItems: [...it.childItems, { kind, id: `child-${crypto.randomUUID()}`, text: delta }],
            };
          }),
        );
      } else if (event.type === "tool_call_started") {
        const tid = `child-tool-${crypto.randomUUID()}`;
        activeSkillRef.toolId = tid;
        const childTool: ChildItem = { kind: "tool", id: tid, name: event.name, pending: true, params: event.args };
        setItems((prev) =>
          prev.map((it) =>
            it.kind === "skill" && it.id === skillId
              ? { ...it, childItems: [...it.childItems, childTool] }
              : it,
          ),
        );
      } else if (event.type === "tool_call_completed") {
        const tid = activeSkillRef.toolId;
        if (tid) {
          const toolResult = event.result;
          setItems((prev) =>
            prev.map((it) => {
              if (it.kind !== "skill" || it.id !== skillId) return it;
              return {
                ...it,
                childItems: it.childItems.map((c) =>
                  c.kind === "tool" && c.id === tid ? { ...c, pending: false, result: toolResult } : c,
                ),
              };
            }),
          );
          activeSkillRef.toolId = null;
        }
      }
    };

    try {
      onBeforeSend?.();
      for await (const event of conversation.runStream(prompt, abortController.signal, onToolEvent)) {
        if (event.type === "thinking") {
          const id = ensureAssistant();
          const delta = event.delta;
          setItems((prev) =>
            prev.map((it) =>
              it.kind === "assistant" && it.id === id
                ? { ...it, thought: it.thought + delta }
                : it,
            ),
          );
        } else if (event.type === "text_delta") {
          const id = ensureAssistant();
          const delta = event.delta;
          setItems((prev) =>
            prev.map((it) =>
              it.kind === "assistant" && it.id === id
                ? { ...it, text: it.text + delta }
                : it,
            ),
          );
        } else if (event.type === "tool_call_started") {
          // Finalize any open assistant bubble, then open a pending tool/skill item.
          if (assistantId) {
            const closeId = assistantId;
            setItems((prev) =>
              prev.map((it) =>
                it.kind === "assistant" && it.id === closeId
                  ? { ...it, isStreaming: false }
                  : it,
              ),
            );
            assistantId = null;
          }
          const tid = `tool-${crypto.randomUUID()}`;
          toolId = tid;
          if (event.name === "delegate_to_skill") {
            const args = event.args as { skillName?: string; task?: string };
            activeSkillRef.id = tid;
            activeSkillRef.toolId = null;
            setItems((prev) => [
              ...prev,
              { kind: "skill", id: tid, name: args.skillName ?? "skill", task: args.task ?? "", pending: true, childItems: [] },
            ]);
          } else {
            const name = event.name;
            const params = event.args;
            setItems((prev) => [
              ...prev,
              { kind: "tool", id: tid, name, pending: true, params },
            ]);
          }
        } else if (event.type === "tool_call_completed") {
          // Mark the tool/skill as done. Next content will lazily open a new assistant bubble.
          if (toolId) {
            const closeToolId = toolId;
            if (activeSkillRef.id === closeToolId) {
              setItems((prev) =>
                prev.map((it) =>
                  it.kind === "skill" && it.id === closeToolId
                    ? { ...it, pending: false }
                    : it,
                ),
              );
              activeSkillRef.id = null;
            } else {
              const toolResult = event.result;
              setItems((prev) =>
                prev.map((it) =>
                  it.kind === "tool" && it.id === closeToolId
                    ? { ...it, pending: false, result: toolResult }
                    : it,
                ),
              );
            }
            toolId = null;
          }
          assistantId = null;
        } else if (event.type === "done") {
          // Finalize the last assistant bubble and auto-collapse its thought.
          if (assistantId) {
            const closeId = assistantId;
            setItems((prev) =>
              prev.map((it) =>
                it.kind === "assistant" && it.id === closeId
                  ? { ...it, isStreaming: false }
                  : it,
              ),
            );
            setExpandedThoughts((prev) => {
              const next = new Set(prev);
              next.delete(closeId);
              return next;
            });
            assistantId = null;
          }
        }
      }
    } catch (error) {
      if ((error as { name?: string }).name !== "AbortError") {
        console.error("Chat Error:", error);
      }
      // Remove any open (empty) assistant bubble on failure/cancel.
      if (assistantId) {
        const removeId = assistantId;
        setItems((prev) => prev.filter((it) => it.id !== removeId));
      }
    } finally {
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  };

  const canSend =
    (trailingInput.trim().length > 0 || segments.length > 0) && !isLoading;

  return (
    <div className="flex flex-col h-full bg-muted/20 border-l">
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

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="text-sm text-muted-foreground italic text-center mt-4 p-4">
            Start a conversation with the editor assistant.
          </div>
        ) : (
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map((vItem) => (
              <div
                key={vItem.key}
                data-index={vItem.index}
                ref={virtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  transform: `translateY(${vItem.start}px)`,
                  width: "100%",
                  padding: "8px 16px",
                }}
              >
                <ChatItem
                  item={items[vItem.index]}
                  isExpanded={expandedThoughts.has(items[vItem.index].id)}
                  onToggle={toggleThought}
                />
              </div>
            ))}
          </div>
        )}
      </div>

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
                {seg.text && (
                  <span className="text-sm">{seg.text}</span>
                )}
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
              disabled={isLoading}
              className="w-full min-w-0 bg-transparent outline-none text-sm placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 resize-none overflow-hidden"
              aria-label="Chat input"
            />
          </div>
        </div>
        {isLoading ? (
          <Button
            variant="outline"
            onClick={() => abortControllerRef.current?.abort()}
            className="min-h-11"
          >
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
