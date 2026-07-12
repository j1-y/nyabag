"use client";

import { HugeIcon } from "@/components/ui/huge-icon";
import { IconAdd, IconArrowLeft, IconArrowRight, IconArrowUpRight, IconCamera, IconClose, IconDelete, IconInfo, IconLink, IconMaximize, IconMinus, IconRefresh, IconShare } from "@/components/ui/icons";
import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { IconSearch, IconList, IconArrowDown } from "@/components/ui/icons";

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
  const [mounted, setMounted] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef({ pointerX: 0, pointerY: 0, imageX: 0, imageY: 0 });
  const didDragRef = useRef(false);

  const resetView = useCallback(() => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
    setDragging(false);
  }, []);

  const changeZoom = useCallback((nextZoom: number) => {
    const clamped = Math.min(4, Math.max(1, nextZoom));
    setZoom(clamped);
    if (clamped === 1) setPosition({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    setMounted(true);
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    window.requestAnimationFrame(() => overlayRef.current?.focus());
    return () => restoreFocusRef.current?.focus();
  }, []);

  useEffect(() => {
    resetView();
  }, [capture.id, resetView]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft" && index > 0) onNavigate(index - 1);
      if (event.key === "ArrowRight" && index < captures.length - 1) onNavigate(index + 1);
      if (event.key === "+" || event.key === "=") changeZoom(zoom + 0.25);
      if (event.key === "-") changeZoom(zoom - 0.25);
      if (event.key === "0") resetView();
      if (event.key === "Tab" && overlayRef.current) {
        const focusable = Array.from(
          overlayRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')
        );
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [captures.length, index, onClose, onNavigate, resetView, changeZoom, zoom]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  function handleWheel(event: React.WheelEvent) {
    event.preventDefault();
    changeZoom(zoom + (event.deltaY < 0 ? 0.25 : -0.25));
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (zoom === 1 || event.button !== 0 || !(event.target instanceof HTMLImageElement)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      imageX: position.x,
      imageY: position.y,
    };
    didDragRef.current = false;
    setDragging(true);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    if (Math.abs(event.clientX - dragRef.current.pointerX) > 4 || Math.abs(event.clientY - dragRef.current.pointerY) > 4) {
      didDragRef.current = true;
    }
    setPosition({
      x: dragRef.current.imageX + event.clientX - dragRef.current.pointerX,
      y: dragRef.current.imageY + event.clientY - dragRef.current.pointerY,
    });
  }

  function handlePointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(false);
  }

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

  if (!mounted) return null;

  return createPortal(
    <div
      ref={overlayRef}
      className={`lb-overlay${showInfo ? " lb-overlay--info-open" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="capture-lightbox-title"
      tabIndex={-1}
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="lb-topbar">
        <div className="lb-topbar-left">
          <span id="capture-lightbox-title" className="lb-title">
            {capture.page_title || capture.page_url || "Untitled capture"}
          </span>
        </div>

        <div className="lb-topbar-right">
          {capture.page_url && (
            <a
              href={capture.page_url}
              target="_blank"
              rel="noopener noreferrer"
              className="lb-action-btn lb-action-btn--secondary"
              title="Visit source"
              aria-label="Visit source"
            >
              <HugeIcon icon={IconLink} size={18} />
            </a>
          )}
          {capture.capture_url && (
            <a
              href={capture.capture_url}
              target="_blank"
              rel="noopener noreferrer"
              className="lb-action-btn lb-action-btn--secondary"
              title="Open full image"
              aria-label="Open full image"
            >
              <HugeIcon icon={IconArrowUpRight} size={18} />
            </a>
          )}
          <button type="button" className="lb-action-btn lb-action-btn--secondary" title="Copy image link" aria-label="Copy image link" onClick={handleShare}>
            <HugeIcon icon={IconShare} size={18} />
          </button>
          <button
            type="button"
            className={`lb-action-btn${showInfo ? " lb-action-btn--active" : ""}`}
            title="Info"
            aria-label="Info"
            aria-pressed={showInfo}
            onClick={() => setShowInfo((value) => !value)}
          >
            <HugeIcon icon={IconInfo} size={18} />
          </button>
          <div className="lb-zoom-controls" aria-label="Image zoom controls">
            <button type="button" className="lb-action-btn" title="Zoom out" aria-label="Zoom out" disabled={zoom === 1} onClick={() => changeZoom(zoom - 0.25)}>
              <HugeIcon icon={IconMinus} size={18} />
            </button>
            <span className="lb-zoom-value">{zoom === 1 ? "Fit" : `${Math.round(zoom * 100)}%`}</span>
            <button type="button" className="lb-action-btn" title="Zoom in" aria-label="Zoom in" disabled={zoom === 4} onClick={() => changeZoom(zoom + 0.25)}>
              <HugeIcon icon={IconAdd} size={18} />
            </button>
            <button type="button" className="lb-action-btn" title="Fit to screen" aria-label="Fit to screen" onClick={resetView}>
              <HugeIcon icon={zoom === 1 ? IconMaximize : IconRefresh} size={18} />
            </button>
          </div>
          <button
            type="button"
            className={`lb-action-btn lb-action-btn--danger${confirmDelete ? " lb-action-btn--confirm" : ""}`}
            title={confirmDelete ? "Click again to confirm delete" : "Delete"}
            aria-label={confirmDelete ? "Confirm delete" : "Delete capture"}
            disabled={isDeleting}
            onClick={handleDelete}
          >
            <HugeIcon icon={IconDelete} size={18} />
          </button>
          <div className="lb-topbar-divider" />
          <button type="button" className="lb-action-btn" title="Close" aria-label="Close" onClick={onClose}>
            <HugeIcon icon={IconClose} size={18} />
          </button>
        </div>
      </div>

      <div
        className={`lb-stage${zoom > 1 ? " lb-stage--zoomed" : ""}${dragging ? " lb-stage--dragging" : ""}`}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onClick={(event) => event.target === event.currentTarget && onClose()}
      >
        {index > 0 && (
          <button type="button" className="lb-nav lb-nav--prev" onClick={() => onNavigate(index - 1)} aria-label="Previous capture">
            <HugeIcon icon={IconArrowLeft} size={18} />
          </button>
        )}

        <div className="lb-img-wrap" onClick={(event) => event.target === event.currentTarget && onClose()}>
          {capture.capture_url ? (
            <img
              key={capture.id}
              src={capture.capture_url}
              alt={capture.page_title ?? "Capture"}
              className="lb-img"
              draggable={false}
              onClick={() => {
                if (didDragRef.current) {
                  didDragRef.current = false;
                  return;
                }
                changeZoom(zoom === 1 ? 2 : 1);
              }}
              style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${zoom})` }}
            />
          ) : (
            <div className="lb-no-image">
              <HugeIcon icon={IconCamera} size={18} />
              <span>No image available</span>
            </div>
          )}
        </div>

        {index < captures.length - 1 && (
          <button type="button" className="lb-nav lb-nav--next" onClick={() => onNavigate(index + 1)} aria-label="Next capture">
            <HugeIcon icon={IconArrowRight} size={18} />
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
    </div>,
    document.body
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
              <HugeIcon icon={IconCamera} size={18} />
            </div>
          )}
          <div className="masonry-hover" aria-hidden="true">
            <HugeIcon icon={IconArrowUpRight} size={18} />
          </div>
        </div>
      ))}
    </section>
  );
}

