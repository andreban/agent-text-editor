// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import React, { createContext, useContext, useState, useEffect } from "react";
import * as monaco from "monaco-editor";
import { Skill, initializeSkills, saveSkills } from "./skills";
import type { Plan } from "@/lib/agents";

export interface Suggestion {
  id: string;
  originalText: string;
  replacementText: string;
  status: "pending" | "accepted" | "rejected";
  range: monaco.IRange;
  resolve: (value: string) => void;
}

export interface TabSwitchRequest {
  resolve: (accepted: boolean) => void;
}

export interface PlanConfirmationRequest {
  plan: Plan;
  resolve: (accepted: boolean) => void;
}

export interface WorkflowState {
  planId: string;
  steps: Array<{
    id: string;
    status: "pending" | "running" | "done" | "failed" | "skipped";
    result?: unknown;
  }>;
}

// --- Agent config context (slow-changing: API key, model, skills, token count) ---

interface AgentConfigState {
  apiKey: string | null;
  setApiKey: (key: string | null) => void;
  modelName: string;
  setModelName: (name: string) => void;
  totalTokens: number;
  setTotalTokens: (tokens: number | ((prev: number) => number)) => void;
  skills: Skill[];
  setSkills: (skills: Skill[]) => void;
}

const AgentConfigContext = createContext<AgentConfigState | undefined>(
  undefined,
);

// --- Editor UI context (fast-changing: editor state, suggestions, UI toggles) ---

interface EditorUIState {
  editorInstance: monaco.editor.IStandaloneCodeEditor | null;
  setEditorInstance: (
    editor: monaco.editor.IStandaloneCodeEditor | null,
  ) => void;
  activeTab: "editor" | "preview";
  setActiveTab: (tab: "editor" | "preview") => void;
  editorContent: string;
  setEditorContent: (content: string) => void;
  suggestions: Suggestion[];
  setSuggestions: (
    suggestions: Suggestion[] | ((prev: Suggestion[]) => Suggestion[]),
  ) => void;
  pendingTabSwitchRequest: TabSwitchRequest | null;
  setPendingTabSwitchRequest: (req: TabSwitchRequest | null) => void;
  pendingPlanConfirmation: PlanConfirmationRequest | null;
  setPendingPlanConfirmation: (req: PlanConfirmationRequest | null) => void;
  approveAll: boolean;
  setApproveAll: (approve: boolean) => void;
  workflowState: WorkflowState | null;
  setWorkflowState: (state: WorkflowState | null) => void;
}

const EditorUIContext = createContext<EditorUIState | undefined>(undefined);

// --- Combined type (for useApp backward compat) ---

interface AppState extends AgentConfigState, EditorUIState {}

// --- Provider ---

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [apiKey, setApiKey] = useState<string | null>(() =>
    localStorage.getItem("gemini_api_key"),
  );
  const [modelName, setModelName] = useState<string>(() => {
    const saved = localStorage.getItem("gemini_model_name");
    if (saved === "gemini-2.0-flash") return "gemini-3.1-flash-lite-preview";
    return saved || "gemini-3.1-flash-lite-preview";
  });
  const [totalTokens, setTotalTokens] = useState<number>(0);
  const [skills, setSkillsState] = useState<Skill[]>(() => initializeSkills());

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [editorInstance, setEditorInstance] =
    useState<monaco.editor.IStandaloneCodeEditor | null>(null);
  const [activeTab, setActiveTab] = useState<"editor" | "preview">("editor");
  const [editorContent, setEditorContent] = useState<string>("");
  const [pendingTabSwitchRequest, setPendingTabSwitchRequest] =
    useState<TabSwitchRequest | null>(null);
  const [pendingPlanConfirmation, setPendingPlanConfirmation] =
    useState<PlanConfirmationRequest | null>(null);
  const [approveAll, setApproveAll] = useState(false);
  const [workflowState, setWorkflowState] = useState<WorkflowState | null>(
    null,
  );

  const setSkills = (updated: Skill[]) => {
    saveSkills(updated);
    setSkillsState(updated);
  };

  useEffect(() => {
    if (apiKey) {
      localStorage.setItem("gemini_api_key", apiKey);
    } else {
      localStorage.removeItem("gemini_api_key");
    }
  }, [apiKey]);

  useEffect(() => {
    localStorage.setItem("gemini_model_name", modelName);
  }, [modelName]);

  const agentConfigValue: AgentConfigState = {
    apiKey,
    setApiKey,
    modelName,
    setModelName,
    totalTokens,
    setTotalTokens,
    skills,
    setSkills,
  };

  const editorUIValue: EditorUIState = {
    editorInstance,
    setEditorInstance,
    activeTab,
    setActiveTab,
    editorContent,
    setEditorContent,
    suggestions,
    setSuggestions,
    pendingTabSwitchRequest,
    setPendingTabSwitchRequest,
    pendingPlanConfirmation,
    setPendingPlanConfirmation,
    approveAll,
    setApproveAll,
    workflowState,
    setWorkflowState,
  };

  return (
    <AgentConfigContext.Provider value={agentConfigValue}>
      <EditorUIContext.Provider value={editorUIValue}>
        {children}
      </EditorUIContext.Provider>
    </AgentConfigContext.Provider>
  );
};

export const useAgentConfig = (): AgentConfigState => {
  const ctx = useContext(AgentConfigContext);
  if (ctx === undefined) {
    throw new Error("useAgentConfig must be used within an AppProvider");
  }
  return ctx;
};

export const useEditorUI = (): EditorUIState => {
  const ctx = useContext(EditorUIContext);
  if (ctx === undefined) {
    throw new Error("useEditorUI must be used within an AppProvider");
  }
  return ctx;
};

/** Combined hook — subscribes to both contexts. Use targeted hooks where possible. */
export const useApp = (): AppState => {
  return { ...useAgentConfig(), ...useEditorUI() };
};
