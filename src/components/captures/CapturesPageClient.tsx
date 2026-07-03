"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowUpRight,
  Camera,
  ChevronLeft,
  ChevronRight,
  Info,
  Link as LinkIcon,
  Share2,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";

export type CaptureView = {
  id: string;
  path: string;
  capture_url: string | null;
  page_url: string | null;
  page_title: string | null;
  original_size: number | null;
  compressed_size: number | null;
  source: string | null;
  created_at: string;
};

interface CapturesPageClientProps {
  captures: CaptureView[];
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

function formatBytes(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function sourceLabel(source: string | null) {
  if (source === "extension-scroll") return "Full-page";
  if (source === "extension-visible") return "Visible tab";
  return "Extension";
}

function Lightbox({
  captures,
  index,
  onClose,
  onNavigate,
  onDelete,
}: {
  captures: CaptureView[];
  index: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
  onDelete: (id: string) => Promise<void>;
}) {
  const capture = captures[index];
  const [showInfo, setShowInfo] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft" && index > 0) onNavigate(index - 1);
      if (event.key === "ArrowRight" && index < captures.length - 1) onNavigate(index + 1);
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [captures.length, index, onClose, onNavigate]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  function handleShare() {
    if (capture.capture_url) {
      navigator.clipboard.writeText(capture.capture_url).catch(() => {});
    }
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      window.setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }

    setIsDeleting(true);
    setDeleteError("");
    try {
      await onDelete(capture.id);
    } catch {
      setDeleteError("Could not delete this capture. Please try again.");
    } finally {
      setIsDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <div className="lb-overlay" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="lb-topbar">
        <div className="lb-topbar-left">
          <span className="lb-title">
            {capture.page_title || capture.page_url || "Untitled capture"}
          </span>
        </div>

        <div className="lb-topbar-right">
          {capture.page_url && (
            <a
              href={capture.page_url}
              target="_blank"
              rel="noopener noreferrer"
              className="lb-action-btn"
              title="Visit source"
              aria-label="Visit source"
            >
              <LinkIcon size={17} />
            </a>
          )}
          {capture.capture_url && (
            <a
              href={capture.capture_url}
              target="_blank"
              rel="noopener noreferrer"
              className="lb-action-btn"
              title="Open full image"
              aria-label="Open full image"
            >
              <ArrowUpRight size={17} />
            </a>
          )}
          <button type="button" className="lb-action-btn" title="Copy image link" aria-label="Copy image link" onClick={handleShare}>
            <Share2 size={17} />
          </button>
          <button
            type="button"
            className={`lb-action-btn${showInfo ? " lb-action-btn--active" : ""}`}
            title="Info"
            aria-label="Info"
            aria-pressed={showInfo}
            onClick={() => setShowInfo((value) => !value)}
          >
            <Info size={17} />
          </button>
          <button
            type="button"
            className={`lb-action-btn lb-action-btn--danger${confirmDelete ? " lb-action-btn--confirm" : ""}`}
            title={confirmDelete ? "Click again to confirm delete" : "Delete"}
            aria-label={confirmDelete ? "Confirm delete" : "Delete capture"}
            disabled={isDeleting}
            onClick={handleDelete}
          >
            <Trash2 size={17} />
          </button>
          <div className="lb-topbar-divider" />
          <button type="button" className="lb-action-btn" title="Close" aria-label="Close" onClick={onClose}>
            <X size={17} />
          </button>
        </div>
      </div>

      <div className="lb-stage">
        {index > 0 && (
          <button type="button" className="lb-nav lb-nav--prev" onClick={() => onNavigate(index - 1)} aria-label="Previous capture">
            <ChevronLeft size={20} />
          </button>
        )}

        <div className="lb-img-wrap">
          {capture.capture_url ? (
            <img key={capture.id} src={capture.capture_url} alt={capture.page_title ?? "Capture"} className="lb-img" />
          ) : (
            <div className="lb-no-image">
              <Camera size={32} />
              <span>No image available</span>
            </div>
          )}
        </div>

        {index < captures.length - 1 && (
          <button type="button" className="lb-nav lb-nav--next" onClick={() => onNavigate(index + 1)} aria-label="Next capture">
            <ChevronRight size={20} />
          </button>
        )}
      </div>

      <div className="lb-counter">
        {index + 1} / {captures.length}
      </div>

      {deleteError && <div className="lb-error">{deleteError}</div>}

      <div className={`lb-info-panel${showInfo ? " lb-info-panel--open" : ""}`}>
        <p className="lb-info-label">Details</p>
        <div className="lb-info-rows">
          {capture.page_title && (
            <div className="lb-info-row">
              <span className="lb-info-key">Title</span>
              <span className="lb-info-val">{capture.page_title}</span>
            </div>
          )}
          {capture.page_url && (
            <div className="lb-info-row">
              <span className="lb-info-key">Source</span>
              <a href={capture.page_url} target="_blank" rel="noopener noreferrer" className="lb-info-link">
                {capture.page_url}
              </a>
            </div>
          )}
          <div className="lb-info-row">
            <span className="lb-info-key">Captured</span>
            <span className="lb-info-val">{formatDate(capture.created_at)}</span>
          </div>
          <div className="lb-info-row">
            <span className="lb-info-key">Type</span>
            <span className="lb-info-val">{sourceLabel(capture.source)}</span>
          </div>
          {capture.compressed_size && (
            <div className="lb-info-row">
              <span className="lb-info-key">Size</span>
              <span className="lb-info-val">{formatBytes(capture.compressed_size)}</span>
            </div>
          )}
          {capture.compressed_size && capture.original_size && (
            <div className="lb-info-row">
              <span className="lb-info-key">Compressed</span>
              <span className="lb-info-val lb-info-savings">
                {Math.round((1 - capture.compressed_size / capture.original_size) * 100)}% smaller
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MasonryGrid({
  captures,
  onOpen,
}: {
  captures: CaptureView[];
  onOpen: (index: number) => void;
}) {
  return (
    <section className="masonry" aria-label="Screenshot captures">
      {captures.map((capture, index) => (
        <div
          key={capture.id}
          className="masonry-item"
          onClick={() => onOpen(index)}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onOpen(index);
            }
          }}
          aria-label={capture.page_title ?? "Open capture"}
        >
          {capture.capture_url ? (
            <img
              src={capture.capture_url}
              alt={capture.page_title ?? "Capture"}
              loading="lazy"
              className="masonry-img"
            />
          ) : (
            <div className="masonry-placeholder">
              <Camera size={20} />
            </div>
          )}
          <div className="masonry-hover" aria-hidden="true">
            <ArrowUpRight size={14} />
          </div>
        </div>
      ))}
    </section>
  );
}

export function CapturesPageClient({ captures: initialCaptures }: CapturesPageClientProps) {
  const [captures, setCaptures] = useState(initialCaptures);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const handleDelete = useCallback(
    async (id: string) => {
      const response = await fetch(`/api/captures/${id}`, { method: "DELETE" });
      if (!response.ok) {
        throw new Error("Capture delete failed");
      }

      const nextLength = captures.length - 1;
      setCaptures((previous) => previous.filter((capture) => capture.id !== id));
      setLightboxIndex((current) => {
        if (current === null || nextLength === 0) return null;
        return Math.min(current, nextLength - 1);
      });
    },
    [captures.length]
  );

  if (captures.length === 0) {
    return (
      <main className="captures-page">
        <div className="captures-empty">
          <div className="captures-empty__icon" aria-hidden="true">
            <Camera size={24} />
          </div>
          <h2>No captures yet</h2>
          <p>Use the Nyabag browser extension to capture screenshots. They&apos;ll appear here.</p>
          <Link href="/" className="captures-empty__link">
            Back to bookmarks
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="captures-page">
      <div className="captures-header">
        <div className="captures-header__left">
          <p className="captures-kicker">Browser Extension</p>
          <h1 className="captures-heading">Captures</h1>
        </div>
        <span className="captures-count">
          {captures.length} capture{captures.length !== 1 ? "s" : ""}
        </span>
      </div>

      <MasonryGrid captures={captures} onOpen={setLightboxIndex} />

      {lightboxIndex !== null && captures[lightboxIndex] && (
        <Lightbox
          captures={captures}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
          onDelete={handleDelete}
        />
      )}
    </main>
  );
}
