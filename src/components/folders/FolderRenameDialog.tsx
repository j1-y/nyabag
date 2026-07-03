"use client";

import { HugeIcon } from "@/components/ui/huge-icon";
import { IconCheck } from "@/components/ui/icons";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
;
import { updateBookmarkFolder } from "@/lib/folder-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { BookmarkFolder } from "@/lib/types";

type FolderRenameDialogProps = {
  folder: BookmarkFolder;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRenamed?: (folder: BookmarkFolder) => void;
};

export function FolderRenameDialog({
  folder,
  open,
  onOpenChange,
  onRenamed,
}: FolderRenameDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [name, setName] = useState(folder.name);

  function handleClose() {
    setName(folder.name);
    setError("");
    onOpenChange(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    startTransition(async () => {
      const result = await updateBookmarkFolder({
        id: folder.id,
        name: name.trim(),
      });

      if (result.success) {
        onRenamed?.(result.data);
        handleClose();
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename folder</DialogTitle>
          <DialogDescription>
            Give &ldquo;{folder.name}&rdquo; a new name.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 px-4 py-4">
            {error && <div className="auth-error">{error}</div>}
            <Field>
              <FieldLabel htmlFor="folder-rename-name">New name</FieldLabel>
              <Input
                id="folder-rename-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Folder name"
                maxLength={80}
                required
                autoFocus
                onFocus={(e) => e.target.select()}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !name.trim() || name === folder.name}>
              <HugeIcon icon={IconCheck} />
              {isPending ? "Saving..." : "Rename"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
