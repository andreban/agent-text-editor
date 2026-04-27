// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { ToolProvider } from "@mast-ai/core";

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

export function registerWebMCPTools(provider: ToolProvider): () => void {
  if (!navigator.modelContext) {
    console.warn("WebMCP not detected in this browser.");
    return () => {};
  }

  const controller = new AbortController();
  const { signal } = controller;
  const mc = navigator.modelContext;

  try {
    for (const def of provider.getTools()) {
      const tool = provider.getTool(def.name)!;
      mc.registerTool(
        {
          name: def.name,
          description: def.description,
          inputSchema: def.parameters,
          execute: (args) => tool.call(args as never, {}) as Promise<string>,
        },
        { signal },
      );
    }
  } catch (err) {
    console.warn("WebMCP tool registration failed:", err);
    return () => {};
  }

  return () => controller.abort();
}
