import type { Bookmark } from "@/lib/types";

type BookmarkScreenshotFields = Pick<
  Bookmark,
  "screenshot_url" | "long_screenshot_url"
>;

export function getBookmarkDisplayScreenshot(bookmark: BookmarkScreenshotFields) {
  return bookmark.long_screenshot_url ?? bookmark.screenshot_url;
}
