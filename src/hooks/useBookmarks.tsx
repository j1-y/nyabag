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
import type { Bookmark, CortexBookmarkSearchPayload } from "@/lib/types";
import { deleteBookmark, getBookmarks, getProcessingBookmarks, searchCortexBookmarks } from "@/lib/actions";
import { ingestReadyBookmarksToCortex } from "@/lib/cortex-actions";

export type PendingBookmark = {
  id: string;
  title: string;
  url: string;
};

type CortexSearchState =
  | { status: "idle"; query: "" }
  | { status: "loading"; query: string; previousResults: Bookmark[] }
  | { status: "success"; query: string; payload: CortexBookmarkSearchPayload }
  | { status: "error"; query: string; message: string; previousResults: Bookmark[] };

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
  isSearchLoading: boolean;
  searchError: string;
  searchHasRun: boolean;
  isCortexSearchActive: boolean;
  isCortexUnavailable: boolean;
  searchResultCount: number;
  clearSearch: () => void;
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
  filtered: Bookmark[];
}

const Ctx = createContext<BookmarksCtx | null>(null);

const DASHBOARD_REFRESH_INTERVAL_MS = 15_000;
const DASHBOARD_FOCUS_REFRESH_MIN_MS = 5_000;
const CORTEX_SEARCH_MIN_QUERY_LENGTH = 2;
const CORTEX_SEARCH_DEBOUNCE_MS = 400;
const CORTEX_INGEST_THROTTLE_MS = 30_000;

function getPreviousSearchResults(state: CortexSearchState): Bookmark[] {
  if (state.status === "success") return state.payload.bookmarks;
  if (state.status === "loading" || state.status === "error") return state.previousResults;
  return [];
}

function getBookmarkSnapshot(bookmarks: Bookmark[]) {
  return bookmarks
    .map((bookmark) => [
      bookmark.id,
      bookmark.updated_at,
      bookmark.processing_status,
      bookmark.screenshot_url ?? "",
      bookmark.long_screenshot_url ?? "",
      bookmark.cortex_status ?? "",
      bookmark.cortex_error ?? "",
      bookmark.cortex_memory_id ?? "",
      bookmark.cortex_ingested_at ?? "",
    ].join(":"))
    .join("|");
}

function isReadyForCortexIngest(bookmark: Bookmark) {
  const cortexStatus = bookmark.cortex_status ?? "pending";
  return (
    bookmark.processing_status === "ready" &&
    Boolean(bookmark.long_screenshot_url ?? bookmark.screenshot_url) &&
    (cortexStatus === "pending" || cortexStatus === "failed" || cortexStatus === "skipped")
  );
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
  const [searchState, setSearchState] = useState<CortexSearchState>({ status: "idle", query: "" });
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Bookmark | null>(null);
  const [detailTarget, setDetailTarget] = useState<Bookmark | null>(null);
  const refreshInFlightRef = useRef(false);
  const lastRefreshAtRef = useRef(0);
  const searchRequestIdRef = useRef(0);
  const cortexIngestInFlightRef = useRef(false);
  const lastCortexIngestAtRef = useRef(0);

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
    bookmark.processing_status === "processing"
  );

  const cortexIngestSnapshot = useMemo(() => {
    return bookmarks
      .filter(isReadyForCortexIngest)
      .map((bookmark) => [
        bookmark.id,
        bookmark.cortex_status ?? "pending",
        bookmark.long_screenshot_url ?? bookmark.screenshot_url ?? "",
      ].join(":"))
      .join("|");
  }, [bookmarks]);

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
          bookmark.processing_status === "processing"
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
    if (!cortexIngestSnapshot) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    if (cortexIngestInFlightRef.current) return;

    const now = Date.now();
    if (now - lastCortexIngestAtRef.current < CORTEX_INGEST_THROTTLE_MS) return;

    cortexIngestInFlightRef.current = true;
    lastCortexIngestAtRef.current = now;

    void ingestReadyBookmarksToCortex(3)
      .then((result) => {
        if (!result.success) return;
        const changed =
          result.data.attempted +
          result.data.ingested +
          result.data.failed +
          result.data.skipped;
        if (changed > 0) void refreshBookmarks();
      })
      .catch((error) => {
        console.warn("[cortex] Ready bookmark ingest trigger failed:", error);
      })
      .finally(() => {
        cortexIngestInFlightRef.current = false;
      });
  }, [cortexIngestSnapshot, refreshBookmarks]);

  useEffect(() => {
    const q = search.trim();
    if (q.length < CORTEX_SEARCH_MIN_QUERY_LENGTH) {
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

      const result = await searchCortexBookmarks(q, 20);
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
    }, CORTEX_SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [search]);

  const deleteItem = useCallback(async (id: string) => {
    const previousBookmarks = bookmarks;

    setBookmarks((prev) => prev.filter((b) => b.id !== id));
    if (detailTarget?.id === id) setDetailTarget(null);
    if (editTarget?.id === id) setEditTarget(null);

    try {
      const result = await deleteBookmark(id);
      if (!result.success) {
        console.error("Delete failed:", result.error);
        alert(`Failed to delete bookmark: ${result.error}`);
        setBookmarks(previousBookmarks);
      }
    } catch (error) {
      console.error("Delete error:", error);
      alert("An unexpected error occurred while deleting the bookmark.");
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

    if (q.length >= CORTEX_SEARCH_MIN_QUERY_LENGTH) {
      const refreshedById = new Map(bookmarks.map((bookmark) => [bookmark.id, bookmark]));

      list = rankedSearchResults
        .map((result) => {
          const refreshed = refreshedById.get(result.id) ?? result;
          return {
            ...refreshed,
            search_score: result.search_score,
            search_mode: result.search_mode,
            search_match_reasons: result.search_match_reasons,
            semantic_similarity: result.semantic_similarity,
            match_label: result.match_label,
            match_strength: result.match_strength,
          };
        });
    }

    if (activeTag !== "All") list = list.filter((b) => b.tags.includes(activeTag));
    if (activeFilter === "recent") list = list.slice(0, 10);
    return list;
  }, [activeFilter, activeTag, bookmarks, rankedSearchResults, search]);

  const activeQuery = search.trim().length >= CORTEX_SEARCH_MIN_QUERY_LENGTH;
  const isSearchLoading = searchState.status === "loading";
  const searchHasRun = searchState.status === "success" || searchState.status === "error";
  const isCortexSearchActive = searchState.status === "success" && activeQuery && searchState.payload.configured;
  const isCortexUnavailable = searchState.status === "error" && activeQuery;
  const searchError =
    searchState.status === "error"
      ? searchState.message
      : searchState.status === "success"
        ? searchState.payload.message ?? ""
        : "";
  const searchResultCount = searchState.status === "success" ? searchState.payload.result_count : filtered.length;

  const value = useMemo<BookmarksCtx>(
    () => ({
      bookmarks, setBookmarks,
      pendingBookmarks,
      addPendingBookmark,
      removePendingBookmark,
      activeTag, setActiveTag,
      activeFilter, setActiveFilter: setPersistentActiveFilter,
      search, setSearch,
      isSearchLoading,
      searchError,
      searchHasRun,
      isCortexSearchActive,
      isCortexUnavailable,
      searchResultCount,
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
      isCortexSearchActive,
      isCortexUnavailable,
      isSearchLoading,
      openAdd,
      openDetail,
      openEdit,
      openImport,
      pendingBookmarks,
      removePendingBookmark,
      search,
      searchError,
      searchHasRun,
      searchResultCount,
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
