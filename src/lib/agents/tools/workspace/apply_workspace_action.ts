// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { v4 as uuidv4 } from "uuid";
import type { WorkspaceActionRequest } from "../../../store";

export function applyWorkspaceAction(
  description: string,
  apply: () => void,
  autoMessage: string,
  setPendingWorkspaceAction: (action: WorkspaceActionRequest | null) => void,
  approveAllRef: { current: boolean },
): Promise<string> {
  if (approveAllRef.current) {
    apply();
    return Promise.resolve(autoMessage);
  }
  return new Promise((resolve) => {
    const request: WorkspaceActionRequest = {
      id: uuidv4(),
      description,
      apply,
      resolve,
    };
    setPendingWorkspaceAction(request);
  });
}
