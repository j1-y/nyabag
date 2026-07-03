ALTER TABLE bookmarks
  ADD COLUMN IF NOT EXISTS long_screenshot_url TEXT,
  ADD COLUMN IF NOT EXISTS long_screenshot_path TEXT,
  ADD COLUMN IF NOT EXISTS long_screenshot_refreshed_at TIMESTAMPTZ;

ALTER TABLE bookmarks
  DROP CONSTRAINT IF EXISTS bookmarks_long_screenshot_path_check,
  ADD CONSTRAINT bookmarks_long_screenshot_path_check
    CHECK (long_screenshot_path IS NULL OR char_length(long_screenshot_path) <= 1024);
