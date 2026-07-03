"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { BOOKMARK_SEARCH_CONFIG } from "@/lib/bookmark-search/config";
import type { BookmarkSearchMode, BookmarkSearchResult, SearchState } from "@/lib/bookmark-search/types";
import type { TemporalFilter } from "@/lib/bookmark-search/temporal-query";
import type { Bookmark } from "@/lib/types";
import { deleteBookmark, getBookmarks, getProcessingBookmarks } from "@/lib/actions";
import { searchBookmarksByMemory } from "@/lib/semantic/actions";

export type PendingBookmark = {
  id: string;
  title: string;
  url: string;
};

interface BookmarksCtx {
  bookmarks: Bookmark[];
  setBookmarks: Dispatch<SetStateAction<Bookmark[]>>;
  pendingBookmarks: PendingBookmark[];
  addPendingBookmark: (bookmark: PendingBookmark) => void;
  removePendingBookmark: (id: string) => void;
  activeTag: string;
  setActiveTag: (t: string) => void;
  activeFilter: "all" | "recent";
  setActiveFilter: (f: "all" | "recent") => void;
  search: string;
  setSearch: (s: string) => void;
  isSemanticSearching: boolean;
  semanticError: string;
  semanticHasRun: boolean;
  searchMode: BookmarkSearchMode;
  searchResultCount: number;
  temporalFilter?: Omit<TemporalFilter, "sourceText">;
  effectiveSearchQuery: string;
  clearSearch: () => void;
  // Modal state
  addOpen: boolean;
  openAdd: () => void;
  closeAdd: () => void;
  importOpen: boolean;
  openImport: () => void;
  closeImport: () => void;
  editTarget: Bookmark | null;
  openEdit: (b: Bookmark) => void;
  closeEdit: () => void;
  detailTarget: Bookmark | null;
  openDetail: (b: Bookmark) => void;
  closeDetail: () => void;
  deleteItem: (id: string) => void;
  // Derived
  filtered: Bookmark[];
}

const Ctx = createContext<BookmarksCtx | null>(null);

const DASHBOARD_REFRESH_INTERVAL_MS = 15_000;
const DASHBOARD_FOCUS_REFRESH_MIN_MS = 5_000;

function getPreviousSearchResults(state: SearchState): BookmarkSearchResult[] {
  if (state.status === "success") return state.payload.bookmarks;
  if (state.status === "loading" || state.status === "error") return state.previousResults;
  return [];
}

function getBrowserSearchContext() {
  if (typeof window === "undefined") return { timeZone: "UTC", locale: "en-US" };
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const locale = navigator.language || "en-US";
  return { timeZone, locale };
}

function getBookmarkSnapshot(bookmarks: Bookmark[]) {
  return bookmarks
    .map((bookmark) => [
      bookmark.id,
      bookmark.updated_at,
      bookmark.processing_status,
      bookmark.semantic_status ?? "",
      bookmark.screenshot_url ?? "",
      bookmark.long_screenshot_url ?? "",
      bookmark.ai_metadata?.updated_at ?? "",
    ].join(":"))
    .join("|");
}

