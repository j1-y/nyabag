import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const alertVariants = cva(
  "relative w-full rounded-[10px] border px-4 py-3 text-sm leading-5",
  {
    variants: {
      variant: {
        default: "border-border bg-surface text-foreground",
        destructive:
          "border-destructive-border bg-destructive-soft text-destructive",
        success: "border-success-border bg-success-soft text-success",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {}

function Alert({ className, variant, ...props }: AlertProps) {
  return <div className={cn(alertVariants({ variant, className }))} {...props} />;
}

function AlertDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("m-0", className)} {...props} />;
}

export { Alert, AlertDescription, alertVariants };
