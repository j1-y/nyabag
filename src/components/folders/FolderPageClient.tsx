"use client";

import { HugeIcon } from "@/components/ui/huge-icon";
import { IconGrid, IconList } from "@/components/ui/icons";
import { useMemo, useState } from "react";
;
import { BookmarksProvider, useBookmarks } from "@/hooks/useBookmarks";
import { AddBookmarkModal } from "@/components/bookmarks/AddBookmarkModal";
import { EditBookmarkModal } from "@/components/bookmarks/EditBookmarkModal";
import { DeleteBookmarkDialog } from "@/components/bookmarks/DeleteBookmarkDialog";
import { BookmarkCard } from "@/components/bookmarks/BookmarkCard";
import { FolderBreadcrumbs } from "@/components/folders/FolderBreadcrumbs";
import { FolderCard } from "@/components/folders/FolderCard";
import { FolderDetailHeader } from "@/components/folders/FolderDetailHeader";
import { FolderEmptyState } from "@/components/folders/FolderEmptyState";
import { FolderBookmarkRow } from "@/components/folders/FolderBookmarkRow";
import type { Bookmark, BookmarkFolder } from "@/lib/types";

type SortKey = "date" | "title" | "domain";
type ViewMode = "list" | "grid";

type Props = {
  initialBookmarks: Bookmark[];
  currentFolder: BookmarkFolder | null;
  subfolders: BookmarkFolder[];
  breadcrumbs: BookmarkFolder[];
  isInbox: boolean;
  allFolders: BookmarkFolder[];
};

/** Public entry point — wraps everything in BookmarksProvider */
export function FolderPageClient(props: Props) {
  return (
    <BookmarksProvider initial={props.initialBookmarks}>
      <FolderPageInner {...props} />
    </BookmarksProvider>
  );
}

/** Inner component — can call useBookmarks() */
function FolderPageInner({
  currentFolder,
  subfolders,
  breadcrumbs,
  isInbox,
  allFolders,
}: Props) {
  const { filtered, openAdd, openEdit, deleteItem } = useBookmarks();
  const [sort, setSort] = useState<SortKey>("date");
  const [view, setView] = useState<ViewMode>("list");

  // Shared delete dialog state — avoids per-row Radix Portal breaking flex layout
  const [pendingDelete, setPendingDelete] = useState<Bookmark | null>(null);

  const sortedBookmarks = useMemo<Bookmark[]>(() => {
    const arr = [...filtered];
    switch (sort) {
      case "title":
        arr.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case "domain": {
        const host = (url: string) => {
          try {
            return new URL(url).hostname.replace(/^www\./, "");
          } catch {
            return url;
          }
        };
        arr.sort((a, b) => host(a.url).localeCompare(host(b.url)));
        break;
      }
      default:
        arr.sort(
          (a, b) =>
            new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime()
        );
    }
    return arr;
  }, [filtered, sort]);

  const isEmpty = subfolders.length === 0 && filtered.length === 0;

  return (
    <div className="folder-page-wrapper">
      {/* Breadcrumbs */}
      <FolderBreadcrumbs
        breadcrumbs={breadcrumbs}
        isInbox={isInbox}
      />

      {/* Page header */}
      <FolderDetailHeader
        folder={currentFolder}
        isInbox={isInbox}
        bookmarkCount={filtered.length}
        subfolderCount={subfolders.length}
        allFolders={allFolders}
        onAddBookmark={openAdd}
        viewToggleNode={
          <div className="folder-view-toggle">
            <button
              type="button"
              className={`folder-view-btn${view === "list" ? " active" : ""}`}
              onClick={() => setView("list")}
              aria-pressed={view === "list"}
              aria-label="Switch to list view"
              title="List view"
            >
              <HugeIcon icon={IconList} size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={`folder-view-btn${view === "grid" ? " active" : ""}`}
              onClick={() => setView("grid")}
              aria-pressed={view === "grid"}
              aria-label="Switch to grid view"
              title="Grid view"
            >
              <HugeIcon icon={IconGrid} size={18} aria-hidden="true" />
            </button>
          </div>
        }
      />

      {isEmpty ? (
        <FolderEmptyState isInbox={isInbox} />
      ) : (
        <>
          {/* Subfolders grid */}
          {subfolders.length > 0 && (
            <section className="folder-recent-section">
              <h2 className="folder-section-label">
                Recent <span className="folder-section-count">{subfolders.length}</span>
              </h2>
              <div className="folder-card-grid-new">
                {subfolders.map((sf) => (
                  <FolderCard key={sf.id} folder={sf} />
                ))}
              </div>
            </section>
          )}

          {/* Bookmarks */}
          {filtered.length > 0 && (
            <section className="folder-table-section" style={{ border: "1px solid #ebebeb", borderRadius: 8, overflow: "hidden" }}>
              {/* List view */}
              {view === "list" && (
                <>
                  <div className="folder-table-header">
                    <div className="folder-table-th" style={{ flex: 1, paddingLeft: 12 }}>File name</div>
                    <div className="folder-table-th folder-bm-date" style={{ width: 200 }}>Date added</div>
                    <div className="folder-table-th" style={{ width: 180 }}>Action</div>
                  </div>
                  <div className="folder-bm-list">
                    {sortedBookmarks.map((bm) => (
                      <FolderBookmarkRow
                        key={bm.id}
                        bookmark={bm}
                        onEdit={openEdit}
                        onDelete={setPendingDelete}
                        isInbox={isInbox}
                      />
                    ))}
                  </div>
                </>
              )}

              {/* Moodboard / grid view */}
              {view === "grid" && (
                <div className="bm-grid view-moodboard">
                  {sortedBookmarks.map((bm, i) => (
                    <BookmarkCard
                      key={bm.id}
                      bookmark={bm}
                      index={i}
                      onEdit={openEdit}
                      onDelete={deleteItem}
                    />
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}

      {/* Modals — all rendered at top level, inside BookmarksProvider */}
      <AddBookmarkModal />
      <EditBookmarkModal />

      {/* One shared delete dialog — avoids per-row Portal causing layout issues */}
      <DeleteBookmarkDialog
        title={pendingDelete?.title ?? ""}
        open={pendingDelete !== null}
        onOpenChange={(open) => { if (!open) setPendingDelete(null); }}
        onConfirm={() => {
          if (pendingDelete) {
            deleteItem(pendingDelete.id);
            setPendingDelete(null);
          }
        }}
      />
    </div>
  );
}
