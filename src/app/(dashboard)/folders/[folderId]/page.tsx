import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getFolderBreadcrumbs } from "@/lib/folders";
import { attachAiMetadataToBookmarks } from "@/lib/bookmarks/ai-metadata";
import { FolderPageClient } from "@/components/folders/FolderPageClient";
import type { Bookmark, BookmarkFolder } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function FolderPage({
  params,
}: {
  params: Promise<{ folderId: string }>;
}) {
  const { folderId } = await params;
  const isInbox = folderId === "inbox";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) notFound();

  // All folders — needed for breadcrumbs, subfolder list, and sidebar tree
  const { data: allFoldersData } = await supabase
    .from("bookmark_folders")
    .select("*")
    .eq("user_id", user.id)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  const allFolders = (allFoldersData ?? []) as BookmarkFolder[];

  // Resolve current folder, subfolders, and breadcrumbs
  let currentFolder: BookmarkFolder | null = null;
  let subfolders: BookmarkFolder[] = [];
  let breadcrumbs: BookmarkFolder[] = [];

  if (!isInbox) {
    currentFolder = allFolders.find((f) => f.id === folderId) ?? null;
    if (!currentFolder) notFound();

    subfolders = allFolders.filter((f) => f.parent_id === folderId);
    breadcrumbs = getFolderBreadcrumbs(allFolders, folderId);
  }

  // Bookmarks for this folder (or inbox)
  const bookmarksQuery = isInbox
    ? supabase
        .from("bookmarks")
        .select("*")
        .eq("user_id", user.id)
        .is("folder_id", null)
        .order("created_at", { ascending: false })
    : supabase
        .from("bookmarks")
        .select("*")
        .eq("user_id", user.id)
        .eq("folder_id", folderId)
        .order("created_at", { ascending: false });

  const { data: bookmarksData, error: bookmarksError } = await bookmarksQuery;

  if (bookmarksError) {
    return (
      <div className="empty-state">
        <p>Failed to load bookmarks. Please refresh.</p>
      </div>
    );
  }

  const rawBookmarks = (bookmarksData ?? []) as Bookmark[];
  const bookmarks = await attachAiMetadataToBookmarks(
    supabase,
    rawBookmarks,
    user.id
  );

  return (
    <FolderPageClient
      initialBookmarks={bookmarks}
      currentFolder={currentFolder}
      subfolders={subfolders}
      breadcrumbs={breadcrumbs}
      isInbox={isInbox}
      allFolders={allFolders}
    />
  );
}
