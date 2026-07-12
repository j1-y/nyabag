"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { createWorkspace } from "@/lib/workspace-actions";
import type { Workspace } from "@/lib/types";

type CreateWorkspaceDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (workspace: Workspace) => void;
};

export function CreateWorkspaceDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateWorkspaceDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createWorkspace(formData);
      if (!result.success) {
        setError(result.error);
        return;
      }

      onCreated?.(result.data);
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form action={handleSubmit}>
          <DialogHeader className="border-none">
            <DialogTitle>Create workspace</DialogTitle>
            <DialogDescription className="pr-8">
              Create a separate space for bookmarks, captures, folders, and canvas notes.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 p-4">
            <Field>
              <Input
                id="workspace-name"
                name="name"
                maxLength={80}
                placeholder="Client Research"
                required
              />
              {error && <FieldError>{error}</FieldError>}
            </Field>
          </div>

          <DialogFooter className="border-none">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