export function BookmarksProvider({
  children,
  initial,
}: {
  children: ReactNode;
  initial: Bookmark[];
}) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(initial);
  const [pendingBookmarks, setPendingBookmarks] = useState<PendingBookmark[]>([]);
  const [activeTag, setActiveTag] = useState("All");
  const [activeFilter, setActiveFilter] = useState<"all" | "recent">(() => {
    if (typeof window === "undefined") return "all";
    try {
      const stored = window.localStorage.getItem("nyabag:dashboard-filter");
      return stored === "all" || stored === "recent" ? stored : "all";
    } catch {
      return "all";
    }
  });
  const [search, setSearch] = useState("");
  const [searchState, setSearchState] = useState<SearchState>({ status: "idle", query: "" });
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Bookmark | null>(null);
  const [detailTarget, setDetailTarget] = useState<Bookmark | null>(null);
  const refreshInFlightRef = useRef(false);
  const lastRefreshAtRef = useRef(0);
  const searchRequestIdRef = useRef(0);

  const setPersistentActiveFilter = useCallback((filter: "all" | "recent") => {
    setActiveFilter(filter);
    try {
      window.localStorage.setItem("nyabag:dashboard-filter", filter);
    } catch {
      // Do not store private bookmark data; ignore preference storage failures.
    }
  }, []);

  const hasActiveProcessing = bookmarks.some((bookmark) =>
    bookmark.processing_status === "queued" ||
    bookmark.processing_status === "processing" ||
    bookmark.semantic_status === "processing"
  );

  const refreshBookmarks = useCallback(async () => {
    if (refreshInFlightRef.current) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;

    refreshInFlightRef.current = true;
    lastRefreshAtRef.current = Date.now();

    try {
      const result = await getBookmarks();
      if (!result.success) return;

      setBookmarks((current) => {
        const currentSnapshot = getBookmarkSnapshot(current);
        const nextSnapshot = getBookmarkSnapshot(result.data);
        if (currentSnapshot === nextSnapshot) return current;
        return result.data;
      });
    } finally {
      refreshInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void refreshBookmarks();
    }, DASHBOARD_REFRESH_INTERVAL_MS);

    function refreshOnFocus() {
      if (Date.now() - lastRefreshAtRef.current < DASHBOARD_FOCUS_REFRESH_MIN_MS) return;
      void refreshBookmarks();
    }

    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshOnFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshOnFocus);
    };
  }, [refreshBookmarks]);

  useEffect(() => {
    if (!hasActiveProcessing) return;

    let attempts = 0;
    let cancelled = false;
    let timeout: number | null = null;
    const maxAttempts = 60;

    async function refreshProcessingBookmarks() {
      attempts += 1;
      const result = await getProcessingBookmarks();
      if (cancelled) return;

      let stillProcessing = true;
      if (result.success) {
        setBookmarks(result.data);
        stillProcessing = result.data.some((bookmark) =>
          bookmark.processing_status === "queued" ||
          bookmark.processing_status === "processing" ||
          bookmark.semantic_status === "processing"
        );
      }

      if (!stillProcessing || attempts >= maxAttempts) return;

      const nextDelay = attempts < 5 ? 3_000 : 10_000;
      timeout = window.setTimeout(refreshProcessingBookmarks, nextDelay);
    }

    void refreshProcessingBookmarks();

    return () => {
      cancelled = true;
      if (timeout) window.clearTimeout(timeout);
    };
  }, [hasActiveProcessing]);

  useEffect(() => {
    const q = search.trim();
    if (q.length < BOOKMARK_SEARCH_CONFIG.minQueryLength) {
      searchRequestIdRef.current += 1;
      const timeout = window.setTimeout(() => {
        setSearchState({ status: "idle", query: "" });
      }, 0);
      return () => window.clearTimeout(timeout);
    }

    const requestId = searchRequestIdRef.current + 1;
    searchRequestIdRef.current = requestId;

    const timeout = window.setTimeout(async () => {
      setSearchState((current) => ({
        status: "loading",
        query: q,
        previousResults: getPreviousSearchResults(current),
      }));

      const searchContext = getBrowserSearchContext();
      const result = await searchBookmarksByMemory(q, searchContext);
      if (searchRequestIdRef.current !== requestId) return;

      if (!result.success) {
        setSearchState((current) => ({
          status: "error",
          query: q,
          message: result.error,
          previousResults: getPreviousSearchResults(current),
        }));
        return;
      }

      setSearchState({ status: "success", query: q, payload: result.data });
    }, BOOKMARK_SEARCH_CONFIG.debounceMs);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [search]);

  const deleteItem = useCallback(async (id: string) => {
    // Keep reference to previous state for rollback
    const previousBookmarks = bookmarks;
    
    // Optimistic UI update
    setBookmarks((prev) => prev.filter((b) => b.id !== id));
    if (detailTarget?.id === id) setDetailTarget(null);
    if (editTarget?.id === id) setEditTarget(null);
    
    try {
      const result = await deleteBookmark(id);
      if (!result.success) {
        console.error("Delete failed:", result.error);
        alert(`Failed to delete bookmark: ${result.error}`);
        // Revert optimistic update
        setBookmarks(previousBookmarks);
      }
    } catch (error) {
      console.error("Delete error:", error);
      alert("An unexpected error occurred while deleting the bookmark.");
      // Revert optimistic update
      setBookmarks(previousBookmarks);
    }
  }, [bookmarks, detailTarget?.id, editTarget?.id]);

  const addPendingBookmark = useCallback((bookmark: PendingBookmark) => {
    setPendingBookmarks((prev) => [bookmark, ...prev]);
  }, []);

  const removePendingBookmark = useCallback((id: string) => {
    setPendingBookmarks((prev) => prev.filter((bookmark) => bookmark.id !== id));
  }, []);

  const openAdd = useCallback(() => setAddOpen(true), []);
  const closeAdd = useCallback(() => setAddOpen(false), []);
  const openImport = useCallback(() => setImportOpen(true), []);
  const closeImport = useCallback(() => setImportOpen(false), []);
  const openEdit = useCallback((b: Bookmark) => setEditTarget(b), []);
  const closeEdit = useCallback(() => setEditTarget(null), []);
  const openDetail = useCallback((b: Bookmark) => setDetailTarget(b), []);
  const closeDetail = useCallback(() => setDetailTarget(null), []);
  const clearSearch = useCallback(() => {
    searchRequestIdRef.current += 1;
    setSearch("");
    setSearchState({ status: "idle", query: "" });
  }, []);

  const rankedSearchResults = useMemo(() => getPreviousSearchResults(searchState), [searchState]);

  const filtered = useMemo(() => {
    const q = search.trim();
    let list: Bookmark[] = [...bookmarks];

    if (q.length >= BOOKMARK_SEARCH_CONFIG.minQueryLength) {
      const refreshedById = new Map(bookmarks.map((bookmark) => [bookmark.id, bookmark]));

      list = rankedSearchResults
        .map((result) => {
          const refreshed = refreshedById.get(result.id);
          if (!refreshed) return null;
          return {
            ...refreshed,
            search_score: result.search_score,
            search_mode: result.search_mode,
            search_match_reasons: result.search_match_reasons,
            lexical_score: result.lexical_score,
            exact_match_score: result.exact_match_score,
            semantic_similarity: result.semantic_similarity,
            semantic_match_reasons: result.semantic_match_reasons,
            match_label: result.match_label,
            match_strength: result.match_strength,
            visual_match_evidence: result.visual_match_evidence,
            visual_score_breakdown: result.visual_score_breakdown,
          } satisfies BookmarkSearchResult;
        })
        .filter(Boolean) as Bookmark[];
    }

    if (activeTag !== "All") list = list.filter((b) => b.tags.includes(activeTag));
    if (activeFilter === "recent") list = list.slice(0, 10);
    return list;
  }, [activeFilter, activeTag, bookmarks, rankedSearchResults, search]);

  const isSemanticSearching = searchState.status === "loading";
  const semanticHasRun = searchState.status === "success" || searchState.status === "error";
  const semanticError =
    searchState.status === "error"
      ? searchState.message
      : searchState.status === "success"
        ? searchState.payload.message ?? ""
        : "";
  const searchMode = searchState.status === "success" ? searchState.payload.mode : "keyword";
  const searchResultCount = searchState.status === "success" ? searchState.payload.result_count : filtered.length;
  const temporalFilter = searchState.status === "success" ? searchState.payload.temporalFilter : undefined;
  const effectiveSearchQuery = searchState.status === "success" ? searchState.payload.effectiveQuery : search.trim();

  const value = useMemo<BookmarksCtx>(
    () => ({
      bookmarks, setBookmarks,
      pendingBookmarks,
      addPendingBookmark,
      removePendingBookmark,
      activeTag, setActiveTag,
      activeFilter, setActiveFilter: setPersistentActiveFilter,
      search, setSearch,
      isSemanticSearching,
      semanticError,
      semanticHasRun,
      searchMode,
      searchResultCount,
      temporalFilter,
      effectiveSearchQuery,
      clearSearch,
      addOpen,
      openAdd,
      closeAdd,
      importOpen,
      openImport,
      closeImport,
      editTarget,
      openEdit,
      closeEdit,
      detailTarget,
      openDetail,
      closeDetail,
      deleteItem,
      filtered,
    }),
    [
      activeFilter,
      activeTag,
      addOpen,
      addPendingBookmark,
      bookmarks,
      closeAdd,
      closeDetail,
      closeEdit,
      closeImport,
      clearSearch,
      deleteItem,
      detailTarget,
      editTarget,
      filtered,
      importOpen,
      openAdd,
      openDetail,
      openEdit,
      openImport,
      pendingBookmarks,
      removePendingBookmark,
      search,
      searchMode,
      searchResultCount,
      temporalFilter,
      effectiveSearchQuery,
      semanticError,
      semanticHasRun,
      isSemanticSearching,
      setPersistentActiveFilter,
    ]
  );

  return (
    <Ctx.Provider value={value}>
      {children}
    </Ctx.Provider>
  );
}

export function useBookmarks(): BookmarksCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useBookmarks must be used within BookmarksProvider");
  return ctx;
}
