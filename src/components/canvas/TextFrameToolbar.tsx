"use client";

import { HugeIcon, type IconSvgElement } from "@/components/ui/huge-icon";
import { IconDelete, IconLink, IconText, IconBold, IconItalic, IconUnderline, IconStrikethrough } from "@/components/ui/icons";
import type { CSSProperties, RefObject } from "react";
import { useNotes } from "@/hooks/useNotes";
import { IconButton } from "@/components/ui/icon-button";
import type { CanvasNote } from "@/lib/types";
import type { StickyNoteFormatAction, StickyNoteTextHandle } from "./NoteTextContent";

interface TextFrameToolbarProps {
  note: CanvasNote;
  formatRef: RefObject<StickyNoteTextHandle | null>;
  placement: "above" | "below";
}

const FRAME_ACTIONS: Array<{
  action: StickyNoteFormatAction;
  label: string;
  title: string;
  icon?: IconSvgElement;
}> = [
  { action: "heading", label: "H", title: "Heading", icon: IconText },
  { action: "bold", label: "B", title: "Bold", icon: IconBold },
  { action: "italic", label: "I", title: "Italic", icon: IconItalic },
  { action: "underline", label: "U", title: "Underline", icon: IconUnderline },
  { action: "strike", label: "S", title: "Strikethrough", icon: IconStrikethrough },
  { action: "link", label: "Link", title: "Link", icon: IconLink },
];

export function TextFrameToolbar({
  note,
  formatRef,
  placement,
}: TextFrameToolbarProps) {
  const { deleteNote } = useNotes();

  return (
    <div
      className={`text-frame-toolbar text-frame-toolbar--${placement}`}
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
          {Icon ? <HugeIcon icon={Icon} size={14} strokeWidth={1.5} /> : label}
        </button>
      ))}

      <div className="text-frame-toolbar-sep" />

      <IconButton
        type="button"
        variant="ghost"
        size="icon-sm"
        className="text-frame-toolbar-button text-frame-toolbar-button--delete [&_svg]:size-[14px]"
        title="Delete text frame"
        aria-label="Delete text frame"
        onPointerDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          void deleteNote(note.id);
        }}
      >
        <HugeIcon icon={IconDelete} size={14} strokeWidth={1.5} />
      </IconButton>
    </div>
  );
}
