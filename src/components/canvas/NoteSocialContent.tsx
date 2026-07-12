"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { HugeIcon } from "@/components/ui/huge-icon";
import { IconArrowUpRight } from "@/components/ui/icons";
import {
  getSocialNoteUrl,
  parseSocialEmbed,
  socialProviderLabel,
  toSocialNoteContent,
} from "@/lib/social-embeds";
import { useNotes } from "@/hooks/useNotes";
import type { CanvasNote } from "@/lib/types";
import { SocialNoteDialog } from "./SocialNoteDialog";
import {
  XEmbed,
  FacebookEmbed,
  LinkedInEmbed,
  InstagramEmbed,
  TikTokEmbed,
  PinterestEmbed,
} from "react-social-media-embed";

function clampNoteWidth(value: number) {
  return Math.min(1200, Math.max(100, Math.ceil(value)));
}

function clampNoteHeight(value: number) {
  return Math.min(900, Math.max(80, Math.ceil(value)));
}

export function NoteSocialContent({ note, isSelected }: { note: CanvasNote; isSelected: boolean }) {
  void isSelected;
  const { updateContent, setNoteSize, commitSize } = useNotes();
  const [editOpen, setEditOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const socialUrl = getSocialNoteUrl(note.content);
  const embed = useMemo(() => parseSocialEmbed(note.content), [note.content]);
  const hasEmbed = Boolean(embed);

  // Resize note to fit embed content automatically using ResizeObserver
  const resizeToRenderedEmbed = useCallback(() => {
    if (!containerRef.current || !hasEmbed) return;
    
    // Find the actual rendered content (iframe, blockquote, or innermost div)
    const iframe = containerRef.current.querySelector("iframe");
    const blockquote = containerRef.current.querySelector("blockquote");
    const content = iframe || blockquote || (containerRef.current.firstElementChild as HTMLElement);
    
    if (!content) return;

    const renderedWidth = content.offsetWidth || content.getBoundingClientRect().width;
    const renderedHeight = content.offsetHeight || content.getBoundingClientRect().height;
    
    if (renderedWidth < 100 || renderedHeight < 100) return;

    const nextWidth = clampNoteWidth(renderedWidth + 24); // Add padding for Chrome
    const nextHeight = clampNoteHeight(renderedHeight + 24);
    
    // Only dispatch if difference is significant to avoid infinite loops
    if (Math.abs(nextWidth - note.width) > 5 || Math.abs(nextHeight - note.height) > 5) {
      setNoteSize(note.id, nextWidth, nextHeight);
      void commitSize(note.id, nextWidth, nextHeight);
    }
  }, [commitSize, hasEmbed, note.height, note.id, note.width, setNoteSize]);

  useEffect(() => {
    if (!hasEmbed || !containerRef.current) return;

    const observer = new ResizeObserver(() => resizeToRenderedEmbed());
    observer.observe(containerRef.current);
    
    // Attempt to observe all potential inner wrappers
    const children = containerRef.current.querySelectorAll("*");
    children.forEach(child => observer.observe(child));

    // Fallback polling for when iframe loads and resizes asynchronously
    let attempts = 0;
    const interval = setInterval(() => {
      resizeToRenderedEmbed();
      if (attempts++ > 15) clearInterval(interval);
    }, 500);

    return () => {
      observer.disconnect();
      clearInterval(interval);
    };
  }, [hasEmbed, resizeToRenderedEmbed]);

  if (!hasEmbed) {
    return (
      <>
        <div className="social-note-empty" onPointerDown={(e) => e.stopPropagation()}>
          <strong>Social post</strong>
          <span>Add a public X/Twitter, Facebook, LinkedIn, Instagram, TikTok, or Pinterest post link.</span>
          <button type="button" onClick={() => setEditOpen(true)}>
            Set post link
          </button>
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

  const embedUrl = embed!.url;

  return (
    <div className="social-note" onPointerDown={(e) => e.stopPropagation()}>
      <div className="social-note-frame" ref={containerRef} style={{ width: "100%", height: "100%", display: "flex", justifyContent: "center" }}>
        {embed!.provider === "x" && <XEmbed url={embedUrl} width={550} />}
        {embed!.provider === "facebook" && <FacebookEmbed url={embedUrl} width={550} />}
        {embed!.provider === "linkedin" && <LinkedInEmbed url={embedUrl} width={550} />}
        {embed!.provider === "instagram" && <InstagramEmbed url={embedUrl} width={400} />}
        {embed!.provider === "tiktok" && <TikTokEmbed url={embedUrl} width={325} />}
        {embed!.provider === "pinterest" && <PinterestEmbed url={embedUrl} width={345} />}
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
