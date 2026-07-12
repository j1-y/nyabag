"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createBookmark } from "@/lib/actions";
import { useBookmarks } from "@/hooks/useBookmarks";
import { getDomain, getFaviconUrl } from "@/lib/data";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { HugeIcon } from "@/components/ui/huge-icon";
import { IconArrowRight, IconCheck, IconLoader } from "@/components/ui/icons";

// ─── Helpers ───────────────────────────────────────────────────────────────

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function isValidUrl(raw: string): boolean {
  try {
    const url = new URL(normalizeUrl(raw));
    return (url.protocol === "http:" || url.protocol === "https:") &&
      url.hostname.includes(".");
  } catch {
    return false;
  }
}

type Phase = "idle" | "confirmed" | "saving" | "saved";

// Two-tick mount hook: returns false → true after element is in DOM so CSS transitions run
function useMounted(active: boolean) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (active) {
      const id = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(id);
    } else {
      setVisible(false);
    }
  }, [active]);
  return visible;
}

// ─── Component ─────────────────────────────────────────────────────────────

export function AddBookmarkModal() {
  const {
    addOpen,
    openAdd,
    closeAdd,
    addPendingBookmark,
    removePendingBookmark,
    setBookmarks,
  } = useBookmarks();

  const [urlInput, setUrlInput] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingIdRef = useRef<string | null>(null);

  const urlValid = isValidUrl(urlInput);
  const domain = urlValid ? getDomain(normalizeUrl(urlInput)) : "";
  const faviconUrl = urlValid ? getFaviconUrl(normalizeUrl(urlInput)) : null;

  // Animate preview/footer in: mount when valid, add class one frame later
  const previewVisible = useMounted(urlValid);

  // Reset when modal opens/closes
  useEffect(() => {
    if (addOpen) {
      setTimeout(() => inputRef.current?.focus(), 60);
    } else {
      setUrlInput("");
      setPhase("idle");
      setError("");
    }
  }, [addOpen]);

  // Auto-advance to "confirmed" when URL becomes valid
  useEffect(() => {
    if (urlValid && phase === "idle") {
      setPhase("confirmed");
    } else if (!urlValid && phase === "confirmed") {
      setPhase("idle");
    }
  }, [urlValid, phase]);

  function handleClose() {
    if (phase === "saving") return;
    closeAdd();
  }

  function handleSave() {
    if (!urlValid || phase === "saving" || phase === "saved") return;

    const finalUrl = normalizeUrl(urlInput);
    const pendingId = crypto.randomUUID();
    pendingIdRef.current = pendingId;

    const optimisticTitle =
      domain.charAt(0).toUpperCase() + domain.slice(1) || finalUrl;

    setPhase("saving");
    setError("");

    addPendingBookmark({ id: pendingId, title: optimisticTitle, url: finalUrl });

    const fd = new FormData();
    fd.set("url", finalUrl);
    fd.set("title", "");
    fd.set("tags", "");
    fd.set("note", "");

    startTransition(async () => {
      const result = await createBookmark(fd);
      const pid = pendingIdRef.current!;
      removePendingBookmark(pid);

      if (result.success) {
        setBookmarks((prev) => [result.data, ...prev.filter((b) => b.id !== result.data.id)]);
        setPhase("saved");
        setTimeout(() => {
          closeAdd();
        }, 900);
      } else {
        setPhase("confirmed");
        setError(result.error);
        openAdd();
      }
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && urlValid) {
      handleSave();
    }
  }

  const isBusy = phase === "saving" || isPending;

  return (
    <Dialog open={addOpen} onOpenChange={(open) => (open ? openAdd() : handleClose())}>
      <DialogContent className="abm-modal p-0 gap-0 overflow-hidden border-none shadow-[var(--shadow-lg)] max-w-[420px]">
        {/* Header */}
        <div className="abm-header">
          <div className="abm-header-text pr-8">
            <DialogTitle className="abm-title">Save bookmark</DialogTitle>
            <span className="abm-subtitle">
              {phase === "saved"
                ? "Saved! Nyabag is enriching it."
                : "Paste a URL and Nyabag will handle the rest."}
            </span>
          </div>
        </div>

        {/* URL Input Row */}
        <div className="abm-url-row">
          <div className={`abm-url-wrap${error ? " is-error" : ""}${urlValid ? " is-valid" : ""}`}>
            <Input
              ref={inputRef}
              id="abm-url"
              name="url"
              type="text"
              inputMode="url"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="Paste URL here…"
              value={urlInput}
              disabled={isBusy || phase === "saved"}
              onChange={(e) => {
                setUrlInput(e.target.value);
                setError("");
              }}
              onKeyDown={handleKeyDown}
              className="abm-url-input"
              aria-label="URL"
            />
          </div>

          {error && (
            <p className="abm-error" role="alert">{error}</p>
          )}
        </div>

        {/* Preview card — only mounted when URL is valid */}
        {urlValid && (
          <div className={`abm-preview${previewVisible ? " is-visible" : ""}`}>
            <div className="abm-site-card">
              <div className="abm-favicon-wrap">
                {faviconUrl ? (
                  <img
                    src={faviconUrl}
                    alt=""
                    className="abm-favicon"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                ) : (
                  <span className="abm-favicon-letter">
                    {domain.charAt(0).toUpperCase() || "?"}
                  </span>
                )}
              </div>
              <div className="abm-site-info">
                <span className="abm-site-title">
                  {domain.charAt(0).toUpperCase()}{domain.slice(1)}
                </span>
                <span className="abm-site-domain">{domain}</span>
              </div>
              <div className="abm-site-badge">
                {phase === "saving" ? (
                  <span className="abm-badge abm-badge--saving">
                    <HugeIcon icon={IconLoader} size={12} className="abm-spin" />
                    Saving
                  </span>
                ) : phase === "saved" ? (
                  <span className="abm-badge abm-badge--saved">
                    <HugeIcon icon={IconCheck} size={12} />
                    Saved
                  </span>
                ) : (
                  <span className="abm-badge abm-badge--ready">Ready</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Footer — only mounted when URL is valid */}
        {urlValid && (
        <div className={`abm-footer${previewVisible ? " is-visible" : ""}`}>
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isBusy}
            className="abm-btn-cancel"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={!urlValid || isBusy || phase === "saved"}
            className="abm-btn-save"
          >
            {phase === "saving" ? (
              <>
                <HugeIcon icon={IconLoader} size={14} className="abm-spin" />
                Saving…
              </>
            ) : phase === "saved" ? (
              <>
                <HugeIcon icon={IconCheck} size={14} />
                Saved
              </>
            ) : (
              <>
                Save
                <HugeIcon icon={IconArrowRight} size={14} />
              </>
            )}
          </Button>
        </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
