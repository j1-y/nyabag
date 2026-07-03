"use client";

import { HugeIcon } from "@/components/ui/huge-icon";
import { IconArrowUpRight, IconDelete, IconFile, IconImage, IconMaximize, IconPalette, IconPencil, IconTag, IconText } from "@/components/ui/icons";
import { useState } from "react";
import { getDomain, getTagColor } from "@/lib/data";
import { useBookmarks } from "@/hooks/useBookmarks";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DeleteBookmarkDialog } from "./DeleteBookmarkDialog";

export function DetailModal() {
  const { detailTarget, closeDetail, openEdit, deleteItem } = useBookmarks();
  const [imgError, setImgError] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (!detailTarget) return null;

  const b = detailTarget;
  const domain = getDomain(b.url);

  function handleDelete() {
    setDeleteOpen(true);
  }

  return (
    <>
      <Dialog open={Boolean(detailTarget)} onOpenChange={(open) => !open && closeDetail()}>
        <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{b.title}</DialogTitle>
        </DialogHeader>

        <div className="relative h-[220px] bg-muted overflow-hidden border-b flex-shrink-0 group">
          <div className="absolute inset-0 overflow-y-auto">
            {!imgError ? (
              b.screenshot_url ? (
                <img
                  className="w-full h-auto block"
                  src={b.screenshot_url}
                  alt="Site screenshot"
                  onError={() => setImgError(true)}
                />
              ) : (
                <div className="preview-fallback" style={{ position: "absolute", inset: 0, display: "flex" }}>
                  <HugeIcon icon={IconImage} size={18} />
                  <span style={{ fontSize: 12, color: "var(--text3)" }}>{domain}</span>
                </div>
              )
            ) : (
              <div className="preview-fallback" style={{ position: "absolute", inset: 0, display: "flex" }}>
                <HugeIcon icon={IconImage} size={18} />
                <span style={{ fontSize: 12, color: "var(--text3)" }}>{domain}</span>
              </div>
            )}
          </div>
          <div className="absolute bottom-2 right-2 flex gap-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button size="sm" variant="secondary" className="h-8 px-4 text-xs shadow-md" asChild>
              <a href={b.screenshot_url ?? b.url} target="_blank" rel="noopener noreferrer">
                <HugeIcon icon={IconMaximize} className="mr-2" /> Expand
              </a>
            </Button>
            <Button size="sm" variant="default" className="h-8 px-4 text-xs shadow-md" asChild>
              <a href={b.url} target="_blank" rel="noopener noreferrer">
                <HugeIcon icon={IconArrowUpRight} className="mr-2" /> Open site
              </a>
            </Button>
          </div>
        </div>

        <div className="detail-meta">
          <div className="meta-block">
            <p className="meta-label"><HugeIcon icon={IconPalette} /> Extracted colors</p>
            <div className="palette-row">
              {b.palette.map((c) => (
                <div key={c} className="palette-swatch">
                  <div className="dot" style={{ background: c }} />
                  <span>{c}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="meta-block">
            <p className="meta-label"><HugeIcon icon={IconText} /> Detected fonts</p>
            <div className="font-row">
              {b.fonts.map((f) => <span key={f} className="font-badge">{f}</span>)}
            </div>
          </div>

          {b.note && (
            <div className="meta-block">
              <p className="meta-label"><HugeIcon icon={IconFile} /> Note</p>
              <p className="meta-note">{b.note}</p>
            </div>
          )}

          <div className="meta-block">
            <p className="meta-label"><HugeIcon icon={IconTag} /> Tags</p>
            <div className="tag-row">
              {b.tags.length ? b.tags.map((t) => (
                <span key={t} className="ctag" style={{ borderColor: `${getTagColor(t)}33`, color: getTagColor(t) }}>
                  {t}
                </span>
              )) : <span style={{ fontSize: 12, color: "var(--text3)" }}>No tags</span>}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="destructive" onClick={handleDelete}>
            <HugeIcon icon={IconDelete} /> Delete
          </Button>
          <Button variant="outline" onClick={() => { closeDetail(); openEdit(b); }}>
            <HugeIcon icon={IconPencil} /> Edit
          </Button>
          <Button asChild>
            <a href={b.url} target="_blank" rel="noopener noreferrer">
              <HugeIcon icon={IconArrowUpRight} /> Visit site
            </a>
          </Button>
        </DialogFooter>
        </DialogContent>
      </Dialog>
      <DeleteBookmarkDialog
        title={b.title}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={() => deleteItem(b.id)}
      />
    </>
  );
}
