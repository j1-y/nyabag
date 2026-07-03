"use client";

import { HugeIcon, type IconSvgElement } from "@/components/ui/huge-icon";
import { IconCursorPointer, IconHand, IconImage, IconLink, IconShare, IconSticker, IconText, IconVideo } from "@/components/ui/icons";
import { useState } from "react";
import { useNotes } from "@/hooks/useNotes";
import { IconButton } from "@/components/ui/icon-button";
import type { NoteType } from "@/lib/types";
import { MediaNoteDialog } from "./MediaNoteDialog";
import { SocialNoteDialog } from "./SocialNoteDialog";

const NOTE_TYPES: { type: NoteType; icon: IconSvgElement; label: string; size: number }[] = [
  { type: "text", icon: IconSticker, label: "Sticky note", size: 18 },
  { type: "text_frame", icon: IconText, label: "Text frame", size: 18 },
  { type: "link", icon: IconLink, label: "Link note", size: 18 },
  { type: "image", icon: IconImage, label: "Image note", size: 18 },
  { type: "video", icon: IconVideo, label: "Video note", size: 18 },
  { type: "social", icon: IconShare, label: "Social post", size: 18 },
];

export function CanvasToolbar() {
  const {
    toolMode,
    setToolMode,
    activeNoteTool,
    setActiveNoteTool,
    pendingMediaNote,
    setPendingMediaNote,
    createSocialNote,
  } = useNotes();
  const [mediaDialogType, setMediaDialogType] = useState<"image" | "video" | null>(null);
  const [socialDialogOpen, setSocialDialogOpen] = useState(false);

  return (
    <>
      <div className="canvas-toolbar">
        <div className="canvas-tool-switch" aria-label="Canvas tool mode">
          <IconButton
            type="button"
            variant="ghost"
            size="icon"
            className={`canvas-tool-switch-btn${toolMode === "select" ? " active" : ""}`}
            title="Select notes"
            aria-label="Select notes"
            aria-pressed={toolMode === "select"}
            onClick={() => {
              setToolMode("select");
              setActiveNoteTool(null);
              setPendingMediaNote(null);
            }}
          >
            <HugeIcon icon={IconCursorPointer} size={18} style={{ width: 18, height: 18 }} />
          </IconButton>
          <IconButton
            type="button"
            variant="ghost"
            size="icon"
            className={`canvas-tool-switch-btn${toolMode === "pan" ? " active" : ""}`}
            title="Drag canvas"
            aria-label="Drag canvas"
            aria-pressed={toolMode === "pan"}
            onClick={() => {
              setToolMode("pan");
              setActiveNoteTool(null);
              setPendingMediaNote(null);
            }}
          >
            <HugeIcon icon={IconHand} size={18} style={{ width: 18, height: 18 }} />
          </IconButton>
        </div>

        <div className="canvas-toolbar-sep" />

        {NOTE_TYPES.map(({ type, icon: Icon, label, size }) => {
          const isMediaTool = type === "image" || type === "video";
          const isActive = activeNoteTool === type || pendingMediaNote?.type === type || (type === "social" && socialDialogOpen);

          return (
            <IconButton
              key={type}
              type="button"
              variant="ghost"
              size="icon"
              className={`canvas-toolbar-btn${isActive ? " active" : ""}`}
              title={label}
              aria-label={label}
              aria-pressed={isActive}
              onClick={() => {
                if (isMediaTool) {
                  setMediaDialogType(type);
                  setActiveNoteTool(null);
                  setPendingMediaNote(null);
                  setToolMode("select");
                  return;
                }

                if (type === "social") {
                  setSocialDialogOpen(true);
                  setPendingMediaNote(null);
                  setActiveNoteTool(null);
                  setToolMode("select");
                  return;
                }

                setPendingMediaNote(null);
                setActiveNoteTool(activeNoteTool === type ? null : type);
                setToolMode("select");
              }}
            >
              <HugeIcon icon={Icon} size={size} />
            </IconButton>
          );
        })}
      </div>

      {mediaDialogType && (
        <MediaNoteDialog
          type={mediaDialogType}
          onClose={() => setMediaDialogType(null)}
          onConfirm={(media) => {
            setPendingMediaNote(media);
            setMediaDialogType(null);
          }}
        />
      )}

      {socialDialogOpen && (
        <SocialNoteDialog
          onClose={() => setSocialDialogOpen(false)}
          onConfirm={createSocialNote}
        />
      )}
    </>
  );
}
