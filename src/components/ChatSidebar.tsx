// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export function ChatSidebar() {
  return (
    <div className="flex flex-col h-full bg-muted/20 border-l">
      <div className="p-4 border-b font-medium">AI Assistant</div>
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {/* Chat messages will go here */}
        <div className="text-sm text-muted-foreground italic text-center mt-4">
          Chat will be connected in Phase 2.
        </div>
      </div>
      <div className="p-4 border-t flex gap-2">
        <Input placeholder="Type a message..." disabled />
        <Button disabled>Send</Button>
      </div>
    </div>
  );
}
