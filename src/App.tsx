// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0
import { useState, useMemo, useEffect, useRef } from "react";
import { EditorPanel } from "@/components/EditorPanel";
import { ChatSidebar } from "@/components/ChatSidebar";
import { MessageCircle, ChevronDown } from "lucide-react";
import { useApp } from "@/lib/store";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AgentRunner,
  ToolRegistry,
  AgentConfig,
  Conversation,
} from "@mast-ai/core";
import { GoogleGenAIAdapter } from "@/adapters/GoogleGenAIAdapter";
import { EditorTools } from "@/lib/EditorTools";

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia("(max-width: 767px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isMobile;
}

interface LayoutProps {
  conversation: Conversation | null;
  totalTokens: number;
}

function DesktopLayout({ conversation, totalTokens }: LayoutProps) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <main className="flex-1 min-w-0">
        <EditorPanel />
      </main>
      <aside className="w-[400px] shrink-0 border-l border-border">
        <ChatSidebar conversation={conversation} totalTokens={totalTokens} />
      </aside>
    </div>
  );
}

function MobileLayout({ conversation, totalTokens }: LayoutProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sheetRef.current;
    if (!el) return;
    if (!sheetOpen) {
      el.setAttribute("inert", "");
      el.setAttribute("aria-hidden", "true");
    } else {
      el.removeAttribute("inert");
      el.removeAttribute("aria-hidden");
    }
  }, [sheetOpen]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* Editor always mounted, full screen */}
      <div className="h-full w-full">
        <EditorPanel />
      </div>

      {/* FAB */}
      {!sheetOpen && (
        <button
          onClick={() => setSheetOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
          aria-label="Open chat"
        >
          <MessageCircle className="h-6 w-6" />
        </button>
      )}

      {/* Bottom sheet overlay */}
      <div
        ref={sheetRef}
        className={`fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl border-t border-border bg-background shadow-2xl transition-transform duration-300 ${
          sheetOpen ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ height: "70vh" }}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="font-medium">AI Assistant</span>
          <button
            onClick={() => {
              (document.activeElement as HTMLElement)?.blur();
              setSheetOpen(false);
            }}
            className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-muted"
            aria-label="Close chat"
          >
            <ChevronDown className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          <ChatSidebar conversation={conversation} totalTokens={totalTokens} />
        </div>
      </div>
    </div>
  );
}

function App() {
  const {
    apiKey,
    setApiKey,
    modelName,
    setTotalTokens,
    totalTokens,
    editorInstance,
    setSuggestions,
    approveAll,
    setEditorContent,
  } = useApp();
  const [tempKey, setTempKey] = useState("");
  const [showKeyDialog, setShowKeyDialog] = useState(!apiKey);

  const runner = useMemo(() => {
    if (!apiKey) return null;
    const adapter = new GoogleGenAIAdapter(apiKey, modelName, (usage) => {
      setTotalTokens((prev) => prev + (usage.totalTokenCount || 0));
    });
    const registry = new ToolRegistry();

    const editorTools = new EditorTools(
      editorInstance,
      setSuggestions,
      approveAll,
      setEditorContent,
    );

    registry.register({
      definition: () => ({
        name: "read",
        description: "Reads the complete current editor content.",
        parameters: { type: "object", properties: {} },
      }),
      call: async () => editorTools.read(),
    });

    registry.register({
      definition: () => ({
        name: "read_selection",
        description: "Reads the currently selected text in the editor.",
        parameters: { type: "object", properties: {} },
      }),
      call: async () => editorTools.read_selection(),
    });

    registry.register({
      definition: () => ({
        name: "search",
        description:
          "Finds all occurrences of a query string in the document. Returns the line and column of each match.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The text to search for.",
            },
          },
          required: ["query"],
        },
      }),
      call: async (args: { query: string }) => editorTools.search(args),
    });

    registry.register({
      definition: () => ({
        name: "get_metadata",
        description:
          "Returns metadata about the current document: character count, word count, and line count.",
        parameters: { type: "object", properties: {} },
      }),
      call: async () => editorTools.get_metadata(),
    });

    registry.register({
      definition: () => ({
        name: "edit",
        description:
          "Proposes a targeted edit. This tool pauses and waits for user approval. ONLY use this for small, localized changes (e.g., 1-2 sentences). Never pass the entire document.",
        parameters: {
          type: "object",
          properties: {
            originalText: {
              type: "string",
              description:
                "The exact, minimal string of text to replace. Must be short. Do NOT pass the whole document.",
            },
            replacementText: {
              type: "string",
              description: "The new text to replace the originalText with.",
            },
          },
          required: ["originalText", "replacementText"],
        },
      }),
      call: async (args: { originalText: string; replacementText: string }) =>
        editorTools.edit(args),
    });

    registry.register({
      definition: () => ({
        name: "write",
        description:
          "Proposes a complete rewrite. This tool pauses and waits for user approval. ONLY use this when the user explicitly requests a total rewrite of the entire document.",
        parameters: {
          type: "object",
          properties: {
            content: {
              type: "string",
              description: "The full new document content.",
            },
          },
          required: ["content"],
        },
      }),
      call: async (args: { content: string }) => editorTools.write(args),
    });

    return new AgentRunner(adapter, registry);
  }, [
    apiKey,
    modelName,
    setTotalTokens,
    editorInstance,
    setSuggestions,
    approveAll,
    setEditorContent,
  ]);

  const conversation = useMemo(() => {
    if (!runner) return null;
    const agent: AgentConfig = {
      name: "EditorAssistant",
      instructions:
        "You are a helpful senior editorial assistant. Help the user refine their text. " +
        "You MUST use the provided tools to interact with the editor. " +
        "Always use `read()` or `read_selection()` before suggesting changes. " +
        "Use `search()` to locate specific text before editing it. " +
        "Use `get_metadata()` to answer questions about document length or word count without reading the full content. " +
        "CRITICAL: Prefer small, surgical edits using `edit()`. Do not rewrite the entire document unless explicitly asked to. " +
        "When using `edit()`, the `originalText` should be as short as possible (just the sentence or words changing), not the whole file. " +
        "When you call `edit()` or `write()`, the execution will PAUSE until the user manually Accepts or Rejects the change. " +
        "You will then receive the user's decision (and feedback if any) as the tool result.",
      tools: [
        "read",
        "read_selection",
        "search",
        "get_metadata",
        "edit",
        "write",
      ],
    };
    return runner.conversation(agent);
  }, [runner]);

  const isMobile = useIsMobile();

  const handleSaveKey = () => {
    if (tempKey.trim()) {
      setApiKey(tempKey.trim());
      setShowKeyDialog(false);
    }
  };

  return (
    <>
      {isMobile ? (
        <MobileLayout conversation={conversation} totalTokens={totalTokens} />
      ) : (
        <DesktopLayout conversation={conversation} totalTokens={totalTokens} />
      )}

      <Dialog open={showKeyDialog} onOpenChange={setShowKeyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enter Gemini API Key</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-4">
              To use the AI assistant, please provide your Google AI Studio API
              key. Your key is stored locally in your browser.
            </p>
            <Input
              type="password"
              placeholder="API Key"
              value={tempKey}
              onChange={(e) => setTempKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSaveKey()}
            />
          </div>
          <DialogFooter>
            <Button onClick={handleSaveKey}>Save Key</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default App;
