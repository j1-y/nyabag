"use client";

import { HugeIcon } from "@/components/ui/huge-icon";
import { IconAdd, IconBookmark, IconDownload } from "@/components/ui/icons";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BookmarksProvider, useBookmarks } from "@/hooks/useBookmarks";
import { BookmarkCard } from "./BookmarkCard";
import { PendingBookmarkCard } from "./PendingBookmarkCard";
import { AddBookmarkModal } from "./AddBookmarkModal";
import { EditBookmarkModal } from "./EditBookmarkModal";
import { ImportReferencesModal } from "./ImportReferencesModal";
import { BookmarkSearchBar } from "./BookmarkSearchBar";
import { getBookmarkDisplayScreenshot } from "@/lib/bookmarks/screenshots";
import type { Bookmark } from "@/lib/types";

function getFirstName(profileName: string, userEmail: string) {
  const source = profileName.trim() || userEmail.split("@")[0]?.trim() || "";
  if (!source) return "there";
  return source.split(/[._\-\s]+/).filter(Boolean)[0] || "there";
}


function DashboardGreeting({
  profileName,
  userEmail,
  onNewBookmark,
  onImportReferences,
  workspaceName,
}: {
  profileName: string;
  userEmail: string;
  onNewBookmark: () => void;
  onImportReferences: () => void;
  workspaceName?: string;
}) {
  const ws = workspaceName || "Personal";
  const [prefix, setPrefix] = useState(`${ws} workspace`);
  const firstName = useMemo(() => getFirstName(profileName, userEmail), [profileName, userEmail]);

  useEffect(() => {
    const greetings = [
      `Designing in ${ws}`,
      `Welcome back to ${ws}`,
      `Creating magic in ${ws}`,
      `Your ${ws} canvas awaits`,
      `Building something great in ${ws}`,
      `Let's get to work in ${ws}`
    ];
    setPrefix(greetings[Math.floor(Math.random() * greetings.length)]);
  }, [ws]);

  return (
    <section className="dashboard-greeting dashboard-enter" aria-label="Dashboard greeting">
      <h1>{prefix}, {firstName}</h1>
      <div className="dashboard-greeting-actions">
        <button type="button" className="dashboard-new-bookmark-btn" onClick={onNewBookmark}>
          <span className="dashboard-new-bookmark-inner">
            <HugeIcon icon={IconAdd} size={18} />
            New bookmark
          </span>
        </button>
        <button type="button" className="dashboard-import-btn" onClick={onImportReferences}>
          <HugeIcon icon={IconDownload} size={18} />
          Import references
        </button>
      </div>
    </section>
  );
}

function GridInner({
  profileName,
  userEmail,
  showGreeting = true,
  workspaceName,
}: {
  profileName: string;
  userEmail: string;
  showGreeting?: boolean;
  workspaceName?: string;
}) {
  const {
    filtered,
    pendingBookmarks,
    search,
    searchHasRun,
    searchError,
    isSearchLoading,
    openAdd,
    openImport,
    openEdit,
    addOpen,
    importOpen,
    editTarget,
    deleteItem,
  } = useBookmarks();
  const router = useRouter();
  const searchParams = useSearchParams();
  const showSearchDock = !addOpen && !importOpen && !editTarget;

  useEffect(() => {
    if (searchParams.get("add") === "1") {
      openAdd();
      router.replace("/");
    }
  }, [openAdd, router, searchParams]);

  return (
    <>
      {showSearchDock && (
        <>
          <div className="dashboard-bottom-gradient" aria-hidden="true" />
          <div className="dashboard-search-dock">
            <div className="dashboard-search-inner">
              <BookmarkSearchBar />
            </div>
          </div>
        </>
      )}
      <main className="dashboard-home">
        {showGreeting && (
          <DashboardGreeting
            profileName={profileName}
            userEmail={userEmail}
            onNewBookmark={openAdd}
            onImportReferences={openImport}
            workspaceName={workspaceName}
          />
        )}

        {/* Grid */}
        {filtered.length === 0 && pendingBookmarks.length === 0 ? (
          <div className="empty-state dashboard-enter dashboard-enter-delayed">
            <div className="empty-state-icon" aria-hidden="true">
              <HugeIcon icon={IconBookmark} size={18} />
            </div>
            {search.trim().length >= 2 && searchHasRun ? (
              <>
                <h2>{searchError || "No Cortex matches"}</h2>
                <p>Try a broader phrase, another design term, or remove a filter.</p>
              </>
            ) : search.trim().length > 0 ? (
              <>
                <h2>{isSearchLoading ? "Searching Cortex..." : "No Cortex matches"}</h2>
                <p>Try a broader phrase, another design term, or remove a filter.</p>
              </>
            ) : (
              <>
                <h2>No bookmarks yet</h2>
                <p>Save websites, references, and ideas into a visual board.</p>
              </>
            )}
          </div>
        ) : (
          <div className="bm-grid view-moodboard dashboard-enter dashboard-enter-delayed">
            {pendingBookmarks.map((bookmark) => (
              <PendingBookmarkCard key={bookmark.id} bookmark={bookmark} />
            ))}
            {filtered.map((b, i) => (
              <BookmarkCard
                key={`${b.id}-${getBookmarkDisplayScreenshot(b) ?? "no-shot"}`}
                bookmark={b}
                index={i}
                onEdit={openEdit}
                onDelete={deleteItem}
              />
            ))}
          </div>
        )}
      </main>

      {/* Modals */}
      <AddBookmarkModal />
      <ImportReferencesModal />
      <EditBookmarkModal />
    </>
  );
}

export function BookmarkGrid({
  initialBookmarks,
  userEmail,
  profileName,
  showGreeting = true,
  workspaceName,
}: {
  initialBookmarks: Bookmark[];
  userEmail: string;
  profileName: string;
  showGreeting?: boolean;
  workspaceName?: string;
}) {
  return (
    <BookmarksProvider initial={initialBookmarks}>
      <GridInner profileName={profileName} userEmail={userEmail} showGreeting={showGreeting} workspaceName={workspaceName} />
    </BookmarksProvider>
  );
}
