// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0
import { useState, useCallback, useRef, useEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Switch } from "./ui/switch";
import { Label } from "./ui/label";
import { Conversation } from "@mast-ai/core";
import {
  Settings,
  Wand2,
  Sun,
  Moon,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { useTheme } from "@/lib/ThemeProvider";
import { SettingsDialog } from "./SettingsDialog";
import { SkillsDialog } from "./SkillsDialog";
import { ChatItem, StreamItem } from "./ChatItem";

interface ChatSidebarProps {
  conversation: Conversation | null;
}

export function ChatSidebar({ conversation }: ChatSidebarProps) {
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [items, setItems] = useState<StreamItem[]>([]);
  const [expandedThoughts, setExpandedThoughts] = useState<Set<string>>(
    new Set(),
  );
  const [prevConversation, setPrevConversation] = useState<Conversation | null>(
    null,
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const { approveAll, setApproveAll } = useApp();
  const { theme, toggleTheme } = useTheme();

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

  const handleSend = async () => {
    if (!input.trim() || !conversation || isLoading) return;

    const userText = input.trim();
    setInput("");
    setIsLoading(true);

    setItems((prev) => [
      ...prev,
      { kind: "user", id: `user-${crypto.randomUUID()}`, text: userText },
    ]);

    // IDs of in-flight items — local vars are sufficient since this all runs
    // within a single async invocation.
    let assistantId: string | null = null;
    let toolId: string | null = null;

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

    try {
      for await (const event of conversation.runStream(userText)) {
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
          // Finalize any open assistant bubble, then open a pending tool item.
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
          const name = event.name;
          setItems((prev) => [
            ...prev,
            { kind: "tool", id: tid, name, pending: true },
          ]);
        } else if (event.type === "tool_call_completed") {
          // Mark the tool as done. Next content will lazily open a new assistant bubble.
          if (toolId) {
            const closeToolId = toolId;
            setItems((prev) =>
              prev.map((it) =>
                it.kind === "tool" && it.id === closeToolId
                  ? { ...it, pending: false }
                  : it,
              ),
            );
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
      console.error("Chat Error:", error);
      // Remove any open (empty) assistant bubble on failure.
      if (assistantId) {
        const removeId = assistantId;
        setItems((prev) => prev.filter((it) => it.id !== removeId));
      }
    } finally {
      setIsLoading(false);
    }
  };

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

      <div className="p-4 border-t bg-background/50 backdrop-blur-sm flex gap-2">
        <Input
          placeholder="Ask the editor..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          disabled={isLoading}
          className="bg-background"
        />
        <Button
          onClick={handleSend}
          disabled={isLoading || !input.trim()}
          className="min-h-11"
        >
          Send
        </Button>
      </div>
    </div>
  );
}
