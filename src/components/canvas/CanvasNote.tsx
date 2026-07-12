"use client";

import { useRef, useState } from "react";
import { useNotes } from "@/hooks/useNotes";
import { ResizeHandles } from "./ResizeHandles";
import { NoteContent } from "./NoteContent";
import { NoteToolbar } from "./NoteToolbar";
import { StickyNoteToolbar } from "./StickyNoteToolbar";
import { SocialNoteToolbar } from "./SocialNoteToolbar";
import { TextFrameToolbar } from "./TextFrameToolbar";
import { maybeSnap } from "@/lib/canvas-grid";
import { NOTE_COLORS_REQUIRING_LIGHT_TEXT } from "@/lib/content-colors";
import { isSocialNoteContent } from "@/lib/social-embeds";
import type { StickyNoteTextHandle } from "./NoteTextContent";
import type { CanvasNote as CanvasNoteType } from "@/lib/types";
import { useCanvasStore } from "@/features/canvas/store/useCanvasStore";

interface Props {
  note: CanvasNoteType;
}

const TYPE_LABELS: Record<string, string> = {
  text: "",
  text_frame: "",
  link: "Link",
  image: "Image",
  video: "Video",
  social: "Social",
};

const LIGHT_TEXT_COLORS = new Set<string>(NOTE_COLORS_REQUIRING_LIGHT_TEXT);

function getNoteInk(color: string) {
  return LIGHT_TEXT_COLORS.has(color.toUpperCase()) ? "var(--text-inverse)" : "var(--text)";
}

