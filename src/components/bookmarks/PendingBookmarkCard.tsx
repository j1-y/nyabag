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
    <article className="bm-card moodboard-card ppc-card" aria-busy="true" aria-label="Saving bookmark">
      <div className="moodboard-shot ppc-shot">
        {/* Onboarding-style scan sweep (subtle, no blue) */}
        <div className="ppc-scan-sweep" aria-hidden="true" />

        {/* Browser chrome bar */}
        <div className="ppc-browser-bar">
          <span className="ppc-dot" aria-hidden="true" />
          <span className="ppc-dot" aria-hidden="true" />
          <span className="ppc-dot" aria-hidden="true" />
          <div className="ppc-address">
            {faviconUrl && !faviconError ? (
              <img
                src={faviconUrl}
                alt=""
                width={10}
                height={10}
                style={{ borderRadius: 2, objectFit: "contain", flexShrink: 0 }}
                onError={() => setFaviconError(true)}
              />
            ) : (
              <span className="ppc-address-dot" />
            )}
            <span className="ppc-address-text">{domain || "Saving…"}</span>
          </div>
        </div>

        {/* Toolbar row */}
        <div className="ppc-toolbar">
          <span className="ppc-pill ppc-pill--wide" />
          <span className="ppc-pill" />
          <span className="ppc-pill" />
          <span className="ppc-pill" />
        </div>

        {/* Hero block */}
        <div className="ppc-hero" />

        {/* Text lines */}
        <div className="ppc-text-stack">
          <span className="ppc-line ppc-line--title" />
          <span className="ppc-line ppc-line--short" />
          <span className="ppc-rule" />
          <span className="ppc-rule ppc-rule--short" />
        </div>

        {/* Card grid */}
        <div className="ppc-card-grid">
          <span /><span /><span /><span />
        </div>

        {/* Status pill */}
        <div className="ppc-status-pill">
          <HugeIcon icon={IconLoader} size={12} className="ppc-spinner" />
          <span
            className={`ppc-phase-label${fadingOut ? " is-fading" : ""}`}
            key={phaseIndex}
          >
            {PHASES[phaseIndex]}
          </span>
        </div>
      </div>
    </article>
  );
}
