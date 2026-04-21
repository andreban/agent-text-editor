// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import React, { createContext, useContext, useState, useEffect } from "react";
import * as monaco from "monaco-editor";
import { Skill, initializeSkills, saveSkills } from "./skills";

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

export interface WorkspaceActionRequest {
  id: string;
  description: string;
  apply: () => void;
  resolve: (message: string) => void;
}

interface AppState {
  apiKey: string | null;
  setApiKey: (key: string | null) => void;
  modelName: string;
  setModelName: (name: string) => void;
  totalTokens: number;
  setTotalTokens: (tokens: number | ((prev: number) => number)) => void;
  suggestions: Suggestion[];
  setSuggestions: (
    suggestions: Suggestion[] | ((prev: Suggestion[]) => Suggestion[]),
  ) => void;
  editorInstance: monaco.editor.IStandaloneCodeEditor | null;
  setEditorInstance: (
    editor: monaco.editor.IStandaloneCodeEditor | null,
  ) => void;
  activeTab: "editor" | "preview";
  setActiveTab: (tab: "editor" | "preview") => void;
  editorContent: string;
  setEditorContent: (content: string) => void;
  pendingTabSwitchRequest: TabSwitchRequest | null;
  setPendingTabSwitchRequest: (req: TabSwitchRequest | null) => void;
  pendingWorkspaceAction: WorkspaceActionRequest | null;
  setPendingWorkspaceAction: (action: WorkspaceActionRequest | null) => void;
  approveAll: boolean;
  setApproveAll: (approve: boolean) => void;
  skills: Skill[];
  setSkills: (skills: Skill[]) => void;
}

const AppContext = createContext<AppState | undefined>(undefined);

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
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [editorInstance, setEditorInstance] =
    useState<monaco.editor.IStandaloneCodeEditor | null>(null);
  const [activeTab, setActiveTab] = useState<"editor" | "preview">("editor");
  const [editorContent, setEditorContent] = useState<string>("");
  const [pendingTabSwitchRequest, setPendingTabSwitchRequest] =
    useState<TabSwitchRequest | null>(null);
  const [pendingWorkspaceAction, setPendingWorkspaceAction] =
    useState<WorkspaceActionRequest | null>(null);
  const [approveAll, setApproveAll] = useState(false);
  const [skills, setSkillsState] = useState<Skill[]>(() => initializeSkills());

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

  return (
    <AppContext.Provider
      value={{
        apiKey,
        setApiKey,
        modelName,
        setModelName,
        totalTokens,
        setTotalTokens,
        suggestions,
        setSuggestions,
        editorInstance,
        setEditorInstance,
        activeTab,
        setActiveTab,
        editorContent,
        setEditorContent,
        pendingTabSwitchRequest,
        setPendingTabSwitchRequest,
        pendingWorkspaceAction,
        setPendingWorkspaceAction,
        approveAll,
        setApproveAll,
        skills,
        setSkills,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
};
