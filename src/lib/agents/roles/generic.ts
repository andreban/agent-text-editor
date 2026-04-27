// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { AgentRunner, ToolProvider } from "@mast-ai/core";
import type { AgentRunnerFactory } from "./factory";

export function createGenericAgent(
  factory: AgentRunnerFactory,
  systemPrompt: string,
  tools?: ToolProvider,
): AgentRunner {
  return factory.create({ systemPrompt, tools });
}
