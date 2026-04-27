// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ChatSidebar } from "./ChatSidebar";
import { AppProvider } from "@/lib/store";
import { ThemeProvider } from "@/lib/ThemeProvider";
import { WorkspacesProvider } from "@/lib/WorkspacesContext";
import { useAgentContext } from "@/context/AgentContext";
import type { StreamItem } from "@/lib/agents";

vi.mock("@/context/AgentContext");

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

function makeContext(
  overrides: {
    items?: StreamItem[];
    isLoading?: boolean;
    sendMessage?: (prompt: string, displayText?: string) => Promise<void>;
    cancel?: () => void;
  } = {},
) {
  return {
    items: overrides.items ?? [],
    isLoading: overrides.isLoading ?? false,
    sendMessage:
      overrides.sendMessage ??
      (vi.fn() as unknown as (
        prompt: string,
        displayText?: string,
      ) => Promise<void>),
    cancel: overrides.cancel ?? (vi.fn() as () => void),
  };
}

function renderSidebar(
  context: ReturnType<typeof makeContext> = makeContext(),
) {
  vi.mocked(useAgentContext).mockReturnValue(context);
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
    renderSidebar(makeContext({ sendMessage }));
    await user.type(getInput(), "Hello AI");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(sendMessage).toHaveBeenCalledWith("Hello AI", "Hello AI");
  });

  it("shows cancel button while loading", () => {
    renderSidebar(makeContext({ isLoading: true }));
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("calls cancel when cancel button is clicked", async () => {
    const user = userEvent.setup();
    const cancel = vi.fn();
    renderSidebar(makeContext({ isLoading: true, cancel }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(cancel).toHaveBeenCalled();
  });

  it("renders a user message from items", () => {
    renderSidebar(
      makeContext({
        items: [{ kind: "user", id: "u1", text: "Hello from user" }],
      }),
    );
    expect(screen.getByText("Hello from user")).toBeInTheDocument();
  });

  it("renders an assistant message from items", () => {
    renderSidebar(
      makeContext({
        items: [
          {
            kind: "assistant",
            id: "a1",
            text: "Hello from assistant",
            thought: "",
            isStreaming: false,
          },
        ],
      }),
    );
    expect(screen.getByText("Hello from assistant")).toBeInTheDocument();
  });

  it("renders a thinking section when thought is present", () => {
    renderSidebar(
      makeContext({
        items: [
          {
            kind: "assistant",
            id: "a1",
            text: "",
            thought: "Thinking hard...",
            isStreaming: true,
          },
        ],
      }),
    );
    expect(screen.getByText("Thinking Process")).toBeInTheDocument();
  });

  it("renders a tool item from items", () => {
    renderSidebar(
      makeContext({
        items: [{ kind: "tool", id: "t1", name: "read", pending: false }],
      }),
    );
    expect(screen.getByText("read")).toBeInTheDocument();
  });
});
