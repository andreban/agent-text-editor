// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import { addAllBuiltInAITools } from "@mast-ai/built-in-ai";
import { DefaultAgentRunnerFactory, AgentModel } from "@/lib/agents";
import type { StreamItem } from "@/lib/agents";
import {
  EditorTools,
  createDelegateToSkillHandler,
} from "@/lib/tools/EditorTools";
import { WorkspaceTools } from "@/lib/tools/WorkspaceTools";
import { buildReadWriteRegistry } from "@/lib/tools/registries";
import { registerDelegationTools } from "@/lib/tools/DelegationTools";
import { registerWebMCPTools } from "@/lib/WebMCPTools";
import { useAgentConfig, useEditorUI } from "@/lib/store";
import { useWorkspaces } from "@/lib/WorkspacesContext";

interface AgentContextValue {
  items: readonly StreamItem[];
  isLoading: boolean;
  sendMessage: (prompt: string, displayText?: string) => Promise<void>;
  cancel: () => void;
}

const AgentContext = createContext<AgentContextValue | undefined>(undefined);

export function AgentContextProvider({ children }: { children: ReactNode }) {
  const { apiKey, modelName, setTotalTokens, skills } = useAgentConfig();
  const {
    setSuggestions,
    approveAll,
    activeTab,
    editorContent,
    editorInstance,
    setPendingTabSwitchRequest,
    setPendingWorkspaceAction,
    setPendingPlanConfirmation,
  } = useEditorUI();
  const {
    activeWorkspace,
    activeDocument,
    createDocumentWithTitle,
    updateDocument,
    deleteDocument,
    setActiveDocumentId,
  } = useWorkspaces();

  // Stable refs updated on every render so tool callbacks always see latest values.
  const docsRef = useRef(activeWorkspace?.documents ?? []);
  useEffect(() => {
    docsRef.current = activeWorkspace?.documents ?? [];
  }, [activeWorkspace]);

  const activeDocRef = useRef<{ id: string; title: string } | null>(
    activeDocument
      ? { id: activeDocument.id, title: activeDocument.title }
      : null,
  );
  useEffect(() => {
    activeDocRef.current = activeDocument
      ? { id: activeDocument.id, title: activeDocument.title }
      : null;
  }, [activeDocument]);

  const editorInstanceRef = useRef(editorInstance);
  useEffect(() => {
    editorInstanceRef.current = editorInstance;
  }, [editorInstance]);

  const editorContentRef = useRef(editorContent);
  useEffect(() => {
    editorContentRef.current = editorContent;
  }, [editorContent]);

  const activeTabRef = useRef(activeTab);
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  const approveAllRef = useRef(approveAll);
  useEffect(() => {
    approveAllRef.current = approveAll;
  }, [approveAll]);

  const requestTabSwitch = useCallback(
    () =>
      new Promise<boolean>((resolve) => {
        setPendingTabSwitchRequest({ resolve });
      }),
    [setPendingTabSwitchRequest],
  );

  const editorTools = useMemo(
    () =>
      new EditorTools(
        editorInstanceRef,
        setSuggestions,
        approveAllRef,
        editorContentRef,
        activeTabRef,
        requestTabSwitch,
      ),
    [setSuggestions, requestTabSwitch],
  );

  const usageCallback = useCallback(
    (usage: { totalTokenCount?: number }) =>
      setTotalTokens((prev) => prev + (usage.totalTokenCount || 0)),
    [setTotalTokens],
  );

  const factory = useMemo(
    () =>
      apiKey
        ? new DefaultAgentRunnerFactory(apiKey, modelName, usageCallback)
        : null,
    [apiKey, modelName, usageCallback],
  );

  const workspaceTools = useMemo(
    () =>
      new WorkspaceTools(
        docsRef,
        activeDocRef,
        factory ?? new DefaultAgentRunnerFactory("", ""),
        (title) => createDocumentWithTitle(title),
        (id, title) => updateDocument(id, { title }),
        (id) => deleteDocument(id),
        (id) => setActiveDocumentId(id),
        (id, content) => updateDocument(id, { content }),
        editorInstanceRef,
        editorContentRef,
        setPendingWorkspaceAction,
        approveAllRef,
      ),
    [
      factory,
      createDocumentWithTitle,
      updateDocument,
      deleteDocument,
      setActiveDocumentId,
      setPendingWorkspaceAction,
    ],
  );

  useEffect(
    () => registerWebMCPTools(editorTools, workspaceTools),
    [editorTools, workspaceTools],
  );

  const registry = useMemo(() => {
    if (!apiKey || !factory) return null;
    const r = buildReadWriteRegistry(editorTools, workspaceTools);
    addAllBuiltInAITools(r).catch(() => {});
    r.register({
      definition: () => ({
        name: "delegate_to_skill",
        description:
          "Delegates a task to a named skill (sub-agent). The skill runs with read-only access and returns its response as a string. Interpret the response and act on it accordingly.",
        parameters: {
          type: "object",
          properties: {
            skillName: {
              type: "string",
              description: "The exact name of the skill to invoke.",
            },
            task: {
              type: "string",
              description:
                "The specific task or instructions to pass to the skill.",
            },
          },
          required: ["skillName", "task"],
        },
        scope: "write" as const,
      }),
      call: createDelegateToSkillHandler(factory, r.readOnly()),
    });
    registerDelegationTools(
      r,
      factory,
      r.readOnly(),
      workspaceTools,
      setPendingPlanConfirmation,
    );
    return r;
  }, [
    apiKey,
    factory,
    editorTools,
    workspaceTools,
    setPendingPlanConfirmation,
  ]);

  const model = useMemo(
    () =>
      apiKey && registry
        ? new AgentModel(apiKey, modelName, skills, registry, usageCallback)
        : null,
    [apiKey, modelName, skills, registry, usageCallback],
  );

  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    if (!model) return;
    return model.subscribe(() => forceUpdate());
  }, [model]);

  const flushEditorContent = useCallback(() => {
    const doc = activeDocRef.current;
    if (doc) {
      const content =
        editorInstanceRef.current?.getValue() ?? editorContentRef.current;
      updateDocument(doc.id, { content });
    }
  }, [updateDocument]);

  const sendMessage = useCallback(
    (prompt: string, displayText?: string) =>
      model?.sendMessage(prompt, displayText, flushEditorContent) ??
      Promise.resolve(),
    [model, flushEditorContent],
  );

  const cancel = useCallback(() => model?.cancel(), [model]);

  return (
    <AgentContext.Provider
      value={{
        items: model?.items ?? [],
        isLoading: model?.isLoading ?? false,
        sendMessage,
        cancel,
      }}
    >
      {children}
    </AgentContext.Provider>
  );
}

export function useAgentContext(): AgentContextValue {
  const ctx = useContext(AgentContext);
  if (!ctx)
    throw new Error("useAgentContext must be used within AgentContextProvider");
  return ctx;
}
