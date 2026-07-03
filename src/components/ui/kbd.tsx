import * as React from "react";

import { cn } from "@/lib/utils";

function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        "inline-flex h-6 min-w-6 items-center justify-center rounded-[10px] border border-border bg-surface px-2 text-[11px] font-medium text-muted-foreground shadow-[var(--shadow-xs)]",
        className
      )}
      {...props}
    />
  );
}

export { Kbd };
