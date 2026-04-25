// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { AgentRunner, ToolRegistry } from "@mast-ai/core";
import type { AgentRunnerFactory } from "./factory";

export function createGenericAgent(
  factory: AgentRunnerFactory,
  systemPrompt: string,
  tools?: ToolRegistry,
): AgentRunner {
  return factory.create({ systemPrompt, tools });
}
