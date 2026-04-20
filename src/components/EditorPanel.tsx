// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0
import { useEffect, useRef, useState } from "react";
import { Editor, OnMount } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MarkdownContent } from "./MarkdownContent";
import { useApp } from "@/lib/store";
import { useTheme } from "@/lib/ThemeProvider";
import { useWorkspaces } from "@/lib/WorkspacesContext";
import { SuggestionWidget } from "./SuggestionWidget";
import { createPortal } from "react-dom";

const DEFAULT_CONTENT =
  "# Welcome to the AI Agent Text Editor\n\nStart typing here, and switch to the **Preview** tab to see the rendered Markdown.\n\n- React\n- Monaco Editor\n- MAST AI";

const DEBOUNCE_MS = 500;

export function EditorPanel() {
  const { setEditorInstance, suggestions, setSuggestions, editorInstance } =
    useApp();
  const { activeDocument, updateDocument } = useWorkspaces();

  const { theme } = useTheme();
  const monacoTheme = theme === "dark" ? "vs-dark" : "light";

  const [localContent, setLocalContent] = useState<string>(
    () => activeDocument?.content || DEFAULT_CONTENT,
  );
  const prevDocIdRef = useRef<string | null>(activeDocument?.id ?? null);
  const updateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [suggestionNodes, setSuggestionNodes] = useState<
    { id: string; node: HTMLElement }[]
  >([]);
  const decorationsRef = useRef<string[]>([]);
  const contentWidgetsRef = useRef<Map<string, monaco.editor.IContentWidget>>(
    new Map(),
  );

  // Sync editor content when switching documents
  useEffect(() => {
    if (activeDocument?.id !== prevDocIdRef.current) {
      prevDocIdRef.current = activeDocument?.id ?? null;
      setLocalContent(activeDocument?.content || DEFAULT_CONTENT);
    }
  }, [activeDocument]);

  const handleEditorDidMount: OnMount = (editor) => {
    setEditorInstance(editor);
  };

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

    const pendingSuggestions = suggestions.filter(
      (s) => s.status === "pending",
    );

    // 1. Manage Decorations (Strikethrough Original + Inline Green New Text)
    const newDecorations: monaco.editor.IModelDeltaDecoration[] =
      pendingSuggestions.map((suggestion) => ({
        range: suggestion.range,
        options: {
          description: "suggestion-edit",
          inlineClassName: "suggestion-original",
          after: {
            content: " " + suggestion.replacementText.replace(/\n/g, "↵"),
            inlineClassName: "suggestion-new",
          },
          hoverMessage: {
            value: "**Proposed Edit**\nAccept or reject via the popup.",
          },
        },
      }));

    decorationsRef.current = editorInstance.deltaDecorations(
      decorationsRef.current,
      newDecorations,
    );

    // 2. Manage Content Widgets (Accept/Reject popup)
    const pendingIds = new Set(pendingSuggestions.map((s) => s.id));

    // Add new widgets
    pendingSuggestions.forEach((suggestion) => {
      if (!contentWidgetsRef.current.has(suggestion.id)) {
        const domNode = document.createElement("div");
        domNode.className = "z-50";
        // Monaco captures touchstart globally on mobile; stop propagation so
        // the Accept/Reject buttons inside the widget receive the tap.
        domNode.addEventListener("touchstart", (e) => e.stopPropagation(), {
          passive: false,
        });

        const widget: monaco.editor.IContentWidget = {
          getId: () => `suggestion-widget-${suggestion.id}`,
          getDomNode: () => domNode,
          getPosition: () => ({
            position: {
              lineNumber: suggestion.range.startLineNumber,
              column: suggestion.range.startColumn,
            },
            preference: [
              monaco.editor.ContentWidgetPositionPreference.ABOVE,
              monaco.editor.ContentWidgetPositionPreference.BELOW,
            ],
          }),
        };

        editorInstance.addContentWidget(widget);
        contentWidgetsRef.current.set(suggestion.id, widget);
        setSuggestionNodes((prev) => [
          ...prev,
          { id: suggestion.id, node: domNode },
        ]);

        // Scroll to the new suggestion so the user can see it
        editorInstance.revealRangeInCenterIfOutsideViewport(suggestion.range);
      }
    });

    // Remove old widgets
    Array.from(contentWidgetsRef.current.keys()).forEach((id) => {
      if (!pendingIds.has(id)) {
        const widget = contentWidgetsRef.current.get(id);
        if (widget) {
          editorInstance.removeContentWidget(widget);
          contentWidgetsRef.current.delete(id);
        }
        setSuggestionNodes((prev) => prev.filter((n) => n.id !== id));
      }
    });
  }, [suggestions, editorInstance]);

  const handleAccept = (id: string) => {
    const suggestion = suggestions.find((s) => s.id === id);
    if (suggestion && editorInstance) {
      const model = editorInstance.getModel();
      if (model) {
        model.pushEditOperations(
          [],
          [{ range: suggestion.range, text: suggestion.replacementText }],
          () => null,
        );
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

  return (
    <div className="flex h-full w-full flex-col bg-background relative">
      <Tabs defaultValue="editor" className="flex h-full w-full flex-col">
        <div className="border-b px-4 py-2">
          <TabsList>
            <TabsTrigger value="editor">Editor</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          value="editor"
          className="m-0 flex-1 border-0 p-0 outline-none data-[state=active]:flex data-[state=active]:flex-col relative"
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
            {suggestionNodes.map(({ id, node }) => {
              const suggestion = suggestions.find((s) => s.id === id);
              if (!suggestion) return null;
              return createPortal(
                <SuggestionWidget
                  suggestion={suggestion}
                  onAccept={handleAccept}
                  onReject={handleReject}
                />,
                node,
              );
            })}
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
