"use client";

import { HugeIcon } from "@/components/ui/huge-icon";
import { IconClose, IconSearch, IconSend, IconSparkles } from "@/components/ui/icons";
import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useBookmarks } from "@/hooks/useBookmarks";

export function BookmarkSearchBar() {
  const {
    search,
    setSearch,
    isSearchLoading,
    searchError,
    searchResultCount,
    isCortexSearchActive,
    isCortexUnavailable,
    clearSearch,
    addOpen,
    importOpen,
    editTarget,
  } = useBookmarks();
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasOpenModal = addOpen || importOpen || Boolean(editTarget);
  const shortcutLabel =
    typeof navigator !== "undefined" && /mac/i.test(navigator.platform)
      ? "Cmd K"
      : "Ctrl K";

  useEffect(() => {
    if (searchParams.get("search") !== "1") return;

    if (!hasOpenModal && searchParams.get("add") !== "1") {
      inputRef.current?.focus();
    }

    router.replace("/");
  }, [hasOpenModal, router, searchParams]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (hasOpenModal) return;
      if (event.key.toLowerCase() !== "k") return;
      if (!event.ctrlKey && !event.metaKey) return;

      event.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hasOpenModal]);

  if (hasOpenModal) return null;

  const hasSearch = search.trim().length > 0;
  const hasActiveSearch = search.trim().length >= 2;
  const statusCopy = isSearchLoading
    ? "Searching Cortex..."
    : isCortexUnavailable
      ? "Cortex search unavailable"
      : isCortexSearchActive && searchResultCount > 0
        ? "AI search active"
        : isCortexSearchActive
          ? "No Cortex matches"
          : searchError || "Cortex search";

  return (
    <form
      className="bookmark-search-bar bookmark-controls"
      aria-label="Bookmark search"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        inputRef.current?.focus();
      }}
    >
      <div className="search-wrap">
        <HugeIcon icon={IconSearch} size={18} />
        <input
          ref={inputRef}
          type="text"
          placeholder='Search icons by keyword, style, or vibe…'
          autoComplete="on"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {hasSearch ? (
          <button type="button" className="search-clear-btn" aria-label="Clear search" onClick={clearSearch}>
            <HugeIcon icon={IconClose} size={18} />
          </button>
        ) : (
          <kbd suppressHydrationWarning>{shortcutLabel}</kbd>
        )}
        <button type="submit" className="search-submit-btn" aria-label="Submit search">
          <HugeIcon icon={IconSend} size={18} />
        </button>
      </div>
      {(hasActiveSearch || searchError) && (
        <div className="search-mode-row" aria-label="IconSearch status">
          <span className="search-memory-status" role={searchError ? "status" : undefined}>
            <HugeIcon icon={IconSparkles} size={18} />
            {statusCopy}
          </span>
        </div>
      )}
    </form>
  );
}
