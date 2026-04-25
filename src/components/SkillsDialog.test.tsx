// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SkillsDialog } from "./SkillsDialog";
import * as storeModule from "@/lib/store";
import { Skill } from "@/lib/skills";

const mockSetSkills = vi.fn();

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: "skill-1",
    name: "Proofreader",
    description: "Fix grammar",
    instructions: "You are a proofreader.",
    ...overrides,
  };
}

function mockStore(skills: Skill[]) {
  vi.spyOn(storeModule, "useApp").mockReturnValue({
    apiKey: "test-key",
    setApiKey: vi.fn(),
    modelName: "gemini-2.5-flash",
    setModelName: vi.fn(),
    totalTokens: 0,
    setTotalTokens: vi.fn(),
    suggestions: [],
    setSuggestions: vi.fn(),
    editorInstance: null,
    setEditorInstance: vi.fn(),
    activeTab: "editor",
    setActiveTab: vi.fn(),
    editorContent: "",
    setEditorContent: vi.fn(),
    pendingTabSwitchRequest: null,
    setPendingTabSwitchRequest: vi.fn(),
    pendingWorkspaceAction: null,
    setPendingWorkspaceAction: vi.fn(),
    approveAll: false,
    setApproveAll: vi.fn(),
    skills,
    setSkills: mockSetSkills,
    workflowState: null,
    setWorkflowState: vi.fn(),
  });
}

describe("SkillsDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders skill list from context", () => {
    mockStore([makeSkill()]);
    render(<SkillsDialog open={true} onOpenChange={vi.fn()} />);

    expect(screen.getByText("Proofreader")).toBeInTheDocument();
    expect(screen.getByText("Fix grammar")).toBeInTheDocument();
  });

  it("shows empty state when no skills exist", () => {
    mockStore([]);
    render(<SkillsDialog open={true} onOpenChange={vi.fn()} />);

    expect(screen.getByText(/No skills yet/i)).toBeInTheDocument();
  });

  it("does not render content when closed", () => {
    mockStore([makeSkill()]);
    render(<SkillsDialog open={false} onOpenChange={vi.fn()} />);

    expect(screen.queryByText("Proofreader")).not.toBeInTheDocument();
  });

  it("clicking Add Skill shows empty form", async () => {
    const user = userEvent.setup();
    mockStore([]);
    render(<SkillsDialog open={true} onOpenChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Add Skill" }));

    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Instructions")).toBeInTheDocument();
  });

  it("submitting a valid new skill calls setSkills with new entry appended", async () => {
    const user = userEvent.setup();
    const existing = makeSkill();
    mockStore([existing]);
    render(<SkillsDialog open={true} onOpenChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Add Skill" }));
    await user.type(screen.getByLabelText("Name"), "Summarizer");
    await user.type(screen.getByLabelText("Description"), "Summarize docs");
    await user.type(
      screen.getByLabelText("Instructions"),
      "Summarize the document.",
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(mockSetSkills).toHaveBeenCalledOnce();
    const saved: Skill[] = mockSetSkills.mock.calls[0][0];
    expect(saved).toHaveLength(2);
    expect(saved[0]).toEqual(existing);
    expect(saved[1].name).toBe("Summarizer");
    expect(saved[1].description).toBe("Summarize docs");
    expect(saved[1].instructions).toBe("Summarize the document.");
    expect(saved[1].id).toBeTruthy();
  });

  it("editing a skill updates it in place with the same id", async () => {
    const user = userEvent.setup();
    const skill = makeSkill();
    mockStore([skill]);
    render(<SkillsDialog open={true} onOpenChange={vi.fn()} />);

    await user.click(
      screen.getByRole("button", { name: `Edit ${skill.name}` }),
    );

    const nameInput = screen.getByLabelText("Name") as HTMLInputElement;
    await user.clear(nameInput);
    await user.type(nameInput, "Renamed");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(mockSetSkills).toHaveBeenCalledOnce();
    const saved: Skill[] = mockSetSkills.mock.calls[0][0];
    expect(saved).toHaveLength(1);
    expect(saved[0].id).toBe(skill.id);
    expect(saved[0].name).toBe("Renamed");
  });

  it("confirming delete removes the skill", async () => {
    const user = userEvent.setup();
    const skill = makeSkill();
    mockStore([skill]);
    render(<SkillsDialog open={true} onOpenChange={vi.fn()} />);

    await user.click(
      screen.getByRole("button", { name: `Delete ${skill.name}` }),
    );
    await user.click(screen.getByRole("button", { name: "Yes" }));

    expect(mockSetSkills).toHaveBeenCalledWith([]);
  });

  it("cancelling delete keeps the skill", async () => {
    const user = userEvent.setup();
    const skill = makeSkill();
    mockStore([skill]);
    render(<SkillsDialog open={true} onOpenChange={vi.fn()} />);

    await user.click(
      screen.getByRole("button", { name: `Delete ${skill.name}` }),
    );
    await user.click(screen.getByRole("button", { name: "No" }));

    expect(mockSetSkills).not.toHaveBeenCalled();
  });

  it("duplicate name shows a validation error", async () => {
    const user = userEvent.setup();
    mockStore([makeSkill()]);
    render(<SkillsDialog open={true} onOpenChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Add Skill" }));
    await user.type(screen.getByLabelText("Name"), "Proofreader");
    await user.type(screen.getByLabelText("Description"), "desc");
    await user.type(screen.getByLabelText("Instructions"), "inst");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText(/already exists/i)).toBeInTheDocument();
    expect(mockSetSkills).not.toHaveBeenCalled();
  });

  it("cancel edit returns to list view without saving", async () => {
    const user = userEvent.setup();
    const skill = makeSkill();
    mockStore([skill]);
    render(<SkillsDialog open={true} onOpenChange={vi.fn()} />);

    await user.click(
      screen.getByRole("button", { name: `Edit ${skill.name}` }),
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(mockSetSkills).not.toHaveBeenCalled();
    expect(screen.getByText("Proofreader")).toBeInTheDocument();
  });
});
