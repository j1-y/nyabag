"use client";

import { HugeIcon } from "@/components/ui/huge-icon";
import { IconDelete } from "@/components/ui/icons";
;
import { useNotes } from "@/hooks/useNotes";
import { IconButton } from "@/components/ui/icon-button";
import type { CanvasNote } from "@/lib/types";

interface SocialNoteToolbarProps {
  note: CanvasNote;
  placement: "above" | "below";
}

export function SocialNoteToolbar({ note, placement }: SocialNoteToolbarProps) {
  const { deleteNote } = useNotes();

  return (
    <div
      className={`social-note-toolbar social-note-toolbar--${placement}`}
      onPointerDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <IconButton
        type="button"
        variant="ghost"
        size="icon-sm"
        className="social-note-toolbar-button social-note-toolbar-button--delete"
        title="Delete note"
        aria-label="Delete note"
        onPointerDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          void deleteNote(note.id);
        }}
      >
        <HugeIcon icon={IconDelete} size={18} />
      </IconButton>
    </div>
  );
}
