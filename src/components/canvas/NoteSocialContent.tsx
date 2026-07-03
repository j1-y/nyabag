"use client";

import { HugeIcon } from "@/components/ui/huge-icon";
import { IconArrowUpRight } from "@/components/ui/icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
;
import { getXPostEmbedHtml } from "@/lib/canvas-actions";
import {
  getSocialNoteUrl,
  parseSocialEmbed,
  socialProviderLabel,
  toSocialNoteContent,
} from "@/lib/social-embeds";
import { useNotes } from "@/hooks/useNotes";
import type { CanvasNote } from "@/lib/types";
import { SocialNoteDialog } from "./SocialNoteDialog";

declare global {
  interface Window {
    twttr?: { widgets?: { load: (element?: HTMLElement) => void | Promise<unknown> } };
    instgrm?: { Embeds?: { process: () => void } };
    PinUtils?: { build: (element?: HTMLElement) => void };
  }
}

const SCRIPT_IDS = {
  x: "nyabag-x-widgets",
  instagram: "nyabag-instagram-embed",
  tiktok: "nyabag-tiktok-embed",
  pinterest: "nyabag-pinterest-embed",
};

function loadScript(id: string, src: string): Promise<void> {
  const existing = document.getElementById(id) as HTMLScriptElement | null;
  if (existing?.dataset.loaded === "true") return Promise.resolve();
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Script failed to load")), { once: true });
    });
  }

  const script = document.createElement("script");
  script.id = id;
  script.src = src;
  script.async = true;
  script.defer = true;
  script.onload = () => {
    script.dataset.loaded = "true";
  };
  script.onerror = () => {
    script.dataset.loaded = "false";
  };
  document.body.appendChild(script);
  return new Promise((resolve, reject) => {
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("Script failed to load")), { once: true });
  });
}

function reloadScript(id: string, src: string): Promise<void> {
  document.getElementById(id)?.remove();
  return loadScript(id, src);
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function waitForTwitterWidgets() {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (window.twttr?.widgets?.load) return window.twttr.widgets;
    await wait(100);
  }

  return null;
}

async function waitForInstagramEmbeds() {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (window.instgrm?.Embeds?.process) return window.instgrm.Embeds;
    await wait(100);
  }

  return null;
}

async function waitForPinterestWidgets() {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (window.PinUtils?.build) return window.PinUtils;
    await wait(100);
  }

  return null;
}

function clampNoteWidth(value: number) {
  return Math.min(1200, Math.max(100, Math.ceil(value)));
}

function clampNoteHeight(value: number) {
  return Math.min(900, Math.max(80, Math.ceil(value)));
}

function SocialFallback({ url, label, message }: { url: string; label: string; message?: string }) {
  return (
    <div className="social-embed-fallback">
      <div>
        <span>{label}</span>
        <strong>{message ?? "Open the public post"}</strong>
      </div>
      <a href={url} target="_blank" rel="noopener noreferrer" onPointerDown={(e) => e.stopPropagation()}>
        Open post
        <HugeIcon icon={IconArrowUpRight} size={18} />
      </a>
    </div>
  );
}

