// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import {
  GoogleGenAI,
  Content,
  FunctionDeclaration,
  ThinkingLevel,
} from "@google/genai";
import {
  LlmAdapter,
  AdapterRequest,
  AdapterResponse,
  AdapterStreamChunk,
  Message,
  ToolDefinition,
} from "@mast-ai/core";

export interface UsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

export class GoogleGenAIAdapter implements LlmAdapter {
  private client: GoogleGenAI;
  private modelName: string;
  private onUsageUpdate?: (usage: UsageMetadata) => void;

  constructor(
    apiKey: string,
    modelName: string = "gemini-3.1-flash-lite-preview",
    onUsageUpdate?: (usage: UsageMetadata) => void,
  ) {
    this.client = new GoogleGenAI({ apiKey });
    this.modelName = modelName;
    this.onUsageUpdate = onUsageUpdate;
  }

  async generate(request: AdapterRequest): Promise<AdapterResponse> {
    const contents = this.mapMessages(request.messages);

    const systemInstruction: Content | undefined = request.system
      ? {
          parts: [{ text: request.system }],
        }
      : undefined;

    const tools =
      request.tools.length > 0
        ? [
            {
              functionDeclarations: request.tools.map((t) => this.mapTool(t)),
            },
          ]
        : undefined;

    const response = await this.client.models.generateContent({
      model: this.modelName,
      contents,
      config: {
        systemInstruction,
        tools,
        temperature: request.config?.temperature,
        maxOutputTokens: request.config?.maxTokens,
        topP: request.config?.topP,
        stopSequences: request.config?.stopSequences,
        thinkingConfig: {
          includeThoughts: true,
          thinkingLevel: ThinkingLevel.HIGH,
        },
      },
    });

    if (response.usageMetadata && this.onUsageUpdate) {
      this.onUsageUpdate({
        promptTokenCount: response.usageMetadata.promptTokenCount,
        candidatesTokenCount: response.usageMetadata.candidatesTokenCount,
        totalTokenCount:
          (response.usageMetadata.promptTokenCount ?? 0) +
          (response.usageMetadata.candidatesTokenCount ?? 0),
      });
    }

    const candidate = response.candidates?.[0];
    if (!candidate) {
      throw new Error("No candidate returned from Gemini");
    }

    const textPart = candidate.content?.parts?.find(
      (p) => "text" in p && typeof p.text === "string" && !p.thought,
    );
    const toolCallParts =
      candidate.content?.parts?.filter(
        (p) => "functionCall" in p && p.functionCall,
      ) || [];

    return {
      text:
        textPart && "text" in textPart ? (textPart.text as string) : undefined,
      toolCalls: toolCallParts.map((p) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fc = (p as any).functionCall;
        return {
          id: fc.id || crypto.randomUUID(),
          name: fc.name,
          args: fc.args,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          thoughtSignature: (p as any).thoughtSignature,
        };
      }),
    };
  }

  async *generateStream(
    request: AdapterRequest,
  ): AsyncIterable<AdapterStreamChunk> {
    const contents = this.mapMessages(request.messages);

    const systemInstruction: Content | undefined = request.system
      ? {
          parts: [{ text: request.system }],
        }
      : undefined;

    const tools =
      request.tools.length > 0
        ? [
            {
              functionDeclarations: request.tools.map((t) => this.mapTool(t)),
            },
          ]
        : undefined;

    // generateContentStream returns an AsyncGenerator directly in the newer SDK
    const responseStream = await this.client.models.generateContentStream({
      model: this.modelName,
      contents,
      config: {
        systemInstruction,
        tools,
        temperature: request.config?.temperature,
        maxOutputTokens: request.config?.maxTokens,
        topP: request.config?.topP,
        stopSequences: request.config?.stopSequences,
        thinkingConfig: {
          includeThoughts: true,
          thinkingLevel: ThinkingLevel.HIGH,
        },
      },
    });

    for await (const chunk of responseStream) {
      if (chunk.usageMetadata && this.onUsageUpdate) {
        this.onUsageUpdate({
          promptTokenCount: chunk.usageMetadata.promptTokenCount,
          candidatesTokenCount: chunk.usageMetadata.candidatesTokenCount,
          totalTokenCount:
            (chunk.usageMetadata.promptTokenCount ?? 0) +
            (chunk.usageMetadata.candidatesTokenCount ?? 0),
        });
      }

      const candidate = chunk.candidates?.[0];
      if (!candidate) continue;

      for (const part of candidate.content?.parts || []) {
        if (part.thought && typeof part.text === "string") {
          yield { type: "thinking", delta: part.text };
        } else if ("text" in part && typeof part.text === "string") {
          yield { type: "text_delta", delta: part.text };
        } else if ("functionCall" in part && part.functionCall) {
          yield {
            type: "tool_call",
            toolCall: {
              id:
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (part.functionCall as any).id ||
                crypto.randomUUID(),
              name: part.functionCall.name!,
              args: part.functionCall.args,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              thoughtSignature: (part as any).thoughtSignature,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any,
          };
        }
      }
    }
  }

  private mapMessages(messages: Message[]): Content[] {
    return messages.map((m) => {
      const role = m.role === "assistant" ? "model" : "user";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parts: any[] = [];

      if (m.content.type === "text") {
        parts.push({ text: m.content.text });
      } else if (m.content.type === "tool_calls") {
        m.content.calls.forEach((call) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const thoughtSignature = (call as any).thoughtSignature;

          parts.push({
            functionCall: {
              id: call.id,
              name: call.name,
              args: call.args as Record<string, unknown>,
            },
            ...(thoughtSignature ? { thoughtSignature } : {}),
          });
        });
      } else if (m.content.type === "tool_result") {
        parts.push({
          functionResponse: {
            id: m.content.id,
            name: m.content.name,
            response: { result: m.content.result },
          },
        });
      }

      return { role, parts };
    });
  }

  private mapTool(tool: ToolDefinition): FunctionDeclaration {
    return {
      name: tool.name,
      description: tool.description,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      parameters: tool.parameters as any, // MAST ToolDefinition parameters are valid JSON Schema
    };
  }
}
