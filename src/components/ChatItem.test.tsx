// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChatItem, StreamItem } from "./ChatItem";

const noop = () => {};

function makeAgentItem(
  overrides: Partial<Extract<StreamItem, { kind: "agent" }>> = {},
): StreamItem {
  return {
    kind: "agent",
    id: "agent-1",
    agentRole: "Agent",
    task: "Summarize the document.",
    pending: true,
    childItems: [],
    ...overrides,
  };
}

describe("ChatItem — agent kind", () => {
  it("renders the agentRole label", () => {
    render(
      <ChatItem
        item={makeAgentItem({ agentRole: "Researcher" })}
        isExpanded={false}
        onToggle={noop}
      />,
    );
    expect(screen.getByText("Researcher")).toBeInTheDocument();
  });

  it("renders the task text", () => {
    render(
      <ChatItem
        item={makeAgentItem({ task: "Write a summary." })}
        isExpanded={false}
        onToggle={noop}
      />,
    );
    expect(screen.getByText("Write a summary.")).toBeInTheDocument();
  });

  it("shows pulsing icon when pending", () => {
    const { container } = render(
      <ChatItem
        item={makeAgentItem({ pending: true })}
        isExpanded={false}
        onToggle={noop}
      />,
    );
    const icon = container.querySelector(".animate-pulse");
    expect(icon).not.toBeNull();
  });

  it("shows check icon when not pending", () => {
    const { container } = render(
      <ChatItem
        item={makeAgentItem({ pending: false })}
        isExpanded={false}
        onToggle={noop}
      />,
    );
    const check = container.querySelector(".text-green-500");
    expect(check).not.toBeNull();
  });

  it("renders childItems inside the collapsed panel when open", () => {
    const item = makeAgentItem({
      pending: false,
      childItems: [{ kind: "text", id: "c1", text: "Child text output" }],
    });
    render(<ChatItem item={item} isExpanded={false} onToggle={noop} />);
    expect(screen.getByText("Child text output")).toBeInTheDocument();
  });

  it("does not render childItems when there are none", () => {
    const item = makeAgentItem({ childItems: [] });
    const { container } = render(
      <ChatItem item={item} isExpanded={false} onToggle={noop} />,
    );
    // No border-l-2 child container should be present
    expect(container.querySelector(".border-l-2")).toBeNull();
  });
});
