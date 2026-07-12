"use client";

import { HugeIcon } from "@/components/ui/huge-icon";
import { IconArrowDown, IconCheck, IconCheckSquare, IconDelete, IconLink, IconList, IconOrderedList, IconText, IconBold, IconItalic, IconUnderline, IconStrikethrough } from "@/components/ui/icons";
;
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { NOTE_COLORS, useNotes } from "@/hooks/useNotes";
import { IconButton } from "@/components/ui/icon-button";
import type { StickyNoteFormatAction, StickyNoteTextHandle } from "./NoteTextContent";
import type { CanvasNote } from "@/lib/types";

interface StickyNoteToolbarProps {
  note: CanvasNote;
  formatRef: RefObject<StickyNoteTextHandle | null>;
  placement: "above" | "below";
}

const FORMAT_BUTTONS: Array<{
  action: StickyNoteFormatAction;
  label: string;
  title: string;
  icon?: ReactNode;
}> = [
  { action: "heading", label: "H", title: "Heading", icon: <HugeIcon icon={IconText} size={14} strokeWidth={1.5} /> },
  { action: "bold", label: "B", title: "Bold", icon: <HugeIcon icon={IconBold} size={14} strokeWidth={1.5} /> },
  { action: "italic", label: "I", title: "Italic", icon: <HugeIcon icon={IconItalic} size={14} strokeWidth={1.5} /> },
  { action: "underline", label: "U", title: "Underline", icon: <HugeIcon icon={IconUnderline} size={14} strokeWidth={1.5} /> },
  { action: "strike", label: "S", title: "Strikethrough", icon: <HugeIcon icon={IconStrikethrough} size={14} strokeWidth={1.5} /> },
  { action: "bullet", label: "List", title: "Bulleted list", icon: <HugeIcon icon={IconList} size={14} strokeWidth={1.5} /> },
  { action: "ordered", label: "1", title: "Ordered list", icon: <HugeIcon icon={IconOrderedList} size={14} strokeWidth={1.5} /> },
  { action: "todo", label: "Todo", title: "Todo list", icon: <HugeIcon icon={IconCheckSquare} size={14} strokeWidth={1.5} /> },
  { action: "link", label: "Link", title: "Link", icon: <HugeIcon icon={IconLink} size={14} strokeWidth={1.5} /> },
];

export function StickyNoteToolbar({
  note,
  formatRef,
  placement,
}: StickyNoteToolbarProps) {
  const { deleteNote, updateColor } = useNotes();
  const [colorOpen, setColorOpen] = useState(false);
  const [activeActions, setActiveActions] = useState<Set<StickyNoteFormatAction>>(() => new Set());
  const toolbarRef = useRef<HTMLDivElement>(null);

  const refreshActiveActions = useCallback(() => {
    const next = new Set<StickyNoteFormatAction>();
    for (const button of FORMAT_BUTTONS) {
      if (formatRef.current?.isActive(button.action)) {
        next.add(button.action);
      }
    }
    setActiveActions(next);
  }, [formatRef]);

  useEffect(() => {
    if (!colorOpen) return;

    function closeOnOutsideClick(event: MouseEvent) {
      if (!toolbarRef.current?.contains(event.target as Node)) {
        setColorOpen(false);
      }
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [colorOpen]);

  function applyFormat(action: StickyNoteFormatAction) {
    formatRef.current?.applyFormat(action);
    window.setTimeout(refreshActiveActions, 0);
  }

  return (
    <div
      ref={toolbarRef}
      className={`sticky-note-toolbar sticky-note-toolbar--${placement}`}
      onPointerDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseEnter={refreshActiveActions}
      onFocus={refreshActiveActions}
    >
      <div className="sticky-note-color-menu">
        <button
          type="button"
          className="sticky-note-color-trigger"
          title="Change note color"
          aria-label="Change note color"
          aria-expanded={colorOpen}
          onPointerDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setColorOpen((open) => !open);
          }}
        >
          <span className="sticky-note-current-color" style={{ background: note.color }} />
          <HugeIcon icon={IconArrowDown} size={14} strokeWidth={1.5} />
        </button>

        {colorOpen && (
          <div className="sticky-note-color-popover">
            <div className="sticky-note-color-grid">
              {NOTE_COLORS.map((color) => {
                const isActive = note.color.toLowerCase() === color.toLowerCase();
                return (
                  <button
                    key={color}
                    type="button"
                    className={`sticky-note-color-swatch${isActive ? " active" : ""}`}
                    style={{ background: color }}
                    title={`Set color ${color}`}
                    aria-label={`Set note color ${color}`}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      updateColor(note.id, color);
                      setColorOpen(false);
                      formatRef.current?.focus();
                    }}
                  >
                    {isActive && <HugeIcon icon={IconCheck} size={14} strokeWidth={1.5} />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="sticky-note-toolbar-sep" />

      {FORMAT_BUTTONS.map((button) => {
        const isActive = activeActions.has(button.action);
        return (
          <button
            key={button.action}
            type="button"
            className={`sticky-note-toolbar-button sticky-note-toolbar-button--${button.action}${
              isActive ? " active" : ""
            }`}
            title={button.title}
            aria-label={button.title}
            aria-pressed={isActive}
            onPointerDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              applyFormat(button.action);
            }}
          >
            {button.icon ?? button.label}
          </button>
        );
      })}

      <div className="sticky-note-toolbar-sep" />

      <IconButton
        type="button"
        variant="ghost"
        size="icon-sm"
        className="sticky-note-toolbar-button sticky-note-toolbar-button--delete [&_svg]:size-[14px]"
        title="Delete note"
        aria-label="Delete note"
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
