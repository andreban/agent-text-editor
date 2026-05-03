// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ChatSidebar } from "./ChatSidebar";
import { AppProvider } from "@/lib/store";
import { ThemeProvider } from "@/lib/ThemeProvider";
import { WorkspacesProvider } from "@/lib/WorkspacesContext";
import { useAgent } from "@mast-ai/react-ui";
import type { ConversationEntry } from "@mast-ai/react-ui";

// Stub MessageList because the real one uses its own bundled useAgent binding
// that vi.mock cannot reach. The stub renders enough of the entry shape for
// the smoke tests below.
vi.mock("@mast-ai/react-ui", async () => {
  const actual =
    await vi.importActual<typeof import("@mast-ai/react-ui")>(
      "@mast-ai/react-ui",
    );
  const useAgent = vi.fn();
  function MessageList() {
    const { messages } = useAgent() as { messages: ConversationEntry[] };
    return (
      <div>
        {messages.map((m) => (
          <div key={m.id}>
            {m.text && <div>{m.text}</div>}
            {m.thinking && <div>Thinking Process</div>}
            {m.toolEvents?.map((t) => (
              <div key={t.id}>{t.name}</div>
            ))}
          </div>
        ))}
      </div>
    );
  }
  return {
    ...actual,
    useAgent,
    MessageList,
  };
});

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

interface AgentMockOverrides {
  messages?: ConversationEntry[];
  isRunning?: boolean;
  sendMessage?: (text: string, displayText?: string) => void;
  cancel?: () => void;
}

function makeAgent(overrides: AgentMockOverrides = {}) {
  return {
    messages: overrides.messages ?? [],
    history: [],
    isRunning: overrides.isRunning ?? false,
    sendMessage: overrides.sendMessage ?? (vi.fn() as () => void),
    cancel: overrides.cancel ?? (vi.fn() as () => void),
    reset: vi.fn(),
    pendingApprovals: [],
  };
}

function renderSidebar(agent: ReturnType<typeof makeAgent> = makeAgent()) {
  vi.mocked(useAgent).mockReturnValue(agent);
  // The chat input is gated on apiKey; seed it before mount so handleSend runs.
  localStorage.setItem("gemini_api_key", "test-key");
  return render(
    <ThemeProvider>
      <WorkspacesProvider>
        <AppProvider>
          <ChatSidebar />
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
    vi.clearAllMocks();
  });

  it("shows empty state when there are no messages", () => {
    renderSidebar();
    expect(
      screen.getByText("Start a conversation with the editor assistant."),
    ).toBeInTheDocument();
  });

  it("disables send button when input is empty", () => {
    renderSidebar();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("enables send button when input has text", async () => {
    const user = userEvent.setup();
    renderSidebar();
    await user.type(getInput(), "Hello");
    expect(screen.getByRole("button", { name: "Send" })).not.toBeDisabled();
  });

  it("calls sendMessage with the typed text on send", async () => {
    const user = userEvent.setup();
    const sendMessage = vi.fn();
    renderSidebar(makeAgent({ sendMessage }));
    await user.type(getInput(), "Hello AI");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(sendMessage).toHaveBeenCalledWith("Hello AI", "Hello AI");
  });

  it("shows cancel button while running", () => {
    renderSidebar(makeAgent({ isRunning: true }));
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("calls cancel when cancel button is clicked", async () => {
    const user = userEvent.setup();
    const cancel = vi.fn();
    renderSidebar(makeAgent({ isRunning: true, cancel }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(cancel).toHaveBeenCalled();
  });

  it("renders a user message from messages", () => {
    renderSidebar(
      makeAgent({
        messages: [
          {
            id: "u1",
            role: "user",
            text: "Hello from user",
            toolEvents: [],
            isStreaming: false,
          },
        ],
      }),
    );
    expect(screen.getByText("Hello from user")).toBeInTheDocument();
  });

  it("renders an assistant message from messages", () => {
    renderSidebar(
      makeAgent({
        messages: [
          {
            id: "a1",
            role: "assistant",
            text: "Hello from assistant",
            toolEvents: [],
            isStreaming: false,
          },
        ],
      }),
    );
    expect(screen.getByText("Hello from assistant")).toBeInTheDocument();
  });

  it("renders a thinking section when entry.thinking is present", () => {
    renderSidebar(
      makeAgent({
        messages: [
          {
            id: "a1",
            role: "assistant",
            text: "",
            thinking: "Thinking hard...",
            toolEvents: [],
            isStreaming: true,
          },
        ],
      }),
    );
    expect(screen.getByText("Thinking Process")).toBeInTheDocument();
  });

  it("renders a tool call from messages", () => {
    renderSidebar(
      makeAgent({
        messages: [
          {
            id: "a1",
            role: "assistant",
            text: "",
            toolEvents: [
              {
                id: "t1",
                type: "tool_call_completed",
                name: "read",
                isStreaming: false,
                status: "success",
              },
            ],
            isStreaming: false,
          },
        ],
      }),
    );
    expect(screen.getByText("read")).toBeInTheDocument();
  });
});
