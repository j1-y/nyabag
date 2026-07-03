"use client";

import { HugeIcon } from "@/components/ui/huge-icon";
import { IconSave } from "@/components/ui/icons";
import { useRef, useState, useTransition } from "react";
;
import { createBookmark } from "@/lib/actions";
import { useBookmarks } from "@/hooks/useBookmarks";
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
import { FolderSelector } from "@/components/folders/FolderSelector";

export function AddBookmarkModal() {
  const {
    addOpen,
    openAdd,
    closeAdd,
    addPendingBookmark,
    removePendingBookmark,
    setBookmarks,
  } = useBookmarks();
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

  const domainHint = (() => {
    if (!urlInput) return "Auto-detected from URL";
    try {
      const hostname = new URL(urlInput.startsWith("http") ? urlInput : `https://${urlInput}`).hostname.replace("www.", "");
      const base = hostname.split(".")[0];
      return base.charAt(0).toUpperCase() + base.slice(1);
    } catch {
      return "Auto-detected from URL";
    }
  })();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const fd = new FormData(formRef.current!);
    // Ensure folder_id is in the form data
    if (selectedFolderId) {
      fd.set("folder_id", selectedFolderId);
    }
    const optimisticUrl = String(fd.get("url") ?? "");
    const optimisticTitle = String(fd.get("title") ?? "").trim() || domainHint;
    const pendingId = crypto.randomUUID();

    addPendingBookmark({
      id: pendingId,
      title: optimisticTitle,
      url: optimisticUrl,
    });
    closeAdd();

    startTransition(async () => {
      const result = await createBookmark(fd);
      removePendingBookmark(pendingId);
      if (result.success) {
        setBookmarks((prev) => [result.data, ...prev.filter((b) => b.id !== result.data.id)]);
        formRef.current?.reset();
        setUrlInput("");
        setSelectedFolderId(null);
      } else {
        setError(result.error);
        openAdd();
      }
    });
  }

  function handleClose() {
    setSelectedFolderId(null);
    setUrlInput("");
    setError("");
    closeAdd();
  }

  return (
    <Dialog open={addOpen} onOpenChange={(open) => (open ? openAdd() : handleClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New bookmark</DialogTitle>
          <DialogDescription>
            Save a reference and Nyabag will enrich it in the background.
          </DialogDescription>
        </DialogHeader>
        <form ref={formRef} onSubmit={handleSubmit}>
          <div className="grid gap-4 px-4 py-4">
            {error && <div className="auth-error">{error}</div>}
            <Field>
              <FieldLabel htmlFor="add-url">URL <span className="text-destructive">*</span></FieldLabel>
              <Input id="add-url" name="url" type="url" placeholder="https://example.com" required autoComplete="off" value={urlInput} onChange={(event) => setUrlInput(event.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="add-title">Title</FieldLabel>
              <Input id="add-title" name="title" type="text" placeholder={domainHint} />
            </Field>
            <Field>
              <FieldLabel htmlFor="add-tags">Tags</FieldLabel>
              <Input id="add-tags" name="tags" type="text" placeholder="design, inspiration, dashboard" />
              <FieldHint>Optional, comma-separated.</FieldHint>
            </Field>
            <Field>
              <FieldLabel htmlFor="add-note">Note</FieldLabel>
              <Textarea id="add-note" name="note" rows={2} placeholder="Why did you save this?" className="resize-none" />
              <FieldHint>Optional.</FieldHint>
            </Field>
            <Field>
              <FieldLabel htmlFor="add-folder">Folder</FieldLabel>
              <FolderSelector
                id="add-folder"
                name="folder_id"
                value={selectedFolderId}
                onChange={setSelectedFolderId}
              />
              <FieldHint>Optional. You can always move it later.</FieldHint>
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
            <Button type="submit" disabled={isPending}>
              <HugeIcon icon={IconSave} /> {isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
