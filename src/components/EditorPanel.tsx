// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0
import { useEffect, useRef, useState } from "react";
import { Editor, OnMount } from "@monaco-editor/react";
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
import { useEditorUI } from "@/lib/store";
import { useTheme } from "@/lib/ThemeProvider";
import { useWorkspaces } from "@/lib/WorkspacesContext";
import { DEFAULT_EDITOR_CONTENT } from "@/lib/constants";

const DEBOUNCE_MS = 500;

export function EditorPanel() {
  const {
    setEditorInstance,
    editorInstance,
    activeTab,
    setActiveTab,
    setEditorContent,
    pendingTabSwitchRequest,
    setPendingTabSwitchRequest,
  } = useEditorUI();
  const { activeDocument, updateDocument } = useWorkspaces();

  const { theme } = useTheme();
  const monacoTheme = theme === "dark" ? "vs-dark" : "light";

  const [localContent, setLocalContent] = useState<string>(
    () => activeDocument?.content || DEFAULT_EDITOR_CONTENT,
  );
  const prevDocIdRef = useRef<string | null>(activeDocument?.id ?? null);
  const updateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
          className="hidden m-0 flex-1 border-0 p-0 outline-none data-[state=active]:flex data-[state=active]:flex-col"
        >
          <div className="flex-1">
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
