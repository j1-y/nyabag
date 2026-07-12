import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type Capture = {
  id: string;
  user_id: string;
  workspace_id: string;
  path: string;
  capture_url: string | null;
  page_url: string | null;
  page_title: string | null;
  original_size: number | null;
  compressed_size: number | null;
  source: string | null;
  created_at: string;
};

export async function getCaptures(
  supabase: SupabaseClient,
  userId: string,
  workspaceId: string
): Promise<Capture[]> {
  const { data, error } = await supabase
    .from("captures")
    .select("*")
    .eq("user_id", userId)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("[captures/data] fetch failed:", error.message);
    return [];
  }

  return data ?? [];
}
