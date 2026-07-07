-- Remove retired Nyabag-side Gemini AI generation objects.
-- Cortex is now the bookmark AI memory/search authority.

DROP TABLE IF EXISTS bookmark_ai_metadata CASCADE;
DROP TABLE IF EXISTS bookmark_visual_facts CASCADE;

DROP TRIGGER IF EXISTS bookmarks_search_vector_update ON bookmarks;
ALTER TABLE bookmarks
  DROP CONSTRAINT IF EXISTS bookmarks_ai_description_check,
  DROP COLUMN IF EXISTS ai_description,
  DROP COLUMN IF EXISTS ai_tags,
  DROP COLUMN IF EXISTS ai_patterns,
  DROP COLUMN IF EXISTS ai_design_dna;

DROP FUNCTION IF EXISTS build_bookmark_search_vector(
  TEXT,
  TEXT,
  TEXT[],
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT[],
  TEXT[],
  TEXT[],
  JSONB
);

CREATE OR REPLACE FUNCTION build_bookmark_search_vector(
  bookmark_title TEXT,
  bookmark_url TEXT,
  bookmark_tags TEXT[],
  bookmark_summary TEXT,
  bookmark_note TEXT,
  bookmark_save_reason TEXT,
  bookmark_fonts TEXT[]
)
RETURNS TSVECTOR
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT
    setweight(to_tsvector('english', coalesce(bookmark_title, '')), 'A') ||
    setweight(to_tsvector('english', bookmark_hostname(bookmark_url)), 'A') ||
    setweight(to_tsvector('english', array_to_string(coalesce(bookmark_tags, '{}'), ' ')), 'A') ||
    setweight(to_tsvector('english', coalesce(bookmark_note, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(bookmark_save_reason, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(bookmark_summary, '')), 'C') ||
    setweight(to_tsvector('english', array_to_string(coalesce(bookmark_fonts, '{}'), ' ')), 'D');
$$;

CREATE OR REPLACE FUNCTION update_bookmark_search_vector()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_vector = build_bookmark_search_vector(
    NEW.title,
    NEW.url,
    NEW.tags,
    NEW.summary,
    NEW.note,
    NEW.save_reason,
    NEW.fonts
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER bookmarks_search_vector_update
  BEFORE INSERT OR UPDATE OF title, url, tags, summary, note, save_reason, fonts ON bookmarks
  FOR EACH ROW EXECUTE FUNCTION update_bookmark_search_vector();

UPDATE bookmarks
SET search_vector = build_bookmark_search_vector(
  title,
  url,
  tags,
  summary,
  note,
  save_reason,
  fonts
);
