-- ============================================================
-- Nyabag - Supabase Schema
-- Run this full file in your Supabase SQL editor.
-- It is safe to rerun and does not drop existing app data.
-- ============================================================

-- ============================================================
-- Extensions and helpers
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS vector;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ============================================================
-- Bookmarks
-- ============================================================

CREATE TABLE IF NOT EXISTS bookmarks (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url                      TEXT        NOT NULL,
  title                    TEXT        NOT NULL,
  tags                     TEXT[]      NOT NULL DEFAULT '{}',
  palette                  TEXT[]      NOT NULL DEFAULT '{}',
  fonts                    TEXT[]      NOT NULL DEFAULT '{}',
  screenshot_url           TEXT,
  screenshot_path          TEXT,
  screenshot_refreshed_at  TIMESTAMPTZ,
  long_screenshot_url      TEXT,
  long_screenshot_path     TEXT,
  long_screenshot_refreshed_at TIMESTAMPTZ,
  summary                  TEXT        NOT NULL DEFAULT '',
  metadata_refreshed_at    TIMESTAMPTZ,
  note                     TEXT        NOT NULL DEFAULT '',
  search_vector            TSVECTOR,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE bookmarks
  ADD COLUMN IF NOT EXISTS screenshot_url TEXT,
  ADD COLUMN IF NOT EXISTS screenshot_path TEXT,
  ADD COLUMN IF NOT EXISTS screenshot_refreshed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS long_screenshot_url TEXT,
  ADD COLUMN IF NOT EXISTS long_screenshot_path TEXT,
  ADD COLUMN IF NOT EXISTS long_screenshot_refreshed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS summary TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS metadata_refreshed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS processing_status TEXT NOT NULL DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS processing_error TEXT,
  ADD COLUMN IF NOT EXISTS enrichment_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS enrichment_finished_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_description TEXT,
  ADD COLUMN IF NOT EXISTS ai_tags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ai_patterns TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ai_design_dna JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS save_reason TEXT,
  ADD COLUMN IF NOT EXISTS semantic_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS semantic_error TEXT,
  ADD COLUMN IF NOT EXISTS semantic_processed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_opened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS search_vector TSVECTOR;

ALTER TABLE bookmarks
  DROP CONSTRAINT IF EXISTS bookmarks_url_check,
  DROP CONSTRAINT IF EXISTS bookmarks_title_check,
  DROP CONSTRAINT IF EXISTS bookmarks_screenshot_path_check,
  DROP CONSTRAINT IF EXISTS bookmarks_long_screenshot_path_check,
  DROP CONSTRAINT IF EXISTS bookmarks_summary_check,
  DROP CONSTRAINT IF EXISTS bookmarks_note_check,
  DROP CONSTRAINT IF EXISTS bookmarks_processing_status_check,
  DROP CONSTRAINT IF EXISTS bookmarks_ai_description_check,
  DROP CONSTRAINT IF EXISTS bookmarks_save_reason_check,
  DROP CONSTRAINT IF EXISTS bookmarks_semantic_status_check,
  DROP CONSTRAINT IF EXISTS bookmarks_semantic_error_check,
  ADD CONSTRAINT bookmarks_url_check CHECK (char_length(url) <= 2048),
  ADD CONSTRAINT bookmarks_title_check CHECK (char_length(title) <= 255),
  ADD CONSTRAINT bookmarks_screenshot_path_check CHECK (screenshot_path IS NULL OR char_length(screenshot_path) <= 1024),
  ADD CONSTRAINT bookmarks_long_screenshot_path_check CHECK (long_screenshot_path IS NULL OR char_length(long_screenshot_path) <= 1024),
  ADD CONSTRAINT bookmarks_summary_check CHECK (char_length(summary) <= 1000),
  ADD CONSTRAINT bookmarks_note_check CHECK (char_length(note) <= 2000),
  ADD CONSTRAINT bookmarks_processing_status_check CHECK (processing_status IN ('queued', 'processing', 'ready', 'failed')),
  ADD CONSTRAINT bookmarks_ai_description_check CHECK (ai_description IS NULL OR char_length(ai_description) <= 1200),
  ADD CONSTRAINT bookmarks_save_reason_check CHECK (save_reason IS NULL OR char_length(save_reason) <= 500),
  ADD CONSTRAINT bookmarks_semantic_status_check CHECK (semantic_status IN ('pending', 'processing', 'ready', 'failed', 'skipped')),
  ADD CONSTRAINT bookmarks_semantic_error_check CHECK (semantic_error IS NULL OR char_length(semantic_error) <= 500);

DROP TRIGGER IF EXISTS bookmarks_updated_at ON bookmarks;
CREATE TRIGGER bookmarks_updated_at
  BEFORE UPDATE ON bookmarks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_bookmarks_user_id ON bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_tags ON bookmarks USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_bookmarks_created ON bookmarks(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bookmarks_user_created_at_idx ON bookmarks(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_url ON bookmarks(user_id, url);
CREATE INDEX IF NOT EXISTS idx_bookmarks_processing_status ON bookmarks(processing_status);
CREATE INDEX IF NOT EXISTS idx_bookmarks_semantic_status ON bookmarks(semantic_status);
CREATE INDEX IF NOT EXISTS idx_bookmarks_search_vector ON bookmarks USING GIN(search_vector);

CREATE OR REPLACE FUNCTION bookmark_hostname(bookmark_url TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT lower(split_part(regexp_replace(coalesce(bookmark_url, ''), '^https?://(www\.)?', '', 'i'), '/', 1));
$$;

CREATE OR REPLACE FUNCTION build_bookmark_search_vector(
  bookmark_title TEXT,
  bookmark_url TEXT,
  bookmark_tags TEXT[],
  bookmark_summary TEXT,
  bookmark_note TEXT,
  bookmark_save_reason TEXT,
  bookmark_ai_description TEXT,
  bookmark_ai_tags TEXT[],
  bookmark_ai_patterns TEXT[],
  bookmark_fonts TEXT[],
  bookmark_ai_design_dna JSONB
)
RETURNS TSVECTOR
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT
    setweight(to_tsvector('english', coalesce(bookmark_title, '')), 'A') ||
    setweight(to_tsvector('english', bookmark_hostname(bookmark_url)), 'A') ||
    setweight(to_tsvector('english', array_to_string(coalesce(bookmark_tags, '{}'), ' ')), 'A') ||
    setweight(to_tsvector('english', array_to_string(coalesce(bookmark_ai_patterns, '{}'), ' ')), 'B') ||
    setweight(to_tsvector('english', array_to_string(coalesce(bookmark_ai_tags, '{}'), ' ')), 'B') ||
    setweight(to_tsvector('english', coalesce(bookmark_note, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(bookmark_save_reason, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(bookmark_summary, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(bookmark_ai_description, '')), 'C') ||
    setweight(to_tsvector('english', array_to_string(coalesce(bookmark_fonts, '{}'), ' ')), 'D') ||
    setweight(to_tsvector('english', coalesce(bookmark_ai_design_dna::text, '')), 'D');
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
    NEW.ai_description,
    NEW.ai_tags,
    NEW.ai_patterns,
    NEW.fonts,
    NEW.ai_design_dna
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookmarks_search_vector_update ON bookmarks;
CREATE TRIGGER bookmarks_search_vector_update
  BEFORE INSERT OR UPDATE OF title, url, tags, summary, note, save_reason, ai_description, ai_tags, ai_patterns, fonts, ai_design_dna ON bookmarks
  FOR EACH ROW EXECUTE FUNCTION update_bookmark_search_vector();

UPDATE bookmarks
SET search_vector = build_bookmark_search_vector(
  title,
  url,
  tags,
  summary,
  note,
  save_reason,
  ai_description,
  ai_tags,
  ai_patterns,
  fonts,
  ai_design_dna
)
WHERE search_vector IS NULL;

CREATE OR REPLACE FUNCTION search_bookmarks_lexical(
  search_query TEXT,
  result_limit INTEGER DEFAULT 40
)
RETURNS TABLE (
  bookmark_id UUID,
  lexical_score DOUBLE PRECISION,
  exact_match_score DOUBLE PRECISION,
  rank INTEGER,
  match_reasons TEXT[]
)
LANGUAGE SQL
STABLE
SECURITY INVOKER
AS $$
  WITH q AS (
    SELECT
      trim(regexp_replace(coalesce(search_query, ''), '\s+', ' ', 'g')) AS raw_query,
      lower(trim(regexp_replace(coalesce(search_query, ''), '\s+', ' ', 'g'))) AS normalized_query,
      websearch_to_tsquery('english', trim(regexp_replace(coalesce(search_query, ''), '\s+', ' ', 'g'))) AS ts_query
  ),
  scored AS (
    SELECT
      b.id AS bookmark_id,
      ts_rank_cd(b.search_vector, q.ts_query, 32) AS text_rank,
      bookmark_hostname(b.url) AS hostname,
      lower(b.title) AS title_normalized,
      q.normalized_query,
      LEAST(1.0,
        (CASE WHEN lower(b.title) = q.normalized_query THEN 1.0 ELSE 0.0 END) +
        (CASE WHEN bookmark_hostname(b.url) = q.normalized_query THEN 0.95 ELSE 0.0 END) +
        (CASE WHEN EXISTS (SELECT 1 FROM unnest(b.tags) tag WHERE lower(tag) = q.normalized_query) THEN 0.9 ELSE 0.0 END) +
        (CASE WHEN lower(b.title) LIKE q.normalized_query || '%' THEN 0.35 ELSE 0.0 END) +
        (CASE WHEN bookmark_hostname(b.url) LIKE q.normalized_query || '%' THEN 0.3 ELSE 0.0 END) +
        (CASE WHEN lower(b.title) LIKE '%' || q.normalized_query || '%' THEN 0.25 ELSE 0.0 END) +
        (CASE WHEN lower(b.note) LIKE '%' || q.normalized_query || '%' THEN 0.2 ELSE 0.0 END)
      ) AS exact_score,
      array_remove(ARRAY[
        CASE WHEN lower(b.title) = q.normalized_query THEN 'Exact title' END,
        CASE WHEN bookmark_hostname(b.url) = q.normalized_query THEN 'Exact domain' END,
        CASE WHEN EXISTS (SELECT 1 FROM unnest(b.tags) tag WHERE lower(tag) = q.normalized_query) THEN 'Exact tag' END,
        CASE WHEN lower(b.title) LIKE q.normalized_query || '%' THEN 'Title prefix' END,
        CASE WHEN bookmark_hostname(b.url) LIKE q.normalized_query || '%' THEN 'Domain prefix' END,
        CASE WHEN ts_rank_cd(b.search_vector, q.ts_query, 32) > 0 THEN 'Keyword evidence' END,
        CASE WHEN lower(b.note) LIKE '%' || q.normalized_query || '%' THEN 'Note phrase' END
      ], NULL) AS reasons
    FROM bookmarks b
    CROSS JOIN q
    WHERE b.user_id = auth.uid()
      AND q.raw_query <> ''
      AND (
        b.search_vector @@ q.ts_query
        OR lower(b.title) LIKE '%' || q.normalized_query || '%'
        OR bookmark_hostname(b.url) LIKE '%' || q.normalized_query || '%'
        OR lower(b.note) LIKE '%' || q.normalized_query || '%'
        OR EXISTS (SELECT 1 FROM unnest(b.tags) tag WHERE lower(tag) LIKE '%' || q.normalized_query || '%')
      )
  ),
  ranked AS (
    SELECT
      bookmark_id,
      LEAST(1.0, text_rank + exact_score) AS lexical_score,
      exact_score AS exact_match_score,
      reasons AS match_reasons,
      row_number() OVER (ORDER BY exact_score DESC, text_rank DESC, bookmark_id) AS result_rank
    FROM scored
  )
  SELECT
    bookmark_id,
    lexical_score,
    exact_match_score,
    result_rank::INTEGER - 1 AS rank,
    match_reasons
  FROM ranked
  ORDER BY result_rank
  LIMIT LEAST(GREATEST(result_limit, 1), 80);
$$;

CREATE OR REPLACE FUNCTION search_bookmarks_lexical_v2(
  search_query TEXT,
  result_limit INTEGER DEFAULT 40,
  created_after TIMESTAMPTZ DEFAULT NULL,
  created_before TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  bookmark_id UUID,
  lexical_score DOUBLE PRECISION,
  exact_match_score DOUBLE PRECISION,
  rank INTEGER,
  match_reasons TEXT[]
)
LANGUAGE SQL
STABLE
SECURITY INVOKER
AS $$
  WITH q AS (
    SELECT
      trim(regexp_replace(coalesce(search_query, ''), '\s+', ' ', 'g')) AS raw_query,
      lower(trim(regexp_replace(coalesce(search_query, ''), '\s+', ' ', 'g'))) AS normalized_query,
      websearch_to_tsquery('english', trim(regexp_replace(coalesce(search_query, ''), '\s+', ' ', 'g'))) AS ts_query
  ),
  scored AS (
    SELECT
      b.id AS bookmark_id,
      ts_rank_cd(b.search_vector, q.ts_query, 32) AS text_rank,
      q.normalized_query,
      LEAST(1.0,
        (CASE WHEN lower(b.title) = q.normalized_query THEN 1.0 ELSE 0.0 END) +
        (CASE WHEN bookmark_hostname(b.url) = q.normalized_query THEN 0.95 ELSE 0.0 END) +
        (CASE WHEN EXISTS (SELECT 1 FROM unnest(b.tags) tag WHERE lower(tag) = q.normalized_query) THEN 0.9 ELSE 0.0 END) +
        (CASE WHEN lower(b.title) LIKE q.normalized_query || '%' THEN 0.35 ELSE 0.0 END) +
        (CASE WHEN bookmark_hostname(b.url) LIKE q.normalized_query || '%' THEN 0.3 ELSE 0.0 END) +
        (CASE WHEN lower(b.title) LIKE '%' || q.normalized_query || '%' THEN 0.25 ELSE 0.0 END) +
        (CASE WHEN lower(b.note) LIKE '%' || q.normalized_query || '%' THEN 0.2 ELSE 0.0 END)
      ) AS exact_score,
      array_remove(ARRAY[
        CASE WHEN lower(b.title) = q.normalized_query THEN 'Exact title' END,
        CASE WHEN bookmark_hostname(b.url) = q.normalized_query THEN 'Exact domain' END,
        CASE WHEN EXISTS (SELECT 1 FROM unnest(b.tags) tag WHERE lower(tag) = q.normalized_query) THEN 'Exact tag' END,
        CASE WHEN lower(b.title) LIKE q.normalized_query || '%' THEN 'Title prefix' END,
        CASE WHEN bookmark_hostname(b.url) LIKE q.normalized_query || '%' THEN 'Domain prefix' END,
        CASE WHEN ts_rank_cd(b.search_vector, q.ts_query, 32) > 0 THEN 'Keyword evidence' END,
        CASE WHEN lower(b.note) LIKE '%' || q.normalized_query || '%' THEN 'Note phrase' END
      ], NULL) AS reasons
    FROM bookmarks b
    CROSS JOIN q
    WHERE b.user_id = auth.uid()
      AND q.raw_query <> ''
      AND (created_after IS NULL OR b.created_at >= created_after)
      AND (created_before IS NULL OR b.created_at < created_before)
      AND (
        b.search_vector @@ q.ts_query
        OR lower(b.title) LIKE '%' || q.normalized_query || '%'
        OR bookmark_hostname(b.url) LIKE '%' || q.normalized_query || '%'
        OR lower(b.note) LIKE '%' || q.normalized_query || '%'
        OR EXISTS (SELECT 1 FROM unnest(b.tags) tag WHERE lower(tag) LIKE '%' || q.normalized_query || '%')
      )
  ),
  ranked AS (
    SELECT
      bookmark_id,
      LEAST(1.0, text_rank + exact_score) AS lexical_score,
      exact_score AS exact_match_score,
      reasons AS match_reasons,
      row_number() OVER (ORDER BY exact_score DESC, text_rank DESC, bookmark_id) AS result_rank
    FROM scored
  )
  SELECT
    bookmark_id,
    lexical_score,
    exact_match_score,
    result_rank::INTEGER - 1 AS rank,
    match_reasons
  FROM ranked
  ORDER BY result_rank
  LIMIT LEAST(GREATEST(result_limit, 1), 80);
$$;

ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_bookmarks" ON bookmarks;
CREATE POLICY "select_own_bookmarks" ON bookmarks
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_bookmarks" ON bookmarks;
CREATE POLICY "insert_own_bookmarks" ON bookmarks
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_bookmarks" ON bookmarks;
CREATE POLICY "update_own_bookmarks" ON bookmarks
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_bookmarks" ON bookmarks;
CREATE POLICY "delete_own_bookmarks" ON bookmarks
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- Bookmark AI metadata
-- ============================================================

CREATE TABLE IF NOT EXISTS bookmark_ai_metadata (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  bookmark_id       UUID        NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  page_type         TEXT        NOT NULL DEFAULT '',
  industry          TEXT        NOT NULL DEFAULT '',
  visual_style      TEXT[]      NOT NULL DEFAULT '{}',
  ui_patterns       TEXT[]      NOT NULL DEFAULT '{}',
  components        TEXT[]      NOT NULL DEFAULT '{}',
  suggested_tags    TEXT[]      NOT NULL DEFAULT '{}',
  suggested_folder  TEXT        NOT NULL DEFAULT '',
  design_context    TEXT        NOT NULL DEFAULT '',
  confidence        NUMERIC     NOT NULL DEFAULT 0,
  model_name        TEXT        NOT NULL DEFAULT '',
  raw_response      JSONB,
  error             TEXT,
  status            TEXT        NOT NULL DEFAULT 'pending',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE bookmark_ai_metadata
  ADD COLUMN IF NOT EXISTS bookmark_id UUID,
  ADD COLUMN IF NOT EXISTS user_id UUID,
  ADD COLUMN IF NOT EXISTS page_type TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS industry TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS visual_style TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ui_patterns TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS components TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS suggested_tags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS suggested_folder TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS design_context TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS confidence NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS model_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS raw_response JSONB,
  ADD COLUMN IF NOT EXISTS error TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE bookmark_ai_metadata
  DROP CONSTRAINT IF EXISTS bookmark_ai_metadata_bookmark_id_fkey,
  DROP CONSTRAINT IF EXISTS bookmark_ai_metadata_user_id_fkey,
  DROP CONSTRAINT IF EXISTS bookmark_ai_metadata_status_check,
  DROP CONSTRAINT IF EXISTS bookmark_ai_metadata_confidence_check,
  DROP CONSTRAINT IF EXISTS bookmark_ai_metadata_page_type_check,
  DROP CONSTRAINT IF EXISTS bookmark_ai_metadata_industry_check,
  DROP CONSTRAINT IF EXISTS bookmark_ai_metadata_suggested_folder_check,
  DROP CONSTRAINT IF EXISTS bookmark_ai_metadata_design_context_check,
  DROP CONSTRAINT IF EXISTS bookmark_ai_metadata_model_name_check,
  DROP CONSTRAINT IF EXISTS bookmark_ai_metadata_error_check,
  DROP CONSTRAINT IF EXISTS bookmark_ai_metadata_bookmark_id_key,
  ADD CONSTRAINT bookmark_ai_metadata_bookmark_id_fkey FOREIGN KEY (bookmark_id) REFERENCES bookmarks(id) ON DELETE CASCADE,
  ADD CONSTRAINT bookmark_ai_metadata_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD CONSTRAINT bookmark_ai_metadata_status_check CHECK (status IN ('pending', 'completed', 'failed')),
  ADD CONSTRAINT bookmark_ai_metadata_confidence_check CHECK (confidence >= 0 AND confidence <= 1),
  ADD CONSTRAINT bookmark_ai_metadata_page_type_check CHECK (char_length(page_type) <= 80),
  ADD CONSTRAINT bookmark_ai_metadata_industry_check CHECK (char_length(industry) <= 80),
  ADD CONSTRAINT bookmark_ai_metadata_suggested_folder_check CHECK (char_length(suggested_folder) <= 80),
  ADD CONSTRAINT bookmark_ai_metadata_design_context_check CHECK (char_length(design_context) <= 700),
  ADD CONSTRAINT bookmark_ai_metadata_model_name_check CHECK (char_length(model_name) <= 120),
  ADD CONSTRAINT bookmark_ai_metadata_error_check CHECK (error IS NULL OR char_length(error) <= 500),
  ADD CONSTRAINT bookmark_ai_metadata_bookmark_id_key UNIQUE (bookmark_id);

DROP TRIGGER IF EXISTS bookmark_ai_metadata_updated_at ON bookmark_ai_metadata;
CREATE TRIGGER bookmark_ai_metadata_updated_at
  BEFORE UPDATE ON bookmark_ai_metadata
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_bookmark_ai_metadata_user_id ON bookmark_ai_metadata(user_id);
CREATE INDEX IF NOT EXISTS idx_bookmark_ai_metadata_bookmark_id ON bookmark_ai_metadata(bookmark_id);
CREATE INDEX IF NOT EXISTS idx_bookmark_ai_metadata_status ON bookmark_ai_metadata(status);

ALTER TABLE bookmark_ai_metadata ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_bookmark_ai_metadata" ON bookmark_ai_metadata;
CREATE POLICY "select_own_bookmark_ai_metadata" ON bookmark_ai_metadata
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_bookmark_ai_metadata" ON bookmark_ai_metadata;
CREATE POLICY "insert_own_bookmark_ai_metadata" ON bookmark_ai_metadata
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_bookmark_ai_metadata" ON bookmark_ai_metadata;
CREATE POLICY "update_own_bookmark_ai_metadata" ON bookmark_ai_metadata
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_bookmark_ai_metadata" ON bookmark_ai_metadata;
CREATE POLICY "delete_own_bookmark_ai_metadata" ON bookmark_ai_metadata
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- Bookmark semantic embeddings
-- ============================================================

CREATE TABLE IF NOT EXISTS bookmark_embeddings (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bookmark_id    UUID        NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
  embedding      vector(768) NOT NULL,
  embedding_text TEXT        NOT NULL,
  model          TEXT        NOT NULL,
  content_hash   TEXT        NOT NULL,
  retrieval_schema_version INTEGER NOT NULL DEFAULT 1,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE bookmark_embeddings
  ADD COLUMN IF NOT EXISTS user_id UUID,
  ADD COLUMN IF NOT EXISTS bookmark_id UUID,
  ADD COLUMN IF NOT EXISTS embedding vector(768),
  ADD COLUMN IF NOT EXISTS embedding_text TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS model TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS content_hash TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS retrieval_schema_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE bookmark_embeddings
  DROP CONSTRAINT IF EXISTS bookmark_embeddings_user_id_fkey,
  DROP CONSTRAINT IF EXISTS bookmark_embeddings_bookmark_id_fkey,
  DROP CONSTRAINT IF EXISTS bookmark_embeddings_bookmark_id_key,
  DROP CONSTRAINT IF EXISTS bookmark_embeddings_embedding_text_check,
  DROP CONSTRAINT IF EXISTS bookmark_embeddings_model_check,
  DROP CONSTRAINT IF EXISTS bookmark_embeddings_content_hash_check,
  DROP CONSTRAINT IF EXISTS bookmark_embeddings_retrieval_schema_version_check,
  ADD CONSTRAINT bookmark_embeddings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD CONSTRAINT bookmark_embeddings_bookmark_id_fkey FOREIGN KEY (bookmark_id) REFERENCES bookmarks(id) ON DELETE CASCADE,
  ADD CONSTRAINT bookmark_embeddings_bookmark_id_key UNIQUE (bookmark_id),
  ADD CONSTRAINT bookmark_embeddings_embedding_text_check CHECK (char_length(embedding_text) <= 16000),
  ADD CONSTRAINT bookmark_embeddings_model_check CHECK (char_length(model) <= 120),
  ADD CONSTRAINT bookmark_embeddings_content_hash_check CHECK (char_length(content_hash) <= 120),
  ADD CONSTRAINT bookmark_embeddings_retrieval_schema_version_check CHECK (retrieval_schema_version >= 1);

DROP TRIGGER IF EXISTS bookmark_embeddings_updated_at ON bookmark_embeddings;
CREATE TRIGGER bookmark_embeddings_updated_at
  BEFORE UPDATE ON bookmark_embeddings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS bookmark_embeddings_user_id_idx
  ON bookmark_embeddings(user_id);

CREATE INDEX IF NOT EXISTS bookmark_embeddings_bookmark_id_idx
  ON bookmark_embeddings(bookmark_id);

-- Uses cosine distance for pgvector retrieval. If a Supabase project has an
-- older pgvector version, recreate this as the compatible cosine index type.
CREATE INDEX IF NOT EXISTS bookmark_embeddings_embedding_ivfflat_idx
  ON bookmark_embeddings USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

ALTER TABLE bookmark_embeddings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_bookmark_embeddings" ON bookmark_embeddings;
CREATE POLICY "select_own_bookmark_embeddings" ON bookmark_embeddings
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_bookmark_embeddings" ON bookmark_embeddings;
CREATE POLICY "insert_own_bookmark_embeddings" ON bookmark_embeddings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_bookmark_embeddings" ON bookmark_embeddings;
CREATE POLICY "update_own_bookmark_embeddings" ON bookmark_embeddings
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_bookmark_embeddings" ON bookmark_embeddings;
CREATE POLICY "delete_own_bookmark_embeddings" ON bookmark_embeddings
  FOR DELETE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION match_bookmarks_by_embedding(
  query_embedding vector(768),
  match_user_id UUID,
  match_count INT DEFAULT 24,
  similarity_threshold FLOAT DEFAULT 0.2,
  minimum_schema_version INT DEFAULT 1
)
RETURNS TABLE (
  bookmark_id UUID,
  similarity FLOAT
)
LANGUAGE SQL
STABLE
AS $$
  SELECT
    be.bookmark_id,
    1 - (be.embedding <=> query_embedding) AS similarity
  FROM bookmark_embeddings be
  WHERE be.user_id = match_user_id
    AND be.retrieval_schema_version >= minimum_schema_version
    AND 1 - (be.embedding <=> query_embedding) >= similarity_threshold
  ORDER BY be.embedding <=> query_embedding
  LIMIT LEAST(GREATEST(match_count, 1), 50);
$$;

CREATE OR REPLACE FUNCTION match_bookmarks_by_embedding_v2(
  query_embedding vector(768),
  match_user_id UUID,
  match_count INT DEFAULT 24,
  similarity_threshold FLOAT DEFAULT 0.2,
  minimum_schema_version INT DEFAULT 1,
  created_after TIMESTAMPTZ DEFAULT NULL,
  created_before TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  bookmark_id UUID,
  similarity FLOAT
)
LANGUAGE SQL
STABLE
AS $$
  SELECT
    be.bookmark_id,
    1 - (be.embedding <=> query_embedding) AS similarity
  FROM bookmark_embeddings be
  JOIN bookmarks b ON b.id = be.bookmark_id
  WHERE be.user_id = match_user_id
    AND b.user_id = match_user_id
    AND be.retrieval_schema_version >= minimum_schema_version
    AND (created_after IS NULL OR b.created_at >= created_after)
    AND (created_before IS NULL OR b.created_at < created_before)
    AND 1 - (be.embedding <=> query_embedding) >= similarity_threshold
  ORDER BY be.embedding <=> query_embedding
  LIMIT LEAST(GREATEST(match_count, 1), 50);
$$;

-- ============================================================
-- Visual memory facts and chunks
-- ============================================================

CREATE TABLE IF NOT EXISTS bookmark_visual_facts (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bookmark_id         UUID        NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
  version             INTEGER     NOT NULL DEFAULT 1,
  source              TEXT        NOT NULL DEFAULT 'processor',
  status              TEXT        NOT NULL DEFAULT 'pending',
  facts               JSONB       NOT NULL DEFAULT '{}'::jsonb,
  dom_snapshot        JSONB       NOT NULL DEFAULT '{}'::jsonb,
  vision_snapshot     JSONB       NOT NULL DEFAULT '{}'::jsonb,
  section_facts       JSONB       NOT NULL DEFAULT '[]'::jsonb,
  visible_text        TEXT[]      NOT NULL DEFAULT '{}',
  visible_brands      TEXT[]      NOT NULL DEFAULT '{}',
  detected_components TEXT[]      NOT NULL DEFAULT '{}',
  detected_patterns   TEXT[]      NOT NULL DEFAULT '{}',
  detected_styles     TEXT[]      NOT NULL DEFAULT '{}',
  detected_colors     TEXT[]      NOT NULL DEFAULT '{}',
  confidence          NUMERIC     NOT NULL DEFAULT 0,
  error               TEXT,
  content_hash        TEXT        NOT NULL DEFAULT '',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE bookmark_visual_facts
  ADD COLUMN IF NOT EXISTS user_id UUID,
  ADD COLUMN IF NOT EXISTS bookmark_id UUID,
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'processor',
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS facts JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS dom_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS vision_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS section_facts JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS visible_text TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS visible_brands TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS detected_components TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS detected_patterns TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS detected_styles TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS detected_colors TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS confidence NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS error TEXT,
  ADD COLUMN IF NOT EXISTS content_hash TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE bookmark_visual_facts
  DROP CONSTRAINT IF EXISTS bookmark_visual_facts_user_id_fkey,
  DROP CONSTRAINT IF EXISTS bookmark_visual_facts_bookmark_id_fkey,
  DROP CONSTRAINT IF EXISTS bookmark_visual_facts_user_bookmark_key,
  DROP CONSTRAINT IF EXISTS bookmark_visual_facts_status_check,
  DROP CONSTRAINT IF EXISTS bookmark_visual_facts_confidence_check,
  DROP CONSTRAINT IF EXISTS bookmark_visual_facts_error_check,
  DROP CONSTRAINT IF EXISTS bookmark_visual_facts_content_hash_check,
  ADD CONSTRAINT bookmark_visual_facts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD CONSTRAINT bookmark_visual_facts_bookmark_id_fkey FOREIGN KEY (bookmark_id) REFERENCES bookmarks(id) ON DELETE CASCADE,
  ADD CONSTRAINT bookmark_visual_facts_user_bookmark_key UNIQUE (user_id, bookmark_id),
  ADD CONSTRAINT bookmark_visual_facts_status_check CHECK (status IN ('pending', 'completed', 'failed')),
  ADD CONSTRAINT bookmark_visual_facts_confidence_check CHECK (confidence >= 0 AND confidence <= 1),
  ADD CONSTRAINT bookmark_visual_facts_error_check CHECK (error IS NULL OR char_length(error) <= 1000),
  ADD CONSTRAINT bookmark_visual_facts_content_hash_check CHECK (char_length(content_hash) <= 120);

DROP TRIGGER IF EXISTS bookmark_visual_facts_updated_at ON bookmark_visual_facts;
CREATE TRIGGER bookmark_visual_facts_updated_at
  BEFORE UPDATE ON bookmark_visual_facts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS bookmark_visual_facts_user_id_idx ON bookmark_visual_facts(user_id);
CREATE INDEX IF NOT EXISTS bookmark_visual_facts_bookmark_id_idx ON bookmark_visual_facts(bookmark_id);
CREATE INDEX IF NOT EXISTS bookmark_visual_facts_status_idx ON bookmark_visual_facts(status);
CREATE INDEX IF NOT EXISTS bookmark_visual_facts_facts_gin_idx ON bookmark_visual_facts USING GIN(facts);
CREATE INDEX IF NOT EXISTS bookmark_visual_facts_section_facts_gin_idx ON bookmark_visual_facts USING GIN(section_facts);
CREATE INDEX IF NOT EXISTS bookmark_visual_facts_visible_text_gin_idx ON bookmark_visual_facts USING GIN(visible_text);
CREATE INDEX IF NOT EXISTS bookmark_visual_facts_visible_brands_gin_idx ON bookmark_visual_facts USING GIN(visible_brands);
CREATE INDEX IF NOT EXISTS bookmark_visual_facts_components_gin_idx ON bookmark_visual_facts USING GIN(detected_components);
CREATE INDEX IF NOT EXISTS bookmark_visual_facts_patterns_gin_idx ON bookmark_visual_facts USING GIN(detected_patterns);
CREATE INDEX IF NOT EXISTS bookmark_visual_facts_styles_gin_idx ON bookmark_visual_facts USING GIN(detected_styles);
CREATE INDEX IF NOT EXISTS bookmark_visual_facts_colors_gin_idx ON bookmark_visual_facts USING GIN(detected_colors);

ALTER TABLE bookmark_visual_facts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_bookmark_visual_facts" ON bookmark_visual_facts;
CREATE POLICY "select_own_bookmark_visual_facts" ON bookmark_visual_facts
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_bookmark_visual_facts" ON bookmark_visual_facts;
CREATE POLICY "insert_own_bookmark_visual_facts" ON bookmark_visual_facts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_bookmark_visual_facts" ON bookmark_visual_facts;
CREATE POLICY "update_own_bookmark_visual_facts" ON bookmark_visual_facts
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_bookmark_visual_facts" ON bookmark_visual_facts;
CREATE POLICY "delete_own_bookmark_visual_facts" ON bookmark_visual_facts
  FOR DELETE USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS bookmark_memory_chunks (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bookmark_id  UUID        NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
  chunk_type   TEXT        NOT NULL,
  chunk_label  TEXT        NOT NULL DEFAULT '',
  chunk_text   TEXT        NOT NULL DEFAULT '',
  evidence     JSONB       NOT NULL DEFAULT '{}'::jsonb,
  embedding    vector(768),
  model        TEXT        NOT NULL DEFAULT '',
  content_hash TEXT        NOT NULL DEFAULT '',
  confidence   NUMERIC     NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE bookmark_memory_chunks
  ADD COLUMN IF NOT EXISTS user_id UUID,
  ADD COLUMN IF NOT EXISTS bookmark_id UUID,
  ADD COLUMN IF NOT EXISTS chunk_type TEXT NOT NULL DEFAULT 'full_page',
  ADD COLUMN IF NOT EXISTS chunk_label TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS chunk_text TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS embedding vector(768),
  ADD COLUMN IF NOT EXISTS model TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS content_hash TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS confidence NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE bookmark_memory_chunks
  DROP CONSTRAINT IF EXISTS bookmark_memory_chunks_user_id_fkey,
  DROP CONSTRAINT IF EXISTS bookmark_memory_chunks_bookmark_id_fkey,
  DROP CONSTRAINT IF EXISTS bookmark_memory_chunks_unique_chunk,
  DROP CONSTRAINT IF EXISTS bookmark_memory_chunks_chunk_type_check,
  DROP CONSTRAINT IF EXISTS bookmark_memory_chunks_chunk_text_check,
  DROP CONSTRAINT IF EXISTS bookmark_memory_chunks_confidence_check,
  DROP CONSTRAINT IF EXISTS bookmark_memory_chunks_model_check,
  DROP CONSTRAINT IF EXISTS bookmark_memory_chunks_content_hash_check,
  ADD CONSTRAINT bookmark_memory_chunks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD CONSTRAINT bookmark_memory_chunks_bookmark_id_fkey FOREIGN KEY (bookmark_id) REFERENCES bookmarks(id) ON DELETE CASCADE,
  ADD CONSTRAINT bookmark_memory_chunks_unique_chunk UNIQUE (user_id, bookmark_id, chunk_type, chunk_label),
  ADD CONSTRAINT bookmark_memory_chunks_chunk_type_check CHECK (chunk_type IN ('full_page', 'hero', 'navbar', 'footer', 'pricing', 'features', 'testimonials', 'dashboard', 'form', 'table', 'cards', 'media', 'style', 'component', 'text', 'visual_facts')),
  ADD CONSTRAINT bookmark_memory_chunks_chunk_text_check CHECK (char_length(chunk_text) <= 16000),
  ADD CONSTRAINT bookmark_memory_chunks_confidence_check CHECK (confidence >= 0 AND confidence <= 1),
  ADD CONSTRAINT bookmark_memory_chunks_model_check CHECK (char_length(model) <= 120),
  ADD CONSTRAINT bookmark_memory_chunks_content_hash_check CHECK (char_length(content_hash) <= 120);

DROP TRIGGER IF EXISTS bookmark_memory_chunks_updated_at ON bookmark_memory_chunks;
CREATE TRIGGER bookmark_memory_chunks_updated_at
  BEFORE UPDATE ON bookmark_memory_chunks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS bookmark_memory_chunks_user_id_idx ON bookmark_memory_chunks(user_id);
CREATE INDEX IF NOT EXISTS bookmark_memory_chunks_bookmark_id_idx ON bookmark_memory_chunks(bookmark_id);
CREATE INDEX IF NOT EXISTS bookmark_memory_chunks_chunk_type_idx ON bookmark_memory_chunks(chunk_type);
CREATE INDEX IF NOT EXISTS bookmark_memory_chunks_text_search_idx
  ON bookmark_memory_chunks USING GIN(to_tsvector('english', chunk_text));
CREATE INDEX IF NOT EXISTS bookmark_memory_chunks_embedding_ivfflat_idx
  ON bookmark_memory_chunks USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

ALTER TABLE bookmark_memory_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_bookmark_memory_chunks" ON bookmark_memory_chunks;
CREATE POLICY "select_own_bookmark_memory_chunks" ON bookmark_memory_chunks
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_bookmark_memory_chunks" ON bookmark_memory_chunks;
CREATE POLICY "insert_own_bookmark_memory_chunks" ON bookmark_memory_chunks
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_bookmark_memory_chunks" ON bookmark_memory_chunks;
CREATE POLICY "update_own_bookmark_memory_chunks" ON bookmark_memory_chunks
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_bookmark_memory_chunks" ON bookmark_memory_chunks;
CREATE POLICY "delete_own_bookmark_memory_chunks" ON bookmark_memory_chunks
  FOR DELETE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION match_bookmark_memory_chunks(
  query_embedding vector(768),
  match_user_id UUID,
  match_count INT DEFAULT 40,
  similarity_threshold FLOAT DEFAULT 0.2
)
RETURNS TABLE (
  bookmark_id UUID,
  chunk_id UUID,
  chunk_type TEXT,
  chunk_label TEXT,
  similarity FLOAT,
  evidence JSONB
)
LANGUAGE SQL
STABLE
AS $$
  SELECT
    bmc.bookmark_id,
    bmc.id AS chunk_id,
    bmc.chunk_type,
    bmc.chunk_label,
    1 - (bmc.embedding <=> query_embedding) AS similarity,
    bmc.evidence
  FROM bookmark_memory_chunks bmc
  WHERE bmc.user_id = match_user_id
    AND bmc.embedding IS NOT NULL
    AND 1 - (bmc.embedding <=> query_embedding) >= similarity_threshold
  ORDER BY bmc.embedding <=> query_embedding
  LIMIT LEAST(GREATEST(match_count, 1), 100);
$$;

CREATE OR REPLACE FUNCTION match_bookmark_memory_chunks_v2(
  query_embedding vector(768),
  match_user_id UUID,
  match_count INT DEFAULT 40,
  similarity_threshold FLOAT DEFAULT 0.2,
  created_after TIMESTAMPTZ DEFAULT NULL,
  created_before TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  bookmark_id UUID,
  chunk_id UUID,
  chunk_type TEXT,
  chunk_label TEXT,
  similarity FLOAT,
  evidence JSONB
)
LANGUAGE SQL
STABLE
AS $$
  SELECT
    bmc.bookmark_id,
    bmc.id AS chunk_id,
    bmc.chunk_type,
    bmc.chunk_label,
    1 - (bmc.embedding <=> query_embedding) AS similarity,
    bmc.evidence
  FROM bookmark_memory_chunks bmc
  JOIN bookmarks b ON b.id = bmc.bookmark_id
  WHERE bmc.user_id = match_user_id
    AND b.user_id = match_user_id
    AND bmc.embedding IS NOT NULL
    AND (created_after IS NULL OR b.created_at >= created_after)
    AND (created_before IS NULL OR b.created_at < created_before)
    AND 1 - (bmc.embedding <=> query_embedding) >= similarity_threshold
  ORDER BY bmc.embedding <=> query_embedding
  LIMIT LEAST(GREATEST(match_count, 1), 100);
$$;

CREATE OR REPLACE FUNCTION search_bookmark_memory_chunks_text(
  query_text TEXT,
  match_user_id UUID,
  match_count INT DEFAULT 40
)
RETURNS TABLE (
  bookmark_id UUID,
  chunk_id UUID,
  chunk_type TEXT,
  chunk_label TEXT,
  rank FLOAT,
  evidence JSONB
)
LANGUAGE SQL
STABLE
AS $$
  SELECT
    bmc.bookmark_id,
    bmc.id AS chunk_id,
    bmc.chunk_type,
    bmc.chunk_label,
    ts_rank_cd(to_tsvector('english', bmc.chunk_text), plainto_tsquery('english', query_text)) AS rank,
    bmc.evidence
  FROM bookmark_memory_chunks bmc
  WHERE bmc.user_id = match_user_id
    AND query_text IS NOT NULL
    AND char_length(trim(query_text)) > 0
    AND to_tsvector('english', bmc.chunk_text) @@ plainto_tsquery('english', query_text)
  ORDER BY rank DESC
  LIMIT LEAST(GREATEST(match_count, 1), 100);
$$;

CREATE OR REPLACE FUNCTION search_bookmark_memory_chunks_text_v2(
  query_text TEXT,
  match_user_id UUID,
  match_count INT DEFAULT 40,
  created_after TIMESTAMPTZ DEFAULT NULL,
  created_before TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  bookmark_id UUID,
  chunk_id UUID,
  chunk_type TEXT,
  chunk_label TEXT,
  rank FLOAT,
  evidence JSONB
)
LANGUAGE SQL
STABLE
AS $$
  SELECT
    bmc.bookmark_id,
    bmc.id AS chunk_id,
    bmc.chunk_type,
    bmc.chunk_label,
    ts_rank_cd(to_tsvector('english', bmc.chunk_text), plainto_tsquery('english', query_text)) AS rank,
    bmc.evidence
  FROM bookmark_memory_chunks bmc
  JOIN bookmarks b ON b.id = bmc.bookmark_id
  WHERE bmc.user_id = match_user_id
    AND b.user_id = match_user_id
    AND query_text IS NOT NULL
    AND char_length(trim(query_text)) > 0
    AND (created_after IS NULL OR b.created_at >= created_after)
    AND (created_before IS NULL OR b.created_at < created_before)
    AND to_tsvector('english', bmc.chunk_text) @@ plainto_tsquery('english', query_text)
  ORDER BY rank DESC
  LIMIT LEAST(GREATEST(match_count, 1), 100);
$$;

CREATE TABLE IF NOT EXISTS visual_search_verifications (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  query_hash      TEXT        NOT NULL,
  bookmark_id     UUID        NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
  screenshot_hash TEXT        NOT NULL DEFAULT '',
  verdict         JSONB       NOT NULL DEFAULT '{}'::jsonb,
  score           NUMERIC     NOT NULL DEFAULT 0,
  model           TEXT        NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE visual_search_verifications
  ADD COLUMN IF NOT EXISTS user_id UUID,
  ADD COLUMN IF NOT EXISTS query_hash TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bookmark_id UUID,
  ADD COLUMN IF NOT EXISTS screenshot_hash TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS verdict JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS score NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS model TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE visual_search_verifications
  DROP CONSTRAINT IF EXISTS visual_search_verifications_user_id_fkey,
  DROP CONSTRAINT IF EXISTS visual_search_verifications_bookmark_id_fkey,
  DROP CONSTRAINT IF EXISTS visual_search_verifications_unique_cache,
  DROP CONSTRAINT IF EXISTS visual_search_verifications_score_check,
  ADD CONSTRAINT visual_search_verifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD CONSTRAINT visual_search_verifications_bookmark_id_fkey FOREIGN KEY (bookmark_id) REFERENCES bookmarks(id) ON DELETE CASCADE,
  ADD CONSTRAINT visual_search_verifications_unique_cache UNIQUE (user_id, query_hash, bookmark_id, screenshot_hash),
  ADD CONSTRAINT visual_search_verifications_score_check CHECK (score >= 0 AND score <= 1);

CREATE INDEX IF NOT EXISTS visual_search_verifications_user_id_idx ON visual_search_verifications(user_id);
CREATE INDEX IF NOT EXISTS visual_search_verifications_query_hash_idx ON visual_search_verifications(query_hash);
CREATE INDEX IF NOT EXISTS visual_search_verifications_bookmark_id_idx ON visual_search_verifications(bookmark_id);

ALTER TABLE visual_search_verifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_visual_search_verifications" ON visual_search_verifications;
CREATE POLICY "select_own_visual_search_verifications" ON visual_search_verifications
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_visual_search_verifications" ON visual_search_verifications;
CREATE POLICY "insert_own_visual_search_verifications" ON visual_search_verifications
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_visual_search_verifications" ON visual_search_verifications;
CREATE POLICY "delete_own_visual_search_verifications" ON visual_search_verifications
  FOR DELETE USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS visual_search_feedback (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  query       TEXT        NOT NULL,
  query_hash  TEXT        NOT NULL,
  bookmark_id UUID        NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
  feedback    TEXT        NOT NULL,
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE visual_search_feedback
  ADD COLUMN IF NOT EXISTS user_id UUID,
  ADD COLUMN IF NOT EXISTS query TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS query_hash TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bookmark_id UUID,
  ADD COLUMN IF NOT EXISTS feedback TEXT NOT NULL DEFAULT 'relevant',
  ADD COLUMN IF NOT EXISTS reason TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE visual_search_feedback
  DROP CONSTRAINT IF EXISTS visual_search_feedback_user_id_fkey,
  DROP CONSTRAINT IF EXISTS visual_search_feedback_bookmark_id_fkey,
  DROP CONSTRAINT IF EXISTS visual_search_feedback_feedback_check,
  DROP CONSTRAINT IF EXISTS visual_search_feedback_query_check,
  DROP CONSTRAINT IF EXISTS visual_search_feedback_reason_check,
  ADD CONSTRAINT visual_search_feedback_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD CONSTRAINT visual_search_feedback_bookmark_id_fkey FOREIGN KEY (bookmark_id) REFERENCES bookmarks(id) ON DELETE CASCADE,
  ADD CONSTRAINT visual_search_feedback_feedback_check CHECK (feedback IN ('relevant', 'irrelevant', 'pinned')),
  ADD CONSTRAINT visual_search_feedback_query_check CHECK (char_length(query) <= 500),
  ADD CONSTRAINT visual_search_feedback_reason_check CHECK (reason IS NULL OR char_length(reason) <= 500);

CREATE INDEX IF NOT EXISTS visual_search_feedback_user_id_idx ON visual_search_feedback(user_id);
CREATE INDEX IF NOT EXISTS visual_search_feedback_query_hash_idx ON visual_search_feedback(query_hash);
CREATE INDEX IF NOT EXISTS visual_search_feedback_bookmark_id_idx ON visual_search_feedback(bookmark_id);

ALTER TABLE visual_search_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_visual_search_feedback" ON visual_search_feedback;
CREATE POLICY "select_own_visual_search_feedback" ON visual_search_feedback
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_visual_search_feedback" ON visual_search_feedback;
CREATE POLICY "insert_own_visual_search_feedback" ON visual_search_feedback
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_visual_search_feedback" ON visual_search_feedback;
CREATE POLICY "delete_own_visual_search_feedback" ON visual_search_feedback
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- Design DNA
-- ============================================================

CREATE TABLE IF NOT EXISTS design_dna (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bookmark_id         UUID        REFERENCES bookmarks(id) ON DELETE SET NULL,
  title               TEXT        NOT NULL DEFAULT '',
  source_url          TEXT        NOT NULL DEFAULT '',
  source_domain       TEXT        NOT NULL DEFAULT '',
  source_title        TEXT        NOT NULL DEFAULT '',
  screenshot_url      TEXT,
  typography          JSONB       NOT NULL DEFAULT '[]',
  colors              JSONB       NOT NULL DEFAULT '[]',
  components          TEXT[]      NOT NULL DEFAULT '{}',
  layout_patterns     TEXT[]      NOT NULL DEFAULT '{}',
  extraction_method   TEXT        NOT NULL DEFAULT 'html-css',
  extraction_status   TEXT        NOT NULL DEFAULT 'pending',
  extraction_error    TEXT,
  raw_extraction      JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE design_dna
  ADD COLUMN IF NOT EXISTS user_id UUID,
  ADD COLUMN IF NOT EXISTS bookmark_id UUID,
  ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS source_url TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS source_domain TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS source_title TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS screenshot_url TEXT,
  ADD COLUMN IF NOT EXISTS typography JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS colors JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS components TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS layout_patterns TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS extraction_method TEXT NOT NULL DEFAULT 'html-css',
  ADD COLUMN IF NOT EXISTS extraction_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS extraction_error TEXT,
  ADD COLUMN IF NOT EXISTS raw_extraction JSONB,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE design_dna
  DROP CONSTRAINT IF EXISTS design_dna_user_id_fkey,
  DROP CONSTRAINT IF EXISTS design_dna_bookmark_id_fkey,
  DROP CONSTRAINT IF EXISTS design_dna_extraction_status_check,
  DROP CONSTRAINT IF EXISTS design_dna_extraction_method_check,
  DROP CONSTRAINT IF EXISTS design_dna_title_check,
  DROP CONSTRAINT IF EXISTS design_dna_source_url_check,
  DROP CONSTRAINT IF EXISTS design_dna_source_domain_check,
  DROP CONSTRAINT IF EXISTS design_dna_source_title_check,
  DROP CONSTRAINT IF EXISTS design_dna_extraction_error_check,
  DROP CONSTRAINT IF EXISTS design_dna_user_bookmark_key,
  ADD CONSTRAINT design_dna_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD CONSTRAINT design_dna_bookmark_id_fkey FOREIGN KEY (bookmark_id) REFERENCES bookmarks(id) ON DELETE SET NULL,
  ADD CONSTRAINT design_dna_extraction_status_check CHECK (extraction_status IN ('pending', 'completed', 'failed')),
  ADD CONSTRAINT design_dna_extraction_method_check CHECK (extraction_method IN ('html-css', 'dom', 'dom-plus-ai', 'manual')),
  ADD CONSTRAINT design_dna_title_check CHECK (char_length(title) <= 255),
  ADD CONSTRAINT design_dna_source_url_check CHECK (char_length(source_url) <= 2048),
  ADD CONSTRAINT design_dna_source_domain_check CHECK (char_length(source_domain) <= 255),
  ADD CONSTRAINT design_dna_source_title_check CHECK (char_length(source_title) <= 255),
  ADD CONSTRAINT design_dna_extraction_error_check CHECK (extraction_error IS NULL OR char_length(extraction_error) <= 500),
  ADD CONSTRAINT design_dna_user_bookmark_key UNIQUE (user_id, bookmark_id);

DROP TRIGGER IF EXISTS design_dna_updated_at ON design_dna;
CREATE TRIGGER design_dna_updated_at
  BEFORE UPDATE ON design_dna
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_design_dna_user_id ON design_dna(user_id);
CREATE INDEX IF NOT EXISTS idx_design_dna_bookmark_id ON design_dna(bookmark_id);
CREATE INDEX IF NOT EXISTS idx_design_dna_extraction_status ON design_dna(extraction_status);
CREATE INDEX IF NOT EXISTS idx_design_dna_created_at ON design_dna(created_at);

ALTER TABLE design_dna ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_design_dna" ON design_dna;
CREATE POLICY "select_own_design_dna" ON design_dna
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_design_dna" ON design_dna;
CREATE POLICY "insert_own_design_dna" ON design_dna
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_design_dna" ON design_dna;
CREATE POLICY "update_own_design_dna" ON design_dna
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_design_dna" ON design_dna;
CREATE POLICY "delete_own_design_dna" ON design_dna
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- Bookmark processing queue
-- ============================================================

CREATE TABLE IF NOT EXISTS bookmark_processing_jobs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  bookmark_id   UUID        NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url           TEXT        NOT NULL,
  status        TEXT        NOT NULL DEFAULT 'queued',
  attempts      INTEGER     NOT NULL DEFAULT 0,
  max_attempts  INTEGER     NOT NULL DEFAULT 3,
  error_message TEXT,
  locked_at     TIMESTAMPTZ,
  locked_by     TEXT,
  run_after     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE bookmark_processing_jobs
  ADD COLUMN IF NOT EXISTS bookmark_id UUID,
  ADD COLUMN IF NOT EXISTS user_id UUID,
  ADD COLUMN IF NOT EXISTS url TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'queued',
  ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_by TEXT,
  ADD COLUMN IF NOT EXISTS run_after TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE bookmark_processing_jobs
  DROP CONSTRAINT IF EXISTS bookmark_processing_jobs_bookmark_id_fkey,
  DROP CONSTRAINT IF EXISTS bookmark_processing_jobs_user_id_fkey,
  DROP CONSTRAINT IF EXISTS bookmark_processing_jobs_url_check,
  DROP CONSTRAINT IF EXISTS bookmark_processing_jobs_status_check,
  DROP CONSTRAINT IF EXISTS bookmark_processing_jobs_attempts_check,
  DROP CONSTRAINT IF EXISTS bookmark_processing_jobs_max_attempts_check,
  DROP CONSTRAINT IF EXISTS bookmark_processing_jobs_error_message_check,
  ADD CONSTRAINT bookmark_processing_jobs_bookmark_id_fkey FOREIGN KEY (bookmark_id) REFERENCES bookmarks(id) ON DELETE CASCADE,
  ADD CONSTRAINT bookmark_processing_jobs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD CONSTRAINT bookmark_processing_jobs_url_check CHECK (char_length(url) <= 2048),
  ADD CONSTRAINT bookmark_processing_jobs_status_check CHECK (status IN ('queued', 'processing', 'ready', 'failed', 'cancelled')),
  ADD CONSTRAINT bookmark_processing_jobs_attempts_check CHECK (attempts >= 0),
  ADD CONSTRAINT bookmark_processing_jobs_max_attempts_check CHECK (max_attempts BETWEEN 1 AND 10),
  ADD CONSTRAINT bookmark_processing_jobs_error_message_check CHECK (error_message IS NULL OR char_length(error_message) <= 1000);

DROP TRIGGER IF EXISTS bookmark_processing_jobs_updated_at ON bookmark_processing_jobs;
CREATE TRIGGER bookmark_processing_jobs_updated_at
  BEFORE UPDATE ON bookmark_processing_jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_bookmark_jobs_status_run_after
  ON bookmark_processing_jobs(status, run_after, created_at);

CREATE INDEX IF NOT EXISTS idx_bookmark_jobs_bookmark_id
  ON bookmark_processing_jobs(bookmark_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bookmark_jobs_one_active_per_bookmark
  ON bookmark_processing_jobs(bookmark_id)
  WHERE status IN ('queued', 'processing');

ALTER TABLE bookmark_processing_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_bookmark_processing_jobs" ON bookmark_processing_jobs;
CREATE POLICY "select_own_bookmark_processing_jobs" ON bookmark_processing_jobs
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_bookmark_processing_jobs" ON bookmark_processing_jobs;
CREATE POLICY "insert_own_bookmark_processing_jobs" ON bookmark_processing_jobs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION claim_bookmark_processing_job(worker_id TEXT)
RETURNS bookmark_processing_jobs
LANGUAGE plpgsql
AS $$
DECLARE
  claimed_job bookmark_processing_jobs;
BEGIN
  WITH next_job AS (
    SELECT id
    FROM bookmark_processing_jobs
    WHERE status = 'queued'
      AND run_after <= NOW()
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  UPDATE bookmark_processing_jobs jobs
  SET
    status = 'processing',
    attempts = jobs.attempts + 1,
    locked_at = NOW(),
    locked_by = worker_id,
    error_message = NULL
  FROM next_job
  WHERE jobs.id = next_job.id
  RETURNING jobs.* INTO claimed_job;

  RETURN claimed_job;
END;
$$;

CREATE OR REPLACE FUNCTION enqueue_bookmark_processing_job(
  p_bookmark_id UUID,
  p_user_id UUID,
  p_url TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  active_job_id UUID;
  active_job_status TEXT;
  next_job_id UUID;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM bookmarks
    WHERE id = p_bookmark_id
      AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Bookmark not found';
  END IF;

  SELECT id, status
  INTO active_job_id, active_job_status
  FROM bookmark_processing_jobs
  WHERE bookmark_id = p_bookmark_id
    AND status IN ('queued', 'processing')
  ORDER BY created_at DESC
  LIMIT 1;

  IF active_job_id IS NOT NULL AND active_job_status = 'processing' THEN
    RETURN active_job_id;
  END IF;

  SELECT id
  INTO active_job_id
  FROM bookmark_processing_jobs
  WHERE bookmark_id = p_bookmark_id
    AND status = 'queued'
  ORDER BY created_at DESC
  LIMIT 1;

  IF active_job_id IS NOT NULL THEN
    UPDATE bookmark_processing_jobs
    SET
      url = p_url,
      status = 'queued',
      error_message = NULL,
      locked_at = NULL,
      locked_by = NULL,
      run_after = NOW()
    WHERE id = active_job_id
    RETURNING id INTO next_job_id;
  ELSE
    INSERT INTO bookmark_processing_jobs(bookmark_id, user_id, url, status)
    VALUES (p_bookmark_id, p_user_id, p_url, 'queued')
    RETURNING id INTO next_job_id;
  END IF;

  RETURN next_job_id;
END;
$$;

CREATE TABLE IF NOT EXISTS processor_trigger_state (
  key                 TEXT        PRIMARY KEY,
  last_triggered_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS processor_trigger_state_updated_at ON processor_trigger_state;
CREATE TRIGGER processor_trigger_state_updated_at
  BEFORE UPDATE ON processor_trigger_state
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE processor_trigger_state ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION request_processor_trigger(
  trigger_key TEXT,
  debounce_seconds INTEGER DEFAULT 30
)
RETURNS TABLE(should_trigger BOOLEAN, reason TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  previous_trigger TIMESTAMPTZ;
BEGIN
  SELECT last_triggered_at
  INTO previous_trigger
  FROM processor_trigger_state
  WHERE key = trigger_key
  FOR UPDATE;

  IF previous_trigger IS NOT NULL
     AND previous_trigger > NOW() - make_interval(secs => debounce_seconds) THEN
    should_trigger := FALSE;
    reason := 'debounced';
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO processor_trigger_state(key, last_triggered_at)
  VALUES (trigger_key, NOW())
  ON CONFLICT (key)
  DO UPDATE SET last_triggered_at = EXCLUDED.last_triggered_at;

  should_trigger := TRUE;
  reason := 'triggered';
  RETURN NEXT;
END;
$$;

-- ============================================================
-- Telegram capture
-- ============================================================

CREATE TABLE IF NOT EXISTS telegram_connections (
  id                           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  telegram_user_id             TEXT,
  telegram_chat_id             TEXT,
  telegram_username            TEXT,
  first_name                   TEXT,
  last_name                    TEXT,
  status                       TEXT        NOT NULL DEFAULT 'pending',
  verification_code_hash       TEXT,
  verification_code_expires_at TIMESTAMPTZ,
  connected_at                 TIMESTAMPTZ,
  disconnected_at              TIMESTAMPTZ,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE telegram_connections
  ADD COLUMN IF NOT EXISTS user_id UUID,
  ADD COLUMN IF NOT EXISTS telegram_user_id TEXT,
  ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT,
  ADD COLUMN IF NOT EXISTS telegram_username TEXT,
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS verification_code_hash TEXT,
  ADD COLUMN IF NOT EXISTS verification_code_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS connected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS disconnected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE telegram_connections
  DROP CONSTRAINT IF EXISTS telegram_connections_user_id_fkey,
  DROP CONSTRAINT IF EXISTS telegram_connections_status_check,
  DROP CONSTRAINT IF EXISTS telegram_connections_telegram_user_id_check,
  DROP CONSTRAINT IF EXISTS telegram_connections_telegram_chat_id_check,
  DROP CONSTRAINT IF EXISTS telegram_connections_telegram_username_check,
  DROP CONSTRAINT IF EXISTS telegram_connections_first_name_check,
  DROP CONSTRAINT IF EXISTS telegram_connections_last_name_check,
  DROP CONSTRAINT IF EXISTS telegram_connections_verification_code_hash_check,
  ADD CONSTRAINT telegram_connections_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD CONSTRAINT telegram_connections_status_check CHECK (status IN ('pending', 'connected', 'disabled')),
  ADD CONSTRAINT telegram_connections_telegram_user_id_check CHECK (telegram_user_id IS NULL OR char_length(telegram_user_id) <= 80),
  ADD CONSTRAINT telegram_connections_telegram_chat_id_check CHECK (telegram_chat_id IS NULL OR char_length(telegram_chat_id) <= 80),
  ADD CONSTRAINT telegram_connections_telegram_username_check CHECK (telegram_username IS NULL OR char_length(telegram_username) <= 120),
  ADD CONSTRAINT telegram_connections_first_name_check CHECK (first_name IS NULL OR char_length(first_name) <= 120),
  ADD CONSTRAINT telegram_connections_last_name_check CHECK (last_name IS NULL OR char_length(last_name) <= 120),
  ADD CONSTRAINT telegram_connections_verification_code_hash_check CHECK (verification_code_hash IS NULL OR char_length(verification_code_hash) <= 128);

ALTER TABLE telegram_connections
  ALTER COLUMN user_id SET NOT NULL,
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

DROP TRIGGER IF EXISTS telegram_connections_updated_at ON telegram_connections;
CREATE TRIGGER telegram_connections_updated_at
  BEFORE UPDATE ON telegram_connections
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS telegram_connections_user_id_key
  ON telegram_connections(user_id);

CREATE UNIQUE INDEX IF NOT EXISTS telegram_connections_telegram_user_id_key
  ON telegram_connections(telegram_user_id)
  WHERE telegram_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS telegram_connections_telegram_chat_id_key
  ON telegram_connections(telegram_chat_id)
  WHERE telegram_chat_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_telegram_connections_user_id ON telegram_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_connections_telegram_user_id ON telegram_connections(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_connections_telegram_chat_id ON telegram_connections(telegram_chat_id);
CREATE INDEX IF NOT EXISTS idx_telegram_connections_status ON telegram_connections(status);

ALTER TABLE telegram_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_telegram_connections" ON telegram_connections;
CREATE POLICY "select_own_telegram_connections" ON telegram_connections
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_telegram_connections" ON telegram_connections;
CREATE POLICY "insert_own_telegram_connections" ON telegram_connections
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_telegram_connections" ON telegram_connections;
CREATE POLICY "update_own_telegram_connections" ON telegram_connections
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_telegram_connections" ON telegram_connections;
CREATE POLICY "delete_own_telegram_connections" ON telegram_connections
  FOR DELETE USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS telegram_inbound_messages (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_message_id  TEXT,
  telegram_update_id   TEXT,
  telegram_user_id     TEXT,
  telegram_chat_id     TEXT,
  user_id              UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  message_text         TEXT        NOT NULL DEFAULT '',
  extracted_urls       TEXT[]      NOT NULL DEFAULT '{}',
  status               TEXT        NOT NULL DEFAULT 'received',
  error                TEXT,
  raw_payload          JSONB,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at         TIMESTAMPTZ
);

ALTER TABLE telegram_inbound_messages
  ADD COLUMN IF NOT EXISTS provider_message_id TEXT,
  ADD COLUMN IF NOT EXISTS telegram_update_id TEXT,
  ADD COLUMN IF NOT EXISTS telegram_user_id TEXT,
  ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT,
  ADD COLUMN IF NOT EXISTS user_id UUID,
  ADD COLUMN IF NOT EXISTS message_text TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS extracted_urls TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'received',
  ADD COLUMN IF NOT EXISTS error TEXT,
  ADD COLUMN IF NOT EXISTS raw_payload JSONB,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

ALTER TABLE telegram_inbound_messages
  DROP CONSTRAINT IF EXISTS telegram_inbound_messages_user_id_fkey,
  DROP CONSTRAINT IF EXISTS telegram_inbound_messages_status_check,
  DROP CONSTRAINT IF EXISTS telegram_inbound_messages_provider_message_id_check,
  DROP CONSTRAINT IF EXISTS telegram_inbound_messages_telegram_update_id_check,
  DROP CONSTRAINT IF EXISTS telegram_inbound_messages_telegram_user_id_check,
  DROP CONSTRAINT IF EXISTS telegram_inbound_messages_telegram_chat_id_check,
  DROP CONSTRAINT IF EXISTS telegram_inbound_messages_message_text_check,
  DROP CONSTRAINT IF EXISTS telegram_inbound_messages_error_check,
  ADD CONSTRAINT telegram_inbound_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD CONSTRAINT telegram_inbound_messages_status_check CHECK (status IN ('received', 'processed', 'failed', 'ignored', 'verification')),
  ADD CONSTRAINT telegram_inbound_messages_provider_message_id_check CHECK (provider_message_id IS NULL OR char_length(provider_message_id) <= 80),
  ADD CONSTRAINT telegram_inbound_messages_telegram_update_id_check CHECK (telegram_update_id IS NULL OR char_length(telegram_update_id) <= 80),
  ADD CONSTRAINT telegram_inbound_messages_telegram_user_id_check CHECK (telegram_user_id IS NULL OR char_length(telegram_user_id) <= 80),
  ADD CONSTRAINT telegram_inbound_messages_telegram_chat_id_check CHECK (telegram_chat_id IS NULL OR char_length(telegram_chat_id) <= 80),
  ADD CONSTRAINT telegram_inbound_messages_message_text_check CHECK (char_length(message_text) <= 12000),
  ADD CONSTRAINT telegram_inbound_messages_error_check CHECK (error IS NULL OR char_length(error) <= 1000);

ALTER TABLE telegram_inbound_messages
  ALTER COLUMN message_text SET NOT NULL,
  ALTER COLUMN extracted_urls SET NOT NULL,
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_telegram_inbound_messages_user_id ON telegram_inbound_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_inbound_messages_chat_id ON telegram_inbound_messages(telegram_chat_id);
CREATE INDEX IF NOT EXISTS idx_telegram_inbound_messages_update_id ON telegram_inbound_messages(telegram_update_id);
CREATE INDEX IF NOT EXISTS idx_telegram_inbound_messages_status ON telegram_inbound_messages(status);
CREATE INDEX IF NOT EXISTS idx_telegram_inbound_messages_created_at ON telegram_inbound_messages(created_at);

ALTER TABLE telegram_inbound_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_telegram_inbound_messages" ON telegram_inbound_messages;
CREATE POLICY "select_own_telegram_inbound_messages" ON telegram_inbound_messages
  FOR SELECT USING (auth.uid() = user_id);

-- ============================================================
-- Early access signups
-- ============================================================

CREATE TABLE IF NOT EXISTS early_access_signups (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT        NOT NULL,
  source      TEXT        NOT NULL DEFAULT 'landing',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE early_access_signups
  ADD COLUMN IF NOT EXISTS email TEXT NOT NULL,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'landing',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE early_access_signups
  DROP CONSTRAINT IF EXISTS early_access_signups_email_check,
  DROP CONSTRAINT IF EXISTS early_access_signups_source_check,
  ADD CONSTRAINT early_access_signups_email_check CHECK (char_length(email) <= 255),
  ADD CONSTRAINT early_access_signups_source_check CHECK (char_length(source) <= 80);

CREATE UNIQUE INDEX IF NOT EXISTS idx_early_access_signups_email_lower
  ON early_access_signups (lower(email));

DROP TRIGGER IF EXISTS early_access_signups_updated_at ON early_access_signups;
CREATE TRIGGER early_access_signups_updated_at
  BEFORE UPDATE ON early_access_signups
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE early_access_signups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "insert_early_access_signups" ON early_access_signups;
CREATE POLICY "insert_early_access_signups" ON early_access_signups
  FOR INSERT WITH CHECK (true);

-- ============================================================
-- Profiles
-- ============================================================

CREATE TABLE IF NOT EXISTS profiles (
  user_id      UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL DEFAULT '',
  email        TEXT        NOT NULL DEFAULT '',
  phone        TEXT        NOT NULL DEFAULT '',
  avatar_path  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS avatar_path TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_name_check,
  DROP CONSTRAINT IF EXISTS profiles_email_check,
  DROP CONSTRAINT IF EXISTS profiles_phone_check,
  DROP CONSTRAINT IF EXISTS profiles_avatar_path_check,
  ADD CONSTRAINT profiles_name_check CHECK (char_length(name) <= 120),
  ADD CONSTRAINT profiles_email_check CHECK (char_length(email) <= 255),
  ADD CONSTRAINT profiles_phone_check CHECK (char_length(phone) <= 40),
  ADD CONSTRAINT profiles_avatar_path_check CHECK (avatar_path IS NULL OR char_length(avatar_path) <= 1024);

DROP TRIGGER IF EXISTS profiles_updated_at ON profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile" ON profiles
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_profile" ON profiles;
CREATE POLICY "insert_own_profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_profile" ON profiles;
CREATE POLICY "delete_own_profile" ON profiles
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- Onboarding state
-- ============================================================

CREATE TABLE IF NOT EXISTS user_onboarding (
  user_id        UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_type TEXT        NOT NULL DEFAULT '',
  primary_goal   TEXT        NOT NULL DEFAULT '',
  focus_area     TEXT        NOT NULL DEFAULT '',
  current_step   TEXT        NOT NULL DEFAULT 'welcome',
  completed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_onboarding
  ADD COLUMN IF NOT EXISTS workspace_type TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS primary_goal TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS focus_area TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS current_step TEXT NOT NULL DEFAULT 'welcome',
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE user_onboarding
  DROP CONSTRAINT IF EXISTS user_onboarding_workspace_type_check,
  DROP CONSTRAINT IF EXISTS user_onboarding_primary_goal_check,
  DROP CONSTRAINT IF EXISTS user_onboarding_focus_area_check,
  DROP CONSTRAINT IF EXISTS user_onboarding_current_step_check,
  ADD CONSTRAINT user_onboarding_workspace_type_check CHECK (workspace_type IN ('', 'solo_creator', 'team')),
  ADD CONSTRAINT user_onboarding_primary_goal_check CHECK (primary_goal IN ('', 'save_links', 'organize_research', 'build_moodboards')),
  ADD CONSTRAINT user_onboarding_focus_area_check CHECK (focus_area IN ('', 'product_design', 'branding', 'marketing', 'general')),
  ADD CONSTRAINT user_onboarding_current_step_check CHECK (current_step IN ('welcome', 'preferences', 'telegram', 'complete'));

DROP TRIGGER IF EXISTS user_onboarding_updated_at ON user_onboarding;
CREATE TRIGGER user_onboarding_updated_at
  BEFORE UPDATE ON user_onboarding
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE user_onboarding ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_user_onboarding" ON user_onboarding;
CREATE POLICY "select_own_user_onboarding" ON user_onboarding
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_user_onboarding" ON user_onboarding;
CREATE POLICY "insert_own_user_onboarding" ON user_onboarding
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_user_onboarding" ON user_onboarding;
CREATE POLICY "update_own_user_onboarding" ON user_onboarding
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_user_onboarding" ON user_onboarding;
CREATE POLICY "delete_own_user_onboarding" ON user_onboarding
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- Canvas sections
-- ============================================================

CREATE TABLE IF NOT EXISTS canvas_sections (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label       TEXT        NOT NULL DEFAULT 'Section',
  x           REAL        NOT NULL DEFAULT 60,
  y           REAL        NOT NULL DEFAULT 60,
  width       REAL        NOT NULL DEFAULT 420,
  height      REAL        NOT NULL DEFAULT 300,
  color       TEXT        NOT NULL DEFAULT '#FFFFFF',
  z_index     INTEGER     NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE canvas_sections
  DROP CONSTRAINT IF EXISTS canvas_sections_label_check,
  DROP CONSTRAINT IF EXISTS canvas_sections_color_check,
  DROP CONSTRAINT IF EXISTS canvas_sections_size_check,
  ADD CONSTRAINT canvas_sections_label_check CHECK (char_length(label) BETWEEN 1 AND 120),
  ADD CONSTRAINT canvas_sections_color_check CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  ADD CONSTRAINT canvas_sections_size_check CHECK (width >= 180 AND height >= 120);

DROP TRIGGER IF EXISTS canvas_sections_updated_at ON canvas_sections;
CREATE TRIGGER canvas_sections_updated_at
  BEFORE UPDATE ON canvas_sections
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_sections_user_id ON canvas_sections(user_id);
CREATE INDEX IF NOT EXISTS idx_sections_user_created ON canvas_sections(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sections_user_z ON canvas_sections(user_id, z_index);

ALTER TABLE canvas_sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_sections" ON canvas_sections;
CREATE POLICY "select_own_sections" ON canvas_sections
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_sections" ON canvas_sections;
CREATE POLICY "insert_own_sections" ON canvas_sections
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_sections" ON canvas_sections;
CREATE POLICY "update_own_sections" ON canvas_sections
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_sections" ON canvas_sections;
CREATE POLICY "delete_own_sections" ON canvas_sections
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- Canvas notes
-- ============================================================

CREATE TABLE IF NOT EXISTS canvas_notes (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  section_id    UUID        REFERENCES canvas_sections(id) ON DELETE SET NULL,
  type          TEXT        NOT NULL,
  content       TEXT        NOT NULL DEFAULT '',
  media_source  TEXT,
  media_path    TEXT,
  media_mime    TEXT,
  media_name    TEXT,
  content_json  JSONB,
  content_format TEXT       NOT NULL DEFAULT 'plain',
  x             REAL        NOT NULL DEFAULT 100,
  y             REAL        NOT NULL DEFAULT 100,
  width         REAL        NOT NULL DEFAULT 240,
  height        REAL        NOT NULL DEFAULT 180,
  color         TEXT        NOT NULL DEFAULT '#FFF9C4',
  z_index       INTEGER     NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE canvas_notes
  ADD COLUMN IF NOT EXISTS section_id UUID,
  ADD COLUMN IF NOT EXISTS media_source TEXT,
  ADD COLUMN IF NOT EXISTS media_path TEXT,
  ADD COLUMN IF NOT EXISTS media_mime TEXT,
  ADD COLUMN IF NOT EXISTS media_name TEXT,
  ADD COLUMN IF NOT EXISTS content_json JSONB,
  ADD COLUMN IF NOT EXISTS content_format TEXT NOT NULL DEFAULT 'plain';

ALTER TABLE canvas_notes
  DROP CONSTRAINT IF EXISTS canvas_notes_section_id_fkey,
  DROP CONSTRAINT IF EXISTS canvas_notes_type_check,
  DROP CONSTRAINT IF EXISTS canvas_notes_content_check,
  DROP CONSTRAINT IF EXISTS canvas_notes_content_format_check,
  DROP CONSTRAINT IF EXISTS canvas_notes_media_source_check,
  DROP CONSTRAINT IF EXISTS canvas_notes_media_path_check,
  DROP CONSTRAINT IF EXISTS canvas_notes_media_mime_check,
  DROP CONSTRAINT IF EXISTS canvas_notes_media_name_check,
  ADD CONSTRAINT canvas_notes_section_id_fkey FOREIGN KEY (section_id) REFERENCES canvas_sections(id) ON DELETE SET NULL,
  ADD CONSTRAINT canvas_notes_type_check CHECK (type IN ('text','text_frame','link','image','video','social')),
  ADD CONSTRAINT canvas_notes_content_check CHECK (char_length(content) <= 12000),
  ADD CONSTRAINT canvas_notes_content_format_check CHECK (content_format IN ('plain', 'rich')),
  ADD CONSTRAINT canvas_notes_media_source_check CHECK (media_source IS NULL OR media_source IN ('url','upload')),
  ADD CONSTRAINT canvas_notes_media_path_check CHECK (media_path IS NULL OR char_length(media_path) <= 1024),
  ADD CONSTRAINT canvas_notes_media_mime_check CHECK (media_mime IS NULL OR char_length(media_mime) <= 255),
  ADD CONSTRAINT canvas_notes_media_name_check CHECK (media_name IS NULL OR char_length(media_name) <= 255);

DROP TRIGGER IF EXISTS canvas_notes_updated_at ON canvas_notes;
CREATE TRIGGER canvas_notes_updated_at
  BEFORE UPDATE ON canvas_notes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_notes_user_id ON canvas_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_user_created ON canvas_notes(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_section_id ON canvas_notes(section_id);
CREATE INDEX IF NOT EXISTS idx_notes_user_z ON canvas_notes(user_id, z_index);
CREATE INDEX IF NOT EXISTS idx_notes_user_position ON canvas_notes(user_id, x, y);

ALTER TABLE canvas_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_notes" ON canvas_notes;
CREATE POLICY "select_own_notes" ON canvas_notes
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_notes" ON canvas_notes;
CREATE POLICY "insert_own_notes" ON canvas_notes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_notes" ON canvas_notes;
CREATE POLICY "update_own_notes" ON canvas_notes
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_notes" ON canvas_notes;
CREATE POLICY "delete_own_notes" ON canvas_notes
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- Storage buckets and policies
-- ============================================================

-- Public bookmark screenshots cached from Microlink. Writes are restricted to each user's own folder.
INSERT INTO storage.buckets (id, name, public)
VALUES ('bookmark-screenshots', 'bookmark-screenshots', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "bookmark_screenshots_select_public" ON storage.objects;
CREATE POLICY "bookmark_screenshots_select_public" ON storage.objects
  FOR SELECT USING (bucket_id = 'bookmark-screenshots');

DROP POLICY IF EXISTS "bookmark_screenshots_insert_own" ON storage.objects;
CREATE POLICY "bookmark_screenshots_insert_own" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'bookmark-screenshots'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "bookmark_screenshots_update_own" ON storage.objects;
CREATE POLICY "bookmark_screenshots_update_own" ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'bookmark-screenshots'
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'bookmark-screenshots'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "bookmark_screenshots_delete_own" ON storage.objects;
CREATE POLICY "bookmark_screenshots_delete_own" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'bookmark-screenshots'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Public profile avatars. Writes are restricted to each user's own folder.
INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-avatars', 'profile-avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "profile_avatars_select_public" ON storage.objects;
CREATE POLICY "profile_avatars_select_public" ON storage.objects
  FOR SELECT USING (bucket_id = 'profile-avatars');

DROP POLICY IF EXISTS "profile_avatars_insert_own" ON storage.objects;
CREATE POLICY "profile_avatars_insert_own" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'profile-avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "profile_avatars_update_own" ON storage.objects;
CREATE POLICY "profile_avatars_update_own" ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'profile-avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'profile-avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "profile_avatars_delete_own" ON storage.objects;
CREATE POLICY "profile_avatars_delete_own" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'profile-avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Private canvas media uploads.
INSERT INTO storage.buckets (id, name, public)
VALUES ('canvas-media', 'canvas-media', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "canvas_media_select_own" ON storage.objects;
CREATE POLICY "canvas_media_select_own" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'canvas-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "canvas_media_insert_own" ON storage.objects;
CREATE POLICY "canvas_media_insert_own" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'canvas-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "canvas_media_update_own" ON storage.objects;
CREATE POLICY "canvas_media_update_own" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'canvas-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "canvas_media_delete_own" ON storage.objects;
CREATE POLICY "canvas_media_delete_own" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'canvas-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ============================================================
-- Admin dashboard
-- ============================================================

CREATE TABLE IF NOT EXISTS admin_users (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT        NOT NULL DEFAULT 'admin',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION is_admin(user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM admin_users
    WHERE admin_users.user_id = is_admin.user_id
  );
$$;

ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'admin',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE admin_users
  DROP CONSTRAINT IF EXISTS admin_users_role_check,
  ADD CONSTRAINT admin_users_role_check CHECK (role IN ('admin'));

CREATE INDEX IF NOT EXISTS idx_admin_users_user_id ON admin_users(user_id);

ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_users_select_admins" ON admin_users;
CREATE POLICY "admin_users_select_admins" ON admin_users
  FOR SELECT USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "admin_users_insert_admins" ON admin_users;
CREATE POLICY "admin_users_insert_admins" ON admin_users
  FOR INSERT WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "admin_users_update_admins" ON admin_users;
CREATE POLICY "admin_users_update_admins" ON admin_users
  FOR UPDATE USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "admin_users_delete_admins" ON admin_users;
CREATE POLICY "admin_users_delete_admins" ON admin_users
  FOR DELETE USING (is_admin(auth.uid()));

ALTER TABLE early_access_signups
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS role TEXT,
  ADD COLUMN IF NOT EXISTS current_tool TEXT,
  ADD COLUMN IF NOT EXISTS pain_point TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ;

ALTER TABLE early_access_signups
  DROP CONSTRAINT IF EXISTS early_access_signups_name_check,
  DROP CONSTRAINT IF EXISTS early_access_signups_role_check,
  DROP CONSTRAINT IF EXISTS early_access_signups_current_tool_check,
  DROP CONSTRAINT IF EXISTS early_access_signups_pain_point_check,
  DROP CONSTRAINT IF EXISTS early_access_signups_status_check,
  DROP CONSTRAINT IF EXISTS early_access_signups_notes_check,
  ADD CONSTRAINT early_access_signups_name_check CHECK (name IS NULL OR char_length(name) <= 120),
  ADD CONSTRAINT early_access_signups_role_check CHECK (role IS NULL OR char_length(role) <= 120),
  ADD CONSTRAINT early_access_signups_current_tool_check CHECK (current_tool IS NULL OR char_length(current_tool) <= 160),
  ADD CONSTRAINT early_access_signups_pain_point_check CHECK (pain_point IS NULL OR char_length(pain_point) <= 2000),
  ADD CONSTRAINT early_access_signups_status_check CHECK (status IN ('new', 'contacted', 'replied', 'invited', 'onboarded', 'not_interested')),
  ADD CONSTRAINT early_access_signups_notes_check CHECK (notes IS NULL OR char_length(notes) <= 2000);

DROP POLICY IF EXISTS "insert_early_access_signups" ON early_access_signups;

DROP POLICY IF EXISTS "early_access_insert_public" ON early_access_signups;
CREATE POLICY "early_access_insert_public" ON early_access_signups
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "early_access_select_admins" ON early_access_signups;
CREATE POLICY "early_access_select_admins" ON early_access_signups
  FOR SELECT USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "early_access_update_admins" ON early_access_signups;
CREATE POLICY "early_access_update_admins" ON early_access_signups
  FOR UPDATE USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "early_access_delete_admins" ON early_access_signups;
CREATE POLICY "early_access_delete_admins" ON early_access_signups
  FOR DELETE USING (is_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS email_templates (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL,
  slug          TEXT        NOT NULL UNIQUE,
  subject       TEXT        NOT NULL,
  preview_text  TEXT,
  html_content  TEXT        NOT NULL,
  text_content  TEXT,
  status        TEXT        NOT NULL DEFAULT 'draft',
  created_by    UUID        REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE email_templates
  ADD COLUMN IF NOT EXISTS preview_text TEXT,
  ADD COLUMN IF NOT EXISTS text_content TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE email_templates
  DROP CONSTRAINT IF EXISTS email_templates_name_check,
  DROP CONSTRAINT IF EXISTS email_templates_slug_check,
  DROP CONSTRAINT IF EXISTS email_templates_subject_check,
  DROP CONSTRAINT IF EXISTS email_templates_status_check,
  ADD CONSTRAINT email_templates_name_check CHECK (char_length(name) BETWEEN 1 AND 120),
  ADD CONSTRAINT email_templates_slug_check CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  ADD CONSTRAINT email_templates_subject_check CHECK (char_length(subject) BETWEEN 1 AND 200),
  ADD CONSTRAINT email_templates_status_check CHECK (status IN ('draft', 'active', 'archived'));

DROP TRIGGER IF EXISTS email_templates_updated_at ON email_templates;
CREATE TRIGGER email_templates_updated_at
  BEFORE UPDATE ON email_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_templates_admins" ON email_templates;
CREATE POLICY "email_templates_admins" ON email_templates
  FOR ALL USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS email_sends (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id       UUID        REFERENCES email_templates(id),
  recipient_email   TEXT        NOT NULL,
  recipient_name    TEXT,
  subject           TEXT        NOT NULL,
  status            TEXT        NOT NULL DEFAULT 'pending',
  resend_email_id   TEXT,
  error_message     TEXT,
  sent_by           UUID        REFERENCES auth.users(id),
  sent_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE email_sends
  DROP CONSTRAINT IF EXISTS email_sends_recipient_email_check,
  DROP CONSTRAINT IF EXISTS email_sends_subject_check,
  DROP CONSTRAINT IF EXISTS email_sends_status_check,
  ADD CONSTRAINT email_sends_recipient_email_check CHECK (char_length(recipient_email) <= 255),
  ADD CONSTRAINT email_sends_subject_check CHECK (char_length(subject) BETWEEN 1 AND 200),
  ADD CONSTRAINT email_sends_status_check CHECK (status IN ('pending', 'sent', 'failed'));

ALTER TABLE email_sends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_sends_admins" ON email_sends;
CREATE POLICY "email_sends_admins" ON email_sends
  FOR ALL USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS admin_activity_logs (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id  UUID        REFERENCES auth.users(id),
  action         TEXT        NOT NULL,
  entity_type    TEXT,
  entity_id      TEXT,
  metadata       JSONB       NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE admin_activity_logs
  DROP CONSTRAINT IF EXISTS admin_activity_logs_action_check,
  ADD CONSTRAINT admin_activity_logs_action_check CHECK (char_length(action) BETWEEN 1 AND 160);

ALTER TABLE admin_activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_activity_logs_admins" ON admin_activity_logs;
CREATE POLICY "admin_activity_logs_admins" ON admin_activity_logs
  FOR ALL USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

INSERT INTO email_templates (
  name,
  slug,
  subject,
  preview_text,
  html_content,
  text_content,
  status
)
VALUES (
  'Nyabag Early Access Welcome',
  'nyabag-early-access-welcome',
  'You''re early to Nyabag',
  'Thanks for joining Nyabag Early Access. You''re one of the first people on the list.',
  '<p>Hi {{firstName}},</p><p>Thanks for joining Nyabag Early Access. You''re one of the first people on the list.</p><p>Nyabag is a design memory workspace for saving references, notes, and visual context.</p><p><a href="{{nyabagUrl}}">Visit Nyabag</a></p>',
  'Hi {{firstName}}, Thanks for joining Nyabag Early Access. You''re one of the first people on the list. Visit {{nyabagUrl}}',
  'draft'
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO email_templates (
  name,
  slug,
  subject,
  preview_text,
  html_content,
  text_content,
  status
)
VALUES (
  'Template Mark 1',
  'template-mark-1',
  'Thanks for signing up!',
  'Thank you for joining the Nyabag early access list.',
  $template_mark_1$
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Thanks for signing up!</title>
  </head>
  <body style="margin:0;padding:0;background:#f1f1f1;font-family:Arial,Helvetica,sans-serif;color:#7b7b7b;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f1f1;margin:0;padding:40px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="720" cellspacing="0" cellpadding="0" style="width:720px;max-width:720px;margin:0 auto;">
            <tr>
              <td style="padding:0 0 40px 0;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td align="left" valign="middle">
                      <img src="{{nyabagUrl}}/nyabag-logo-email.png" width="204" alt="Nyabag" style="display:block;width:204px;height:auto;border:0;">
                    </td>
                    <td align="right" valign="middle">
                      <span style="display:inline-block;border:1.5px solid #16c82f;border-radius:8px;color:#16c82f;font-size:16px;font-weight:700;line-height:20px;padding:11px 15px;">
                        <span style="font-size:19px;vertical-align:-1px;">&#128274;</span>
                        <span style="display:inline-block;padding-left:8px;">EARLY ACCESS</span>
                      </span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="border:1px solid #cfcfcf;border-radius:14px;background:#ffffff;overflow:hidden;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td align="center" style="background-color:#202020;background-image:radial-gradient(circle,#3c3c3c 1.5px,transparent 1.5px);background-size:24px 24px;padding:60px 48px 0 48px;">
                      <h1 style="margin:0 0 54px 0;color:#e5e5e5;font-size:48px;line-height:1.1;font-weight:800;letter-spacing:-0.5px;">Thanks for signing up!</h1>
                      <img src="{{nyabagUrl}}/template-mark-1-dashboard.png" width="626" alt="Nyabag dashboard preview" style="display:block;width:626px;max-width:100%;height:auto;border:0;">
                      <img src="{{nyabagUrl}}/template-mark-1-dashboard.png" width="626" alt="Nyabag dashboard preview" style="display:block;width:626px;max-width:100%;height:auto;border:0;">
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:32px 29px 26px 29px;">
                      <div style="font-size:27px;line-height:1.5;font-weight:400;color:#7b7b7b;">
                        <p style="margin:0 0 40px 0;">Hey,</p>
                        <p style="margin:0 0 42px 0;">Thank you for joining the Nyabag early access list.<br>I’m Jayanth, the guy behind Nyabag. I’m building it from a problem I kept running into myself: saving design inspiration everywhere, then never being able to find the right reference when I actually needed it.</p>
                        <p style="margin:0 0 42px 0;">Browser bookmarks, screenshots, WhatsApp links, Telegram saves, Notion dumps, random folders, the whole chaos buffet.</p>
                        <p style="margin:0 0 42px 0;">Nyabag is meant to become a second memory for design. A calmer place to collect visual references, websites, notes, and ideas, then retrieve them naturally when you’re designing.</p>
                        <p style="margin:0 0 42px 0;">You’ll be one of the first people I invite when the early version is ready.</p>
                        <p style="margin:0 0 42px 0;">Before that, I’d love to know:</p>
                        <p style="margin:0 0 42px 0;">What do you currently use to save design inspiration? And what frustrates you the most about that workflow?</p>
                        <p style="margin:0 0 42px 0;">A short reply is more than enough.</p>
                        <p style="margin:0;">Thanks again,<br>Jayanth</p>
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
$template_mark_1$,
  'Hey,

Thank you for joining the Nyabag early access list.
I’m Jayanth, the guy behind Nyabag. I’m building it from a problem I kept running into myself: saving design inspiration everywhere, then never being able to find the right reference when I actually needed it.

Browser bookmarks, screenshots, WhatsApp links, Telegram saves, Notion dumps, random folders, the whole chaos buffet.

Nyabag is meant to become a second memory for design. A calmer place to collect visual references, websites, notes, and ideas, then retrieve them naturally when you’re designing.

You’ll be one of the first people I invite when the early version is ready.

Before that, I’d love to know:

What do you currently use to save design inspiration? And what frustrates you the most about that workflow?

A short reply is more than enough.

Thanks again,
Jayanth',
  'active'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  subject = EXCLUDED.subject,
  preview_text = EXCLUDED.preview_text,
  html_content = EXCLUDED.html_content,
  text_content = EXCLUDED.text_content,
  status = EXCLUDED.status,
  updated_at = NOW();

-- Force Supabase/PostgREST to refresh its schema cache after new columns,
-- tables, constraints, and policies are created.
NOTIFY pgrst, 'reload schema';


-- ============================================================
-- Rate limits
-- ============================================================

CREATE TABLE IF NOT EXISTS rate_limits (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  scope       TEXT        NOT NULL,
  identifier  TEXT        NOT NULL,
  count       INTEGER     NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(scope, identifier)
);

ALTER TABLE rate_limits
  DROP CONSTRAINT IF EXISTS rate_limits_scope_check,
  DROP CONSTRAINT IF EXISTS rate_limits_identifier_check,
  DROP CONSTRAINT IF EXISTS rate_limits_count_check,
  ADD CONSTRAINT rate_limits_scope_check CHECK (char_length(scope) <= 120),
  ADD CONSTRAINT rate_limits_identifier_check CHECK (char_length(identifier) <= 160),
  ADD CONSTRAINT rate_limits_count_check CHECK (count >= 0);

DROP TRIGGER IF EXISTS rate_limits_updated_at ON rate_limits;
CREATE TRIGGER rate_limits_updated_at
  BEFORE UPDATE ON rate_limits
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_rate_limits_scope_identifier
  ON rate_limits(scope, identifier);

CREATE INDEX IF NOT EXISTS idx_rate_limits_window_start
  ON rate_limits(window_start);

ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- No user-facing policies. This table should only be touched from server code
-- using the service role client.

-- ============================================================
-- Bookmark Folders
-- ============================================================

CREATE TABLE IF NOT EXISTS bookmark_folders (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id   UUID        REFERENCES bookmark_folders(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  description TEXT        NOT NULL DEFAULT '',
  color       TEXT,
  icon        TEXT,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE bookmark_folders
  ADD COLUMN IF NOT EXISTS parent_id   UUID REFERENCES bookmark_folders(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS color       TEXT,
  ADD COLUMN IF NOT EXISTS icon        TEXT,
  ADD COLUMN IF NOT EXISTS sort_order  INTEGER NOT NULL DEFAULT 0;

ALTER TABLE bookmark_folders
  DROP CONSTRAINT IF EXISTS bookmark_folders_name_check,
  DROP CONSTRAINT IF EXISTS bookmark_folders_description_check,
  DROP CONSTRAINT IF EXISTS bookmark_folders_color_check,
  DROP CONSTRAINT IF EXISTS bookmark_folders_icon_check,
  ADD CONSTRAINT bookmark_folders_name_check        CHECK (char_length(name) BETWEEN 1 AND 80),
  ADD CONSTRAINT bookmark_folders_description_check CHECK (char_length(description) <= 300),
  ADD CONSTRAINT bookmark_folders_color_check       CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$'),
  ADD CONSTRAINT bookmark_folders_icon_check        CHECK (icon IS NULL OR char_length(icon) <= 40);

DROP TRIGGER IF EXISTS bookmark_folders_updated_at ON bookmark_folders;
CREATE TRIGGER bookmark_folders_updated_at
  BEFORE UPDATE ON bookmark_folders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_bookmark_folders_user_id
  ON bookmark_folders(user_id);

CREATE INDEX IF NOT EXISTS idx_bookmark_folders_parent_id
  ON bookmark_folders(parent_id);

CREATE INDEX IF NOT EXISTS idx_bookmark_folders_user_parent
  ON bookmark_folders(user_id, parent_id);

CREATE INDEX IF NOT EXISTS idx_bookmark_folders_sort_order
  ON bookmark_folders(sort_order);

ALTER TABLE bookmark_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_bookmark_folders" ON bookmark_folders;
CREATE POLICY "select_own_bookmark_folders" ON bookmark_folders
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_bookmark_folders" ON bookmark_folders;
CREATE POLICY "insert_own_bookmark_folders" ON bookmark_folders
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_bookmark_folders" ON bookmark_folders;
CREATE POLICY "update_own_bookmark_folders" ON bookmark_folders
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_bookmark_folders" ON bookmark_folders;
CREATE POLICY "delete_own_bookmark_folders" ON bookmark_folders
  FOR DELETE USING (auth.uid() = user_id);

-- Add folder_id to bookmarks (nullable, ON DELETE SET NULL so deleting folder uncategorizes)
ALTER TABLE bookmarks
  ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES bookmark_folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS bookmarks_folder_id_idx
  ON bookmarks(folder_id);

CREATE INDEX IF NOT EXISTS bookmarks_user_folder_idx
  ON bookmarks(user_id, folder_id);
