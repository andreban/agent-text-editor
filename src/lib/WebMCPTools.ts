// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { EditorTools } from "./tools/EditorTools";
import { WorkspaceTools } from "./tools/WorkspaceTools";

interface WebMCPTool {
  name: string;
  description: string;
  inputSchema: object;
  execute: (args: Record<string, unknown>) => string | Promise<string>;
}

interface ModelContext {
  registerTool(tool: WebMCPTool, options?: { signal?: AbortSignal }): void;
}

declare global {
  interface Navigator {
    modelContext?: ModelContext;
  }
}

export function registerWebMCPTools(
  editorTools: EditorTools,
  workspaceTools: WorkspaceTools,
): () => void {
  if (!navigator.modelContext) {
    console.warn("WebMCP not detected in this browser.");
    return () => {};
  }

  const controller = new AbortController();
  const { signal } = controller;
  const mc = navigator.modelContext;

  try {
    mc.registerTool(
      {
        name: "read",
        description:
          "Reads the complete current editor content and returns it as a string.",
        inputSchema: { type: "object", properties: {} },
        execute: () => editorTools.read(),
      },
      { signal },
    );

    mc.registerTool(
      {
        name: "read_selection",
        description: "Reads the currently selected text in the editor.",
        inputSchema: { type: "object", properties: {} },
        execute: () => editorTools.read_selection(),
      },
      { signal },
    );

    mc.registerTool(
      {
        name: "search",
        description:
          "Finds all occurrences of a query string in the document. Returns the line and column of each match.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "The text to search for." },
          },
          required: ["query"],
        },
        execute: (args) => editorTools.search(args as { query: string }),
      },
      { signal },
    );

    mc.registerTool(
      {
        name: "get_metadata",
        description:
          "Returns metadata about the current document: character count, word count, and line count.",
        inputSchema: { type: "object", properties: {} },
        execute: () => editorTools.get_metadata(),
      },
      { signal },
    );

    mc.registerTool(
      {
        name: "get_current_mode",
        description:
          "Returns the current UI mode: 'editor' (Monaco editor is visible) or 'preview' (Markdown preview is visible).",
        inputSchema: { type: "object", properties: {} },
        execute: () => editorTools.get_current_mode(),
      },
      { signal },
    );

    mc.registerTool(
      {
        name: "request_switch_to_editor",
        description:
          "Requests the user to switch from Preview mode to Editor mode. Displays a prompt to the user and waits for them to accept or decline. Call this before attempting edits when in preview mode.",
        inputSchema: { type: "object", properties: {} },
        execute: () => editorTools.request_switch_to_editor(),
      },
      { signal },
    );

    mc.registerTool(
      {
        name: "edit",
        description:
          "Proposes a targeted edit by replacing a specific piece of text. The user must approve or reject the change before it is applied. Use for small, localized changes only — do not pass the entire document.",
        inputSchema: {
          type: "object",
          properties: {
            originalText: {
              type: "string",
              description:
                "The exact, minimal text to replace. Must be short and unique in the document.",
            },
            replacementText: {
              type: "string",
              description: "The new text to replace the originalText with.",
            },
          },
          required: ["originalText", "replacementText"],
        },
        execute: (args) =>
          editorTools.edit(
            args as { originalText: string; replacementText: string },
          ),
      },
      { signal },
    );

    mc.registerTool(
      {
        name: "write",
        description:
          "Proposes a complete rewrite of the entire document. The user must approve or reject the change before it is applied. Use only when a full document rewrite is explicitly requested.",
        inputSchema: {
          type: "object",
          properties: {
            content: {
              type: "string",
              description: "The full new document content.",
            },
          },
          required: ["content"],
        },
        execute: (args) => editorTools.write(args as { content: string }),
      },
      { signal },
    );

    mc.registerTool(
      {
        name: "get_active_doc_info",
        description:
          "Returns the id and title of the document currently open in the editor.",
        inputSchema: { type: "object", properties: {} },
        execute: () => workspaceTools.get_active_doc_info(),
      },
      { signal },
    );

    mc.registerTool(
      {
        name: "list_workspace_docs",
        description:
          "Lists all documents in the current workspace. Returns an array of { id, title } objects.",
        inputSchema: { type: "object", properties: {} },
        execute: () => workspaceTools.list_workspace_docs(),
      },
      { signal },
    );

    mc.registerTool(
      {
        name: "read_workspace_doc",
        description:
          "Reads the full content of a specific document in the workspace. Returns { title, content } or { error } if not found.",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description:
                "The document ID to read. Use list_workspace_docs first to get IDs.",
            },
          },
          required: ["id"],
        },
        execute: (args) =>
          workspaceTools.read_workspace_doc(args as { id: string }),
      },
      { signal },
    );

    mc.registerTool(
      {
        name: "query_workspace_doc",
        description:
          "Asks a question about a specific document in the workspace. Returns { summary } with a concise answer.",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string", description: "The document ID to query." },
            query: {
              type: "string",
              description: "The question or query about the document.",
            },
          },
          required: ["id", "query"],
        },
        execute: (args) =>
          workspaceTools.query_workspace_doc(
            args as { id: string; query: string },
          ),
      },
      { signal },
    );

    mc.registerTool(
      {
        name: "query_workspace",
        description:
          "Asks a question that spans all documents in the workspace. Queries each document individually then synthesizes the results. Returns { answer }.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description:
                "The question to answer across all workspace documents.",
            },
          },
          required: ["query"],
        },
        execute: (args) =>
          workspaceTools.query_workspace(args as { query: string }),
      },
      { signal },
    );

    mc.registerTool(
      {
        name: "create_document",
        description:
          "Creates a new blank document in the workspace with the given title. Pauses for user authorization before creating.",
        inputSchema: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "The title for the new document.",
            },
          },
          required: ["title"],
        },
        execute: (args) =>
          workspaceTools.create_document(args as { title: string }),
      },
      { signal },
    );

    mc.registerTool(
      {
        name: "rename_document",
        description:
          "Renames an existing document in the workspace. Pauses for user authorization before renaming.",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string", description: "The document ID to rename." },
            title: {
              type: "string",
              description: "The new title for the document.",
            },
          },
          required: ["id", "title"],
        },
        execute: (args) =>
          workspaceTools.rename_document(args as { id: string; title: string }),
      },
      { signal },
    );

    mc.registerTool(
      {
        name: "delete_document",
        description:
          "Deletes a document from the workspace. Pauses for user authorization before deleting.",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string", description: "The document ID to delete." },
          },
          required: ["id"],
        },
        execute: (args) =>
          workspaceTools.delete_document(args as { id: string }),
      },
      { signal },
    );

    mc.registerTool(
      {
        name: "switch_active_document",
        description:
          "Switches the active document in the editor. Saves the current document content before switching. Does not require user authorization.",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The document ID to switch to.",
            },
          },
          required: ["id"],
        },
        execute: (args) =>
          workspaceTools.switch_active_document(args as { id: string }),
      },
      { signal },
    );
  } catch (err) {
    console.warn("WebMCP tool registration failed:", err);
    return () => {};
  }

  return () => controller.abort();
}
