import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBookmarkAiMetadata } from "@/lib/bookmarks/ai-metadata";
import { BookmarkDetailPage } from "@/components/bookmarks/BookmarkDetailPage";
import type { Bookmark } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function BookmarkPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data, error } = await supabase
    .from("bookmarks")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !data) notFound();

  const aiMetadata = await getBookmarkAiMetadata(supabase, id, user.id);
  const bookmark = { ...(data as Bookmark), ai_metadata: aiMetadata };

  return <BookmarkDetailPage bookmark={bookmark} />;
}
