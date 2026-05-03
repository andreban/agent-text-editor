// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import {
  AgentConfig,
  AgentEvent,
  AgentRunner,
  ToolRegistry,
} from "@mast-ai/core";
import type { AgentRunnerFactory } from "./factory";
import type { WorkspaceDocument } from "../../workspace";

export interface ResearchSource {
  id: string;
  title: string;
  excerpt: string;
}

export interface ResearchResult {
  summary: string;
  sources: ResearchSource[];
}

export const DOC_QUERIER_SYSTEM_PROMPT =
  "You are a document research assistant. You will be given a document's content and a query.\n" +
  'Return ONLY valid JSON: { "summary": "...", "excerpt": "..." }\n' +
  "- summary: a concise answer to the query from this document's perspective (1–3 sentences).\n" +
  "- excerpt: the single most relevant verbatim passage from the document (≤ 200 characters).\n" +
  'If the document contains nothing relevant, return { "summary": "No relevant content.", "excerpt": "" }.';

export const SYNTHESIZER_SYSTEM_PROMPT =
  "You are a research synthesizer. You will be given a query and a list of per-document summaries with their source titles.\n" +
  'Produce ONLY valid JSON: { "summary": "..." }\n' +
  "- summary: a single coherent answer that combines the per-document summaries. Cite document titles for any claim (e.g. \"According to 'Style Guide', ...\").\n" +
  '- If all summaries say "No relevant content.", return { "summary": "No relevant content found in workspace." }.';

export function createDocQuerierAgent(
  factory: AgentRunnerFactory,
): AgentRunner {
  return factory.create({
    systemPrompt: DOC_QUERIER_SYSTEM_PROMPT,
    tools: new ToolRegistry(),
  });
}

export function createSynthesizerAgent(
  factory: AgentRunnerFactory,
): AgentRunner {
  return factory.create({
    systemPrompt: SYNTHESIZER_SYSTEM_PROMPT,
    tools: new ToolRegistry(),
  });
}

export async function runResearch(
  query: string,
  docs: WorkspaceDocument[],
  factory: AgentRunnerFactory,
  docIds?: string[],
  onEvent?: (event: AgentEvent) => void,
): Promise<ResearchResult> {
  const filteredDocs = docIds
    ? docs.filter((d) => docIds.includes(d.id))
    : docs;

  const docResults: Array<{
    doc: WorkspaceDocument;
    summary: string;
    excerpt: string;
  }> = [];

  for (const doc of filteredDocs) {
    const runner = createDocQuerierAgent(factory);
    const agentConfig: AgentConfig = {
      name: "DocQuerier",
      instructions: DOC_QUERIER_SYSTEM_PROMPT,
      tools: [],
    };
    const input = `Document title: ${doc.title}\n\nDocument content:\n${doc.content}\n\nQuery: ${query}`;

    let summary = "No relevant content.";
    let excerpt = "";

    for await (const event of runner.runBuilder(agentConfig).runStream(input)) {
      if (event.type === "done") {
        try {
          const parsed = JSON.parse(event.output) as {
            summary: string;
            excerpt: string;
          };
          summary = parsed.summary ?? "No relevant content.";
          excerpt = parsed.excerpt ?? "";
        } catch {
          summary = event.output;
        }
        break;
      }
      onEvent?.(event);
    }

    docResults.push({ doc, summary, excerpt });
  }

  const contributing = docResults.filter(
    (r) => r.summary !== "No relevant content.",
  );

  if (contributing.length === 0) {
    return { summary: "No relevant content found in workspace.", sources: [] };
  }

  const sources: ResearchSource[] = contributing.map((r) => ({
    id: r.doc.id,
    title: r.doc.title,
    excerpt: r.excerpt,
  }));

  const summaryLines = contributing.map(
    (r) => `Document "${r.doc.title}": ${r.summary}`,
  );
  const synth = createSynthesizerAgent(factory);
  const synthConfig: AgentConfig = {
    name: "WorkspaceSynthesizer",
    instructions: SYNTHESIZER_SYSTEM_PROMPT,
    tools: [],
  };
  const synthInput = `Query: ${query}\n\nPer-document summaries:\n\n${summaryLines.join("\n\n")}`;

  let finalSummary = "No relevant content found in workspace.";

  for await (const event of synth
    .runBuilder(synthConfig)
    .runStream(synthInput)) {
    if (event.type === "done") {
      try {
        const parsed = JSON.parse(event.output) as { summary: string };
        finalSummary =
          parsed.summary ?? "No relevant content found in workspace.";
      } catch {
        finalSummary = event.output;
      }
      break;
    }
    onEvent?.(event);
  }

  return { summary: finalSummary, sources };
}
