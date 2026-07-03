import { HugeiconsIcon } from "@hugeicons/react";
import type { HugeiconsIconProps, IconSvgElement } from "@hugeicons/react";
import { cn } from "@/lib/utils";

export type { IconSvgElement };

type HugeIconProps = Omit<HugeiconsIconProps, "size"> & {
  size?: number | string;
};

function normalizeIconSize(size: number | string | undefined) {
  if (typeof size === "number") return Math.max(size, 18);

  if (typeof size === "string") {
    const parsed = Number(size);
    if (Number.isFinite(parsed)) return String(Math.max(parsed, 18));
  }

  return size ?? 18;
}

export function HugeIcon({
  size,
  strokeWidth = 1.5,
  color = "currentColor",
  className,
  ...props
}: HugeIconProps) {
  return (
    <HugeiconsIcon
      className={cn("nyabag-icon", className)}
      color={color}
      size={normalizeIconSize(size)}
      strokeWidth={strokeWidth}
      {...props}
    />
  );
}
