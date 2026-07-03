"use client";

import { Search, Send, Sparkles, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useBookmarks } from "@/hooks/useBookmarks";

export function BookmarkSearchBar() {
  const {
    search,
    setSearch,
    isSemanticSearching,
    semanticError,
    searchMode,
    searchResultCount,
    temporalFilter,
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
  const statusCopy = isSemanticSearching
    ? "Searching your memory..."
    : temporalFilter
      ? searchMode === "temporal"
        ? searchResultCount > 0
          ? `${searchResultCount} ${searchResultCount === 1 ? "bookmark" : "bookmarks"} saved ${temporalFilter.label.toLowerCase()}`
          : `Saved: ${temporalFilter.label}`
        : searchResultCount > 0
          ? "Best matches"
          : "No matching bookmarks"
    : semanticError && searchResultCount === 0
      ? "No strong matches found"
      : searchResultCount > 0
        ? searchMode === "keyword"
          ? "Keyword search"
          : "Best matches"
        : semanticError || "No strong matches found";

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
        <Search size={16} />
        <input
          ref={inputRef}
          type="text"
          placeholder='Search keywords, vibe, layout, color, or pattern'
          autoComplete="on"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {hasSearch ? (
          <button type="button" className="search-clear-btn" aria-label="Clear search" onClick={clearSearch}>
            <X size={14} />
          </button>
        ) : (
          <kbd suppressHydrationWarning>{shortcutLabel}</kbd>
        )}
        <button type="submit" className="search-submit-btn" aria-label="Submit search">
          <Send size={15} fill="currentColor" />
        </button>
      </div>
      {(hasActiveSearch || semanticError) && (
        <div className="search-mode-row" aria-label="Search status">
          <span className="search-memory-status" role={semanticError ? "status" : undefined}>
            <Sparkles size={13} />
            {statusCopy}
          </span>
          {temporalFilter && searchMode !== "temporal" && (
            <span className="search-memory-status" aria-label="Temporal filter">
              Saved: {temporalFilter.label}
            </span>
          )}
        </div>
      )}
    </form>
  );
}
