// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

export interface ModelOption {
  id: string;
  label: string;
}

export const DEFAULT_MODEL = "gemini-3.5-flash-lite";

export const MODELS: readonly ModelOption[] = [
  { id: "gemini-4-carbon", label: "Gemini 4 Carbon" },
  { id: "gemini-4-neon", label: "Gemini 4 Neon" },
  { id: "gemini-4-argon", label: "Gemini 4 Argon" },
  { id: "gemini-4-hydrogen", label: "Gemini 4 Hydrogen" },
  { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash" },
  { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash Lite" },
  { id: "gemma-4-26b-a4b-it", label: "Gemma 4 26B A4B IT" },
  { id: "gemma-4-31b-it", label: "Gemma 4 31B IT" },
];

export const LEGACY_MODEL_MIGRATIONS: Readonly<Record<string, string>> = {
  "gemini-2.0-flash": DEFAULT_MODEL,
  "gemini-2.5-flash": DEFAULT_MODEL,
  "gemini-2.5-pro": "gemini-3.8-flash",
  "gemini-3-flash-preview": "gemini-3.8-flash",
  "gemini-3.1-pro-preview": "gemini-3.8-flash",
  "gemini-3.1-flash-lite-preview": DEFAULT_MODEL,
  "gemini-3.1-flash-lite": DEFAULT_MODEL,
  "gemini-3.5-flash": "gemini-3.8-flash",
};
