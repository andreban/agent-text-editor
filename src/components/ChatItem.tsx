// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0
import { useState } from "react";
import { Brain, Check, ChevronDown, ChevronUp, Wrench } from "lucide-react";
import { MarkdownContent } from "./MarkdownContent";

export type StreamItem =
  | { kind: "user"; id: string; text: string }
  | {
      kind: "assistant";
      id: string;
      text: string;
      thought: string;
      isStreaming: boolean;
    }
  | {
      kind: "tool";
      id: string;
      name: string;
      pending: boolean;
      params?: unknown;
      result?: unknown;
    };

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

type ToolItem = Extract<StreamItem, { kind: "tool" }>;

function ToolItem({ item }: { item: ToolItem }) {
  const [open, setOpen] = useState(false);
  const hasDetails = item.params !== undefined || item.result !== undefined;

  return (
    <div className="self-start border border-border rounded-lg bg-muted/40 overflow-hidden text-xs text-muted-foreground">
      <button
        className="flex items-center gap-2 px-2 py-1 w-full hover:bg-accent disabled:cursor-default"
        onClick={() => hasDetails && setOpen((v) => !v)}
        disabled={!hasDetails}
      >
        {item.pending ? (
          <Wrench className="w-3 h-3 animate-pulse text-primary shrink-0" />
        ) : (
          <Check className="w-3 h-3 text-green-500 shrink-0" />
        )}
        <code className="font-mono">{item.name}</code>
        {hasDetails && (
          <span className="ml-auto">
            {open ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
          </span>
        )}
      </button>
      {open && (
        <div className="border-t border-border divide-y divide-border">
          {item.params !== undefined && (
            <div className="p-2">
              <div className="text-[10px] uppercase tracking-wider font-bold mb-1">
                Parameters
              </div>
              <pre className="whitespace-pre-wrap break-all leading-relaxed">
                {formatValue(item.params)}
              </pre>
            </div>
          )}
          {item.result !== undefined && (
            <div className="p-2">
              <div className="text-[10px] uppercase tracking-wider font-bold mb-1">
                Result
              </div>
              <pre className="whitespace-pre-wrap break-all leading-relaxed">
                {formatValue(item.result)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface ChatItemProps {
  item: StreamItem;
  isExpanded: boolean;
  onToggle: (id: string) => void;
}

export function ChatItem({ item, isExpanded, onToggle }: ChatItemProps) {
  if (item.kind === "user") {
    return (
      <div className="flex flex-col items-end">
        <div className="max-w-[90%] p-3 rounded-2xl rounded-tr-none text-sm shadow-sm bg-primary text-primary-foreground">
          {item.text}
        </div>
      </div>
    );
  }

  if (item.kind === "tool") {
    return <ToolItem item={item} />;
  }

  // assistant
  return (
    <div className="flex flex-col gap-2">
      {item.thought && (
        <div className="max-w-[90%] self-start w-full">
          <div className="bg-muted border border-border rounded-lg overflow-hidden">
            <button
              onClick={() => onToggle(item.id)}
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
}
