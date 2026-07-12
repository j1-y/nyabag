"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useNotes } from "@/hooks/useNotes";
import { CanvasNote } from "./CanvasNote";
import { CanvasSection } from "./CanvasSection";
import { maybeSnap, SNAP_SIZE } from "@/lib/canvas-grid";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { NoteType, CanvasViewport } from "@/lib/types";
import { useCanvasStore } from "@/features/canvas/store/useCanvasStore";

const MIN_SCALE = 0.1;
const MAX_SCALE = 4.0;
const WHEEL_LINE_HEIGHT = 16;

const NOTE_DEFAULT_SIZE: Record<NoteType, { width: number; height: number }> = {
  text: { width: 280, height: 280 },
  text_frame: { width: 240, height: 80 },
  link: { width: 280, height: 280 },
  image: { width: 280, height: 280 },
  video: { width: 280, height: 280 },
  social: { width: 280, height: 280 },
};

const IMAGE_MAX_WIDTH = 420;
const IMAGE_MAX_HEIGHT = 320;
const IMAGE_MIN_WIDTH = 120;
const IMAGE_MIN_HEIGHT = 90;

function fitImageNoteSize(width: number | undefined, height: number | undefined) {
  if (!width || !height || width <= 0 || height <= 0) return NOTE_DEFAULT_SIZE.image;

  const ratio = Math.min(IMAGE_MAX_WIDTH / width, IMAGE_MAX_HEIGHT / height, 1);
  let nextWidth = Math.round(width * ratio);
  let nextHeight = Math.round(height * ratio);

  if (nextWidth < IMAGE_MIN_WIDTH) {
    const scale = IMAGE_MIN_WIDTH / nextWidth;
    nextWidth = IMAGE_MIN_WIDTH;
    nextHeight = Math.round(nextHeight * scale);
  }

  if (nextHeight < IMAGE_MIN_HEIGHT) {
    const scale = IMAGE_MIN_HEIGHT / nextHeight;
    nextHeight = IMAGE_MIN_HEIGHT;
    nextWidth = Math.round(nextWidth * scale);
  }

  return {
    width: Math.min(IMAGE_MAX_WIDTH, nextWidth),
    height: Math.min(IMAGE_MAX_HEIGHT, nextHeight),
  };
}

