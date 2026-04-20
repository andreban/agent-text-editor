// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0
import { useState, useMemo, useEffect, useRef } from "react";
import { EditorPanel } from "@/components/EditorPanel";
import { ChatSidebar } from "@/components/ChatSidebar";
import { ReferenceTab } from "@/components/ReferenceTab";
import {
  MessageCircle,
  ChevronDown,
  BookOpen,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
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
import {
  EditorTools,
  registerEditorTools,
  createDelegateToSkillHandler,
} from "@/lib/EditorTools";

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
}

function DesktopLayout({ conversation }: LayoutProps) {
  const [refOpen, setRefOpen] = useState(false);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* Collapsible reference drawer */}
      <aside
        className={`shrink-0 border-r border-border flex flex-col overflow-hidden transition-[width] duration-300 ease-in-out ${
          refOpen ? "w-[280px]" : "w-10"
        }`}
      >
        <div className="flex items-center border-b border-border h-10 shrink-0">
          <button
            onClick={() => setRefOpen((v) => !v)}
            className="flex items-center justify-center w-10 h-10 hover:bg-muted/60 text-muted-foreground"
            aria-label={
              refOpen ? "Collapse reference drawer" : "Expand reference drawer"
            }
          >
            {refOpen ? (
              <PanelLeftClose className="w-4 h-4" />
            ) : (
              <PanelLeftOpen className="w-4 h-4" />
            )}
          </button>
          {refOpen && (
            <span className="text-xs font-medium text-muted-foreground ml-1 truncate">
              Reference
            </span>
          )}
        </div>
        {refOpen && (
          <div className="flex-1 min-h-0 overflow-hidden">
            <ReferenceTab />
          </div>
        )}
      </aside>

      <main className="flex-1 min-w-0">
        <EditorPanel />
      </main>
      <aside className="w-[400px] shrink-0 border-l border-border">
        <ChatSidebar conversation={conversation} />
      </aside>
    </div>
  );
}

function MobileLayout({ conversation }: LayoutProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState<"chat" | "reference">("chat");
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

  const openSheet = (mode: "chat" | "reference") => {
    setSheetMode(mode);
    setSheetOpen(true);
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* Editor always mounted, full screen */}
      <div className="h-full w-full">
        <EditorPanel />
      </div>

      {/* FABs */}
      {!sheetOpen && (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3">
          <button
            onClick={() => openSheet("reference")}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground shadow-lg border border-border"
            aria-label="Open reference"
          >
            <BookOpen className="h-5 w-5" />
          </button>
          <button
            onClick={() => openSheet("chat")}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
            aria-label="Open chat"
          >
            <MessageCircle className="h-6 w-6" />
          </button>
        </div>
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
          <span className="font-medium">
            {sheetMode === "chat" ? "AI Assistant" : "Reference"}
          </span>
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
          {sheetMode === "chat" ? (
            <ChatSidebar conversation={conversation} />
          ) : (
            <ReferenceTab />
          )}
        </div>
      </div>
    </div>
  );
}

const BASE_INSTRUCTIONS =
  "You are a helpful senior editorial assistant. Help the user refine their text. " +
  "You MUST use the provided tools to interact with the editor. " +
  "Always use `read()` or `read_selection()` before suggesting changes. " +
  "Use `search()` to locate specific text before editing it. " +
  "Use `get_metadata()` to answer questions about document length or word count without reading the full content. " +
  "CRITICAL: Prefer small, surgical edits using `edit()`. Do not rewrite the entire document unless explicitly asked to. " +
  "When using `edit()`, the `originalText` should be as short as possible (just the sentence or words changing), not the whole file. " +
  "When you call `edit()` or `write()`, the execution will PAUSE until the user manually Accepts or Rejects the change. " +
  "You will then receive the user's decision (and feedback if any) as the tool result.";

function App() {
  const {
    apiKey,
    setApiKey,
    modelName,
    setTotalTokens,
    editorInstance,
    setSuggestions,
    approveAll,
    skills,
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
    );

    registerEditorTools(registry, editorTools);

    registry.register({
      definition: () => ({
        name: "delegate_to_skill",
        description:
          "Delegates a task to a named skill (sub-agent). The skill runs with its own instructions and can read and edit the document. Returns the skill's final response.",
        parameters: {
          type: "object",
          properties: {
            skillName: {
              type: "string",
              description: "The exact name of the skill to invoke.",
            },
            task: {
              type: "string",
              description:
                "The specific task or instructions to pass to the skill.",
            },
          },
          required: ["skillName", "task"],
        },
      }),
      call: createDelegateToSkillHandler(apiKey!, adapter, editorTools),
    });

    return new AgentRunner(adapter, registry);
  }, [
    apiKey,
    modelName,
    setTotalTokens,
    editorInstance,
    setSuggestions,
    approveAll,
  ]);

  const conversation = useMemo(() => {
    if (!runner) return null;
    const skillsSection =
      skills.length > 0
        ? "\n\nAvailable skills you can delegate to via the delegate_to_skill tool:\n" +
          skills.map((s) => `- ${s.name}: ${s.description}`).join("\n")
        : "";
    const agent: AgentConfig = {
      name: "EditorAssistant",
      instructions: BASE_INSTRUCTIONS + skillsSection,
      tools: [
        "read",
        "read_selection",
        "search",
        "get_metadata",
        "edit",
        "write",
        "delegate_to_skill",
      ],
    };
    return runner.conversation(agent);
  }, [runner, skills]);

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
        <MobileLayout conversation={conversation} />
      ) : (
        <DesktopLayout conversation={conversation} />
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
