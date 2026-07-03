"use client";

import { Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
;
import { deleteBookmarkFolder } from "@/lib/folder-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { BookmarkFolder } from "@/lib/types";

type FolderDeleteDialogProps = {
  folder: BookmarkFolder;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
};

export function FolderDeleteDialog({
  folder,
  open,
  onOpenChange,
  onDeleted,
}: FolderDeleteDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function handleDelete() {
    setError("");
    startTransition(async () => {
      const result = await deleteBookmarkFolder(folder.id);
      if (result.success) {
        onDeleted?.();
        onOpenChange(false);
        router.refresh();
        router.push("/");
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete folder?</DialogTitle>
          <DialogDescription>
            This will delete <strong>&ldquo;{folder.name}&rdquo;</strong> and its
            subfolders. Bookmarks inside them will be moved to{" "}
            <strong>Inbox</strong>. Your bookmarks will not be deleted.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <div className="auth-error" style={{ margin: "0 1rem" }}>
            {error}
          </div>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={isPending}
          >
            <Trash2 />
            {isPending ? "Deleting..." : "Delete folder"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
