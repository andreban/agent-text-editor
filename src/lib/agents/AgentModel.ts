// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import {
  AgentRunner,
  AgentConfig,
  AgentEvent,
  Conversation,
  ToolProvider,
} from "@mast-ai/core";
import { GoogleGenAIAdapter } from "@mast-ai/google-genai";
import { buildOrchestratorPrompt } from "./roles/orchestrator";
import type { Skill } from "../skills";
import type { StreamItem, ChildItem } from "./types";

export class AgentModel {
  private _items: StreamItem[] = [];
  private _isLoading = false;
  private _listeners = new Set<() => void>();
  private _abortController: AbortController | null = null;
  private _conversation: Conversation;

  constructor(
    apiKey: string,
    modelName: string,
    skills: Skill[],
    registry: ToolProvider,
    usageCallback?: (usage: { totalTokenCount?: number }) => void,
  ) {
    const adapter = new GoogleGenAIAdapter(apiKey, modelName, usageCallback);
    const runner = new AgentRunner(adapter, registry);
    const agentConfig: AgentConfig = {
      name: "EditorAssistant",
      instructions: buildOrchestratorPrompt(skills),
    };
    this._conversation = runner.conversation(agentConfig);
    this._initFromHistory();
  }

  private _initFromHistory(): void {
    const history = this._conversation.history;
    if (history.length === 0) return;
    this._items = history.flatMap((m, i) => {
      if (m.content.type === "text") {
        const item: StreamItem =
          m.role === "user"
            ? { kind: "user", id: `hist-${i}`, text: m.content.text }
            : {
                kind: "assistant",
                id: `hist-${i}`,
                text: m.content.text,
                thought: "",
                isStreaming: false,
              };
        return [item];
      }
      if (m.content.type === "tool_calls") {
        return m.content.calls.map(
          (c, j): StreamItem => ({
            kind: "tool",
            id: `hist-${i}-${j}`,
            name: c.name,
            pending: false,
          }),
        );
      }
      return [];
    });
  }

  get items(): readonly StreamItem[] {
    return this._items;
  }

  get isLoading(): boolean {
    return this._isLoading;
  }

