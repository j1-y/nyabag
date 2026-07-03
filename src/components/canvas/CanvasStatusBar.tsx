"use client";

import { HugeIcon } from "@/components/ui/huge-icon";
import { IconAdd, IconMaximize, IconMinus } from "@/components/ui/icons";
;
import { useNotes } from "@/hooks/useNotes";
import { IconButton } from "@/components/ui/icon-button";

export function CanvasStatusBar() {
  const { viewport, setViewport } = useNotes();
  const pct = Math.round(viewport.scale * 100);

  function zoom(delta: number) {
    const newScale = Math.min(4.0, Math.max(0.1, viewport.scale + delta));
    setViewport({ ...viewport, scale: newScale });
  }

  function resetView() {
    setViewport({ x: 0, y: 0, scale: 1 });
  }

  return (
    <div className="canvas-zoom-controls">
      <IconButton type="button" variant="ghost" size="icon-sm" title="Zoom out" aria-label="Zoom out" onClick={() => zoom(-0.1)}>
        <HugeIcon icon={IconMinus} size={18} />
      </IconButton>
      <IconButton type="button" variant="ghost" size="icon-sm" title="Reset zoom" aria-label={`Reset zoom, current ${pct}%`} onClick={resetView}>
        <HugeIcon icon={IconMaximize} size={18} />
      </IconButton>
      <IconButton type="button" variant="ghost" size="icon-sm" title="Zoom in" aria-label="Zoom in" onClick={() => zoom(0.1)}>
        <HugeIcon icon={IconAdd} size={18} />
      </IconButton>
    </div>
  );
}
