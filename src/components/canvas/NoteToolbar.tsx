"use client";

import { HugeIcon } from "@/components/ui/huge-icon";
import { IconDelete } from "@/components/ui/icons";
;
import { useNotes } from "@/hooks/useNotes";
import { IconButton } from "@/components/ui/icon-button";
import { ColorPicker } from "./ColorPicker";
import type { CanvasNote } from "@/lib/types";

interface Props {
  note: CanvasNote;
  isVisible: boolean;
}

export function NoteToolbar({ note, isVisible }: Props) {
  const { deleteNote, updateColor } = useNotes();

  return (
    <div
      className="note-toolbar"
      style={{ opacity: isVisible ? 1 : 0 }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <ColorPicker
        value={note.color}
        onChange={(color) => updateColor(note.id, color)}
      />
      <IconButton
        type="button"
        variant="ghost"
        size="icon-sm"
        className="note-toolbar-btn"
        title="Delete note"
        onPointerDown={(e) => { e.stopPropagation(); deleteNote(note.id); }}
      >
        <HugeIcon icon={IconDelete} size={18} />
      </IconButton>
    </div>
  );
}