  subscribe(listener: () => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  cancel(): void {
    this._abortController?.abort();
  }

  async sendMessage(
    prompt: string,
    displayText?: string,
    onBeforeSend?: () => void,
  ): Promise<void> {
    if (!prompt.trim() || this._isLoading) return;

    const abortController = new AbortController();
    this._abortController = abortController;
    this._isLoading = true;
    this._items = [
      ...this._items,
      {
        kind: "user",
        id: `user-${crypto.randomUUID()}`,
        text: (displayText ?? prompt).trim(),
      },
    ];
    this._notify();

    onBeforeSend?.();

    let assistantId: string | null = null;
    let toolId: string | null = null;
    const activeSkillRef = {
      id: null as string | null,
      toolId: null as string | null,
    };

    const mutateItems = (fn: (prev: StreamItem[]) => StreamItem[]) => {
      this._items = fn(this._items);
      this._notify();
    };

    const ensureAssistant = (): string => {
      if (assistantId) return assistantId;
      const id = `asst-${crypto.randomUUID()}`;
      assistantId = id;
      mutateItems((prev) => [
        ...prev,
        { kind: "assistant", id, text: "", thought: "", isStreaming: true },
      ]);
      return id;
    };

    const onToolEvent = (_toolName: string, event: AgentEvent) => {
      const skillId = activeSkillRef.id;
      if (!skillId) return;

      if (event.type === "thinking" || event.type === "text_delta") {
        const kind =
          event.type === "thinking" ? ("thought" as const) : ("text" as const);
        const delta = event.delta;
        mutateItems((prev) =>
          prev.map((it) => {
            if (
              (it.kind !== "skill" && it.kind !== "agent") ||
              it.id !== skillId
            )
              return it;
            const last = it.childItems[it.childItems.length - 1];
            if (last && last.kind === kind) {
              return {
                ...it,
                childItems: it.childItems.map((c, i) =>
                  i === it.childItems.length - 1
                    ? { ...c, text: (c as { text: string }).text + delta }
                    : c,
                ),
              };
            }
            return {
              ...it,
              childItems: [
                ...it.childItems,
                { kind, id: `child-${crypto.randomUUID()}`, text: delta },
              ],
            };
          }),
        );
      } else if (event.type === "tool_call_started") {
        const tid = `child-tool-${crypto.randomUUID()}`;
        activeSkillRef.toolId = tid;
        const childTool: ChildItem = {
          kind: "tool",
          id: tid,
          name: event.name,
          pending: true,
          params: event.args,
        };
        mutateItems((prev) =>
          prev.map((it) =>
            (it.kind === "skill" || it.kind === "agent") && it.id === skillId
              ? { ...it, childItems: [...it.childItems, childTool] }
              : it,
          ),
        );
      } else if (event.type === "tool_call_completed") {
        const tid = activeSkillRef.toolId;
        if (tid) {
          const toolResult = event.result;
          mutateItems((prev) =>
            prev.map((it) => {
              if (
                (it.kind !== "skill" && it.kind !== "agent") ||
                it.id !== skillId
              )
                return it;
              return {
                ...it,
                childItems: it.childItems.map((c) =>
                  c.kind === "tool" && c.id === tid
                    ? { ...c, pending: false, result: toolResult }
                    : c,
                ),
              };
            }),
          );
          activeSkillRef.toolId = null;
        }
      }
    };

    try {
      for await (const event of this._conversation.runStream(
        prompt,
        abortController.signal,
        onToolEvent,
      )) {
        if (event.type === "thinking") {
          const id = ensureAssistant();
          const delta = event.delta;
          mutateItems((prev) =>
            prev.map((it) =>
              it.kind === "assistant" && it.id === id
                ? { ...it, thought: it.thought + delta }
                : it,
            ),
          );
        } else if (event.type === "text_delta") {
          const id = ensureAssistant();
          const delta = event.delta;
          mutateItems((prev) =>
            prev.map((it) =>
              it.kind === "assistant" && it.id === id
                ? { ...it, text: it.text + delta }
                : it,
            ),
          );
        } else if (event.type === "tool_call_started") {
          if (assistantId) {
            const closeId = assistantId;
            mutateItems((prev) =>
              prev.map((it) =>
                it.kind === "assistant" && it.id === closeId
                  ? { ...it, isStreaming: false }
                  : it,
              ),
            );
            assistantId = null;
          }
          const tid = `tool-${crypto.randomUUID()}`;
          toolId = tid;
          if (event.name === "invoke_agent") {
            const args = event.args as { systemPrompt?: string; task?: string };
            activeSkillRef.id = tid;
            activeSkillRef.toolId = null;
            mutateItems((prev) => [
              ...prev,
              {
                kind: "agent",
                id: tid,
                agentRole: "Agent",
                task: args.task ?? "",
                pending: true,
                childItems: [],
              },
            ]);
          } else if (event.name === "delegate_to_skill") {
            const args = event.args as { skillName?: string; task?: string };
            activeSkillRef.id = tid;
            activeSkillRef.toolId = null;
            mutateItems((prev) => [
              ...prev,
              {
                kind: "skill",
                id: tid,
                name: args.skillName ?? "skill",
                task: args.task ?? "",
                pending: true,
                childItems: [],
              },
            ]);
          } else {
            const name = event.name;
            const params = event.args;
            mutateItems((prev) => [
              ...prev,
              { kind: "tool", id: tid, name, pending: true, params },
            ]);
          }
        } else if (event.type === "tool_call_completed") {
          if (toolId) {
            const closeToolId = toolId;
            if (activeSkillRef.id === closeToolId) {
              mutateItems((prev) =>
                prev.map((it) =>
                  (it.kind === "skill" || it.kind === "agent") &&
                  it.id === closeToolId
                    ? { ...it, pending: false }
                    : it,
                ),
              );
              activeSkillRef.id = null;
            } else {
              const toolResult = event.result;
              mutateItems((prev) =>
                prev.map((it) =>
                  it.kind === "tool" && it.id === closeToolId
                    ? { ...it, pending: false, result: toolResult }
                    : it,
                ),
              );
            }
            toolId = null;
          }
          assistantId = null;
        } else if (event.type === "done") {
          if (assistantId) {
            const closeId = assistantId;
            mutateItems((prev) =>
              prev.map((it) =>
                it.kind === "assistant" && it.id === closeId
                  ? { ...it, isStreaming: false }
                  : it,
              ),
            );
            assistantId = null;
          }
        }
      }
    } catch (error) {
      if ((error as { name?: string }).name !== "AbortError") {
        console.error("Chat Error:", error);
      }
      if (assistantId) {
        const removeId = assistantId;
        mutateItems((prev) => prev.filter((it) => it.id !== removeId));
      }
    } finally {
      this._abortController = null;
      this._isLoading = false;
      this._notify();
    }
  }

  private _notify(): void {
    this._listeners.forEach((l) => l());
  }
}
