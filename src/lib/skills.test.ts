// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, beforeEach } from "vitest";
import {
  loadSkills,
  saveSkills,
  initializeSkills,
  DEFAULT_SKILLS,
  Skill,
  CREATE_SKILL_ID,
} from "./skills";

describe("skills storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("loadSkills returns empty array when storage is empty", () => {
    expect(loadSkills()).toEqual([]);
  });

  it("saveSkills / loadSkills round-trip preserves all fields", () => {
    const skill: Skill = {
      id: "test-id",
      name: "Test",
      description: "A test skill",
      instructions: "Do stuff",
      model: "some-model",
    };
    saveSkills([skill]);
    expect(loadSkills()).toEqual([skill]);
  });

  it("loadSkills returns empty array on malformed JSON", () => {
    localStorage.setItem("skills", "not-json{{{");
    expect(loadSkills()).toEqual([]);
  });

  it("initializeSkills seeds defaults when key is absent", () => {
    const result = initializeSkills();
    expect(result).toEqual(DEFAULT_SKILLS);
    expect(loadSkills()).toEqual(DEFAULT_SKILLS);
  });

  it("initializeSkills does not overwrite existing skills", () => {
    const custom: Skill[] = [
      { id: "x", name: "Custom", description: "desc", instructions: "inst" },
    ];
    saveSkills(custom);
    const result = initializeSkills();
    expect(result).toEqual(custom);
  });

  it("Create Skill is included in DEFAULT_SKILLS and does not reference write tools", () => {
    const createSkill = DEFAULT_SKILLS.find((s) => s.id === CREATE_SKILL_ID);
    expect(createSkill).toBeDefined();
    expect(createSkill!.name).toBe("Create Skill");
    expect(createSkill!.instructions).not.toContain("create_document");
    expect(createSkill!.instructions).not.toContain("switch_active_document");
    expect(createSkill!.instructions).not.toContain("write(");
  });

  it("model field is optional and preserved when set", () => {
    const withModel: Skill = {
      id: "a",
      name: "A",
      description: "d",
      instructions: "i",
      model: "gemini-2.5-pro",
    };
    const withoutModel: Skill = {
      id: "b",
      name: "B",
      description: "d",
      instructions: "i",
    };
    saveSkills([withModel, withoutModel]);
    const loaded = loadSkills();
    expect(loaded[0].model).toBe("gemini-2.5-pro");
    expect(loaded[1].model).toBeUndefined();
  });
});
