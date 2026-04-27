// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { v4 as uuidv4 } from "uuid";
import type { Suggestion } from "../../../store";

export function applySuggestion(
  data: Omit<Suggestion, "id" | "status" | "resolve">,
  autoApply: () => void,
  autoMessage: string,
  setSuggestions: (fn: (prev: Suggestion[]) => Suggestion[]) => void,
  approveAllRef: { current: boolean },
): Promise<string> {
  if (approveAllRef.current) {
    autoApply();
    return Promise.resolve(autoMessage);
  }
  return new Promise((resolve) => {
    const suggestion: Suggestion = {
      id: uuidv4(),
      ...data,
      status: "pending",
      resolve,
    };
    setSuggestions((prev) => [...prev, suggestion]);
  });
}
