import { createClient } from "@/lib/supabase/server";
import { timeAsync } from "@/lib/perf";
import { getWorkspaceContext } from "@/lib/workspaces";
import type { CanvasNote, CanvasSection } from "@/lib/types";

export const CANVAS_NOTE_COLUMNS = [
  "id",
  "user_id",
  "workspace_id",
  "section_id",
  "type",
  "content",
  "media_source",
  "media_path",
  "media_mime",
  "media_name",
  "content_json",
  "content_format",
  "text_sizing_mode",
  "x",
  "y",
  "width",
  "height",
  "color",
  "z_index",
  "created_at",
  "updated_at",
].join(",");

export const CANVAS_SECTION_COLUMNS = [
  "id",
  "user_id",
  "workspace_id",
  "label",
  "x",
  "y",
  "width",
  "height",
  "color",
  "z_index",
  "created_at",
  "updated_at",
].join(",");

export async function getNotes(): Promise<CanvasNote[]> {
  return timeAsync("getNotes", async () => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const workspaceContext = await getWorkspaceContext(supabase, user);
    const { data, error } = await supabase
      .from("canvas_notes")
      .select(CANVAS_NOTE_COLUMNS)
      .eq("user_id", user.id)
      .eq("workspace_id", workspaceContext.activeWorkspace.id)
      .order("z_index", { ascending: true });

    if (error || !data) return [];
    const notes = data as unknown as CanvasNote[];
    const uploadedPaths = notes
      .filter((note) => note.media_source === "upload" && note.media_path)
      .map((note) => note.media_path as string);

    if (uploadedPaths.length === 0) return notes;

    const signedUrlByPath = await timeAsync("signed URL generation", async () => {
      const { data: signed } = await supabase.storage
        .from("canvas-media")
        .createSignedUrls(uploadedPaths, 60 * 60);
      return new Map(
        (signed ?? [])
          .filter((item) => item.signedUrl)
          .map((item, index) => [uploadedPaths[index], item.signedUrl as string])
      );
    });

    // Signed URLs are batched to avoid one storage round trip per uploaded media note.
    return notes.map((note) => {
      if (note.media_source !== "upload" || !note.media_path) return note;
      const mediaUrl = signedUrlByPath.get(note.media_path);
      return mediaUrl ? { ...note, media_url: mediaUrl } : note;
    });
  });
}

export async function getSections(): Promise<CanvasSection[]> {
  return timeAsync("getSections", async () => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const workspaceContext = await getWorkspaceContext(supabase, user);
    const { data, error } = await supabase
      .from("canvas_sections")
      .select(CANVAS_SECTION_COLUMNS)
      .eq("user_id", user.id)
      .eq("workspace_id", workspaceContext.activeWorkspace.id)
      .order("z_index", { ascending: true });

    if (error || !data) return [];
    return data as unknown as CanvasSection[];
  });
}
