// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import {
  AgentProvider,
  INLINE_APPROVAL,
  type OnApprovalRequired,
  type IconMap,
} from "@mast-ai/react-ui";
import type { AgentConfig } from "@mast-ai/core";
import { addAllBuiltInAITools } from "@mast-ai/built-in-ai";
import {
  Brain,
  Wrench,
  CircleCheck,
  CircleX,
  Ban,
  Loader2,
  Send,
  Square,
} from "lucide-react";
import {
  DefaultAgentRunnerFactory,
  buildOrchestratorPrompt,
} from "@/lib/agents";
import type { EditorContext } from "@/lib/agents/tools/editor/context";
import type { WorkspaceContext } from "@/lib/agents/tools/workspace/context";
import { DelegateToSkillTool } from "@/lib/agents/tools/delegation/delegate_to_skill";
import { createToolRegistry } from "@/lib/agents/tools/registries";
import { registerDelegationTools } from "@/lib/agents/tools/delegation";
import { useAgentConfig, useEditorUI } from "@/lib/store";
import { useWorkspaces } from "@/lib/WorkspacesContext";

const ICONS: IconMap = {
  brain: <Brain className="w-4 h-4" />,
  wrench: <Wrench className="w-4 h-4" />,
  check: <CircleCheck className="w-4 h-4" />,
  error: <CircleX className="w-4 h-4" />,
  cancelled: <Ban className="w-4 h-4" />,
  loader: <Loader2 className="w-4 h-4 animate-spin" />,
  send: <Send className="w-4 h-4" />,
  stop: <Square className="w-4 h-4" />,
};

export function AgentProviderShim({ children }: { children: ReactNode }) {
  const { apiKey, modelName, skills, setTotalTokens } = useAgentConfig();
  const {
    setSuggestions,
    approveAll,
    activeTab,
    editorContent,
    editorInstance,
    setPendingTabSwitchRequest,
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
    }),
    [
      factory,
      createDocumentWithTitle,
      updateDocument,
      deleteDocument,
      setActiveDocumentId,
    ],
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
  }, [apiKey, factory, editorCtx, workspaceCtx, setPendingPlanConfirmation]);

  const runner = useMemo(() => {
    if (!factory || !registry) return null;
    return factory.create({ tools: registry });
  }, [factory, registry]);

  const agent = useMemo<AgentConfig>(
    () => ({
      name: "EditorAssistant",
      instructions: buildOrchestratorPrompt(skills),
    }),
    [skills],
  );

  // Routing rules:
  // - Approve-all toggle bypasses every prompt (matches the previous bespoke
  //   behaviour).
  // - `edit`/`write` keep their Monaco suggestion UI: the tool's own
  //   `applySuggestion` handles approval inline in the editor, so we simply
  //   let the call through.
  // - Workspace mutations (`create_document`, `rename_document`,
  //   `delete_document`) defer to the library's inline approval queue, which
  //   renders an Approve / Reject prompt inside the assistant message.
  // - Anything else falls through unprompted (today nothing else carries
  //   `requiresApproval: true`).
  const onApprovalRequired = useCallback<OnApprovalRequired>(
    async (toolCall) => {
      if (approveAllRef.current) return true;
      if (toolCall.name === "edit" || toolCall.name === "write") return true;
      if (
        toolCall.name === "create_document" ||
        toolCall.name === "rename_document" ||
        toolCall.name === "delete_document"
      ) {
        return INLINE_APPROVAL;
      }
      return true;
    },
    [],
  );

  return (
    <AgentProvider
      runner={runner}
      agent={agent}
      icons={ICONS}
      onApprovalRequired={onApprovalRequired}
      disableRoot
    >
      {children}
    </AgentProvider>
  );
}