export function CapturesPageClient({ captures: initialCaptures }: CapturesPageClientProps) {
  const [captures, setCaptures] = useState(initialCaptures);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterSource, setFilterSource] = useState("all");
  const [sortOrder, setSortOrder] = useState("newest");

  const filteredCaptures = useMemo(() => {
    let result = [...captures];

    // Filter
    if (filterSource !== "all") {
      result = result.filter(c => {
        if (filterSource === "extension-scroll") return c.source === "extension-scroll";
        if (filterSource === "extension-visible") return c.source === "extension-visible";
        if (filterSource === "extension") return c.source === "extension" || !c.source;
        return true;
      });
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(c => (c.page_title || "").toLowerCase().includes(q) || (c.page_url || "").toLowerCase().includes(q));
    }

    // Sort
    result.sort((a, b) => {
      if (sortOrder === "newest") {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      } else if (sortOrder === "oldest") {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      } else if (sortOrder === "size-desc") {
        return (b.compressed_size || 0) - (a.compressed_size || 0);
      }
      return 0;
    });

    return result;
  }, [captures, searchQuery, filterSource, sortOrder]);

  const handleDelete = useCallback(
    async (id: string) => {
      const response = await fetch(`/api/captures/${id}`, { method: "DELETE" });
      if (!response.ok) {
        throw new Error("Capture delete failed");
      }

      setCaptures((previous) => previous.filter((capture) => capture.id !== id));
      setLightboxIndex(null);
    },
    []
  );

  if (captures.length === 0) {
    return (
      <main className="captures-page">
        <div className="captures-empty">
          <div className="captures-empty__icon" aria-hidden="true">
            <HugeIcon icon={IconCamera} size={18} />
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
          <div className="captures-title-row">
            <h1 className="captures-heading">Captures</h1>
            <span className="captures-count-badge">
              {filteredCaptures.length} {filteredCaptures.length === 1 ? "capture" : "captures"}
            </span>
          </div>
          <p className="captures-subtitle">Manage and organize screenshots captured via the browser extension.</p>
        </div>
      </div>

      <div className="captures-toolbar">
        <div className="captures-toolbar__search">
          <HugeIcon icon={IconSearch} size={16} className="captures-toolbar__search-icon" />
          <input
            type="text"
            placeholder="Search captures..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        
        <div className="captures-toolbar__controls">
          <div className="captures-toolbar__select-wrapper">
            <HugeIcon icon={IconList} size={16} />
            <select value={filterSource} onChange={(e) => setFilterSource(e.target.value)}>
              <option value="all">All sources</option>
              <option value="extension-scroll">Full-page</option>
              <option value="extension-visible">Visible tab</option>
              <option value="extension">Extension selection</option>
            </select>
          </div>
          
          <div className="captures-toolbar__select-wrapper">
            <HugeIcon icon={IconArrowDown} size={16} />
            <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="size-desc">Largest size</option>
            </select>
          </div>
        </div>
      </div>

      {filteredCaptures.length > 0 ? (
        <MasonryGrid captures={filteredCaptures} onOpen={setLightboxIndex} />
      ) : (
        <div className="captures-empty captures-empty--filtered">
          <p>No captures match your filters.</p>
          <button type="button" onClick={() => { setSearchQuery(""); setFilterSource("all"); }} className="captures-empty__link">
            Clear filters
          </button>
        </div>
      )}

      {lightboxIndex !== null && filteredCaptures[lightboxIndex] && (
        <Lightbox
          captures={filteredCaptures}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
          onDelete={handleDelete}
        />
      )}
    </main>
  );
}
