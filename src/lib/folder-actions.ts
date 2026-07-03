"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  folderCreateSchema,
  folderUpdateSchema,
  moveBookmarkToFolderSchema,
  type FolderCreateInput,
  type FolderUpdateInput,
} from "@/lib/validations";
import {
  getFolderDepth,
  getFolderDescendantIds,
  isDescendantFolder,
} from "@/lib/folders";
import type { ActionResult, Bookmark, BookmarkFolder } from "@/lib/types";

const MAX_FOLDER_DEPTH = 4;

// ── Helpers ───────────────────────────────────────────────────

async function getAuthUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

async function getAllUserFoldersRaw(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<BookmarkFolder[]> {
  const { data } = await supabase
    .from("bookmark_folders")
    .select("*")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  return (data ?? []) as BookmarkFolder[];
}

async function getMaxSiblingSortOrder(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  parentId: string | null | undefined
): Promise<number> {
  const query = supabase
    .from("bookmark_folders")
    .select("sort_order")
    .eq("user_id", userId)
    .order("sort_order", { ascending: false })
    .limit(1);

  if (parentId) {
    query.eq("parent_id", parentId);
  } else {
    query.is("parent_id", null);
  }

  const { data } = await query;
  return (data?.[0]?.sort_order ?? 0) + 1;
}

async function checkDuplicateSiblingName(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  name: string,
  parentId: string | null | undefined,
  excludeId?: string
): Promise<boolean> {
  const query = supabase
    .from("bookmark_folders")
    .select("id")
    .eq("user_id", userId)
    .ilike("name", name.trim());

  if (parentId) {
    query.eq("parent_id", parentId);
  } else {
    query.is("parent_id", null);
  }

  if (excludeId) {
    query.neq("id", excludeId);
  }

  const { data } = await query;
  return (data?.length ?? 0) > 0;
}

// ── Fetch actions ─────────────────────────────────────────────

export async function getBookmarkFolders(): Promise<ActionResult<BookmarkFolder[]>> {
  const { supabase, user } = await getAuthUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const folders = await getAllUserFoldersRaw(supabase, user.id);
  return { success: true, data: folders };
}

export async function getFolderById(folderId: string): Promise<ActionResult<BookmarkFolder>> {
  const { supabase, user } = await getAuthUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const { data, error } = await supabase
    .from("bookmark_folders")
    .select("*")
    .eq("id", folderId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: "Folder not found" };

  return { success: true, data: data as BookmarkFolder };
}

export async function getBookmarksByFolder(folderId: string): Promise<ActionResult<Bookmark[]>> {
  const { supabase, user } = await getAuthUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const { data, error } = await supabase
    .from("bookmarks")
    .select("*")
    .eq("user_id", user.id)
    .eq("folder_id", folderId)
    .order("created_at", { ascending: false });

  if (error) return { success: false, error: error.message };
  return { success: true, data: (data ?? []) as Bookmark[] };
}

export async function getInboxBookmarks(): Promise<ActionResult<Bookmark[]>> {
  const { supabase, user } = await getAuthUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const { data, error } = await supabase
    .from("bookmarks")
    .select("*")
    .eq("user_id", user.id)
    .is("folder_id", null)
    .order("created_at", { ascending: false });

  if (error) return { success: false, error: error.message };
  return { success: true, data: (data ?? []) as Bookmark[] };
}

// ── Create ────────────────────────────────────────────────────

export async function createBookmarkFolder(
  input: FolderCreateInput
): Promise<ActionResult<BookmarkFolder>> {
  const { supabase, user } = await getAuthUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const parsed = folderCreateSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid folder data" };
  }

  const { name, parent_id, description, color, icon } = parsed.data;

  // Load all user folders for depth/cycle checks
  const allFolders = await getAllUserFoldersRaw(supabase, user.id);

  // Validate parent ownership and depth
  if (parent_id) {
    const parentFolder = allFolders.find((f) => f.id === parent_id);
    if (!parentFolder) {
      return { success: false, error: "Parent folder not found or not owned by you" };
    }

    const parentDepth = getFolderDepth(allFolders, parent_id);
    if (parentDepth + 1 >= MAX_FOLDER_DEPTH) {
      return {
        success: false,
        error: `Cannot create subfolder: maximum nesting depth of ${MAX_FOLDER_DEPTH} levels reached`,
      };
    }
  }

  // Check for duplicate sibling name
  const isDuplicate = await checkDuplicateSiblingName(supabase, user.id, name, parent_id);
  if (isDuplicate) {
    return {
      success: false,
      error: "A folder with this name already exists at this level",
    };
  }

  const sortOrder = await getMaxSiblingSortOrder(supabase, user.id, parent_id);

  const { data, error } = await supabase
    .from("bookmark_folders")
    .insert({
      user_id: user.id,
      parent_id: parent_id ?? null,
      name: name.trim(),
      description: description ?? "",
      color: color ?? null,
      icon: icon ?? null,
      sort_order: sortOrder,
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message };

  revalidatePath("/");
  if (parent_id) revalidatePath(`/folders/${parent_id}`);

  return { success: true, data: data as BookmarkFolder };
}

// ── Update ────────────────────────────────────────────────────

export async function updateBookmarkFolder(
  input: FolderUpdateInput
): Promise<ActionResult<BookmarkFolder>> {
  const { supabase, user } = await getAuthUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const parsed = folderUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid folder data" };
  }

  const { id, name, parent_id, description, color, icon, sort_order } = parsed.data;

  // Load all user folders for all checks
  const allFolders = await getAllUserFoldersRaw(supabase, user.id);
  const targetFolder = allFolders.find((f) => f.id === id);
  if (!targetFolder) return { success: false, error: "Folder not found or not owned by you" };

  // Validate reparenting
  if (parent_id !== undefined) {
    if (parent_id === id) {
      return { success: false, error: "A folder cannot be its own parent" };
    }

    if (parent_id !== null) {
      const parentFolder = allFolders.find((f) => f.id === parent_id);
      if (!parentFolder) {
        return { success: false, error: "Parent folder not found or not owned by you" };
      }

      // Prevent moving into own descendant
      if (isDescendantFolder(allFolders, parent_id, id)) {
        return { success: false, error: "Cannot move a folder into its own subfolder" };
      }

      // Check max depth after reparenting
      const parentDepth = getFolderDepth(allFolders, parent_id);
      const selfSubtreeDepth = getSubtreeDepth(allFolders, id);
      if (parentDepth + 1 + selfSubtreeDepth >= MAX_FOLDER_DEPTH) {
        return {
          success: false,
          error: `Cannot move folder here: would exceed maximum nesting depth of ${MAX_FOLDER_DEPTH}`,
        };
      }
    }
  }

  // Check for duplicate sibling name (on rename or reparent)
  const effectiveParentId = parent_id !== undefined ? parent_id : targetFolder.parent_id;
  const effectiveName = name ?? targetFolder.name;
  const isDuplicate = await checkDuplicateSiblingName(
    supabase,
    user.id,
    effectiveName,
    effectiveParentId,
    id
  );
  if (isDuplicate) {
    return {
      success: false,
      error: "A folder with this name already exists at this level",
    };
  }

  const updatePayload: Record<string, unknown> = {};
  if (name !== undefined) updatePayload.name = name.trim();
  if (parent_id !== undefined) updatePayload.parent_id = parent_id;
  if (description !== undefined) updatePayload.description = description;
  if (color !== undefined) updatePayload.color = color;
  if (icon !== undefined) updatePayload.icon = icon;
  if (sort_order !== undefined) updatePayload.sort_order = sort_order;

  const { data, error } = await supabase
    .from("bookmark_folders")
    .update(updatePayload)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return { success: false, error: error.message };

  revalidatePath("/");
  revalidatePath(`/folders/${id}`);
  if (targetFolder.parent_id) revalidatePath(`/folders/${targetFolder.parent_id}`);
  if (effectiveParentId) revalidatePath(`/folders/${effectiveParentId}`);

  return { success: true, data: data as BookmarkFolder };
}

