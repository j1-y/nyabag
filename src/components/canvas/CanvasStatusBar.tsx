"use client";

import { HugeIcon } from "@/components/ui/huge-icon";
import { IconAdd, IconMaximize, IconMinus } from "@/components/ui/icons";
import { IconButton } from "@/components/ui/icon-button";
import { useCanvasStore, canvasStoreSelectors } from "@/features/canvas/store/useCanvasStore";

export function CanvasStatusBar() {
  const viewport = useCanvasStore(canvasStoreSelectors.viewport);
  const setViewport = useCanvasStore((state) => state.setViewport);
  const pct = Math.round(viewport.scale * 100);

  const adjustZoom = (delta: number) => {
    const newScale = Math.min(4.0, Math.max(0.1, viewport.scale + delta));
    setViewport({ ...viewport, scale: newScale });
  };

  const resetZoom = () => {
    setViewport({ x: 0, y: 0, scale: 1 });
  };

  return (
    <div className="canvas-zoom-controls">
      <IconButton type="button" variant="ghost" size="icon-sm" title="Zoom out" aria-label="Zoom out" onClick={() => adjustZoom(-0.1)}>
        <HugeIcon icon={IconMinus} size={18} />
      </IconButton>
      <IconButton type="button" variant="ghost" size="icon-sm" title="Reset zoom" aria-label={`Reset zoom, current ${pct}%`} onClick={resetZoom}>
        <span className="text-xs min-w-[32px] font-medium">{pct}%</span>
      </IconButton>
      <IconButton type="button" variant="ghost" size="icon-sm" title="Zoom in" aria-label="Zoom in" onClick={() => adjustZoom(0.1)}>
        <HugeIcon icon={IconAdd} size={18} />
      </IconButton>
    </div>
  );
}
