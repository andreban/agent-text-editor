// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0
import React from "react";
import { Suggestion } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";

interface SuggestionWidgetProps {
  suggestion: Suggestion;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
}

export const SuggestionWidget: React.FC<SuggestionWidgetProps> = ({
  suggestion,
  onAccept,
  onReject,
}) => {
  return (
    <div className="flex items-center bg-card border rounded-full shadow-md px-1 py-1 gap-1">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onAccept(suggestion.id)}
        className="h-11 w-11 rounded-full text-green-600 hover:bg-green-50 hover:text-green-700"
        title="Accept"
      >
        <Check className="w-4 h-4" />
      </Button>
      <div className="w-px h-4 bg-border mx-0.5" />
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onReject(suggestion.id)}
        className="h-11 w-11 rounded-full text-red-600 hover:bg-red-50 hover:text-red-700"
        title="Reject"
      >
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
};
