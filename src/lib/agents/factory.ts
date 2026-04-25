// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { AgentRunner, ToolRegistry } from "@mast-ai/core";
import { GoogleGenAIAdapter } from "@mast-ai/google-genai";

export interface AgentRunnerFactory {
  create(options: {
    systemPrompt?: string;
    tools?: ToolRegistry;
    model?: string;
  }): AgentRunner;
}

export class DefaultAgentRunnerFactory implements AgentRunnerFactory {
  constructor(
    private apiKey: string,
    private modelName: string,
    private usageCallback?: (usage: { totalTokenCount?: number }) => void,
  ) {}

  create({
    tools,
    model,
  }: {
    systemPrompt?: string;
    tools?: ToolRegistry;
    model?: string;
  }): AgentRunner {
    const adapter = new GoogleGenAIAdapter(
      this.apiKey,
      model ?? this.modelName,
      this.usageCallback,
    );
    return new AgentRunner(adapter, tools);
  }
}
