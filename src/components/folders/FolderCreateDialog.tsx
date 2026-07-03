"use client";

import { HugeIcon } from "@/components/ui/huge-icon";
import { IconSave } from "@/components/ui/icons";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
;
import { createBookmarkFolder } from "@/lib/folder-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldHint, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { BookmarkFolder } from "@/lib/types";

type FolderCreateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentFolder?: BookmarkFolder | null;
  onCreated?: (folder: BookmarkFolder) => void;
};

export function FolderCreateDialog({
  open,
  onOpenChange,
  parentFolder,
  onCreated,
}: FolderCreateDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("");

  function handleClose() {
    setName("");
    setDescription("");
    setColor("");
    setError("");
    onOpenChange(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    startTransition(async () => {
      const result = await createBookmarkFolder({
        name: name.trim(),
        parent_id: parentFolder?.id ?? null,
        description: description.trim() || "",
        color: color.trim() ? color.trim() : undefined,
        icon: undefined,
      });

      if (result.success) {
        onCreated?.(result.data);
        handleClose();
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  const title = parentFolder
    ? `New subfolder in "${parentFolder.name}"`
    : "New folder";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {parentFolder
              ? `Create a subfolder inside "${parentFolder.name}".`
              : "Create a new folder to organize your bookmarks."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 px-4 py-4">
            {error && <div className="auth-error">{error}</div>}
            <Field>
              <FieldLabel htmlFor="folder-create-name">
                Name <span className="text-destructive">*</span>
              </FieldLabel>
              <Input
                id="folder-create-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Landing Pages"
                maxLength={80}
                required
                autoFocus
              />
              <FieldHint>1–80 characters.</FieldHint>
            </Field>
            <Field>
              <FieldLabel htmlFor="folder-create-description">Description</FieldLabel>
              <Textarea
                id="folder-create-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What goes in this folder?"
                rows={2}
                className="resize-none"
                maxLength={300}
              />
              <FieldHint>Optional.</FieldHint>
            </Field>
            <Field>
              <FieldLabel htmlFor="folder-create-color">Color</FieldLabel>
              <div className="folder-color-input-row">
                <input
                  id="folder-create-color"
                  type="color"
                  value={color || "#8B6BEA"}
                  onChange={(e) => setColor(e.target.value)}
                  className="folder-color-picker"
                  aria-label="Pick folder color"
                />
                <Input
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  placeholder="#8B6BEA"
                  maxLength={7}
                  className="folder-color-text"
                />
                {color && (
                  <button
                    type="button"
                    className="folder-color-clear"
                    onClick={() => setColor("")}
                    aria-label="Remove color"
                  >
                    ×
                  </button>
                )}
              </div>
              <FieldHint>Optional hex color, e.g. #8B6BEA.</FieldHint>
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !name.trim()}>
              <HugeIcon icon={IconSave} />
              {isPending ? "Creating..." : "Create folder"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
