// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from "vitest";
import { DEFAULT_MODEL, LEGACY_MODEL_MIGRATIONS, MODELS } from "./models";

describe("models catalog", () => {
  it("includes DEFAULT_MODEL in MODELS", () => {
    expect(MODELS.map((m) => m.id)).toContain(DEFAULT_MODEL);
  });

  it("has unique model IDs", () => {
    const ids = MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("maps every legacy migration target to an entry in MODELS", () => {
    const validIds = new Set(MODELS.map((m) => m.id));
    for (const target of Object.values(LEGACY_MODEL_MIGRATIONS)) {
      expect(validIds.has(target)).toBe(true);
    }
  });
});
