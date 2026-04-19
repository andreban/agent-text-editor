// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0
import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Switch } from "./ui/switch";
import { Label } from "./ui/label";
import { Conversation } from "@mast-ai/core";
import { MarkdownContent } from "./MarkdownContent";
import { ChevronDown, ChevronUp, Brain } from "lucide-react";
import { useApp } from "@/lib/store";

interface ChatSidebarProps {
  conversation: Conversation | null;
  totalTokens: number;
}

interface UIMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  thought?: string;
  isStreaming?: boolean;
}

export function ChatSidebar({ conversation, totalTokens }: ChatSidebarProps) {
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [expandedThoughts, setExpandedThoughts] = useState<Set<string>>(
    new Set(),
  );
  const [prevConversation, setPrevConversation] = useState<Conversation | null>(
    null,
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const { approveAll, setApproveAll } = useApp();

  // Initialize history if conversation changes
  if (conversation !== prevConversation) {
    setPrevConversation(conversation);
    if (conversation && conversation.history.length > 0) {
      const initialMessages: UIMessage[] = conversation.history.map((m, i) => ({
        id: `hist-${i}`,
        role: m.role,
        text:
          m.content.type === "text"
            ? m.content.text
            : m.content.type === "tool_calls"
              ? m.content.calls
                  .map((c) => `**Tool Call:** \`${c.name}\``)
                  .join("\n")
              : m.content.type === "tool_result"
                ? `**Result:** ${typeof m.content.result === "string" ? m.content.result : JSON.stringify(m.content.result)}`
                : "[Action]",
      }));
      setMessages(initialMessages);
    }
  }

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  // Always scroll when messages update
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

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
    const userMsgId = Date.now().toString();
    let currentAssistantMsgId = (Date.now() + 1).toString();

    const userMsg: UIMessage = { id: userMsgId, role: "user", text: userText };
    const assistantMsg: UIMessage = {
      id: currentAssistantMsgId,
      role: "assistant",
      text: "",
      thought: "",
      isStreaming: true,
    };

    // 1. UPDATE UI IMMEDIATELY
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setIsLoading(true);
    setExpandedThoughts((prev) => new Set(prev).add(currentAssistantMsgId));

    try {
      const stream = conversation.runStream(userText);

      let accumulatedThought = "";
      let accumulatedText = "";

      for await (const event of stream) {
        if (event.type === "thinking") {
          accumulatedThought += event.delta;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === currentAssistantMsgId
                ? { ...m, thought: accumulatedThought }
                : m,
            ),
          );
        } else if (event.type === "text_delta") {
          accumulatedText += event.delta;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === currentAssistantMsgId
                ? { ...m, text: accumulatedText }
                : m,
            ),
          );
        } else if (event.type === "tool_call_started") {
          const newAssistantId = `assistant-${Date.now()}`;
          setMessages((prev) => [
            ...prev.map((m) =>
              m.id === currentAssistantMsgId ? { ...m, isStreaming: false } : m,
            ),
            {
              id: `tool-${Date.now()}`,
              role: "assistant",
              text: `**Tool Call:** \`${event.name}\``,
            },
            {
              id: newAssistantId,
              role: "assistant",
              text: "",
              isStreaming: true,
            },
          ]);
          currentAssistantMsgId = newAssistantId;
          accumulatedText = "";
          accumulatedThought = "";
        } else if (event.type === "tool_call_completed") {
          const resultText =
            typeof event.result === "string"
              ? event.result
              : JSON.stringify(event.result);

          setMessages((prev) => [
            ...prev,
            {
              id: `res-${Date.now()}`,
              role: "user",
              text: `**Result:** ${resultText}`,
            },
          ]);

          const finalAssistantId = `assistant-final-${Date.now()}`;
          setMessages((prev) => [
            ...prev,
            {
              id: finalAssistantId,
              role: "assistant",
              text: "",
              isStreaming: true,
            },
          ]);
          currentAssistantMsgId = finalAssistantId;
          accumulatedText = "";
          accumulatedThought = "";
        }
      }

      // Mark as finished streaming
      setMessages((prev) =>
        prev
          .map((m) =>
            m.id === currentAssistantMsgId ? { ...m, isStreaming: false } : m,
          )
          .filter((m) => m.text || m.thought || m.isStreaming),
      );

      // Auto-collapse when done
      setExpandedThoughts((prev) => {
        const next = new Set(prev);
        next.delete(currentAssistantMsgId);
        return next;
      });
    } catch (error) {
      console.error("Chat Error:", error);
      setMessages((prev) => prev.filter((m) => m.id !== currentAssistantMsgId));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-muted/20 border-l">
      <div className="p-4 border-b flex justify-between items-center gap-4">
        <span className="font-medium whitespace-nowrap">AI Assistant</span>
        <div className="flex items-center gap-4 text-xs text-muted-foreground ml-auto">
          <div className="flex items-center space-x-2">
            <Switch
              id="approve-all"
              checked={approveAll}
              onCheckedChange={setApproveAll}
            />
            <Label htmlFor="approve-all" className="text-xs">
              Approve All
            </Label>
          </div>
          <span className="whitespace-nowrap">Tokens: {totalTokens}</span>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 flex flex-col gap-6"
      >
        {messages.length === 0 && (
          <div className="text-sm text-muted-foreground italic text-center mt-4">
            Start a conversation with the editor assistant.
          </div>
        )}

        {messages.map((m) => {
          const isAssistant = m.role === "assistant";
          const isExpanded = expandedThoughts.has(m.id);

          if (isAssistant && !m.text && !m.thought && !m.isStreaming) {
            return null;
          }

          return (
            <div key={m.id} className="flex flex-col gap-2">
              {/* Thought Block */}
              {isAssistant && m.thought && (
                <div className="max-w-[90%] self-start w-full">
                  <div className="bg-muted border border-border rounded-lg overflow-hidden transition-all">
                    <button
                      onClick={() => toggleThought(m.id)}
                      className="flex items-center justify-between w-full p-2 text-[10px] uppercase tracking-wider font-bold text-muted-foreground hover:bg-accent"
                    >
                      <div className="flex items-center gap-2">
                        <Brain
                          className={`w-3 h-3 ${m.isStreaming && !m.text ? "animate-pulse text-primary" : ""}`}
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
                        {m.thought}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Message Bubble */}
              {(m.text || m.isStreaming || !isAssistant) && (
                <div
                  className={`flex flex-col ${isAssistant ? "items-start" : "items-end"}`}
                >
                  <div
                    className={`max-w-[90%] p-3 rounded-2xl text-sm shadow-sm ${
                      isAssistant
                        ? "bg-secondary text-secondary-foreground rounded-tl-none"
                        : "bg-primary text-primary-foreground rounded-tr-none"
                    }`}
                  >
                    {m.text ? (
                      isAssistant ? (
                        <MarkdownContent content={m.text} />
                      ) : (
                        m.text
                      )
                    ) : (
                      isAssistant &&
                      m.isStreaming && (
                        <div className="flex gap-1 h-4 items-center">
                          <span className="animate-bounce">.</span>
                          <span className="animate-bounce delay-100">.</span>
                          <span className="animate-bounce delay-200">.</span>
                        </div>
                      )
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
        <Button onClick={handleSend} disabled={isLoading || !input.trim()}>
          Send
        </Button>
      </div>
    </div>
  );
}
