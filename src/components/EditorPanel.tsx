// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0
import { useEffect, useRef, useState } from "react";
import { Editor, OnMount } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MarkdownContent } from "./MarkdownContent";
import { useApp } from "@/lib/store";
import { useTheme } from "@/lib/ThemeProvider";
import { useWorkspaces } from "@/lib/WorkspacesContext";
import { computeDiffDecorations } from "@/lib/diffDecorations";
import { Check, X } from "lucide-react";
import { DEFAULT_EDITOR_CONTENT } from "@/lib/constants";

const DEBOUNCE_MS = 500;

export function EditorPanel() {
  const {
    setEditorInstance,
    suggestions,
    setSuggestions,
    editorInstance,
    activeTab,
    setActiveTab,
    setEditorContent,
    pendingTabSwitchRequest,
    setPendingTabSwitchRequest,
  } = useApp();
  const { activeDocument, updateDocument } = useWorkspaces();

  const { theme } = useTheme();
  const monacoTheme = theme === "dark" ? "vs-dark" : "light";

  const [localContent, setLocalContent] = useState<string>(
    () => activeDocument?.content || DEFAULT_EDITOR_CONTENT,
  );
  const prevDocIdRef = useRef<string | null>(activeDocument?.id ?? null);
  const updateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const decorationsRef =
    useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
  const [toolbarTop, setToolbarTop] = useState<number>(8);
  const pendingSuggestion =
    suggestions.find((s) => s.status === "pending") ?? null;

  useEffect(() => {
    if (activeDocument?.id !== prevDocIdRef.current) {
      prevDocIdRef.current = activeDocument?.id ?? null;
      if (updateTimerRef.current) {
        clearTimeout(updateTimerRef.current);
        updateTimerRef.current = null;
      }
      setLocalContent(activeDocument?.content || DEFAULT_EDITOR_CONTENT);
    }
  }, [activeDocument]);

  const handleEditorDidMount: OnMount = (editor) => {
    setEditorInstance(editor);
  };

  useEffect(() => {
    setEditorContent(localContent);
  }, [localContent, setEditorContent]);

  useEffect(() => {
    if (activeTab === "editor" && editorInstance) {
      editorInstance.layout();
    }
  }, [activeTab, editorInstance]);

  const handleChange = (value: string | undefined) => {
    const content = value || "";
    setLocalContent(content);
    if (updateTimerRef.current) clearTimeout(updateTimerRef.current);
    updateTimerRef.current = setTimeout(() => {
      if (activeDocument) {
        updateDocument(activeDocument.id, { content });
      }
    }, DEBOUNCE_MS);
  };

  useEffect(() => {
    if (!editorInstance) return;

    if (!pendingSuggestion) {
      decorationsRef.current?.clear();
      return;
    }

    const decorations = computeDiffDecorations(pendingSuggestion);

    if (!decorationsRef.current) {
      decorationsRef.current =
        editorInstance.createDecorationsCollection(decorations);
    } else {
      decorationsRef.current.set(decorations);
    }

    editorInstance.revealLineInCenterIfOutsideViewport(
      pendingSuggestion.range.startLineNumber,
    );
  }, [suggestions, editorInstance, pendingSuggestion]);

  useEffect(() => {
    if (!editorInstance || !pendingSuggestion) return;

    const TOOLBAR_HEIGHT = 36;
    const GAP = 4;

    const computeTop = () => {
      const lineTop =
        editorInstance.getTopForLineNumber(
          pendingSuggestion.range.startLineNumber,
        ) - editorInstance.getScrollTop();
      setToolbarTop(Math.max(GAP, lineTop - TOOLBAR_HEIGHT - GAP));
    };

    computeTop();
    const disposable = editorInstance.onDidScrollChange(computeTop);
    return () => disposable.dispose();
  }, [pendingSuggestion, editorInstance]);

  const handleAccept = (id: string) => {
    const suggestion = suggestions.find((s) => s.id === id);
    if (suggestion) {
      if (editorInstance) {
        const model = editorInstance.getModel();
        if (model) {
          model.pushEditOperations(
            [],
            [{ range: suggestion.range, text: suggestion.replacementText }],
            () => null,
          );
        }
      }
      setSuggestions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, status: "accepted" } : s)),
      );
      suggestion.resolve(
        "User accepted the edit. The document has been updated.",
      );
    }
  };

  const handleReject = (id: string) => {
    const suggestion = suggestions.find((s) => s.id === id);
    if (suggestion) {
      setSuggestions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, status: "rejected" } : s)),
      );
      suggestion.resolve("User rejected the edit.");
    }
  };

  const handleTabSwitchAccept = () => {
    if (pendingTabSwitchRequest) {
      setActiveTab("editor");
      pendingTabSwitchRequest.resolve(true);
      setPendingTabSwitchRequest(null);
    }
  };

  const handleTabSwitchDecline = () => {
    if (pendingTabSwitchRequest) {
      pendingTabSwitchRequest.resolve(false);
      setPendingTabSwitchRequest(null);
    }
  };

  return (
    <div className="flex h-full w-full flex-col bg-background relative">
      <Dialog
        open={!!pendingTabSwitchRequest}
        onOpenChange={(open) => {
          if (!open) handleTabSwitchDecline();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Switch to Editor?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            The AI assistant needs to edit the document, but you are currently
            in Preview mode. Switch to the Editor tab to allow changes?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={handleTabSwitchDecline}>
              Cancel
            </Button>
            <Button onClick={handleTabSwitchAccept}>Switch to Editor</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "editor" | "preview")}
        className="flex h-full w-full flex-col"
      >
        <div className="border-b px-4 py-2">
          <TabsList>
            <TabsTrigger value="editor">Editor</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          value="editor"
          forceMount
          className="hidden m-0 flex-1 border-0 p-0 outline-none data-[state=active]:flex data-[state=active]:flex-col relative"
        >
          <div className="flex-1 relative">
            <Editor
              height="100%"
              defaultLanguage="markdown"
              value={localContent}
              onChange={handleChange}
              onMount={handleEditorDidMount}
              theme={monacoTheme}
              options={{
                minimap: { enabled: false },
                wordWrap: "on",
                padding: { top: 16 },
                scrollBeyondLastLine: false,
                renderLineHighlight: "none",
              }}
            />

            {pendingSuggestion && (
              <div
                className="absolute left-0 right-0 z-10 flex justify-center pointer-events-none"
                style={{ top: toolbarTop }}
              >
                <div className="flex items-center gap-2 pointer-events-auto bg-background border rounded-lg px-3 py-1.5 shadow-md text-sm">
                  <span className="text-muted-foreground text-xs mr-1">
                    Proposed edit
                  </span>
                  <button
                    onClick={() => handleAccept(pendingSuggestion.id)}
                    className="flex items-center gap-1 text-green-600 hover:text-green-700 font-medium"
                  >
                    <Check size={14} />
                    Accept
                  </button>
                  <span className="text-muted-foreground">|</span>
                  <button
                    onClick={() => handleReject(pendingSuggestion.id)}
                    className="flex items-center gap-1 text-red-500 hover:text-red-600 font-medium"
                  >
                    <X size={14} />
                    Reject
                  </button>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent
          value="preview"
          className="m-0 flex-1 overflow-auto p-8 outline-none data-[state=active]:block"
        >
          <MarkdownContent
            content={localContent}
            className="mx-auto max-w-3xl text-foreground"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
