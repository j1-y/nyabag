"use client";

import { HugeIcon } from "@/components/ui/huge-icon";
import { IconDelete, IconPencil } from "@/components/ui/icons";
import { useMemo, useRef, useState } from "react";
;
import { useNotes } from "@/hooks/useNotes";
import { maybeSnap } from "@/lib/canvas-grid";
import { IconButton } from "@/components/ui/icon-button";
import type { CanvasSection as CanvasSectionType, CanvasViewport } from "@/lib/types";

interface Props {
  section: CanvasSectionType;
  viewport: CanvasViewport;
}

const MIN_W = 180;
const MIN_H = 120;
const MAX_W = 4000;
const MAX_H = 4000;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function CanvasSection({ section, viewport }: Props) {
  const {
    notes,
    setNotePositions,
    setSectionPosition,
    setSectionSize,
    commitSectionPosition,
    commitSectionSize,
    renameSection,
    deleteSection,
    toolMode,
  } = useNotes();
  const [isEditing, setIsEditing] = useState(false);
  const [label, setLabel] = useState(section.label);
  const memberNotes = useMemo(
    () => notes.filter((note) => note.section_id === section.id),
    [notes, section.id]
  );
  const dragRef = useRef<{
    startPX: number;
    startPY: number;
    startX: number;
    startY: number;
    noteStarts: Array<{ id: string; x: number; y: number }>;
    latestX: number;
    latestY: number;
  } | null>(null);
  const resizeRef = useRef<{
    startPX: number;
    startPY: number;
    startW: number;
    startH: number;
    latestW: number;
    latestH: number;
  } | null>(null);
  const dragFrameRef = useRef<number | null>(null);
  const pendingSectionMoveRef = useRef<{
    x: number;
    y: number;
    notes: Array<{ id: string; x: number; y: number }>;
  } | null>(null);

  function scheduleSectionMove(
    x: number,
    y: number,
    notePositions: Array<{ id: string; x: number; y: number }>
  ) {
    pendingSectionMoveRef.current = { x, y, notes: notePositions };
    if (dragFrameRef.current !== null) return;
    dragFrameRef.current = requestAnimationFrame(() => {
      dragFrameRef.current = null;
      const pending = pendingSectionMoveRef.current;
      if (!pending) return;
      setSectionPosition(section.id, pending.x, pending.y);
      setNotePositions(pending.notes);
    });
  }

  function startDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (toolMode === "pan") return;
    if (isEditing) return;
    e.stopPropagation();
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      startPX: e.clientX,
      startPY: e.clientY,
      startX: section.x,
      startY: section.y,
      noteStarts: memberNotes.map((note) => ({ id: note.id, x: note.x, y: note.y })),
      latestX: section.x,
      latestY: section.y,
    };
  }

  function moveDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    const dx = (e.clientX - dragRef.current.startPX) / viewport.scale;
    const dy = (e.clientY - dragRef.current.startPY) / viewport.scale;
    const nextX = maybeSnap(dragRef.current.startX + dx, !e.altKey);
    const nextY = maybeSnap(dragRef.current.startY + dy, !e.altKey);
    const snappedDx = nextX - dragRef.current.startX;
    const snappedDy = nextY - dragRef.current.startY;
    dragRef.current.latestX = nextX;
    dragRef.current.latestY = nextY;
    scheduleSectionMove(
      nextX,
      nextY,
      dragRef.current.noteStarts.map((note) => ({
        id: note.id,
        x: note.x + snappedDx,
        y: note.y + snappedDy,
      }))
    );
  }

  function endDrag() {
    if (!dragRef.current) return;
    if (dragFrameRef.current !== null) {
      cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
      const pending = pendingSectionMoveRef.current;
      if (pending) {
        setSectionPosition(section.id, pending.x, pending.y);
        setNotePositions(pending.notes);
      }
    }
    commitSectionPosition(section.id, dragRef.current.latestX, dragRef.current.latestY);
    dragRef.current = null;
  }

  function startResize(e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    resizeRef.current = {
      startPX: e.clientX,
      startPY: e.clientY,
      startW: section.width,
      startH: section.height,
      latestW: section.width,
      latestH: section.height,
    };
  }

  function moveResize(e: React.PointerEvent<HTMLDivElement>) {
    if (!resizeRef.current) return;
    const dx = (e.clientX - resizeRef.current.startPX) / viewport.scale;
    const dy = (e.clientY - resizeRef.current.startPY) / viewport.scale;
    const width = clamp(
      maybeSnap(clamp(resizeRef.current.startW + dx, MIN_W, MAX_W), !e.altKey),
      MIN_W,
      MAX_W
    );
    const height = clamp(
      maybeSnap(clamp(resizeRef.current.startH + dy, MIN_H, MAX_H), !e.altKey),
      MIN_H,
      MAX_H
    );
    resizeRef.current.latestW = width;
    resizeRef.current.latestH = height;
    setSectionSize(section.id, width, height);
  }

  function endResize() {
    if (!resizeRef.current) return;
    commitSectionSize(section.id, resizeRef.current.latestW, resizeRef.current.latestH);
    resizeRef.current = null;
  }

  async function saveLabel() {
    const next = label.trim() || "Section";
    setLabel(next);
    setIsEditing(false);
    await renameSection(section.id, next);
  }

  return (
    <div
      className="canvas-section"
      style={{
        transform: `translate(${section.x}px, ${section.y}px)`,
        width: section.width,
        height: section.height,
        zIndex: section.z_index,
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        className="canvas-section-header"
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
      >
        {isEditing ? (
          <input
            value={label}
            autoFocus
            onChange={(e) => setLabel(e.target.value)}
            onBlur={saveLabel}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveLabel();
              if (e.key === "Escape") {
                setLabel(section.label);
                setIsEditing(false);
              }
            }}
          />
        ) : (
          <span>{section.label}</span>
        )}
        <div className="canvas-section-actions" onPointerDown={(e) => e.stopPropagation()}>
          <IconButton variant="ghost" size="icon-sm" title="Rename section" onClick={() => setIsEditing(true)}>
            <HugeIcon icon={IconPencil} size={18} />
          </IconButton>
          <IconButton variant="ghost" size="icon-sm" title="Delete section" onClick={() => deleteSection(section.id)}>
            <HugeIcon icon={IconDelete} size={18} />
          </IconButton>
        </div>
      </div>
      <div
        className="canvas-section-resize"
        onPointerDown={startResize}
        onPointerMove={moveResize}
        onPointerUp={endResize}
      />
    </div>
  );
}
