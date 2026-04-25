// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ChatSidebar } from "./ChatSidebar";
import { AppProvider } from "@/lib/store";
import { ThemeProvider } from "@/lib/ThemeProvider";
import { WorkspacesProvider } from "@/lib/WorkspacesContext";
import type { Conversation } from "@mast-ai/core";

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: (opts: {
    count: number;
    estimateSize: () => number;
    overscan?: number;
    getScrollElement: () => HTMLElement | null;
  }) => ({
    getVirtualItems: () =>
      Array.from({ length: opts.count }, (_, i) => ({
        key: i,
        index: i,
        start: i * (opts.estimateSize?.() ?? 80),
      })),
    getTotalSize: () => opts.count * (opts.estimateSize?.() ?? 80),
    scrollToIndex: vi.fn(),
    measureElement: vi.fn(),
  }),
}));

function makeConversation(
  events: object[] = [],
  history: object[] = [],
): Conversation {
  return {
    history: history as Conversation["history"],
    runStream: async function* () {
      for (const event of events) {
        yield event as never;
      }
    },
  } as unknown as Conversation;
}

function renderSidebar(conversation: Conversation | null = null) {
  return render(
    <ThemeProvider>
      <WorkspacesProvider>
        <AppProvider>
          <ChatSidebar conversation={conversation} />
        </AppProvider>
      </WorkspacesProvider>
    </ThemeProvider>,
  );
}

function getInput() {
  return screen.getByRole("textbox", { name: "Chat input" });
}

describe("ChatSidebar", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows empty state when there are no messages", () => {
    renderSidebar();
    expect(
      screen.getByText("Start a conversation with the editor assistant."),
    ).toBeInTheDocument();
  });

  it("disables send button when input is empty", () => {
    renderSidebar(makeConversation());
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("enables send button when input has text", async () => {
    const user = userEvent.setup();
    renderSidebar(makeConversation());
    await user.type(getInput(), "Hello");
    expect(screen.getByRole("button", { name: "Send" })).not.toBeDisabled();
  });

  it("renders user message after send", async () => {
    const user = userEvent.setup();
    renderSidebar(makeConversation([{ type: "done" }]));
    await user.type(getInput(), "Hello AI");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => {
      expect(screen.getByText("Hello AI")).toBeInTheDocument();
    });
  });

  it("renders thinking section from thinking events", async () => {
    const user = userEvent.setup();
    renderSidebar(
      makeConversation([
        { type: "thinking", delta: "Thinking hard..." },
        { type: "done" },
      ]),
    );
    await user.type(getInput(), "test");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => {
      expect(screen.getByText("Thinking Process")).toBeInTheDocument();
    });
  });

  it("renders accumulated assistant text from text_delta events", async () => {
    const user = userEvent.setup();
    renderSidebar(
      makeConversation([
        { type: "text_delta", delta: "Hello " },
        { type: "text_delta", delta: "world" },
        { type: "done" },
      ]),
    );
    await user.type(getInput(), "test");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => {
      expect(screen.getByText("Hello world")).toBeInTheDocument();
    });
  });

  it("renders tool item for tool_call_started events", async () => {
    const user = userEvent.setup();
    renderSidebar(
      makeConversation([
        { type: "tool_call_started", name: "read" },
        { type: "tool_call_completed" },
        { type: "done" },
      ]),
    );
    await user.type(getInput(), "test");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => {
      expect(screen.getByText("read")).toBeInTheDocument();
    });
  });

  it("reconstructs user and assistant messages from conversation history", () => {
    const conversation = makeConversation(
      [],
      [
        { role: "user", content: { type: "text", text: "Hello from history" } },
        { role: "assistant", content: { type: "text", text: "Hi there" } },
      ],
    );
    renderSidebar(conversation);
    expect(screen.getByText("Hello from history")).toBeInTheDocument();
    expect(screen.getByText("Hi there")).toBeInTheDocument();
  });

  it("reconstructs tool call items from conversation history", () => {
    const conversation = makeConversation(
      [],
      [
        {
          role: "assistant",
          content: {
            type: "tool_calls",
            calls: [{ id: "1", name: "edit", args: {} }],
          },
        },
      ],
    );
    renderSidebar(conversation);
    expect(screen.getByText("edit")).toBeInTheDocument();
  });
});
