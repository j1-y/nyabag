"use client";

import { HugeIcon } from "@/components/ui/huge-icon";
import { IconArrowUpRight } from "@/components/ui/icons";
import { useState } from "react";
;
import { useNotes } from "@/hooks/useNotes";
import { getDomain, getFaviconUrl } from "@/lib/data";
import type { CanvasNote } from "@/lib/types";

export function NoteLinkContent({ note, isSelected }: { note: CanvasNote; isSelected: boolean }) {
  const { updateContent } = useNotes();
  const [inputVal, setInputVal] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const hasUrl = note.content.startsWith("http");
  const domain = getDomain(note.content);
  const favicon = getFaviconUrl(note.content);

  function commitUrl(raw: string) {
    const url = raw.trim();
    if (!url) return;
    const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    updateContent(note.id, normalized);
    setIsEditing(false);
  }

  if (!hasUrl || isEditing) {
    return (
      <div
        style={{ padding: "8px 16px", height: "100%", display: "flex", flexDirection: "column", gap: 8 }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <input
          autoFocus={isSelected}
          type="url"
          placeholder="Paste a URL and press Enter"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitUrl(inputVal);
            if (e.key === "Escape") { setIsEditing(false); setInputVal(""); }
          }}
          style={{
            width: "100%",
            padding: "8px 8px",
            borderRadius: 10,
            border: "1px solid var(--border2)",
            background: "var(--bg)",
            fontSize: 13,
            outline: "none",
          }}
        />
      </div>
    );
  }

  return (
    <div
      style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "grid",
          placeItems: "center",
          background: "linear-gradient(135deg, var(--bg2), var(--bg3))",
        }}
      >
        {favicon ? (
          <img
            src={favicon}
            alt=""
            style={{ width: 40, height: 40, objectFit: "contain", borderRadius: 10 }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        ) : null}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
            gap: 8,
            padding: "8px 16px",
          borderTop: "1px solid var(--border2)",
          fontSize: 12,
          color: "var(--text2)",
        }}
      >
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {domain}
        </span>
        <a
          href={note.content}
          target="_blank"
          rel="noopener noreferrer"
          title="Open link"
          style={{ color: "var(--text3)", flexShrink: 0 }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <HugeIcon icon={IconArrowUpRight} size={18} />
        </a>
        {isSelected && (
          <button
            onClick={() => { setIsEditing(true); setInputVal(note.content); }}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text3)", fontSize: 11, padding: 0 }}
          >
            Edit
          </button>
        )}
      </div>
    </div>
  );
}
