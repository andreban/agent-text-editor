// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from "vitest";
import { createPlannerAgent, PLANNER_SYSTEM_PROMPT } from "./planner";
import { ToolRegistry } from "@mast-ai/core";
import type { AgentRunnerFactory } from "./factory";

function makeFactory(): {
  factory: AgentRunnerFactory;
  mockCreate: ReturnType<typeof vi.fn>;
} {
  const mockCreate = vi.fn().mockReturnValue({
    runBuilder: vi.fn().mockReturnValue({ runStream: vi.fn() }),
  });
  return { factory: { create: mockCreate }, mockCreate };
}

describe("createPlannerAgent", () => {
  it("creates a runner using the provided factory", () => {
    const { factory, mockCreate } = makeFactory();
    createPlannerAgent(factory);
    expect(mockCreate).toHaveBeenCalledOnce();
  });

  it("passes PLANNER_SYSTEM_PROMPT as the system prompt", () => {
    const { factory, mockCreate } = makeFactory();
    createPlannerAgent(factory);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ systemPrompt: PLANNER_SYSTEM_PROMPT }),
    );
  });

  it("registers no tools (empty tool registry)", () => {
    const { factory, mockCreate } = makeFactory();
    createPlannerAgent(factory);
    const { tools } = mockCreate.mock.calls[0][0] as { tools: ToolRegistry };
    expect(tools.definitions()).toEqual([]);
  });
});
