// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

export type ChildItem =
  | { kind: "thought"; id: string; text: string }
  | { kind: "text"; id: string; text: string }
  | {
      kind: "tool";
      id: string;
      name: string;
      pending: boolean;
      params?: unknown;
      result?: unknown;
    };

export type StreamItem =
  | { kind: "user"; id: string; text: string }
  | {
      kind: "assistant";
      id: string;
      text: string;
      thought: string;
      isStreaming: boolean;
      agentRole?: string;
      parentMessageId?: string;
    }
  | {
      kind: "tool";
      id: string;
      name: string;
      pending: boolean;
      params?: unknown;
      result?: unknown;
    }
  | {
      kind: "skill";
      id: string;
      name: string;
      task: string;
      pending: boolean;
      childItems: ChildItem[];
    }
  | {
      kind: "agent";
      id: string;
      agentRole: string;
      task: string;
      pending: boolean;
      childItems: ChildItem[];
      parentMessageId?: string;
    };
