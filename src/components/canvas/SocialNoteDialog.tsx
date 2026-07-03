"use client";

import { HugeIcon } from "@/components/ui/huge-icon";
import { IconShare } from "@/components/ui/icons";
import { useState } from "react";
;
import { parseSocialEmbed, socialProviderLabel } from "@/lib/social-embeds";
import type { ActionResult } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldHint, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function SocialNoteDialog({
  initialUrl = "",
  title = "Embed social post",
  description = "Paste a public X/Twitter, Facebook, LinkedIn, Instagram, TikTok, or Pinterest post link.",
  confirmLabel = "Create note",
  onClose,
  onConfirm,
}: {
  initialUrl?: string;
  title?: string;
  description?: string;
  confirmLabel?: string;
  onClose: () => void;
  onConfirm: (url: string) => Promise<ActionResult<unknown>>;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const parsed = parseSocialEmbed(url);

  async function confirm() {
    setError("");
    if (!parsed) {
      setError("Paste a public X/Twitter, Facebook, LinkedIn, Instagram, TikTok, or Pinterest post URL.");
      return;
    }

    setIsSubmitting(true);
    const result = await onConfirm(parsed.url);
    setIsSubmitting(false);
    if (result.success) onClose();
    else setError(result.error);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-4">
          <div className="grid h-10 w-10 place-items-center rounded-[10px] border border-border bg-surface-muted text-muted-foreground" aria-hidden="true">
            <HugeIcon icon={IconShare} size={18} />
          </div>
          <div className="grid gap-2">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </div>
        </DialogHeader>

        <div className="grid gap-4 px-4 py-4">
          <Field>
            <FieldLabel htmlFor="social-note-url">Post link</FieldLabel>
            <Input
              id="social-note-url"
              autoFocus
              type="url"
              placeholder="https://..."
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirm();
              }}
            />
            {parsed && <FieldHint>Detected {socialProviderLabel(parsed.provider)}</FieldHint>}
          </Field>
          {error && <FieldError>{error}</FieldError>}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={confirm} disabled={isSubmitting}>
            {isSubmitting ? "Creating..." : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
