// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0
import { useState } from "react";
import { Editor } from "@monaco-editor/react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MarkdownContent } from "./MarkdownContent";

const DEFAULT_CONTENT =
  "# Welcome to the AI Agent Text Editor\n\nStart typing here, and switch to the **Preview** tab to see the rendered Markdown.\n\n- React\n- Monaco Editor\n- MAST AI";

export function EditorPanel() {
  const [content, setContent] = useState(DEFAULT_CONTENT);

  return (
    <div className="flex h-full w-full flex-col bg-background">
      <Tabs defaultValue="editor" className="flex h-full w-full flex-col">
        <div className="border-b px-4 py-2">
          <TabsList>
            <TabsTrigger value="editor">Editor</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          value="editor"
          className="m-0 flex-1 border-0 p-0 outline-none data-[state=active]:flex data-[state=active]:flex-col"
        >
          <div className="flex-1">
            <Editor
              height="100%"
              defaultLanguage="markdown"
              value={content}
              onChange={(value) => setContent(value || "")}
              theme="light"
              options={{
                minimap: { enabled: false },
                wordWrap: "on",
                padding: { top: 16 },
              }}
            />
          </div>
        </TabsContent>

        <TabsContent
          value="preview"
          className="m-0 flex-1 overflow-auto p-8 outline-none data-[state=active]:block"
        >
          <MarkdownContent
            content={content}
            className="mx-auto max-w-3xl text-foreground"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
