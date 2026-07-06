"use client";

import { HugeIcon } from "@/components/ui/huge-icon";
import { IconArrowLeft, IconArrowUpRight, IconDelete, IconLoader, IconMessage, IconPalette, IconRefresh, IconSparkles, IconTag, IconText } from "@/components/ui/icons";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
;
import { deleteBookmark, getProcessingBookmarks, refreshBookmarkScreenshot, retryBookmarkProcessing } from "@/lib/actions";
import { getDomain } from "@/lib/data";
import { getBookmarkDisplayScreenshot } from "@/lib/bookmarks/screenshots";
import type { Bookmark } from "@/lib/types";
import { BookmarksProvider } from "@/hooks/useBookmarks";
import { Button } from "@/components/ui/button";
import { DeleteBookmarkDialog } from "./DeleteBookmarkDialog";
import { BookmarkColorPalette } from "./BookmarkColorPalette";

function BookmarkDetailInner({ bookmark }: { bookmark: Bookmark }) {
  const router = useRouter();
  const [currentBookmark, setCurrentBookmark] = useState(bookmark);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isRefreshing, startRefreshTransition] = useTransition();
  const [isRetrying, startRetryTransition] = useTransition();
  const [refreshError, setRefreshError] = useState("");
  const domain = getDomain(currentBookmark.url);
  const displayScreenshot = getBookmarkDisplayScreenshot(currentBookmark);
  const aiMetadata =
    currentBookmark.ai_metadata?.status === "completed"
      ? currentBookmark.ai_metadata
      : null;

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteBookmark(currentBookmark.id);
      if (result.success) router.push("/");
      else console.error("Failed to delete bookmark:", result.error);
    });
  }

  function handleRefreshScreenshot() {
    setRefreshError("");
    startRefreshTransition(async () => {
      const result = await refreshBookmarkScreenshot(currentBookmark.id);
      if (result.success) {
        setCurrentBookmark(result.data);
        router.refresh();
      } else {
        setRefreshError(result.error);
      }
    });
  }

  function handleRetryProcessing() {
    setRefreshError("");
    startRetryTransition(async () => {
      const result = await retryBookmarkProcessing(currentBookmark.id);
      if (result.success) {
        setCurrentBookmark(result.data);
        router.refresh();
      } else {
        setRefreshError(result.error);
      }
    });
  }

  useEffect(() => {
    const isActive =
      currentBookmark.processing_status === "queued" ||
      currentBookmark.processing_status === "processing";
    if (!isActive) return;

    let cancelled = false;
    const interval = window.setInterval(async () => {
      const result = await getProcessingBookmarks();
      if (cancelled || !result.success) return;
      const next = result.data.find((item) => item.id === currentBookmark.id);
      if (next) {
        setCurrentBookmark(next);
        if (next.processing_status !== "queued" && next.processing_status !== "processing") {
          window.clearInterval(interval);
          router.refresh();
        }
      }
    }, 10_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [currentBookmark.id, currentBookmark.processing_status, router]);

  return (
    <div className="bookmark-detail-page">
      <main className="bookmark-detail-shell">
        <section className="bookmark-detail-info">
          <button className="detail-back" onClick={() => router.push("/")}>
            <HugeIcon icon={IconArrowLeft} size={18} />
            Back to bookmarks
          </button>

          <div className="detail-title-block">
            <p className="detail-domain">{domain}</p>
            <h1>{currentBookmark.title}</h1>
          </div>

          {(currentBookmark.summary || aiMetadata) && (
            <div className="detail-summary-card detail-website-read">
              {currentBookmark.summary && <p>{currentBookmark.summary}</p>}
              {aiMetadata && (
                <div className="detail-ai-overview">
                  <span>AI Design Read</span>
                  {aiMetadata.design_context && <p>{aiMetadata.design_context}</p>}
                  <div className="detail-ai-overview-meta">
                    {aiMetadata.page_type && <strong>{aiMetadata.page_type}</strong>}
                    {aiMetadata.industry && <strong>{aiMetadata.industry}</strong>}
                    {aiMetadata.visual_style.slice(0, 3).map((style) => (
                      <strong key={style}>{style}</strong>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {currentBookmark.note && (
            <div className="detail-note-card">
              <HugeIcon icon={IconMessage} size={18} />
              <p>{currentBookmark.note}</p>
            </div>
          )}

          <a className="detail-visit" href={currentBookmark.url} target="_blank" rel="noopener noreferrer">
            Visit website
            <HugeIcon icon={IconArrowUpRight} size={18} />
          </a>

          <div className="detail-section detail-memory-section">
            <h2><HugeIcon icon={IconSparkles} size={18} /> Design Memory</h2>
            {currentBookmark.ai_description || aiMetadata?.design_context ? (
              <p className="detail-memory-description">
                {currentBookmark.ai_description || aiMetadata?.design_context}
              </p>
            ) : (
              <p className="detail-memory-description">
                Nyabag sends new saves to Cortex so active search can rank bookmarks by design intent.
              </p>
            )}
            <div className="detail-chip-list">
              {(currentBookmark.ai_patterns?.length
                ? currentBookmark.ai_patterns
                : aiMetadata?.ui_patterns ?? []
              ).slice(0, 8).map((pattern) => <span key={`pattern-${pattern}`}>{pattern}</span>)}
              {(currentBookmark.ai_tags?.length
                ? currentBookmark.ai_tags
                : aiMetadata?.suggested_tags ?? []
              ).slice(0, 8).map((tag) => <span key={`ai-tag-${tag}`}>{tag}</span>)}
            </div>
          </div>

          <div className="detail-section">
            <h2><HugeIcon icon={IconPalette} size={18} /> Extracted colors</h2>
            <BookmarkColorPalette colors={currentBookmark.palette} />
          </div>

          <div className="detail-section">
            <h2><HugeIcon icon={IconText} size={18} /> Detected fonts</h2>
            <div className="detail-chip-list">
              {currentBookmark.fonts.map((font) => <span key={font}>{font}</span>)}
            </div>
          </div>

          <div className="detail-section">
            <h2><HugeIcon icon={IconTag} size={18} /> Tags</h2>
            <div className="detail-chip-list">
              {currentBookmark.tags.length
                ? currentBookmark.tags.map((tag) => <span key={tag}>{tag}</span>)
                : <span>No tags</span>}
            </div>
          </div>

          <div className="detail-actions">
            <Button className="detail-action-btn detail-action-btn-danger" variant="destructive" onClick={() => setDeleteOpen(true)} disabled={isPending}>
              <HugeIcon icon={IconDelete} /> Delete
            </Button>
            <Button className="detail-action-btn" variant="outline" onClick={handleRefreshScreenshot} disabled={isRefreshing}>
              {isRefreshing ? <HugeIcon icon={IconLoader} className="animate-spin" /> : <HugeIcon icon={IconRefresh} />}
              {isRefreshing ? "Queueing..." : "Reprocess preview + AI"}
            </Button>
            {currentBookmark.processing_status === "failed" && (
              <Button className="detail-action-btn" variant="outline" onClick={handleRetryProcessing} disabled={isRetrying}>
                {isRetrying ? <HugeIcon icon={IconLoader} className="animate-spin" /> : <HugeIcon icon={IconRefresh} />}
                {isRetrying ? "Retrying..." : "Retry preview"}
              </Button>
            )}
          </div>
          {refreshError && <p className="detail-refresh-error" role="alert">{refreshError}</p>}
        </section>

        <section className="bookmark-detail-preview" aria-label={`${currentBookmark.title} screenshot`}>
          <div className="browser-frame bookmark-browser-frame">
            <div className="browser-topbar">
              <span />
              <span />
              <span />
              <strong>{domain}</strong>
              <a href={currentBookmark.url} target="_blank" rel="noopener noreferrer" aria-label="Open site">
                <HugeIcon icon={IconArrowUpRight} size={18} />
              </a>
            </div>
            <div className="browser-shot">
              {displayScreenshot ? (
                <img src={displayScreenshot} alt={`${currentBookmark.title} screenshot`} />
              ) : currentBookmark.processing_status === "queued" ? (
                <div className="preview-fallback">
                  <span>Queued for preview</span>
                </div>
              ) : currentBookmark.processing_status === "processing" ? (
                <div className="preview-fallback">
                  <span>Preparing preview...</span>
                </div>
              ) : currentBookmark.processing_status === "failed" ? (
                <div className="preview-fallback">
                  <span>Preview failed</span>
                  <button
                    type="button"
                    className="preview-retry-btn"
                    onClick={handleRetryProcessing}
                    disabled={isRetrying}
                  >
                    {isRetrying ? "Retrying..." : "Retry"}
                  </button>
                </div>
              ) : (
                <div className="preview-fallback">
                  <span>No screenshot yet</span>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      <DeleteBookmarkDialog
        title={currentBookmark.title}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={handleDelete}
      />
    </div>
  );
}

export function BookmarkDetailPage({ bookmark }: { bookmark: Bookmark }) {
  return (
    <BookmarksProvider initial={[bookmark]}>
      <BookmarkDetailInner bookmark={bookmark} />
    </BookmarksProvider>
  );
}
