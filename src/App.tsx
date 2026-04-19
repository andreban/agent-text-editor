// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0
import { useState, useMemo } from "react";
import { EditorPanel } from "@/components/EditorPanel";
import { ChatSidebar } from "@/components/ChatSidebar";
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
import { AgentRunner, ToolRegistry, AgentConfig } from "@mast-ai/core";
import { GoogleGenAIAdapter } from "@/adapters/GoogleGenAIAdapter";

function App() {
  const { apiKey, setApiKey, modelName, setTotalTokens, totalTokens } =
    useApp();
  const [tempKey, setTempKey] = useState("");
  const [showKeyDialog, setShowKeyDialog] = useState(!apiKey);

  const runner = useMemo(() => {
    if (!apiKey) return null;
    const adapter = new GoogleGenAIAdapter(apiKey, modelName, (usage) => {
      setTotalTokens((prev) => prev + (usage.totalTokenCount || 0));
    });
    const registry = new ToolRegistry();
    return new AgentRunner(adapter, registry);
  }, [apiKey, modelName, setTotalTokens]); // Removed totalTokens dependency

  const conversation = useMemo(() => {
    if (!runner) return null;
    const agent: AgentConfig = {
      name: "EditorAssistant",
      instructions:
        "You are a helpful senior editorial assistant. Help the user refine their text.",
      tools: [],
    };
    return runner.conversation(agent);
  }, [runner]);

  const handleSaveKey = () => {
    if (tempKey.trim()) {
      setApiKey(tempKey.trim());
      setShowKeyDialog(false);
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <main className="flex-1 min-w-0">
        <EditorPanel />
      </main>
      <aside className="w-[400px] shrink-0 border-l border-border">
        <ChatSidebar conversation={conversation} totalTokens={totalTokens} />
      </aside>

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
    </div>
  );
}

export default App;
