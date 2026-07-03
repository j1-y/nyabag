"use client";

import { ArrowUpRight, Folder, Image, Pencil, Loader2, Sparkles, Trash2 } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { retryBookmarkProcessing } from "@/lib/actions";
import { getDomain, getFaviconUrl } from "@/lib/data";
import type { Bookmark } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { AIMetadataChip } from "./AIMetadataChip";
import { DeleteBookmarkDialog } from "./DeleteBookmarkDialog";
import { MoveToFolderMenu } from "@/components/folders/MoveToFolderMenu";

const EAGER_PREVIEW_COUNT = 3;

function BookmarkCardComponent({
  bookmark,
  index,
  onEdit,
  onDelete,
}: {
  bookmark: Bookmark;
  index: number;
  onEdit: (bookmark: Bookmark) => void;
  onDelete: (id: string) => void;
}) {
  const router = useRouter();
  const [imageState, setImageState] = useState({
    src: bookmark.screenshot_url,
    loaded: false,
    error: false,
  });
  const [imageRetryKey, setImageRetryKey] = useState(0);
  const [faviconError, setFaviconError] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const [retryError, setRetryError] = useState("");
  const [isRetrying, startRetryTransition] = useTransition();
  const cardRef = useRef<HTMLElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const domain = getDomain(bookmark.url);
  const favicon = getFaviconUrl(bookmark.url);
  const screenshot = bookmark.screenshot_url;
  const eagerPreview = index < EAGER_PREVIEW_COUNT;
  const imageLoaded = imageState.src === screenshot && imageState.loaded;
  const imageError = imageState.src === screenshot && imageState.error;
  const isImageLoading = Boolean(screenshot && !imageError && !imageLoaded);
  const isQueued = bookmark.processing_status === "queued";
  const isProcessing = bookmark.processing_status === "processing";
  const isPendingPreview = isQueued || isProcessing;
  const isFailed = bookmark.processing_status === "failed";
  const pendingLabel = isQueued ? "Queued for preview" : "Preparing preview...";
  const aiPageType =
    bookmark.ai_metadata?.status === "completed" && bookmark.ai_metadata.page_type
      ? bookmark.ai_metadata.page_type
      : "";
  const isMemoryMatch = typeof bookmark.search_score === "number" || typeof bookmark.semantic_similarity === "number";
  const isMemoryPreparing =
    bookmark.semantic_status === "pending" || bookmark.semantic_status === "processing";
  const memoryLabel = bookmark.match_label ?? (isMemoryMatch ? "Related" : "Preparing memory");
  const memoryChipClass = bookmark.match_strength ? `is-${bookmark.match_strength}` : isMemoryMatch ? "is-related" : "is-preparing";
  const evidenceLabels = (
    bookmark.search_match_reasons?.length
      ? bookmark.search_match_reasons
      : bookmark.visual_match_evidence?.length
        ? bookmark.visual_match_evidence.map((item) => item.label)
        : bookmark.semantic_match_reasons ?? []
  ).filter(Boolean).slice(0, 3);
  const evidenceTitle = bookmark.visual_match_evidence?.length
    ? `Matched because Nyabag detected ${bookmark.visual_match_evidence.map((item) => item.label.toLowerCase()).join(", ")}.`
    : evidenceLabels.length
      ? `Related memory evidence: ${evidenceLabels.join(", ")}.`
      : undefined;

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    setDeleteOpen(true);
  }

  function handleRetry(e: React.MouseEvent) {
    e.stopPropagation();
    setRetryError("");
    startRetryTransition(async () => {
      const result = await retryBookmarkProcessing(bookmark.id);
      if (result.success) router.refresh();
      else setRetryError(result.error);
    });
  }

  function handleImageRetry(e: React.MouseEvent) {
    e.stopPropagation();
    if (!screenshot) return;
    setImageState({ src: screenshot, loaded: false, error: false });
    setImageRetryKey((key) => key + 1);
  }



  const handleImageRef = useCallback((node: HTMLImageElement | null) => {
    imageRef.current = node;
    if (!node || !screenshot || !node.complete) return;

    window.queueMicrotask(() => {
      setImageState({
        src: screenshot,
        loaded: node.naturalWidth > 0,
        error: node.naturalWidth === 0,
      });
    });
  }, [screenshot]);

  useEffect(() => {
    const node = cardRef.current;
    if (!node) return;

    if (!("IntersectionObserver" in window)) {
      const timeout = setTimeout(() => setVisible(true), 0);
      return () => clearTimeout(timeout);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "160px 0px", threshold: 0.08 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <article
        ref={cardRef}
        className={`bm-card moodboard-card ${visible ? "is-visible" : "is-pending-reveal"}`}
        style={{ animationDelay: `${index * 0.04}s` }}
        onClick={() => router.push(`/bookmarks/${bookmark.id}`)}
        aria-label={bookmark.title}
      >
        <div className="moodboard-shot">
          <div className="moodboard-shot-frame">
            {screenshot ? (
              <>
                {isImageLoading && (
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
                      <Loader2 />
                      <span>Loading preview...</span>
                    </div>
                  </div>
                )}
                <img
                  ref={handleImageRef}
                  className={`moodboard-img ${imageLoaded ? "is-loaded" : "is-loading"}`}
                  key={`${screenshot}-${imageRetryKey}`}
                  src={screenshot}
                  alt={`${bookmark.title} preview`}
                  loading={eagerPreview ? "eager" : "lazy"}
                  fetchPriority={eagerPreview ? "high" : "auto"}
                  decoding="async"
                  onLoad={() => setImageState({ src: screenshot, loaded: true, error: false })}
                  onError={() => setImageState({ src: screenshot, loaded: false, error: true })}
                />
                {imageError && (
                  <div className="preview-fallback">
                    <Image />
                    <span>{domain}</span>
                    <button
                      type="button"
                      className="preview-retry-btn"
                      onClick={handleImageRetry}
                    >
                      Retry preview
                    </button>
                  </div>
                )}
              </>
            ) : isPendingPreview ? (
              <div className="preview-fallback">
                <Image />
                <span>{pendingLabel}</span>
              </div>
            ) : isFailed ? (
              <div className="preview-fallback">
                <Image />
                <span>Preview failed</span>
                <button
                  type="button"
                  className="preview-retry-btn"
                  onClick={handleRetry}
                  disabled={isRetrying}
                >
                  {isRetrying ? "Retrying..." : "Retry"}
                </button>
                {retryError && <small>{retryError}</small>}
              </div>
            ) : (
              <div className="preview-fallback">
                <Image />
                <span>{domain}</span>
              </div>
            )}
          </div>

          {aiPageType && (
            <AIMetadataChip
              label={aiPageType}
              showIcon
              className="bookmark-ai-chip"
            />
          )}

          {(isMemoryMatch || isMemoryPreparing || bookmark.match_label) && (
            <div className={`bookmark-memory-chip ${memoryChipClass}`} title={evidenceTitle}>
              {isMemoryPreparing && !bookmark.match_label ? <Loader2 size={12} /> : <Sparkles size={12} />}
              <span>{memoryLabel}</span>
            </div>
          )}

          {evidenceLabels.length > 0 && (
            <div className="bookmark-evidence-chips" title={evidenceTitle}>
              {evidenceLabels.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
          )}

          <div className="moodboard-overlay">
            <div className="moodboard-meta">
              {favicon && !faviconError ? (
                <img
                  src={favicon}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  onError={() => setFaviconError(true)}
                />
              ) : (
                <span className="moodboard-favicon-fallback">
                  {domain.charAt(0).toUpperCase()}
                </span>
              )}
              <div>
                <h3>{bookmark.title}</h3>
                <p>{domain}</p>
              </div>
            </div>
            <div className="moodboard-actions">
              <Button
                variant="ghost" size="icon" className="moodboard-action"
                title="Open site"
                aria-label={`Open ${bookmark.title}`}
                onClick={(e) => { e.stopPropagation(); window.open(bookmark.url, "_blank", "noopener,noreferrer"); }}
              >
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost" size="icon" className="moodboard-action"
                title="Edit"
                aria-label={`Edit ${bookmark.title}`}
                onClick={(e) => { e.stopPropagation(); onEdit(bookmark); }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              {/* Move to folder */}
              <div className="moodboard-move-folder-wrap" onClick={(e) => e.stopPropagation()}>
                <MoveToFolderMenu
                  bookmarkId={bookmark.id}
                  currentFolderId={bookmark.folder_id}
                >
                  <Button
                    variant="ghost" size="icon" className="moodboard-action"
                    title="Move to folder"
                    aria-label={`Move ${bookmark.title} to folder`}
                  >
                    <Folder className="h-3.5 w-3.5" />
                  </Button>
                </MoveToFolderMenu>
              </div>
              <Button
                variant="ghost" size="icon" className="moodboard-action moodboard-action-danger"
                title="Delete"
                aria-label={`Delete ${bookmark.title}`}
                onClick={handleDelete}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </article>
      <DeleteBookmarkDialog
        title={bookmark.title}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={() => onDelete(bookmark.id)}
      />
    </>
  );
}

export const BookmarkCard = memo(BookmarkCardComponent);
