// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { Tool, ToolDefinition, ToolRegistry } from "@mast-ai/core";

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

// We need the listener API on top of ToolProvider.
type ListenableRegistry = Pick<ToolRegistry, "getTools" | "getTool"> &
  Pick<ToolRegistry, "addEventListener" | "removeEventListener">;

export function registerWebMCPTools(registry: ListenableRegistry): () => void {
  if (!navigator.modelContext) {
    console.warn("WebMCP not detected in this browser.");
    return () => {};
  }

  const mc = navigator.modelContext;
  const controllers = new Map<string, AbortController>();
  let teardown = false;

  const registerOne = (def: ToolDefinition): boolean => {
    if (teardown) return true;
    if (controllers.has(def.name)) return true;
    const tool = registry.getTool(def.name);
    if (!tool) return true;
    const ac = new AbortController();
    try {
      mc.registerTool(
        {
          name: def.name,
          description: def.description,
          inputSchema: def.parameters,
          execute: (args) => tool.call(args as never, {}) as Promise<string>,
        },
        { signal: ac.signal },
      );
      controllers.set(def.name, ac);
      return true;
    } catch (err) {
      console.warn("WebMCP tool registration failed:", err);
      cleanup();
      return false;
    }
  };

  const onRegistered = ({ tool }: { tool: Tool }) => {
    registerOne(tool.definition());
  };

  const onUnregistered = ({ name }: { name: string }) => {
    const ac = controllers.get(name);
    if (ac) {
      ac.abort();
      controllers.delete(name);
    }
  };

  const cleanup = () => {
    if (teardown) return;
    teardown = true;
    registry.removeEventListener("tool-registered", onRegistered);
    registry.removeEventListener("tool-unregistered", onUnregistered);
    for (const ac of controllers.values()) ac.abort();
    controllers.clear();
  };

  registry.addEventListener("tool-registered", onRegistered);
  registry.addEventListener("tool-unregistered", onUnregistered);

  for (const def of registry.getTools()) {
    if (!registerOne(def)) break;
  }

  return cleanup;
}
