"use client";

import { useRef } from "react";
import { useNotes } from "@/hooks/useNotes";
import { maybeSnap } from "@/lib/canvas-grid";
import type { CanvasNote, CanvasViewport } from "@/lib/types";

type Direction = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

const MIN_W = 100;
const MIN_H = 80;
const MAX_W = 1200;
const MAX_H = 900;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

import { useCanvasStore } from "@/features/canvas/store/useCanvasStore";

interface ResizeHandlesProps {
  note: CanvasNote;
}

export function ResizeHandles({ note }: ResizeHandlesProps) {
  const { setNotePosition, setNoteSize, commitPosition, commitSize } = useNotes();
  const dragRef = useRef<{
    dir: Direction;
    startPX: number;
    startPY: number;
    startW: number;
    startH: number;
    startX: number;
    startY: number;
  } | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const pendingResizeRef = useRef<{ width: number; height: number; x: number; y: number; movePosition: boolean } | null>(null);

  function scheduleResize(width: number, height: number, x: number, y: number, movePosition: boolean) {
    pendingResizeRef.current = { width, height, x, y, movePosition };
    if (resizeFrameRef.current !== null) return;
    resizeFrameRef.current = requestAnimationFrame(() => {
      resizeFrameRef.current = null;
      const pending = pendingResizeRef.current;
      if (!pending) return;
      setNoteSize(note.id, pending.width, pending.height);
      if (pending.movePosition) setNotePosition(note.id, pending.x, pending.y);
    });
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>, dir: Direction) {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      dir,
      startPX: e.clientX,
      startPY: e.clientY,
      startW: note.width,
      startH: note.height,
      startX: note.x,
      startY: note.y,
    };
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    const { dir, startPX, startPY, startW, startH, startX, startY } = dragRef.current;
    const scale = useCanvasStore.getState().viewport.scale;
    const dx = (e.clientX - startPX) / scale;
    const dy = (e.clientY - startPY) / scale;
    const shouldSnap = !e.altKey;

    let newW = startW;
    let newH = startH;
    let newX = startX;
    let newY = startY;

    if (dir.includes("e")) newW = clamp(maybeSnap(clamp(startW + dx, MIN_W, MAX_W), shouldSnap), MIN_W, MAX_W);
    if (dir.includes("w")) {
      newW = clamp(maybeSnap(clamp(startW - dx, MIN_W, MAX_W), shouldSnap), MIN_W, MAX_W);
      newX = startX + (startW - newW);
      newX = maybeSnap(newX, shouldSnap);
      newW = clamp(startX + startW - newX, MIN_W, MAX_W);
    }
    if (dir.includes("s")) newH = clamp(maybeSnap(clamp(startH + dy, MIN_H, MAX_H), shouldSnap), MIN_H, MAX_H);
    if (dir.includes("n")) {
      newH = clamp(maybeSnap(clamp(startH - dy, MIN_H, MAX_H), shouldSnap), MIN_H, MAX_H);
      newY = startY + (startH - newH);
      newY = maybeSnap(newY, shouldSnap);
      newH = clamp(startY + startH - newY, MIN_H, MAX_H);
    }

    scheduleResize(newW, newH, newX, newY, dir.includes("w") || dir.includes("n"));
  }

  function handlePointerUp() {
    if (!dragRef.current) return;
    if (resizeFrameRef.current !== null) {
      cancelAnimationFrame(resizeFrameRef.current);
      resizeFrameRef.current = null;
      const pending = pendingResizeRef.current;
      if (pending) {
        setNoteSize(note.id, pending.width, pending.height);
        if (pending.movePosition) setNotePosition(note.id, pending.x, pending.y);
      }
    }
    const pending = pendingResizeRef.current;
    commitSize(note.id, pending?.width ?? note.width, pending?.height ?? note.height);
    if (dragRef.current.dir.includes("w") || dragRef.current.dir.includes("n")) {
      commitPosition(note.id, pending?.x ?? note.x, pending?.y ?? note.y);
    }
    pendingResizeRef.current = null;
    dragRef.current = null;
  }

  const handles: Direction[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

  return (
    <>
      {handles.map((dir) => (
        <div
          key={dir}
          className={`resize-handle handle-${dir}`}
          onPointerDown={(e) => handlePointerDown(e, dir)}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />
      ))}
    </>
  );
}
