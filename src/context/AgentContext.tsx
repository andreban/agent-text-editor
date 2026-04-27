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
import type { EditorContext } from "@/lib/agents/tools/editor/context";
import type { WorkspaceContext } from "@/lib/agents/tools/workspace/context";
import { DelegateToSkillTool } from "@/lib/agents/tools/delegation/delegate_to_skill";
import { createToolRegistry } from "@/lib/agents/tools/registries";
import { registerDelegationTools } from "@/lib/agents/tools/delegation";
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

  const editorCtx = useMemo<EditorContext>(
    () => ({
      editorRef: editorInstanceRef,
      editorContentRef,
      activeTabRef,
      requestTabSwitch,
      setSuggestions,
      approveAllRef,
    }),
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

  const workspaceCtx = useMemo<WorkspaceContext>(
    () => ({
      docsRef,
      activeDocRef,
      factory: factory ?? new DefaultAgentRunnerFactory("", ""),
      createDocumentFn: (title) => createDocumentWithTitle(title),
      renameDocumentFn: (id, title) => updateDocument(id, { title }),
      deleteDocumentFn: (id) => deleteDocument(id),
      setActiveDocumentIdFn: (id) => setActiveDocumentId(id),
      saveDocContentFn: (id, content) => updateDocument(id, { content }),
      editorRef: editorInstanceRef,
      editorContentRef,
      setPendingWorkspaceAction,
      approveAllRef,
    }),
    [
      factory,
      createDocumentWithTitle,
      updateDocument,
      deleteDocument,
      setActiveDocumentId,
      setPendingWorkspaceAction,
    ],
  );

  const baseRegistry = useMemo(
    // eslint-disable-next-line react-hooks/refs
    () => createToolRegistry(editorCtx, workspaceCtx),
    [editorCtx, workspaceCtx],
  );

  useEffect(
    () => registerWebMCPTools(baseRegistry),
    [baseRegistry],
  );

  const registry = useMemo(() => {
    if (!apiKey || !factory) return null;
    // eslint-disable-next-line react-hooks/refs
    const r = createToolRegistry(editorCtx, workspaceCtx);
    addAllBuiltInAITools(r).catch(() => {});
    r.register(new DelegateToSkillTool(factory, r.readOnly()));
    registerDelegationTools(
      r,
      factory,
      r.readOnly(),
      // eslint-disable-next-line react-hooks/refs
      workspaceCtx.docsRef,
      setPendingPlanConfirmation,
    );
    return r;
  }, [
    apiKey,
    factory,
    editorCtx,
    workspaceCtx,
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
