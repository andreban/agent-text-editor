// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { AgentConfig, ToolContext, ToolRegistry } from "@mast-ai/core";
import type { AgentRunnerFactory } from "../agents/factory";
import { createGenericAgent } from "../agents/generic";
import {
  createPlannerAgent,
  Plan,
  PLANNER_SYSTEM_PROMPT,
} from "../agents/planner";
import type { ResearchResult } from "../agents/researcher";
import { runResearch } from "../agents/researcher";
import { runWriter } from "../agents/writer";
import { runReview } from "../agents/reviewer";
import type { PlanConfirmationRequest } from "../store";
import { EditorTools } from "./EditorTools";
import { WorkspaceTools } from "./WorkspaceTools";
import { buildReadonlyRegistry } from "./registries";

export function registerDelegationTools(
  registry: ToolRegistry,
  factory: AgentRunnerFactory,
  editorTools: EditorTools,
  workspaceTools: WorkspaceTools,
  setPendingPlanConfirmation: (req: PlanConfirmationRequest | null) => void,
): void {
  registry.register({
    definition: () => ({
      name: "invoke_agent",
      description:
        "Delegates an ad-hoc task to a generic sub-agent. The sub-agent runs with the given system prompt and optional tool groups. Returns { result: string } with the sub-agent's final response.",
      parameters: {
        type: "object",
        properties: {
          systemPrompt: {
            type: "string",
            description: "The system prompt / instructions for the sub-agent.",
          },
          task: {
            type: "string",
            description: "The task or question to send to the sub-agent.",
          },
          tools: {
            type: "array",
            items: { type: "string" },
            description:
              "Optional tool group names to give the sub-agent. Supported: 'workspace_readonly'.",
          },
        },
        required: ["systemPrompt", "task"],
      },
    }),
    call: async (
      args: { systemPrompt: string; task: string; tools?: string[] },
      context: ToolContext,
    ) => {
      const groups = args.tools ?? [];
      const resolvedRegistry = groups.includes("workspace_readonly")
        ? buildReadonlyRegistry(editorTools, workspaceTools)
        : new ToolRegistry();

      const runner = createGenericAgent(
        factory,
        args.systemPrompt,
        resolvedRegistry,
      );
      const agentConfig: AgentConfig = {
        name: "Agent",
        instructions: args.systemPrompt,
        tools: resolvedRegistry.definitions().map((d) => d.name),
      };

      for await (const event of runner
        .runBuilder(agentConfig)
        .runStream(args.task)) {
        if (event.type === "done") {
          return JSON.stringify({ result: event.output });
        }
        context.onEvent?.(event);
      }

      throw new Error("invoke_agent: sub-agent ended without a done event");
    },
  });

  registry.register({
    definition: () => ({
      name: "invoke_planner",
      description:
        "Decomposes a high-level task into a structured step-by-step Plan. Returns a JSON string: { goal, steps: [{ id, instruction, dependsOn }] }. The Orchestrator reads the plan and dispatches each step using the appropriate tools.",
      parameters: {
        type: "object",
        properties: {
          task: {
            type: "string",
            description: "The high-level task to decompose into a plan.",
          },
          context: {
            type: "string",
            description:
              "Optional additional context (e.g. current document summary, workspace doc list).",
          },
        },
        required: ["task"],
      },
    }),
    call: async (args: { task: string; context?: string }) => {
      const runner = createPlannerAgent(factory);
      const prompt = args.context
        ? `${args.task}\n\n${args.context}`
        : args.task;
      const agentConfig: AgentConfig = {
        name: "Planner",
        instructions: PLANNER_SYSTEM_PROMPT,
        tools: [],
      };

      for await (const event of runner
        .runBuilder(agentConfig)
        .runStream(prompt)) {
        if (event.type === "done") {
          let plan: Plan;
          try {
            plan = JSON.parse(event.output) as Plan;
          } catch {
            throw new Error(
              `invoke_planner: agent returned invalid JSON: ${event.output}`,
            );
          }
          if (typeof plan.goal !== "string" || !Array.isArray(plan.steps)) {
            throw new Error(
              "invoke_planner: plan is missing required fields (goal, steps)",
            );
          }

          const accepted = await new Promise<boolean>((resolve) => {
            setPendingPlanConfirmation({ plan, resolve });
          });
          setPendingPlanConfirmation(null);

          if (!accepted) {
            throw new Error("Plan rejected by user.");
          }
          return JSON.stringify(plan);
        }
      }

      throw new Error(
        "invoke_planner: planner agent ended without a done event",
      );
    },
  });

  registry.register({
    definition: () => ({
      name: "invoke_researcher",
      description:
        "Queries workspace documents and synthesizes a structured answer. Returns JSON: { summary, sources: [{ id, title, excerpt }] }. Use this when the task requires finding information across workspace documents before writing or reviewing.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The question or information need to research.",
          },
          docIds: {
            type: "array",
            items: { type: "string" },
            description:
              "Optional list of document IDs to restrict the search to. If omitted, all workspace documents are queried.",
          },
        },
        required: ["query"],
      },
    }),
    call: async (args: { query: string; docIds?: string[] }) => {
      const docs = workspaceTools.docsRef.current;
      const result = await runResearch(args.query, docs, factory, args.docIds);
      return JSON.stringify(result);
    },
  });

  registry.register({
    definition: () => ({
      name: "invoke_writer",
      description:
        "Generates draft text for a single targeted section from an instruction and optional research/style context. " +
        "Returns { draft: string } — raw text only, no edits applied. " +
        "After receiving the draft, apply it using edit() for the target section. " +
        "Do NOT use this to rewrite the whole document at once — use invoke_planner to break full-document tasks into per-section steps.",
      parameters: {
        type: "object",
        properties: {
          instruction: {
            type: "string",
            description:
              "What to write. Be explicit: specify the target section, desired length, and any constraints.",
          },
          researchContext: {
            type: "string",
            description:
              "JSON-encoded ResearchResult from invoke_researcher. Inject when the draft should cite workspace sources.",
          },
          styleContext: {
            type: "string",
            description:
              "A verbatim excerpt from the document the Writer should match in tone, voice, and formatting.",
          },
        },
        required: ["instruction"],
      },
    }),
    call: async (args: {
      instruction: string;
      researchContext?: string;
      styleContext?: string;
    }) => {
      let parsedResearch: ResearchResult | undefined;
      if (args.researchContext) {
        try {
          parsedResearch = JSON.parse(args.researchContext) as ResearchResult;
        } catch {
          // malformed JSON — proceed without research context
        }
      }
      const draft = await runWriter(
        args.instruction,
        factory,
        parsedResearch,
        args.styleContext,
      );
      return JSON.stringify({ draft });
    },
  });

  registry.register({
    definition: () => ({
      name: "invoke_reviewer",
      description:
        "Evaluates a draft against explicit criteria and returns structured feedback. " +
        "Returns JSON: { passed: boolean, issues: [{ severity, location?, description, fix? }], summary }. " +
        "Use after invoke_writer to check a draft before applying it. " +
        "If passed is false and error-severity issues remain after 3 Writer→Reviewer cycles, " +
        "present the best available draft via edit() or write() and summarise remaining issues in your response.",
      parameters: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "The draft text to review.",
          },
          criteria: {
            type: "array",
            items: { type: "string" },
            description:
              "Review criteria to check against (e.g. 'grammatical correctness', 'consistent use of past tense', 'no unsupported factual claims').",
          },
        },
        required: ["text", "criteria"],
      },
    }),
    call: async (args: { text: string; criteria: string[] }) => {
      const result = await runReview(args.text, args.criteria, factory);
      return JSON.stringify(result);
    },
  });
}
