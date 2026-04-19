// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import React, { createContext, useContext, useState, useEffect } from "react";

interface AppState {
  apiKey: string | null;
  setApiKey: (key: string | null) => void;
  modelName: string;
  setModelName: (name: string) => void;
  totalTokens: number;
  setTotalTokens: (tokens: number) => void;
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
