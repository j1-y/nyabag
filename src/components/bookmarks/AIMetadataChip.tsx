"use client";

import { AIIcon } from "@/components/ui/AIIcon";

export function AIMetadataChip({
  label,
  className = "",
  showIcon = false,
}: {
  label: string;
  className?: string;
  showIcon?: boolean;
}) {
  if (!label.trim()) return null;

  return (
    <span className={`ai-chip ${className}`}>
      {showIcon && <AIIcon size={18} />}
      {label}
    </span>
  );
}
