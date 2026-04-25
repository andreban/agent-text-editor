// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import { useApp, AppProvider, WorkflowState } from "./store";

function TestConsumer({
  onState,
}: {
  onState: (state: ReturnType<typeof useApp>) => void;
}) {
  const state = useApp();
  onState(state);
  return null;
}

function renderWithProvider(
  onState: (state: ReturnType<typeof useApp>) => void,
) {
  return render(
    <AppProvider>
      <TestConsumer onState={onState} />
    </AppProvider>,
  );
}

describe("store — workflowState", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("initializes workflowState as null", () => {
    let captured: ReturnType<typeof useApp> | null = null;
    renderWithProvider((s) => {
      captured = s;
    });
    expect(captured!.workflowState).toBeNull();
  });

  it("setWorkflowState updates workflowState", () => {
    let captured: ReturnType<typeof useApp> | null = null;
    renderWithProvider((s) => {
      captured = s;
    });

    const newState: WorkflowState = {
      planId: "plan-1",
      steps: [{ id: "step-1", status: "pending" }],
    };

    act(() => {
      captured!.setWorkflowState(newState);
    });

    expect(captured!.workflowState).toEqual(newState);
  });

  it("setWorkflowState can reset to null", () => {
    let captured: ReturnType<typeof useApp> | null = null;
    renderWithProvider((s) => {
      captured = s;
    });

    act(() => {
      captured!.setWorkflowState({ planId: "p", steps: [] });
    });
    act(() => {
      captured!.setWorkflowState(null);
    });

    expect(captured!.workflowState).toBeNull();
  });
});
