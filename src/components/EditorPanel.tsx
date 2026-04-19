// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0
import { useState } from "react";
import { Editor } from "@monaco-editor/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
          <div className="mx-auto max-w-3xl space-y-4 text-foreground">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ ...props }) => (
                  <h1
                    className="mt-6 scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl"
                    {...props}
                  />
                ),
                h2: ({ ...props }) => (
                  <h2
                    className="mt-10 scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight transition-colors first:mt-0"
                    {...props}
                  />
                ),
                h3: ({ ...props }) => (
                  <h3
                    className="mt-8 scroll-m-20 text-2xl font-semibold tracking-tight"
                    {...props}
                  />
                ),
                p: ({ ...props }) => (
                  <p
                    className="leading-7 [&:not(:first-child)]:mt-6"
                    {...props}
                  />
                ),
                ul: ({ ...props }) => (
                  <ul className="my-6 ml-6 list-disc [&>li]:mt-2" {...props} />
                ),
                ol: ({ ...props }) => (
                  <ol
                    className="my-6 ml-6 list-decimal [&>li]:mt-2"
                    {...props}
                  />
                ),
                blockquote: ({ ...props }) => (
                  <blockquote
                    className="mt-6 border-l-2 pl-6 italic"
                    {...props}
                  />
                ),
                code: ({ className, children, ...props }) => {
                  const match = /language-(\w+)/.exec(className || "");
                  const isInline = !match && !className?.includes("language-");
                  if (isInline) {
                    return (
                      <code
                        className="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold"
                        {...props}
                      >
                        {children}
                      </code>
                    );
                  }
                  return (
                    <code
                      className="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm"
                      {...props}
                    >
                      {children}
                    </code>
                  );
                },
                pre: ({ ...props }) => (
                  <pre
                    className="mb-4 mt-6 overflow-x-auto rounded-lg bg-zinc-950 p-4 text-zinc-50"
                    {...props}
                  />
                ),
              }}
            >
              {content}
            </ReactMarkdown>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
