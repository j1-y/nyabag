"use client";

import { HugeIcon } from "@/components/ui/huge-icon";
import { IconSparkles } from "@/components/ui/icons";

export function AIIcon({
  size = 18,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return <HugeIcon icon={IconSparkles} size={size} className={className} aria-hidden="true" />;
}
