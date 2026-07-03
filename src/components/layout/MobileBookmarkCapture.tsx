"use client";

import { ArrowUpRight, ArrowRight, CheckCircle, Upload, LogOut, Loader2, User, X, Link as LinkIcon } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState, useTransition } from "react";
;
import { createBookmark, signOut } from "@/lib/actions";

type MobileBookmarkCaptureProps = {
  profileName: string;
  userEmail: string;
  profileAvatarUrl: string | null;
};

function initials(name: string, email: string) {
  const source = name.trim() || email.trim();
  if (!source) return "N";
  return source
    .split(/[.@\s_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "N";
}

export function MobileBookmarkCapture({
  profileName,
  userEmail,
  profileAvatarUrl,
}: MobileBookmarkCaptureProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const [urls, setUrls] = useState("");
  const [urlCount, setUrlCount] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [savedCount, setSavedCount] = useState(0);
  const [profileOpen, setProfileOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const displayName = profileName.trim() || userEmail || "Profile";
  const avatarInitials = initials(profileName, userEmail);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!profileRef.current?.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setProfileOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  function parseUrls(raw: string): string[] {
    return raw
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
  }

  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setUrls(val);
    setUrlCount(parseUrls(val).length);
    setErrors([]);
    setSavedCount(0);
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const extracted = text
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.startsWith("http"));
      const appended = urls.trim()
        ? urls.trim() + "\n" + extracted.join("\n")
        : extracted.join("\n");
      setUrls(appended);
      setUrlCount(parseUrls(appended).length);
      setErrors([]);
      setSavedCount(0);
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function handleClear() {
    setUrls("");
    setUrlCount(0);
    setErrors([]);
    setSavedCount(0);
  }

  function handleSave() {
    const list = parseUrls(urls);
    if (!list.length) return;
    setErrors([]);
    setSavedCount(0);

    startTransition(async () => {
      const results = await Promise.allSettled(
        list.map((url) => {
          const fd = new FormData();
          fd.append("url", url);
          return createBookmark(fd);
        })
      );

      const errs: string[] = [];
      let saved = 0;

      results.forEach((r, i) => {
        if (r.status === "fulfilled") {
          if (r.value.success) {
            saved++;
          } else {
            errs.push(`${list[i]}: ${r.value.error}`);
          }
        } else {
          errs.push(`${list[i]}: failed to save`);
        }
      });

      setSavedCount(saved);
      setErrors(errs);
      if (errs.length === 0) {
        setUrls("");
        setUrlCount(0);
      }
    });
  }

  return (
    <main className="mobile-capture-page">
      <nav className="mobile-capture-navbar" aria-label="Mobile capture navigation">
        <Link href="/" className="mobile-capture-brand" aria-label="Nyabag home">
          <Image
            src="/assets/logo.svg"
            alt="Nyabag"
            width={120}
            height={80}
            className="mobile-capture-brand-logo"
            priority
          />
        </Link>

        <div className="mobile-capture-profile" ref={profileRef}>
          {profileOpen && (
            <div className="mobile-capture-profile-menu" role="menu">
              <div className="mobile-capture-profile-summary">
                <strong>{displayName}</strong>
                <span>{userEmail || "Personal"}</span>
              </div>
              <div className="mobile-capture-profile-separator" />
              <form action={signOut}>
                <button type="submit" className="mobile-capture-profile-item mobile-capture-profile-danger" role="menuitem">
                  <LogOut size={16} />
                  Sign out
                </button>
              </form>
            </div>
          )}

          <button
            type="button"
            className="mobile-capture-avatar"
            aria-label="Profile menu"
            aria-haspopup="menu"
            aria-expanded={profileOpen}
            onClick={() => setProfileOpen((open) => !open)}
          >
            {profileAvatarUrl ? (
              <span className="mobile-capture-avatar-image" style={{ backgroundImage: `url(${profileAvatarUrl})` }} />
            ) : (
              avatarInitials
            )}
          </button>
        </div>
      </nav>

      <section className="mobile-capture-body" aria-labelledby="mobile-capture-title">
        <h1 id="mobile-capture-title" className="mobile-capture-heading">
          Drop your links.
        </h1>
        <p className="mobile-capture-description">
          Paste URLs or import a file - ready on your desktop.
        </p>

        <div className="mobile-capture-textarea-wrap">
          <div className="mobile-capture-textarea-label">
            <LinkIcon size={12} aria-hidden="true" />
            <span>URLs</span>
          </div>
          <textarea
            className="mobile-capture-textarea"
            value={urls}
            onChange={handleTextChange}
            placeholder={"https://example.com\nhttps://another-site.com\nhttps://one-more.io"}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="none"
            rows={6}
            disabled={isPending}
          />
          <div className="mobile-capture-textarea-footer">
            <span className={urlCount > 0 ? "mobile-capture-count active" : "mobile-capture-count"}>
              {urlCount > 0 ? `${urlCount} URL${urlCount === 1 ? "" : "s"}` : "one per line"}
            </span>
          </div>
        </div>

        <div className="mobile-capture-divider">
          <span className="mobile-capture-divider-line" />
          <span className="mobile-capture-divider-text">or import</span>
          <span className="mobile-capture-divider-line" />
        </div>

        <button
          className="mobile-capture-file-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={isPending}
          type="button"
        >
          <span className="mobile-capture-file-icon">
            <Upload size={18} aria-hidden="true" />
          </span>
          <span className="mobile-capture-file-copy">
            <span className="mobile-capture-file-title">Upload a file</span>
            <span className="mobile-capture-file-hint">TXT, CSV or Markdown</span>
          </span>
          <ArrowRight className="mobile-capture-file-chevron" size={18} aria-hidden="true" />
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.csv,.md"
          onChange={handleFile}
          style={{ display: "none" }}
        />

        <div className="mobile-capture-actions">
          <button
            className="mobile-capture-save-btn"
            onClick={handleSave}
            disabled={isPending || urlCount === 0}
            type="button"
          >
            {isPending ? (
              <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
            ) : (
              <ArrowUpRight size={17} />
            )}
            {isPending ? "Saving..." : "Save to bookmarks"}
          </button>
          <button
            className="mobile-capture-clear-btn"
            onClick={handleClear}
            disabled={isPending}
            type="button"
            aria-label="Clear"
          >
            <X size={19} aria-hidden="true" />
          </button>
        </div>

        {savedCount > 0 && (
          <div className="mobile-capture-success" role="status">
            <CheckCircle size={16} fill="currentColor" />
            {savedCount} bookmark{savedCount === 1 ? "" : "s"} saved - ready on your desktop.
          </div>
        )}

        {errors.length > 0 && (
          <div className="mobile-capture-error" role="alert">
            <p>{errors.length} URL{errors.length === 1 ? "" : "s"} failed to save:</p>
            <ul>
              {errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <div className="mobile-capture-home-bar" aria-hidden="true">
        <div className="mobile-capture-home-pill" />
      </div>
    </main>
  );
}
