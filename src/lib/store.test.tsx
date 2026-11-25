// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import { useApp, AppProvider, WorkflowState } from "./store";
import { DEFAULT_MODEL, LEGACY_MODEL_MIGRATIONS } from "./models";

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

describe("store — modelName", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to DEFAULT_MODEL when localStorage is empty", () => {
    let captured: ReturnType<typeof useApp> | null = null;
    renderWithProvider((s) => {
      captured = s;
    });
    expect(captured!.modelName).toBe(DEFAULT_MODEL);
  });

  it("restores a supported model from localStorage", () => {
    localStorage.setItem("gemini_model_name", "gemini-4-carbon");
    let captured: ReturnType<typeof useApp> | null = null;
    renderWithProvider((s) => {
      captured = s;
    });
    expect(captured!.modelName).toBe("gemini-4-carbon");
  });

  it.each(Object.entries(LEGACY_MODEL_MIGRATIONS))(
    "migrates legacy saved model %s to %s",
    (legacyModel, expectedModel) => {
      localStorage.setItem("gemini_model_name", legacyModel);
      let captured: ReturnType<typeof useApp> | null = null;
      renderWithProvider((s) => {
        captured = s;
      });
      expect(captured!.modelName).toBe(expectedModel);
    },
  );

  it("preserves unknown custom model IDs not listed in LEGACY_MODEL_MIGRATIONS", () => {
    localStorage.setItem("gemini_model_name", "custom-model-id");
    let captured: ReturnType<typeof useApp> | null = null;
    renderWithProvider((s) => {
      captured = s;
    });
    expect(captured!.modelName).toBe("custom-model-id");
  });
});
