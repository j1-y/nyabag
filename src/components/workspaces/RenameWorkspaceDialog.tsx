"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { renameWorkspace } from "@/lib/workspace-actions";
import type { Workspace } from "@/lib/types";

type RenameWorkspaceDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: Workspace;
  onRenamed?: (workspace: Workspace) => void;
};

export function RenameWorkspaceDialog({
  open,
  onOpenChange,
  workspace,
  onRenamed,
}: RenameWorkspaceDialogProps) {
  const [name, setName] = useState(workspace.name);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (open) {
      setName(workspace.name);
      setError(null);
    }
  }, [open, workspace.name]);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await renameWorkspace(formData);
      if (!result.success) {
        setError(result.error);
        return;
      }

      onRenamed?.(result.data);
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form action={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Rename workspace</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 p-4">
            <input type="hidden" name="id" value={workspace.id} />
            <Field>
              <FieldLabel htmlFor="rename-workspace-name">Name</FieldLabel>
              <Input
                id="rename-workspace-name"
                name="name"
                value={name}
                maxLength={80}
                required
                onChange={(event) => setName(event.target.value)}
              />
              {error && <FieldError>{error}</FieldError>}
            </Field>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

