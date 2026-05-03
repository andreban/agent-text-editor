// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type {
  AgentConfig,
  AgentEvent,
  Tool,
  ToolContext,
  ToolDefinition,
  ToolProvider,
} from "@mast-ai/core";
import type { AgentRunnerFactory } from "../../";
import { loadSkills } from "../../../skills";

type RunnerLike = {
  runBuilder: (agent: AgentConfig) => {
    runStream: (input: string) => AsyncIterable<AgentEvent>;
  };
};

interface DelegateToSkillArgs {
  skillName: string;
  task: string;
}

export class DelegateToSkillTool implements Tool<DelegateToSkillArgs, string> {
  private runnerFactory: (registry: ToolProvider, model?: string) => RunnerLike;

  constructor(
    private factory: AgentRunnerFactory,
    private readonlyRegistry: ToolProvider,
    runnerFactory?: (registry: ToolProvider, model?: string) => RunnerLike,
  ) {
    this.runnerFactory =
      runnerFactory ??
      ((registry, model) => factory.create({ tools: registry, model }));
  }

  definition(): ToolDefinition {
    return {
      name: "delegate_to_skill",
      description:
        "Delegates a task to a named skill (sub-agent). The skill runs with read-only access and returns its response as a string. Interpret the response and act on it accordingly.",
      parameters: {
        type: "object",
        properties: {
          skillName: {
            type: "string",
            description: "The exact name of the skill to invoke.",
          },
          task: {
            type: "string",
            description:
              "The specific task or instructions to pass to the skill.",
          },
        },
        required: ["skillName", "task"],
      },
      scope: "write",
    };
  }

  async call(
    { skillName, task }: DelegateToSkillArgs,
    context: ToolContext,
  ): Promise<string> {
    const skills = loadSkills();
    const skill = skills.find((s) => s.name === skillName);
    if (!skill) {
      const names = skills.map((s) => s.name).join(", ");
      return `Error: skill "${skillName}" not found. Available skills: ${names || "none"}`;
    }

    const readonlyToolNames = this.readonlyRegistry
      .getTools()
      .map((d) => d.name);
    const childRunner = this.runnerFactory(this.readonlyRegistry, skill.model);
    const agentConfig: AgentConfig = {
      name: skill.name,
      instructions: skill.instructions,
      tools: readonlyToolNames,
    };

    for await (const event of childRunner
      .runBuilder(agentConfig)
      .runStream(task)) {
      if (event.type === "done") {
        return event.output;
      }
      context.onEvent?.(event);
    }
    throw new Error("Child runner ended without a done event");
  }
}
