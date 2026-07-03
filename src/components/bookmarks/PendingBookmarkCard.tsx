"use client";

import { HugeIcon } from "@/components/ui/huge-icon";
import { IconLoader } from "@/components/ui/icons";
;
import { getDomain } from "@/lib/data";
import type { PendingBookmark } from "@/hooks/useBookmarks";

export function PendingBookmarkCard({ bookmark }: { bookmark: PendingBookmark }) {
  const domain = getDomain(bookmark.url);

  return (
    <article className="bm-card moodboard-card pending-bookmark-card" aria-busy="true">
      <div className="moodboard-shot pending-shot">
        <div className="pending-browser-bar">
          <span />
          <span />
          <span />
          <strong>{domain || "Capturing website"}</strong>
        </div>
        <div className="pending-skeleton">
          <div className="pending-line pending-line-sm" />
          <div className="pending-hero" />
          <div className="pending-line" />
          <div className="pending-line pending-line-mid" />
          <div className="pending-grid">
            <span />
            <span />
            <span />
            <span />
          </div>
        </div>
        <div className="pending-status">
          <HugeIcon icon={IconLoader} size={18} className="animate-spin" />
          <span>Capturing moodboard preview...</span>
        </div>
      </div>
    </article>
  );
}
