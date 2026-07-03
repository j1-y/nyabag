"use client";

import { HugeIcon, type IconSvgElement } from "@/components/ui/huge-icon";
import { IconDelete, IconLink, IconText } from "@/components/ui/icons";
import type { CSSProperties, RefObject } from "react";
import { useNotes } from "@/hooks/useNotes";
import { IconButton } from "@/components/ui/icon-button";
import type { CanvasNote } from "@/lib/types";
import type { StickyNoteFormatAction, StickyNoteTextHandle } from "./NoteTextContent";

interface TextFrameToolbarProps {
  note: CanvasNote;
  formatRef: RefObject<StickyNoteTextHandle | null>;
  viewportScale: number;
  placement: "above" | "below";
}

const FRAME_ACTIONS: Array<{
  action: StickyNoteFormatAction;
  label: string;
  title: string;
  icon?: IconSvgElement;
}> = [
  { action: "heading", label: "H", title: "Heading", icon: IconText },
  { action: "bold", label: "B", title: "Bold" },
  { action: "italic", label: "I", title: "Italic" },
  { action: "underline", label: "U", title: "Underline" },
  { action: "link", label: "Link", title: "Link", icon: IconLink },
];

export function TextFrameToolbar({
  note,
  formatRef,
  viewportScale,
  placement,
}: TextFrameToolbarProps) {
  const { deleteNote } = useNotes();
  const inverseScale = viewportScale > 0 ? 1 / viewportScale : 1;

  return (
    <div
      className={`text-frame-toolbar text-frame-toolbar--${placement}`}
      style={{ "--sticky-toolbar-scale": inverseScale } as CSSProperties}
      onPointerDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {FRAME_ACTIONS.map(({ action, label, title, icon: Icon }) => (
        <button
          key={action}
          type="button"
          className={`text-frame-toolbar-button text-frame-toolbar-button--${action}`}
          title={title}
          aria-label={title}
          onPointerDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            formatRef.current?.applyFormat(action);
          }}
        >
          {Icon ? <HugeIcon icon={Icon} size={18} /> : label}
        </button>
      ))}

      <div className="text-frame-toolbar-sep" />

      <IconButton
        type="button"
        variant="ghost"
        size="icon-sm"
        className="text-frame-toolbar-button text-frame-toolbar-button--delete"
        title="Delete text frame"
        aria-label="Delete text frame"
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
