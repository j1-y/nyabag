"use client";

import { useEffect, useState } from "react";
import { HugeIcon } from "@/components/ui/huge-icon";
import { IconLoader } from "@/components/ui/icons";
import { getDomain, getFaviconUrl } from "@/lib/data";
import type { PendingBookmark } from "@/hooks/useBookmarks";

const PHASES = [
  "Saving bookmark…",
  "Queuing preview…",
  "Capturing page…",
  "Almost there…",
];

export function PendingBookmarkCard({ bookmark }: { bookmark: PendingBookmark }) {
  const domain = getDomain(bookmark.url);
  const faviconUrl = getFaviconUrl(bookmark.url);
  const [faviconError, setFaviconError] = useState(false);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [fadingOut, setFadingOut] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setFadingOut(true);
      setTimeout(() => {
        setPhaseIndex((i) => (i + 1) % PHASES.length);
        setFadingOut(false);
      }, 220);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <article className="bm-card moodboard-card" aria-busy="true" aria-label="Saving bookmark">
      <div className="moodboard-shot">
        <div className="moodboard-shot-frame">
          <div className="preview-loading-skeleton" aria-hidden="true">
            <div className="preview-loading-browser">
              <span />
              <span />
              <span />
            </div>
            <div className="preview-loading-body">
              <div className="preview-loading-line preview-loading-line-sm" />
              <div className="preview-loading-hero" />
              <div className="preview-loading-line" />
              <div className="preview-loading-line preview-loading-line-mid" />
            </div>
            <div className="skeleton-preview-status">
              <HugeIcon icon={IconLoader} className="animate-spin" />
              <span
                className={`ppc-phase-label${fadingOut ? " is-fading" : ""}`}
                key={phaseIndex}
              >
                {PHASES[phaseIndex]}
              </span>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
