// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { useEditorUI } from "@/lib/store";
import { Button } from "./ui/button";

export function PlanConfirmationWidget() {
  const { pendingPlanConfirmation } = useEditorUI();

  if (!pendingPlanConfirmation) return null;

  const { plan, resolve } = pendingPlanConfirmation;

  return (
    <div className="mx-4 mb-3 rounded-md border bg-muted/30 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
        Confirm Plan
      </p>
      <p className="text-sm mb-3">{plan.goal}</p>
      <ol className="list-decimal list-inside space-y-1 mb-4">
        {plan.steps.map((step) => (
          <li key={step.id} className="text-sm text-muted-foreground">
            {step.instruction}
          </li>
        ))}
      </ol>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => resolve(true)}>
          Confirm
        </Button>
        <Button size="sm" variant="outline" onClick={() => resolve(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
