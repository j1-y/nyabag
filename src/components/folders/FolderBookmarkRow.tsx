"use client";

import { HugeIcon } from "@/components/ui/huge-icon";
import { IconArrowDown, IconArrowUpRight, IconDelete, IconPencil } from "@/components/ui/icons";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { MoveToFolderMenu } from "@/components/folders/MoveToFolderMenu";
import type { Bookmark } from "@/lib/types";

type Props = {
  bookmark: Bookmark;
  onEdit: (bookmark: Bookmark) => void;
  onDelete: (bookmark: Bookmark) => void;
  isInbox?: boolean;
};

export function FolderBookmarkRow({ bookmark, onEdit, onDelete, isInbox }: Props) {
  const router = useRouter();
  const [isExiting, setIsExiting] = useState(false);
  const moveRef = useRef<HTMLDivElement>(null);

  const formattedDate = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(bookmark.created_at));

  return (
    <div
      className={`folder-table-row ${isExiting ? "exiting" : ""}`}
      role="button"
      tabIndex={0}
      onClick={() => router.push(`/bookmarks/${bookmark.id}`)}
      onKeyDown={(e) => {
        if (e.key === "Enter") router.push(`/bookmarks/${bookmark.id}`);
      }}
      aria-label={`Open ${bookmark.title}`}
    >
      <div className="folder-table-td" style={{ flex: 1, paddingLeft: 12 }}>
        <span className="folder-table-row-title">{bookmark.title}</span>
      </div>

      <div className="folder-table-td folder-bm-date" style={{ width: 200, color: "#888", fontSize: 14 }}>
        {formattedDate}
      </div>

      <div className="folder-table-td" style={{ width: 180, overflow: "visible", display: "flex", alignItems: "center", justifyContent: "space-between", paddingRight: 12 }}>
        <div ref={moveRef} className="cell-move-wrap" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <MoveToFolderMenu
            bookmarkId={bookmark.id}
            currentFolderId={bookmark.folder_id}
            onMoved={() => {
              if (isInbox) {
                setIsExiting(true);
                setTimeout(() => router.refresh(), 300);
              } else {
                router.refresh();
              }
            }}
          >
            <Button variant="outline" size="sm" className="gap-2 text-xs h-8 px-2.5">
              Move To <HugeIcon icon={IconArrowDown} size={18} />
            </Button>
          </MoveToFolderMenu>
        </div>

        {/* Hover actions — stop propagation so row click doesn't fire */}
        <div
          className="folder-bm-actions"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="folder-bm-action-btn"
            title="Open link"
            aria-label={`Open ${bookmark.title}`}
            onClick={() =>
              window.open(bookmark.url, "_blank", "noopener,noreferrer")
            }
          >
            <HugeIcon icon={IconArrowUpRight} size={18} />
          </button>
          <button
            type="button"
            className="folder-bm-action-btn"
            title="Edit"
            aria-label="Edit bookmark"
            onClick={() => onEdit(bookmark)}
          >
            <HugeIcon icon={IconPencil} size={18} />
          </button>

          <button
            type="button"
            className="folder-bm-action-btn folder-bm-action-btn-danger"
            title="Delete"
            aria-label="Delete bookmark"
            onClick={() => onDelete(bookmark)}
          >
            <HugeIcon icon={IconDelete} size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
