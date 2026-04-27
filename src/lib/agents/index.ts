// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

export { AgentModel } from "./AgentModel";
export type { StreamItem, ChildItem } from "./types";
export type { AgentRunnerFactory } from "./roles/factory";
export { DefaultAgentRunnerFactory } from "./roles/factory";
export { buildOrchestratorPrompt } from "./roles/orchestrator";
export { createGenericAgent } from "./roles/generic";
export type { Plan, PlanStep } from "./roles/planner";
export { createPlannerAgent, PLANNER_SYSTEM_PROMPT } from "./roles/planner";
export type { ResearchResult, ResearchSource } from "./roles/researcher";
export {
  DOC_QUERIER_SYSTEM_PROMPT,
  runResearch,
} from "./roles/researcher";
export { createWriterAgent, WRITER_SYSTEM_PROMPT, runWriter } from "./roles/writer";
export type { ReviewResult, ReviewIssue } from "./roles/reviewer";
export {
  createReviewerAgent,
  REVIEWER_SYSTEM_PROMPT,
  runReview,
} from "./roles/reviewer";