export function NoteSocialContent({ note, isSelected }: { note: CanvasNote; isSelected: boolean }) {
  void isSelected;
  const { updateContent, setNoteSize, commitSize } = useNotes();
  const [editOpen, setEditOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [xEmbed, setXEmbed] = useState<{ url: string; html: string } | null>(null);
  const [xReady, setXReady] = useState(false);
  const [xFailed, setXFailed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const socialUrl = getSocialNoteUrl(note.content);
  const embed = useMemo(() => parseSocialEmbed(note.content), [note.content]);
  const hasEmbed = Boolean(embed);
  const xHtml = embed?.provider === "x" && xEmbed?.url === embed.url ? xEmbed.html : "";

  const resizeToRenderedXEmbed = useCallback(() => {
    if (!containerRef.current || embed?.provider !== "x") return;
    const iframe = containerRef.current.querySelector("iframe") as HTMLElement | null;
    const content = iframe ?? (containerRef.current.querySelector(".social-note-x-embed") as HTMLElement | null);
    if (!content) return;

    const renderedWidth = content.offsetWidth;
    const renderedHeight = content.offsetHeight;
    if (renderedWidth < 200 || renderedHeight < 120) return;

    const nextWidth = clampNoteWidth(renderedWidth + 22);
    const nextHeight = clampNoteHeight(renderedHeight + 22);
    if (Math.abs(nextWidth - note.width) < 10 && Math.abs(nextHeight - note.height) < 10) return;

    setNoteSize(note.id, nextWidth, nextHeight);
    void commitSize(note.id, nextWidth, nextHeight);
  }, [commitSize, embed?.provider, note.height, note.id, note.width, setNoteSize]);

  useEffect(() => {
    if (!hasEmbed || !embed || embed.provider !== "x") return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setXReady(false);
      setXFailed(false);
      setStatus("");
    });

    getXPostEmbedHtml(embed.url).then((result) => {
      if (cancelled) return;
      if (result.success) setXEmbed({ url: embed.url, html: result.data });
      else setStatus(result.error);
    });

    return () => {
      cancelled = true;
    };
  }, [hasEmbed, embed]);

  useEffect(() => {
    if (!hasEmbed || !embed || embed.provider !== "x" || !xHtml) return;
    let cancelled = false;

    async function hydrateXEmbed() {
      try {
        await loadScript(SCRIPT_IDS.x, "https://platform.twitter.com/widgets.js");
        const widgets = await waitForTwitterWidgets();
        if (!widgets || cancelled) throw new Error("X widgets unavailable");

        for (let attempt = 0; attempt < 8; attempt++) {
          await widgets.load(containerRef.current ?? undefined);
          await wait(250 + attempt * 100);
          const iframe = containerRef.current?.querySelector("iframe");
          if (iframe && !cancelled) {
            setXReady(true);
            setXFailed(false);
            setStatus("");
            window.setTimeout(resizeToRenderedXEmbed, 100);
            window.setTimeout(resizeToRenderedXEmbed, 700);
            return;
          }
        }

        throw new Error("X embed did not hydrate");
      } catch {
        if (!cancelled) {
          setXReady(false);
          setXFailed(true);
          setStatus("X could not render this post here.");
        }
      }
    }

    void hydrateXEmbed();

    return () => {
      cancelled = true;
    };
  }, [hasEmbed, embed, xHtml, resizeToRenderedXEmbed]);

  useEffect(() => {
    if (!hasEmbed || embed?.provider !== "x" || !xHtml || !xReady || !containerRef.current) return;

    const observer = new ResizeObserver(() => resizeToRenderedXEmbed());
    observer.observe(containerRef.current);
    const content = containerRef.current.querySelector("iframe") ?? containerRef.current.querySelector(".social-note-x-embed");
    if (content) observer.observe(content);
    return () => observer.disconnect();
  }, [embed?.provider, hasEmbed, resizeToRenderedXEmbed, xHtml, xReady]);

  useEffect(() => {
    if (!hasEmbed || !embed || embed.provider !== "instagram") return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setStatus("");
    });

    async function hydrateInstagramEmbed() {
      try {
        await loadScript(SCRIPT_IDS.instagram, "https://www.instagram.com/embed.js");
        const embeds = await waitForInstagramEmbeds();
        if (!embeds || cancelled) throw new Error("Instagram embeds unavailable");
        embeds.process();
      } catch {
        if (!cancelled) setStatus("Instagram could not render this post here.");
      }
    }

    void hydrateInstagramEmbed();

    return () => {
      cancelled = true;
    };
  }, [embed, hasEmbed]);

  useEffect(() => {
    if (!hasEmbed || !embed || embed.provider !== "tiktok") return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setStatus("");
    });

    async function hydrateTikTokEmbed() {
      try {
        await reloadScript(SCRIPT_IDS.tiktok, "https://www.tiktok.com/embed.js");
      } catch {
        if (!cancelled) setStatus("TikTok could not render this post here.");
      }
    }

    void hydrateTikTokEmbed();

    return () => {
      cancelled = true;
    };
  }, [embed, hasEmbed]);

  useEffect(() => {
    if (!hasEmbed || !embed || embed.provider !== "pinterest") return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setStatus("");
    });

    async function hydratePinterestEmbed() {
      try {
        await loadScript(SCRIPT_IDS.pinterest, "https://assets.pinterest.com/js/pinit.js");
        const widgets = await waitForPinterestWidgets();
        if (!widgets || cancelled) throw new Error("Pinterest widgets unavailable");
        widgets.build(containerRef.current ?? undefined);
      } catch {
        if (!cancelled) setStatus("Pinterest could not render this post here.");
      }
    }

    void hydratePinterestEmbed();

    return () => {
      cancelled = true;
    };
  }, [embed, hasEmbed]);

  if (!hasEmbed) {
    return (
      <>
        <div className="social-note-empty" onPointerDown={(e) => e.stopPropagation()}>
          <strong>Social post</strong>
          <span>Add a public X/Twitter, Facebook, LinkedIn, Instagram, TikTok, or Pinterest post link.</span>
          <button type="button" onClick={() => setEditOpen(true)}>
            Set post link
          </button>
          {status && <p>{status}</p>}
        </div>
        {editOpen && (
          <SocialNoteDialog
            title="Set social post"
            confirmLabel="Save"
            initialUrl={socialUrl}
            onClose={() => setEditOpen(false)}
            onConfirm={(url) => updateContent(note.id, toSocialNoteContent(url))}
          />
        )}
      </>
    );
  }

  const label = socialProviderLabel(embed!.provider);

  return (
    <div className="social-note" onPointerDown={(e) => e.stopPropagation()}>
      <div className="social-note-frame" ref={containerRef}>
        {embed!.provider === "x" && (
          xHtml ? (
            <>
              <div
                className={`social-note-x-embed${xReady ? " is-ready" : ""}`}
                dangerouslySetInnerHTML={{ __html: xHtml }}
              />
              {!xReady && (
                <SocialFallback
                  url={embed!.url}
                  label={label}
                  message={xFailed ? status : "Loading post..."}
                />
              )}
            </>
          ) : (
            <SocialFallback url={embed!.url} label={label} message={status || "Loading post..."} />
          )
        )}

        {embed!.provider === "facebook" && (
          <iframe
            src={embed!.iframeSrc}
            title="Facebook embedded post"
            allow="encrypted-media; picture-in-picture; web-share"
            allowFullScreen
            loading="lazy"
          />
        )}

        {embed!.provider === "linkedin" && (
          embed!.iframeSrc ? (
            <iframe
              src={embed!.iframeSrc}
              title="LinkedIn embedded post"
              allowFullScreen
              loading="lazy"
            />
          ) : (
            <SocialFallback url={embed!.url} label={label} />
          )
        )}

        {embed!.provider === "instagram" && (
          status ? (
            <SocialFallback url={embed!.url} label={label} message={status} />
          ) : (
            <blockquote
              className="instagram-media"
              data-instgrm-permalink={embed!.url}
              data-instgrm-version="14"
            >
              <a href={embed!.url} target="_blank" rel="noopener noreferrer">
                View this post on Instagram
              </a>
            </blockquote>
          )
        )}

        {embed!.provider === "tiktok" && (
          status ? (
            <SocialFallback url={embed!.url} label={label} message={status} />
          ) : (
            <blockquote
              className="tiktok-embed"
              cite={embed!.url}
              data-video-id={embed!.videoId ?? undefined}
            >
              <section>
                <a href={embed!.url} target="_blank" rel="noopener noreferrer">
                  View this post on TikTok
                </a>
              </section>
            </blockquote>
          )
        )}

        {embed!.provider === "pinterest" && (
          status ? (
            <SocialFallback url={embed!.url} label={label} message={status} />
          ) : (
            <a
              data-pin-do={
                embed!.widget === "pin"
                  ? "embedPin"
                  : embed!.widget === "board"
                    ? "embedBoard"
                    : "embedUser"
              }
              data-pin-board-width="400"
              data-pin-scale-height="520"
              data-pin-scale-width="80"
              href={embed!.url}
            >
              View this on Pinterest
            </a>
          )
        )}
      </div>

      {editOpen && (
        <SocialNoteDialog
          title="Edit social post"
          confirmLabel="Save"
          initialUrl={socialUrl}
          onClose={() => setEditOpen(false)}
          onConfirm={(url) => updateContent(note.id, toSocialNoteContent(url))}
        />
      )}
    </div>
  );
}
