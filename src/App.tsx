// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0
import { EditorPanel } from "@/components/EditorPanel";
import { ChatSidebar } from "@/components/ChatSidebar";

function App() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <main className="flex-1 min-w-0">
        <EditorPanel />
      </main>
      <aside className="w-[400px] shrink-0 border-l border-border">
        <ChatSidebar />
      </aside>
    </div>
  );
}

export default App;
