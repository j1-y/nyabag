"use client";

import { HugeIcon } from "@/components/ui/huge-icon";
import { IconPalette } from "@/components/ui/icons";
import { useState, useRef, useEffect } from "react";
;
import { NOTE_COLORS } from "@/hooks/useNotes";
import { IconButton } from "@/components/ui/icon-button";

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <IconButton
        type="button"
        variant="ghost"
        size="icon-sm"
        className="note-toolbar-btn"
        title="Change color"
        onPointerDown={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
      >
        <HugeIcon icon={IconPalette} size={18} />
      </IconButton>
      {open && (
        <div className="color-picker-popover" onPointerDown={(e) => e.stopPropagation()}>
          {NOTE_COLORS.map((c) => (
            <button
              key={c}
              className={`color-swatch${value === c ? " color-swatch--active" : ""}`}
              style={{ background: c }}
              onPointerDown={(e) => { e.stopPropagation(); onChange(c); setOpen(false); }}
              title={c}
            />
          ))}
        </div>
      )}
    </div>
  );
}
