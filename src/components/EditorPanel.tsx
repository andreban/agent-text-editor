// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0
import { Editor } from "@monaco-editor/react";

export function EditorPanel() {
  return (
    <div className="h-full w-full">
      <Editor
        height="100%"
        defaultLanguage="markdown"
        defaultValue="# Welcome to the AI Agent Text Editor"
        theme="vs-dark"
        options={{
          minimap: { enabled: false },
          wordWrap: "on",
          padding: { top: 16 },
        }}
      />
    </div>
  );
}