// ── Delete ────────────────────────────────────────────────────

export async function deleteBookmarkFolder(folderId: string): Promise<ActionResult> {
  const { supabase, user } = await getAuthUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const allFolders = await getAllUserFoldersRaw(supabase, user.id);
  const targetFolder = allFolders.find((f) => f.id === folderId);
  if (!targetFolder) return { success: false, error: "Folder not found or not owned by you" };

  // Get all descendant folder IDs (including the folder itself)
  const descendantIds = getFolderDescendantIds(allFolders, folderId);
  const allFolderIds = [folderId, ...descendantIds];

  // Null out folder_id for all bookmarks in this folder subtree
  // (Database ON DELETE SET NULL handles this automatically, but we do it explicitly
  // to be safe and to ensure revalidation works correctly)
  const { error: nullifyError } = await supabase
    .from("bookmarks")
    .update({ folder_id: null })
    .eq("user_id", user.id)
    .in("folder_id", allFolderIds);

  if (nullifyError) return { success: false, error: nullifyError.message };

  // Delete the folder (CASCADE deletes descendants)
  const { error: deleteError } = await supabase
    .from("bookmark_folders")
    .delete()
    .eq("id", folderId)
    .eq("user_id", user.id);

  if (deleteError) return { success: false, error: deleteError.message };

  revalidatePath("/");
  revalidatePath("/folders/inbox");
  if (targetFolder.parent_id) revalidatePath(`/folders/${targetFolder.parent_id}`);

  return { success: true, data: undefined };
}

