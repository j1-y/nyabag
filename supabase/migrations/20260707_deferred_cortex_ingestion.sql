ALTER TABLE bookmarks
  ADD COLUMN IF NOT EXISTS cortex_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS cortex_error TEXT,
  ADD COLUMN IF NOT EXISTS cortex_memory_id TEXT,
  ADD COLUMN IF NOT EXISTS cortex_ingested_at TIMESTAMPTZ;

ALTER TABLE bookmarks
  DROP CONSTRAINT IF EXISTS bookmarks_cortex_status_check,
  DROP CONSTRAINT IF EXISTS bookmarks_cortex_error_check,
  ADD CONSTRAINT bookmarks_cortex_status_check
    CHECK (cortex_status IN ('pending', 'processing', 'ready', 'failed', 'skipped')),
  ADD CONSTRAINT bookmarks_cortex_error_check
    CHECK (cortex_error IS NULL OR char_length(cortex_error) <= 500);

CREATE INDEX IF NOT EXISTS idx_bookmarks_cortex_ready_ingest
  ON bookmarks(user_id, cortex_status, updated_at DESC)
  WHERE processing_status = 'ready'
    AND (screenshot_url IS NOT NULL OR long_screenshot_url IS NOT NULL);
