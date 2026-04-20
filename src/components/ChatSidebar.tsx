// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0
import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Switch } from "./ui/switch";
import { Label } from "./ui/label";
import { Conversation } from "@mast-ai/core";
import { MarkdownContent } from "./MarkdownContent";
import {
  ChevronDown,
  ChevronUp,
  Brain,
  Wrench,
  Check,
  Settings,
  Wand2,
  Sun,
  Moon,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { useTheme } from "@/lib/ThemeProvider";
import { SettingsDialog } from "./SettingsDialog";
import { SkillsDialog } from "./SkillsDialog";

interface ChatSidebarProps {
  conversation: Conversation | null;
}

type StreamItem =
  | { kind: "user"; id: string; text: string }
  | {
      kind: "assistant";
      id: string;
      text: string;
      thought: string;
      isStreaming: boolean;
    }
  | { kind: "tool"; id: string; name: string; pending: boolean };

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

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

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
      { kind: "user", id: `user-${Date.now()}`, text: userText },
    ]);

    // IDs of in-flight items — local vars are sufficient since this all runs
    // within a single async invocation.
    let assistantId: string | null = null;
    let toolId: string | null = null;

    const ensureAssistant = (): string => {
      if (assistantId) return assistantId;
      const id = `asst-${Date.now()}`;
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
          const tid = `tool-${Date.now()}`;
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

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 flex flex-col gap-4"
      >
        {items.length === 0 && (
          <div className="text-sm text-muted-foreground italic text-center mt-4">
            Start a conversation with the editor assistant.
          </div>
        )}

        {items.map((item) => {
          if (item.kind === "user") {
            return (
              <div key={item.id} className="flex flex-col items-end">
                <div className="max-w-[90%] p-3 rounded-2xl rounded-tr-none text-sm shadow-sm bg-primary text-primary-foreground">
                  {item.text}
                </div>
              </div>
            );
          }

          if (item.kind === "tool") {
            return (
              <div
                key={item.id}
                className="flex items-center gap-2 text-xs text-muted-foreground self-start px-2 py-1 rounded-full border border-border bg-muted/40"
              >
                {item.pending ? (
                  <Wrench className="w-3 h-3 animate-pulse text-primary" />
                ) : (
                  <Check className="w-3 h-3 text-green-500" />
                )}
                <span>
                  <code className="font-mono">{item.name}</code>
                </span>
              </div>
            );
          }

          // assistant
          const isExpanded = expandedThoughts.has(item.id);
          return (
            <div key={item.id} className="flex flex-col gap-2">
              {item.thought && (
                <div className="max-w-[90%] self-start w-full">
                  <div className="bg-muted border border-border rounded-lg overflow-hidden">
                    <button
                      onClick={() => toggleThought(item.id)}
                      className="flex items-center justify-between w-full p-2 text-[10px] uppercase tracking-wider font-bold text-muted-foreground hover:bg-accent"
                    >
                      <div className="flex items-center gap-2">
                        <Brain
                          className={`w-3 h-3 ${item.isStreaming && !item.text ? "animate-pulse text-primary" : ""}`}
                        />
                        <span>Thinking Process</span>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="w-3 h-3" />
                      ) : (
                        <ChevronDown className="w-3 h-3" />
                      )}
                    </button>
                    {isExpanded && (
                      <div className="p-3 text-xs text-muted-foreground border-t border-border bg-muted/30 whitespace-pre-wrap italic leading-relaxed">
                        {item.thought}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {(item.text || item.isStreaming) && (
                <div className="flex flex-col items-start">
                  <div className="max-w-[90%] p-3 rounded-2xl rounded-tl-none text-sm shadow-sm bg-secondary text-secondary-foreground">
                    {item.text ? (
                      <MarkdownContent content={item.text} />
                    ) : (
                      <div className="flex gap-1 h-4 items-center">
                        <span className="animate-bounce">.</span>
                        <span className="animate-bounce delay-100">.</span>
                        <span className="animate-bounce delay-200">.</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
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