// ── Move bookmark ─────────────────────────────────────────────

export async function moveBookmarkToFolder(
  bookmarkId: string,
  folderId: string | null
): Promise<ActionResult<Bookmark>> {
  const { supabase, user } = await getAuthUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const parsed = moveBookmarkToFolderSchema.safeParse({ bookmark_id: bookmarkId, folder_id: folderId });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  // Verify bookmark ownership
  const { data: bookmark, error: bookmarkError } = await supabase
    .from("bookmarks")
    .select("id, folder_id")
    .eq("id", bookmarkId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (bookmarkError) return { success: false, error: bookmarkError.message };
  if (!bookmark) return { success: false, error: "Bookmark not found" };

  // Verify folder ownership if provided
  if (folderId !== null) {
    const { data: folder } = await supabase
      .from("bookmark_folders")
      .select("id")
      .eq("id", folderId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!folder) return { success: false, error: "Folder not found or not owned by you" };
  }

  const { data, error } = await supabase
    .from("bookmarks")
    .update({ folder_id: folderId })
    .eq("id", bookmarkId)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return { success: false, error: error.message };

  revalidatePath("/");
  revalidatePath(`/bookmarks/${bookmarkId}`);
  revalidatePath("/folders/inbox");
  if (folderId) revalidatePath(`/folders/${folderId}`);
  if (bookmark.folder_id) revalidatePath(`/folders/${bookmark.folder_id}`);

  return { success: true, data: data as Bookmark };
}

export async function bulkMoveBookmarksToFolder(
  bookmarkIds: string[],
  folderId: string | null
): Promise<ActionResult<{ count: number }>> {
  const { supabase, user } = await getAuthUser();
  if (!user) return { success: false, error: "Not authenticated" };

  if (bookmarkIds.length === 0) return { success: true, data: { count: 0 } };

  // Verify folder ownership if provided
  if (folderId !== null) {
    const { data: folder } = await supabase
      .from("bookmark_folders")
      .select("id")
      .eq("id", folderId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!folder) return { success: false, error: "Folder not found or not owned by you" };
  }

  const { error } = await supabase
    .from("bookmarks")
    .update({ folder_id: folderId })
    .eq("user_id", user.id)
    .in("id", bookmarkIds);

  if (error) return { success: false, error: error.message };

  revalidatePath("/");
  if (folderId) revalidatePath(`/folders/${folderId}`);
  revalidatePath("/folders/inbox");

  return { success: true, data: { count: bookmarkIds.length } };
}

// ── Internal helpers ──────────────────────────────────────────

function getSubtreeDepth(folders: BookmarkFolder[], folderId: string, current = 0): number {
  const children = folders.filter((f) => f.parent_id === folderId);
  if (children.length === 0) return current;
  return Math.max(...children.map((c) => getSubtreeDepth(folders, c.id, current + 1)));
}