export function CanvasNote({ note }: Props) {
  const {
    notes,
    selectedId,
    selectedIds,
    setSelectedId,
    setSelectedIds,
    setNotePositions,
    commitPosition,
    bringToFront,
    toolMode,
  } = useNotes();
  const isSelected = selectedIds.includes(note.id);
  const isPrimarySelected = selectedId === note.id;
  const [isHovered, setIsHovered] = useState(false);
  const dragRef = useRef<{
    startPX: number;
    startPY: number;
    starts: Array<{ id: string; x: number; y: number }>;
    latest: Array<{ id: string; x: number; y: number }>;
  } | null>(null);
  const dragFrameRef = useRef<number | null>(null);
  const pendingPositionsRef = useRef<Array<{ id: string; x: number; y: number }>>([]);
  const noteRef = useRef<HTMLDivElement>(null);
  const textFormatRef = useRef<StickyNoteTextHandle | null>(null);

  function schedulePositions(positions: Array<{ id: string; x: number; y: number }>) {
    pendingPositionsRef.current = positions;
    if (dragFrameRef.current !== null) return;
    dragFrameRef.current = requestAnimationFrame(() => {
      dragFrameRef.current = null;
      setNotePositions(pendingPositionsRef.current);
    });
  }

  function handleHeaderPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (toolMode === "pan" && !isSelected) return;
    e.stopPropagation();
    if (!isSelected) setSelectedId(note.id);
    bringToFront(note.id);
    ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    const dragIds = isSelected ? selectedIds : [note.id];
    dragRef.current = {
      startPX: e.clientX,
      startPY: e.clientY,
      starts: notes
        .filter((candidate) => dragIds.includes(candidate.id))
        .map((candidate) => ({ id: candidate.id, x: candidate.x, y: candidate.y })),
      latest: [],
    };
    dragRef.current.latest = dragRef.current.starts;
  }

  function handleHeaderPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    const scale = useCanvasStore.getState().viewport.scale;
    const dx = (e.clientX - dragRef.current.startPX) / scale;
    const dy = (e.clientY - dragRef.current.startPY) / scale;
    const shouldSnap = !e.altKey;
    const anchor = dragRef.current.starts[0];
    const nextAnchorX = maybeSnap(anchor.x + dx, shouldSnap);
    const nextAnchorY = maybeSnap(anchor.y + dy, shouldSnap);
    const snappedDx = nextAnchorX - anchor.x;
    const snappedDy = nextAnchorY - anchor.y;
    const latest = dragRef.current.starts.map((start) => ({
      id: start.id,
      x: start.x + snappedDx,
      y: start.y + snappedDy,
    }));
    dragRef.current.latest = latest;
    schedulePositions(latest);
  }

  function handleHeaderPointerUp() {
    if (!dragRef.current) return;
    if (dragFrameRef.current !== null) {
      cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
      setNotePositions(dragRef.current.latest);
    }
    dragRef.current.latest.forEach((position) => commitPosition(position.id, position.x, position.y));
    dragRef.current = null;
  }

  function handleNotePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (toolMode === "pan" && !isSelected) return;
    e.stopPropagation();
    if (e.shiftKey) {
      setSelectedIds(
        isSelected ? selectedIds.filter((id) => id !== note.id) : [...selectedIds, note.id]
      );
      return;
    }

    if (!isSelected || selectedIds.length > 1) {
      setSelectedId(note.id);
    }
    bringToFront(note.id);
  }

  const isSocialNote = note.type === "social" || isSocialNoteContent(note.content);
  const noteLabel = isSocialNote ? "Social" : TYPE_LABELS[note.type];
  const isStickyNote = note.type === "text" && !isSocialNoteContent(note.content);
  const isTextFrame = note.type === "text_frame";
  const isImageNote = note.type === "image";
  const hasImageMedia = isImageNote && Boolean(note.media_path || note.media_url || note.media_source === "url" || note.content.startsWith("http"));
  const isFramelessImage = isImageNote && hasImageMedia;
  const isTextEditable = isStickyNote || isTextFrame;
  const showStickyToolbar = isPrimarySelected && isStickyNote && selectedIds.length === 1;
  const showTextFrameToolbar = isPrimarySelected && isTextFrame && selectedIds.length === 1;
  const showSocialToolbar = isPrimarySelected && isSocialNote && selectedIds.length === 1;
  const toolbarPlacement = useCanvasStore.getState().viewport.y + note.y * useCanvasStore.getState().viewport.scale > 64 ? "above" : "below";

  function handleBodyPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    if (!isTextEditable) return;
    if (toolMode === "pan" && !isSelected) return;
    if (e.shiftKey) {
      setSelectedIds(
        isSelected ? selectedIds.filter((id) => id !== note.id) : [...selectedIds, note.id]
      );
      return;
    }
    if (!isSelected || selectedIds.length > 1) {
      setSelectedId(note.id);
    }
    bringToFront(note.id);
    requestAnimationFrame(() => textFormatRef.current?.focus());
  }

  return (
    <div
      ref={noteRef}
      data-note-id={note.id}
      className={`canvas-note${isStickyNote ? " canvas-note--text" : ""}${
        isTextFrame ? " canvas-note--text-frame" : ""
      }${isFramelessImage ? " canvas-note--image" : ""
      }${isSocialNote ? " canvas-note--social" : ""
      }${isSelected ? " canvas-note--selected" : ""}`}
      style={{
        transform: `translate(${note.x}px, ${note.y}px)`,
        width: note.width,
        height: note.height,
        background: isTextFrame || isFramelessImage || isSocialNote ? "transparent" : note.color,
        color: isTextFrame ? "var(--text)" : getNoteInk(note.color),
        "--sticky-note-ink": isTextFrame ? "var(--text)" : getNoteInk(note.color),
        zIndex: isSelected ? 9999 : note.z_index,
      } as React.CSSProperties}
      onPointerDown={handleNotePointerDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Drag handle header */}
      <div
        className={`note-header${isTextEditable ? " note-header--text" : ""}${isFramelessImage ? " image-note-drag-bar" : ""}${isSocialNote ? " social-note-drag-bar" : ""}`}
        onPointerDown={handleHeaderPointerDown}
        onPointerMove={handleHeaderPointerMove}
        onPointerUp={handleHeaderPointerUp}
      >
        {isTextEditable || isFramelessImage || isSocialNote ? (
          <span className="note-drag-bar" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
          </span>
        ) : (
          <span className="note-type-badge">{noteLabel}</span>
        )}
        {!isTextEditable && !isFramelessImage && !isSocialNote && <NoteToolbar note={note} isVisible={isHovered || isSelected} />}
      </div>

      {/* Content area */}
      <div
        className="note-body"
        onPointerDown={handleBodyPointerDown}
      >
        <NoteContent note={note} isSelected={isSelected} textFormatRef={textFormatRef} />
      </div>

      {/* Resize handles — only when selected */}
      {showStickyToolbar && (
        <StickyNoteToolbar
          note={note}
          formatRef={textFormatRef}
          placement={toolbarPlacement}
        />
      )}

      {showTextFrameToolbar && (
        <TextFrameToolbar
          note={note}
          formatRef={textFormatRef}
          placement={toolbarPlacement}
        />
      )}

      {showSocialToolbar && (
        <SocialNoteToolbar
          note={note}
          placement={toolbarPlacement}
        />
      )}

      {isPrimarySelected && <ResizeHandles note={note} />}
    </div>
  );
}
