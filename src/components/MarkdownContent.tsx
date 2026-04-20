// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

interface MarkdownContentProps {
  content: string;
  className?: string;
}

export function MarkdownContent({ content, className }: MarkdownContentProps) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          h1: ({ ...props }) => (
            <h1
              className="mt-6 scroll-m-20 text-3xl font-extrabold tracking-tight lg:text-4xl"
              {...props}
            />
          ),
          h2: ({ ...props }) => (
            <h2
              className="mt-8 scroll-m-20 border-b pb-2 text-2xl font-semibold tracking-tight transition-colors first:mt-0"
              {...props}
            />
          ),
          h3: ({ ...props }) => (
            <h3
              className="mt-6 scroll-m-20 text-xl font-semibold tracking-tight"
              {...props}
            />
          ),
          p: ({ ...props }) => (
            <p className="leading-7 [&:not(:first-child)]:mt-4" {...props} />
          ),
          ul: ({ ...props }) => (
            <ul className="my-4 ml-6 list-disc [&>li]:mt-1" {...props} />
          ),
          ol: ({ ...props }) => (
            <ol className="my-4 ml-6 list-decimal [&>li]:mt-1" {...props} />
          ),
          blockquote: ({ ...props }) => (
            <blockquote className="mt-4 border-l-2 pl-6 italic" {...props} />
          ),
          code: ({ className, children, ...props }) => {
            const match = /language-(\w+)/.exec(className || "");
            const isInline = !match && !className?.includes("language-");
            if (isInline) {
              return (
                <code
                  className="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-xs font-semibold"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <code
                className="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-xs"
                {...props}
              >
                {children}
              </code>
            );
          },
          pre: ({ ...props }) => (
            <pre
              className="mb-4 mt-4 overflow-x-auto rounded-lg bg-muted text-muted-foreground p-4 text-xs"
              {...props}
            />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