export function CanvasContainer() {
  const {
    notes,
    sections,
    toolMode,
    setToolMode,
    activeNoteTool,
    setActiveNoteTool,
    pendingMediaNote,
    setPendingMediaNote,
    isCreatingMediaNote,
    mediaPlacementError,
    setSelectedId,
    setSelectedIds,
    selectedIds,
    addNote,
    addMediaNote,
    deleteNotes,
    wrapSelectionInSection,
  } = useNotes();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasWorldRef = useRef<HTMLDivElement>(null);
  const isPanningRef = useRef(false);
  const isSelectingRef = useRef(false);
  const isSpaceDownRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, viewport: { x: 0, y: 0, scale: 1 } });
  const selectStartRef = useRef({ x: 0, y: 0 });
  const [selectionRect, setSelectionRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const [placementPreview, setPlacementPreview] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
    type: NoteType;
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [isSectionDialogOpen, setIsSectionDialogOpen] = useState(false);
  const [sectionLabel, setSectionLabel] = useState("Section");
  const [isPanning, setIsPanning] = useState(false);

  useEffect(() => {
    const applyViewport = (viewport: CanvasViewport) => {
      const { x, y, scale } = viewport;
      const gridSize = SNAP_SIZE * scale;
      const bgX = ((x % gridSize) + gridSize) % gridSize;
      const bgY = ((y % gridSize) + gridSize) % gridSize;

      if (wrapperRef.current) {
        wrapperRef.current.style.setProperty("--canvas-x", `${x}px`);
        wrapperRef.current.style.setProperty("--canvas-y", `${y}px`);
        wrapperRef.current.style.setProperty("--canvas-scale", `${scale}`);
        wrapperRef.current.style.setProperty("--canvas-grid-size", `${gridSize}px`);
        wrapperRef.current.style.setProperty("--canvas-bg-x", `${bgX}px`);
        wrapperRef.current.style.setProperty("--canvas-bg-y", `${bgY}px`);
      }

      if (canvasWorldRef.current) {
        canvasWorldRef.current.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
      }
    };
    
    applyViewport(useCanvasStore.getState().viewport);

    return useCanvasStore.subscribe((state, prevState) => {
      if (state.viewport !== prevState.viewport) {
        applyViewport(state.viewport);
      }
    });
  }, []);

  const handleCanvasWheel = useCallback(
    (e: WheelEvent, allowPan: boolean) => {
      const el = wrapperRef.current;
      if (!el) return;

      const prev = useCanvasStore.getState().viewport;
      
      const isTouchpadPan = e.deltaMode === WheelEvent.DOM_DELTA_PIXEL && Math.abs(e.deltaX) > 0;
      
      const deltaFactor =
        e.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? WHEEL_LINE_HEIGHT
          : e.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? el.clientHeight
            : 1;

      // Trackpad pinch-to-zoom sends ctrlKey=true natively
      if (!e.ctrlKey) {
        if (!allowPan) return;
        if (e.cancelable) e.preventDefault();
        
        // Use standard panning
        useCanvasStore.getState().setViewport({
          ...prev,
          x: prev.x - e.deltaX * deltaFactor,
          y: prev.y - e.deltaY * deltaFactor,
        });
        return;
      }

      if (e.cancelable) e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      // Fine-tune pinch to zoom intensity based on if it's a trackpad or mouse wheel
      const zoomIntensity = e.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? 0.01 : 0.002;
      const zoomFactor = Math.exp(-e.deltaY * deltaFactor * zoomIntensity);
      
      const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev.scale * zoomFactor));
      const ratio = newScale / prev.scale;
      useCanvasStore.getState().setViewport({
        x: mouseX - (mouseX - prev.x) * ratio,
        y: mouseY - (mouseY - prev.y) * ratio,
        scale: newScale,
      });
    },
    []
  );

  const startPan = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      setContextMenu(null);
      isPanningRef.current = true;
      setIsPanning(true);
      const viewport = useCanvasStore.getState().viewport;
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        viewport,
      };
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    },
    []
  );

  const canPlaceActiveTool = Boolean(
    activeNoteTool &&
      activeNoteTool !== "social" &&
      (activeNoteTool !== "image" && activeNoteTool !== "video" || pendingMediaNote) &&
      !isCreatingMediaNote
  );

  const getPlacement = useCallback(
    (clientX: number, clientY: number, shouldSnap: boolean) => {
      if (!activeNoteTool || activeNoteTool === "social") return null;
      const rect = wrapperRef.current?.getBoundingClientRect();
      if (!rect) return null;
      const size =
        activeNoteTool === "image" && pendingMediaNote?.source === "upload"
          ? fitImageNoteSize(pendingMediaNote.width, pendingMediaNote.height)
          : NOTE_DEFAULT_SIZE[activeNoteTool];
      
      const viewport = useCanvasStore.getState().viewport;
      const canvasX = maybeSnap((clientX - rect.left - viewport.x) / viewport.scale, shouldSnap);
      const canvasY = maybeSnap((clientY - rect.top - viewport.y) / viewport.scale, shouldSnap);

      return {
        canvasX,
        canvasY,
        left: rect.left + viewport.x + canvasX * viewport.scale,
        top: rect.top + viewport.y + canvasY * viewport.scale,
        width: size.width,
        height: size.height,
        screenWidth: size.width * viewport.scale,
        screenHeight: size.height * viewport.scale,
      };
    },
    [activeNoteTool, pendingMediaNote]
  );

  const handlePointerDownCapture = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      const isControl = Boolean(
        target.closest(
          "button,input,textarea,a,video,iframe,.canvas-toolbar,.canvas-zoom-controls,.note-toolbar,.sticky-note-toolbar,.text-frame-toolbar,.social-note-toolbar,.color-picker-popover,.resize-handle,.canvas-section-resize"
        )
      );
      const noteEl = target.closest<HTMLElement>("[data-note-id]");
      const sectionEl = target.closest<HTMLElement>(".canvas-section");
      const isSelectedNote = Boolean(noteEl?.dataset.noteId && selectedIds.includes(noteEl.dataset.noteId));
      if (
        canPlaceActiveTool &&
        e.button === 0 &&
        !isControl &&
        !noteEl &&
        !sectionEl &&
        !isCreatingMediaNote
      ) {
        const noteTool = activeNoteTool;
        if (!noteTool) return;
        const placement = getPlacement(e.clientX, e.clientY, !e.altKey);
        if (!placement) return;
        e.stopPropagation();
        e.preventDefault();
        setContextMenu(null);
        setSelectedId(null);
        const { width, height } =
          noteTool === "image" && pendingMediaNote?.source === "upload"
            ? fitImageNoteSize(pendingMediaNote.width, pendingMediaNote.height)
            : NOTE_DEFAULT_SIZE[noteTool];
        setPlacementPreview(null);

        if ((noteTool === "image" || noteTool === "video") && pendingMediaNote) {
          void addMediaNote(placement.canvasX, placement.canvasY, width, height);
        } else {
          void addNote(noteTool, placement.canvasX, placement.canvasY, width, height);
        }
        return;
      }
      const isPanGesture =
        e.button === 1 || isSpaceDownRef.current || (toolMode === "pan" && e.button === 0);

      if (!isPanGesture || isControl || isSelectedNote) return;
      startPan(e);
    },
    [
      activeNoteTool,
      pendingMediaNote,
      isCreatingMediaNote,
      addMediaNote,
      addNote,
      canPlaceActiveTool,
      getPlacement,
      selectedIds,
      setSelectedId,
      startPan,
      toolMode,
    ]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (isPanningRef.current) return;
      if (e.target !== wrapperRef.current) return;
      setContextMenu(null);
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);

      if (e.button === 1 || isSpaceDownRef.current || toolMode === "pan") {
        startPan(e);
        return;
      }

      if (e.button !== 0) return;
      setSelectedId(null);
      isSelectingRef.current = true;
      selectStartRef.current = { x: e.clientX, y: e.clientY };
      setSelectionRect({ left: e.clientX, top: e.clientY, width: 0, height: 0 });
    },
    [startPan, toolMode, setSelectedId]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (isPanningRef.current) {
        setPlacementPreview(null);
        const prev = panStartRef.current.viewport;
        useCanvasStore.getState().setViewport({
          ...prev,
          x: prev.x + (e.clientX - panStartRef.current.x),
          y: prev.y + (e.clientY - panStartRef.current.y),
        });
        return;
      }

      if (canPlaceActiveTool && !isSelectingRef.current) {
        const target = e.target as HTMLElement;
        const isControl = Boolean(
          target.closest(
            "button,input,textarea,a,video,iframe,.canvas-toolbar,.canvas-zoom-controls,.note-toolbar,.sticky-note-toolbar,.text-frame-toolbar,.social-note-toolbar,.color-picker-popover,.resize-handle,.canvas-section-resize"
          )
        );
        const isBlockedSurface = Boolean(
          target.closest("[data-note-id]") || target.closest(".canvas-section")
        );
        const placement = !isControl && !isBlockedSurface
          ? getPlacement(e.clientX, e.clientY, !e.altKey)
          : null;
        setPlacementPreview(
          placement && activeNoteTool
            ? {
                left: placement.left,
                top: placement.top,
                width: placement.screenWidth,
                height: placement.screenHeight,
                type: activeNoteTool,
              }
            : null
        );
      } else if (placementPreview) {
        setPlacementPreview(null);
      }

      if (isSelectingRef.current) {
        const left = Math.min(selectStartRef.current.x, e.clientX);
        const top = Math.min(selectStartRef.current.y, e.clientY);
        const width = Math.abs(e.clientX - selectStartRef.current.x);
        const height = Math.abs(e.clientY - selectStartRef.current.y);
        setSelectionRect({ left, top, width, height });
      }
    },
    [activeNoteTool, canPlaceActiveTool, getPlacement, placementPreview]
  );

  const handlePointerUp = useCallback((e?: React.PointerEvent<HTMLDivElement>) => {
    void e;
    isPanningRef.current = false;
    setIsPanning(false);
    if (isSelectingRef.current && selectionRect && wrapperRef.current) {
      const rect = wrapperRef.current.getBoundingClientRect();
      const viewport = useCanvasStore.getState().viewport;
      const canvasLeft = (selectionRect.left - rect.left - viewport.x) / viewport.scale;
      const canvasTop = (selectionRect.top - rect.top - viewport.y) / viewport.scale;
      const canvasRight = canvasLeft + selectionRect.width / viewport.scale;
      const canvasBottom = canvasTop + selectionRect.height / viewport.scale;
      const selected = notes
        .filter((note) => {
          const noteRight = note.x + note.width;
          const noteBottom = note.y + note.height;
          return (
            note.x < canvasRight &&
            noteRight > canvasLeft &&
            note.y < canvasBottom &&
            noteBottom > canvasTop
          );
        })
        .map((note) => note.id);
      setSelectedIds(selected);
    }
    isSelectingRef.current = false;
    setSelectionRect(null);
  }, [
    notes,
    selectionRect,
    setSelectedIds,
  ]);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      handleCanvasWheel(e, true);
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleCanvasWheel]);

  useEffect(() => {
    const handleCtrlWheelCapture = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      const el = wrapperRef.current;
      if (!el) return;

      const target = e.target instanceof Node ? e.target : null;
      const rect = el.getBoundingClientRect();
      const isInsideCanvasBounds =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;
      const isInsideCanvas = Boolean(target && el.contains(target)) || isInsideCanvasBounds;
      if (!isInsideCanvas) return;

      e.stopPropagation();
      handleCanvasWheel(e, false);
    };

    document.addEventListener("wheel", handleCtrlWheelCapture, { passive: false, capture: true });
    return () => document.removeEventListener("wheel", handleCtrlWheelCapture, { capture: true });
  }, [handleCanvasWheel]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        isSpaceDownRef.current = true;
        document.body.style.cursor = "grab";
      }
      const target = e.target as HTMLElement;
      const tag = target.tagName;
      const isTyping =
        tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;

      if (!isTyping && e.key.toLowerCase() === "v") {
        e.preventDefault();
        setToolMode("select");
        setActiveNoteTool(null);
      }
      if (!isTyping && e.key.toLowerCase() === "h") {
        e.preventDefault();
        setToolMode("pan");
        setActiveNoteTool(null);
      }
      if (e.key === "Escape") {
        setSelectedId(null);
        setActiveNoteTool(null);
        setPendingMediaNote(null);
        setPlacementPreview(null);
        setContextMenu(null);
        setIsSectionDialogOpen(false);
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (isTyping) return;
        if (selectedIds.length > 0) {
          e.preventDefault();
          deleteNotes(selectedIds);
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        isSpaceDownRef.current = false;
        document.body.style.cursor = "";
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      document.body.style.cursor = "";
    };
  }, [deleteNotes, selectedIds, setActiveNoteTool, setPendingMediaNote, setSelectedId, setToolMode]);

  function handleContextMenu(e: React.MouseEvent<HTMLDivElement>) {
    e.preventDefault();
    const noteEl = (e.target as HTMLElement).closest<HTMLElement>("[data-note-id]");
    const noteId = noteEl?.dataset.noteId;
    if (noteId && !selectedIds.includes(noteId)) {
      setSelectedId(noteId);
    }
    if (noteId || selectedIds.length > 0) {
      setContextMenu({ x: e.clientX, y: e.clientY });
    } else {
      setContextMenu(null);
    }
  }

  async function submitSection(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const result = await wrapSelectionInSection(sectionLabel);
    setIsSectionDialogOpen(false);
    setContextMenu(null);
    if (result.success) setSectionLabel("Section");
  }

  return (
    <div
      ref={wrapperRef}
      className={`canvas-wrapper canvas-wrapper--${toolMode}${isPanning ? " canvas-wrapper--panning" : ""}${activeNoteTool ? " canvas-wrapper--placing" : ""}`}
      onPointerDown={handlePointerDown}
      onPointerDownCapture={handlePointerDownCapture}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={() => setPlacementPreview(null)}
      onContextMenu={handleContextMenu}
    >
      {notes.length === 0 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text3)",
            fontSize: 14,
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          Click a note type below to add your first note
        </div>
      )}
      {isCreatingMediaNote && (
        <div className="canvas-creation-status" role="status">
          Creating media note...
        </div>
      )}
      {!isCreatingMediaNote && mediaPlacementError && (
        <div className="canvas-creation-status canvas-creation-status--error" role="alert">
          {mediaPlacementError}
        </div>
      )}
      <div
        ref={canvasWorldRef}
        className="canvas-world"
      >
        {sections.map((section) => (
          <CanvasSection key={section.id} section={section} />
        ))}
        {notes.map((note) => (
          <CanvasNote key={note.id} note={note} />
        ))}
      </div>
      {selectionRect && (
        <div
          className="canvas-selection-marquee"
          style={{
            left: selectionRect.left,
            top: selectionRect.top,
            width: selectionRect.width,
            height: selectionRect.height,
          }}
        />
      )}
      {placementPreview && (
        <div
          className={`canvas-placement-preview canvas-placement-preview--${placementPreview.type}`}
          style={{
            left: placementPreview.left,
            top: placementPreview.top,
            width: placementPreview.width,
            height: placementPreview.height,
          }}
        />
      )}
      {contextMenu && (
        <div className="canvas-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <button
            type="button"
            onClick={() => {
              setIsSectionDialogOpen(true);
              setContextMenu(null);
            }}
            disabled={selectedIds.length === 0}
          >
            Wrap in new section
          </button>
        </div>
      )}
      <Dialog open={isSectionDialogOpen} onOpenChange={setIsSectionDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Create section</DialogTitle>
            <DialogDescription>
              Group the selected notes into a named canvas section.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitSection}>
            <div className="grid gap-4 px-4 py-4">
              <Field>
                <FieldLabel htmlFor="section-label">Section label</FieldLabel>
                <Input
                  id="section-label"
                  value={sectionLabel}
                  autoFocus
                  onChange={(e) => setSectionLabel(e.target.value)}
                  placeholder="Section"
                />
              </Field>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsSectionDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Create section</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
