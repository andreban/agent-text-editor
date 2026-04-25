// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { useEffect } from "react";
import { PlanConfirmationWidget } from "./PlanConfirmationWidget";
import { AppProvider, useEditorUI } from "@/lib/store";
import type { Plan } from "@/lib/agents/planner";

const samplePlan: Plan = {
  goal: "Rewrite the introduction",
  steps: [
    { id: "step_1", instruction: "Research audience", dependsOn: [] },
    { id: "step_2", instruction: "Draft new intro", dependsOn: ["step_1"] },
  ],
};

function SetPlanConfirmation({
  resolve,
}: {
  resolve: (accepted: boolean) => void;
}) {
  const { setPendingPlanConfirmation } = useEditorUI();
  useEffect(() => {
    setPendingPlanConfirmation({ plan: samplePlan, resolve });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function renderWidget(resolve: (accepted: boolean) => void = vi.fn()) {
  return render(
    <AppProvider>
      <SetPlanConfirmation resolve={resolve} />
      <PlanConfirmationWidget />
    </AppProvider>,
  );
}

describe("PlanConfirmationWidget", () => {
  it("renders nothing when pendingPlanConfirmation is null", () => {
    const { container } = render(
      <AppProvider>
        <PlanConfirmationWidget />
      </AppProvider>,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the plan goal when pendingPlanConfirmation is set", async () => {
    renderWidget();
    expect(
      await screen.findByText("Rewrite the introduction"),
    ).toBeInTheDocument();
  });

  it("renders one list item per step with instruction text", async () => {
    renderWidget();
    expect(await screen.findByText("Research audience")).toBeInTheDocument();
    expect(screen.getByText("Draft new intro")).toBeInTheDocument();
  });

  it("calls resolve(true) when Confirm is clicked", async () => {
    const user = userEvent.setup();
    const resolve = vi.fn();
    renderWidget(resolve);
    await screen.findByText("Rewrite the introduction");
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(resolve).toHaveBeenCalledWith(true);
  });

  it("calls resolve(false) when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const resolve = vi.fn();
    renderWidget(resolve);
    await screen.findByText("Rewrite the introduction");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(resolve).toHaveBeenCalledWith(false);
  });
});
