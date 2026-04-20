// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

export interface WorkspaceDocument {
  id: string;
  title: string;
  content: string;
  updatedAt: number;
}

export interface WorkspaceMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface WorkspaceData {
  documents: WorkspaceDocument[];
  activeDocumentId: string | null;
}
