import { createClient } from "@/lib/supabase/server";
import { BookmarkGrid } from "@/components/bookmarks/BookmarkGrid";
import type { Bookmark } from "@/lib/types";
import { attachAiMetadataToBookmarks } from "@/lib/bookmarks/ai-metadata";
import { getUserProfile } from "@/lib/profile";
import { timeAsync } from "@/lib/perf";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  return timeAsync("initial / dashboard data loading", async () => {
    const supabase = await timeAsync("dashboard: create supabase client", async () => {
      return createClient();
    });

    const {
      data: { user },
    } = await timeAsync("dashboard: get auth user", async () => {
      return supabase.auth.getUser();
    });

    const [bookmarksResult, profile] = await Promise.all([
      timeAsync("dashboard: load bookmarks", async () => {
        if (!user) return { data: [], error: null };
        return supabase
          .from("bookmarks")
          .select("*")
          .eq("user_id", user.id)
          .is("folder_id", null)
          .order("created_at", { ascending: false });
      }),

      timeAsync("dashboard: load profile", async () => {
        return user ? getUserProfile(supabase, user) : Promise.resolve(null);
      }),
    ]);

    const { data: bookmarks, error } = bookmarksResult;

    if (error) {
      return (
        <div className="empty-state">
          <p>Failed to load bookmarks. Please refresh.</p>
        </div>
      );
    }

    const initialBookmarks = user
      ? await timeAsync("dashboard: attach AI metadata", async () => {
          return attachAiMetadataToBookmarks(
            supabase,
            (bookmarks ?? []) as Bookmark[],
            user.id
          );
        })
      : ((bookmarks ?? []) as Bookmark[]);

    return (
      <BookmarkGrid
        initialBookmarks={initialBookmarks}
        userEmail={user?.email ?? ""}
        profileName={profile?.name ?? ""}
      />
    );
  });
}