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
-- Workspaces
-- ============================================================

CREATE TABLE IF NOT EXISTS workspaces (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL DEFAULT 'Personal',
  description TEXT        NOT NULL DEFAULT '',
  icon        TEXT,
  color       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS owner_id UUID,
  ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT 'Personal',
  ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS icon TEXT,
  ADD COLUMN IF NOT EXISTS color TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE workspaces
  DROP CONSTRAINT IF EXISTS workspaces_owner_id_fkey,
  DROP CONSTRAINT IF EXISTS workspaces_name_check,
  DROP CONSTRAINT IF EXISTS workspaces_description_check,
  DROP CONSTRAINT IF EXISTS workspaces_icon_check,
  DROP CONSTRAINT IF EXISTS workspaces_color_check,
  ADD CONSTRAINT workspaces_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD CONSTRAINT workspaces_name_check CHECK (char_length(name) BETWEEN 1 AND 80),
  ADD CONSTRAINT workspaces_description_check CHECK (char_length(description) <= 500),
  ADD CONSTRAINT workspaces_icon_check CHECK (icon IS NULL OR char_length(icon) <= 80),
  ADD CONSTRAINT workspaces_color_check CHECK (color IS NULL OR char_length(color) <= 80);

DROP TRIGGER IF EXISTS workspaces_updated_at ON workspaces;
CREATE TRIGGER workspaces_updated_at
  BEFORE UPDATE ON workspaces
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_workspaces_owner_id ON workspaces(owner_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_owner_created ON workspaces(owner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS workspace_members (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role         TEXT        NOT NULL DEFAULT 'owner',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE workspace_members
  ADD COLUMN IF NOT EXISTS workspace_id UUID,
  ADD COLUMN IF NOT EXISTS user_id UUID,
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'owner',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE workspace_members
  DROP CONSTRAINT IF EXISTS workspace_members_workspace_id_fkey,
  DROP CONSTRAINT IF EXISTS workspace_members_user_id_fkey,
  DROP CONSTRAINT IF EXISTS workspace_members_role_check,
  ADD CONSTRAINT workspace_members_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  ADD CONSTRAINT workspace_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD CONSTRAINT workspace_members_role_check CHECK (role IN ('owner', 'admin', 'member', 'viewer'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_members_workspace_user
  ON workspace_members(workspace_id, user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_user_id ON workspace_members(user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace_id ON workspace_members(workspace_id);

DROP TRIGGER IF EXISTS workspace_members_updated_at ON workspace_members;
CREATE TRIGGER workspace_members_updated_at
  BEFORE UPDATE ON workspace_members
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION ensure_personal_workspace(p_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  workspace_id UUID;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT wm.workspace_id
    INTO workspace_id
  FROM workspace_members wm
  JOIN workspaces w ON w.id = wm.workspace_id
  WHERE wm.user_id = p_user_id
  ORDER BY w.created_at DESC
  LIMIT 1;

  IF workspace_id IS NULL THEN
    INSERT INTO workspaces (owner_id, name)
    VALUES (p_user_id, 'Personal')
    RETURNING id INTO workspace_id;

    INSERT INTO workspace_members (workspace_id, user_id, role)
    VALUES (workspace_id, p_user_id, 'owner')
    ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = 'owner';
  END IF;

  RETURN workspace_id;
END;
$$;

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_member_workspaces" ON workspaces;
CREATE POLICY "select_member_workspaces" ON workspaces
  FOR SELECT USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = workspaces.id
        AND wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "insert_own_workspaces" ON workspaces;
CREATE POLICY "insert_own_workspaces" ON workspaces
  FOR INSERT WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "update_owner_workspaces" ON workspaces;
CREATE POLICY "update_owner_workspaces" ON workspaces
  FOR UPDATE USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "delete_owner_workspaces" ON workspaces;
CREATE POLICY "delete_owner_workspaces" ON workspaces
  FOR DELETE USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "select_own_workspace_members" ON workspace_members;
CREATE POLICY "select_own_workspace_members" ON workspace_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM workspaces w
      WHERE w.id = workspace_members.workspace_id
        AND w.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "insert_owner_workspace_members" ON workspace_members;
CREATE POLICY "insert_owner_workspace_members" ON workspace_members
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM workspaces w
      WHERE w.id = workspace_members.workspace_id
        AND w.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "update_owner_workspace_members" ON workspace_members;
CREATE POLICY "update_owner_workspace_members" ON workspace_members
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM workspaces w
      WHERE w.id = workspace_members.workspace_id
        AND w.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "delete_owner_workspace_members" ON workspace_members;
CREATE POLICY "delete_owner_workspace_members" ON workspace_members
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM workspaces w
      WHERE w.id = workspace_members.workspace_id
        AND w.owner_id = auth.uid()
    )
  );

-- ============================================================
-- Bookmarks
-- ============================================================

CREATE TABLE IF NOT EXISTS bookmarks (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id             UUID        REFERENCES workspaces(id) ON DELETE CASCADE,
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
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
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
  ADD COLUMN IF NOT EXISTS save_reason TEXT,
  ADD COLUMN IF NOT EXISTS semantic_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS semantic_error TEXT,
  ADD COLUMN IF NOT EXISTS semantic_processed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cortex_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS cortex_error TEXT,
  ADD COLUMN IF NOT EXISTS cortex_memory_id TEXT,
  ADD COLUMN IF NOT EXISTS cortex_ingested_at TIMESTAMPTZ,
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
  DROP CONSTRAINT IF EXISTS bookmarks_save_reason_check,
  DROP CONSTRAINT IF EXISTS bookmarks_semantic_status_check,
  DROP CONSTRAINT IF EXISTS bookmarks_semantic_error_check,
  DROP CONSTRAINT IF EXISTS bookmarks_cortex_status_check,
  DROP CONSTRAINT IF EXISTS bookmarks_cortex_error_check,
  ADD CONSTRAINT bookmarks_url_check CHECK (char_length(url) <= 2048),
  ADD CONSTRAINT bookmarks_title_check CHECK (char_length(title) <= 255),
  ADD CONSTRAINT bookmarks_screenshot_path_check CHECK (screenshot_path IS NULL OR char_length(screenshot_path) <= 1024),
  ADD CONSTRAINT bookmarks_long_screenshot_path_check CHECK (long_screenshot_path IS NULL OR char_length(long_screenshot_path) <= 1024),
  ADD CONSTRAINT bookmarks_summary_check CHECK (char_length(summary) <= 1000),
  ADD CONSTRAINT bookmarks_note_check CHECK (char_length(note) <= 2000),
  ADD CONSTRAINT bookmarks_processing_status_check CHECK (processing_status IN ('queued', 'processing', 'ready', 'failed')),
  ADD CONSTRAINT bookmarks_save_reason_check CHECK (save_reason IS NULL OR char_length(save_reason) <= 500),
  ADD CONSTRAINT bookmarks_semantic_status_check CHECK (semantic_status IN ('pending', 'processing', 'ready', 'failed', 'skipped')),
  ADD CONSTRAINT bookmarks_semantic_error_check CHECK (semantic_error IS NULL OR char_length(semantic_error) <= 500),
  ADD CONSTRAINT bookmarks_cortex_status_check CHECK (cortex_status IN ('pending', 'processing', 'ready', 'failed', 'skipped')),
  ADD CONSTRAINT bookmarks_cortex_error_check CHECK (cortex_error IS NULL OR char_length(cortex_error) <= 500);

DROP TRIGGER IF EXISTS bookmarks_updated_at ON bookmarks;
CREATE TRIGGER bookmarks_updated_at
  BEFORE UPDATE ON bookmarks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_bookmarks_user_id ON bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_workspace_id ON bookmarks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_workspace ON bookmarks(user_id, workspace_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_workspace_created ON bookmarks(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookmarks_tags ON bookmarks USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_bookmarks_created ON bookmarks(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bookmarks_user_created_at_idx ON bookmarks(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_url ON bookmarks(user_id, url);
CREATE INDEX IF NOT EXISTS idx_bookmarks_processing_status ON bookmarks(processing_status);
CREATE INDEX IF NOT EXISTS idx_bookmarks_semantic_status ON bookmarks(semantic_status);
CREATE INDEX IF NOT EXISTS idx_bookmarks_cortex_ready_ingest
  ON bookmarks(user_id, workspace_id, cortex_status, updated_at DESC)
  WHERE processing_status = 'ready'
    AND (screenshot_url IS NOT NULL OR long_screenshot_url IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_bookmarks_workspace_cortex_ready_ingest
  ON bookmarks(workspace_id, cortex_status, updated_at DESC)
  WHERE processing_status = 'ready'
    AND (screenshot_url IS NOT NULL OR long_screenshot_url IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_bookmarks_search_vector ON bookmarks USING GIN(search_vector);

DROP TRIGGER IF EXISTS bookmarks_search_vector_update ON bookmarks;
ALTER TABLE bookmarks
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

DROP TRIGGER IF EXISTS bookmarks_search_vector_update ON bookmarks;
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
  FOR SELECT USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = bookmarks.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "insert_own_bookmarks" ON bookmarks;
CREATE POLICY "insert_own_bookmarks" ON bookmarks
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = bookmarks.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin', 'member')
    )
  );

DROP POLICY IF EXISTS "update_own_bookmarks" ON bookmarks;
CREATE POLICY "update_own_bookmarks" ON bookmarks
  FOR UPDATE USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = bookmarks.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin', 'member')
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = bookmarks.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin', 'member')
    )
  );

DROP POLICY IF EXISTS "delete_own_bookmarks" ON bookmarks;
CREATE POLICY "delete_own_bookmarks" ON bookmarks
  FOR DELETE USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = bookmarks.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin', 'member')
    )
  );

DROP TABLE IF EXISTS bookmark_ai_metadata CASCADE;
DROP TABLE IF EXISTS bookmark_visual_facts CASCADE;

-- ============================================================
-- Bookmark semantic embeddings
-- ============================================================

CREATE TABLE IF NOT EXISTS bookmark_embeddings (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id   UUID        REFERENCES workspaces(id) ON DELETE CASCADE,
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
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS bookmark_embeddings_workspace_id_idx
  ON bookmark_embeddings(workspace_id);
CREATE INDEX IF NOT EXISTS bookmark_embeddings_user_workspace_idx
  ON bookmark_embeddings(user_id, workspace_id);

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
  FOR SELECT USING (auth.uid() = user_id AND EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = bookmark_embeddings.workspace_id AND wm.user_id = auth.uid()));

DROP POLICY IF EXISTS "insert_own_bookmark_embeddings" ON bookmark_embeddings;
CREATE POLICY "insert_own_bookmark_embeddings" ON bookmark_embeddings
  FOR INSERT WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = bookmark_embeddings.workspace_id AND wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin', 'member')));

DROP POLICY IF EXISTS "update_own_bookmark_embeddings" ON bookmark_embeddings;
CREATE POLICY "update_own_bookmark_embeddings" ON bookmark_embeddings
  FOR UPDATE USING (auth.uid() = user_id AND EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = bookmark_embeddings.workspace_id AND wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin', 'member'))) WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = bookmark_embeddings.workspace_id AND wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin', 'member')));

DROP POLICY IF EXISTS "delete_own_bookmark_embeddings" ON bookmark_embeddings;
CREATE POLICY "delete_own_bookmark_embeddings" ON bookmark_embeddings
  FOR DELETE USING (auth.uid() = user_id AND EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = bookmark_embeddings.workspace_id AND wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin', 'member')));

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
-- Bookmark memory chunks
-- ============================================================

CREATE TABLE IF NOT EXISTS bookmark_memory_chunks (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID        REFERENCES workspaces(id) ON DELETE CASCADE,
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
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS bookmark_memory_chunks_workspace_id_idx ON bookmark_memory_chunks(workspace_id);
CREATE INDEX IF NOT EXISTS bookmark_memory_chunks_user_workspace_idx ON bookmark_memory_chunks(user_id, workspace_id);
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
  FOR SELECT USING (auth.uid() = user_id AND EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = bookmark_memory_chunks.workspace_id AND wm.user_id = auth.uid()));

DROP POLICY IF EXISTS "insert_own_bookmark_memory_chunks" ON bookmark_memory_chunks;
CREATE POLICY "insert_own_bookmark_memory_chunks" ON bookmark_memory_chunks
  FOR INSERT WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = bookmark_memory_chunks.workspace_id AND wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin', 'member')));

DROP POLICY IF EXISTS "update_own_bookmark_memory_chunks" ON bookmark_memory_chunks;
CREATE POLICY "update_own_bookmark_memory_chunks" ON bookmark_memory_chunks
  FOR UPDATE USING (auth.uid() = user_id AND EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = bookmark_memory_chunks.workspace_id AND wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin', 'member'))) WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = bookmark_memory_chunks.workspace_id AND wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin', 'member')));

DROP POLICY IF EXISTS "delete_own_bookmark_memory_chunks" ON bookmark_memory_chunks;
CREATE POLICY "delete_own_bookmark_memory_chunks" ON bookmark_memory_chunks
  FOR DELETE USING (auth.uid() = user_id AND EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = bookmark_memory_chunks.workspace_id AND wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin', 'member')));

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
  workspace_id    UUID        REFERENCES workspaces(id) ON DELETE CASCADE,
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
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS visual_search_verifications_workspace_id_idx ON visual_search_verifications(workspace_id);
CREATE INDEX IF NOT EXISTS visual_search_verifications_user_workspace_idx ON visual_search_verifications(user_id, workspace_id);
CREATE INDEX IF NOT EXISTS visual_search_verifications_query_hash_idx ON visual_search_verifications(query_hash);
CREATE INDEX IF NOT EXISTS visual_search_verifications_bookmark_id_idx ON visual_search_verifications(bookmark_id);

ALTER TABLE visual_search_verifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_visual_search_verifications" ON visual_search_verifications;
CREATE POLICY "select_own_visual_search_verifications" ON visual_search_verifications
  FOR SELECT USING (auth.uid() = user_id AND EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = visual_search_verifications.workspace_id AND wm.user_id = auth.uid()));

DROP POLICY IF EXISTS "insert_own_visual_search_verifications" ON visual_search_verifications;
CREATE POLICY "insert_own_visual_search_verifications" ON visual_search_verifications
  FOR INSERT WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = visual_search_verifications.workspace_id AND wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin', 'member')));

DROP POLICY IF EXISTS "delete_own_visual_search_verifications" ON visual_search_verifications;
CREATE POLICY "delete_own_visual_search_verifications" ON visual_search_verifications
  FOR DELETE USING (auth.uid() = user_id AND EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = visual_search_verifications.workspace_id AND wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin', 'member')));

CREATE TABLE IF NOT EXISTS visual_search_feedback (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID       REFERENCES workspaces(id) ON DELETE CASCADE,
  query       TEXT        NOT NULL,
  query_hash  TEXT        NOT NULL,
  bookmark_id UUID        NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
  feedback    TEXT        NOT NULL,
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE visual_search_feedback
  ADD COLUMN IF NOT EXISTS user_id UUID,
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS visual_search_feedback_workspace_id_idx ON visual_search_feedback(workspace_id);
CREATE INDEX IF NOT EXISTS visual_search_feedback_user_workspace_idx ON visual_search_feedback(user_id, workspace_id);
CREATE INDEX IF NOT EXISTS visual_search_feedback_query_hash_idx ON visual_search_feedback(query_hash);
CREATE INDEX IF NOT EXISTS visual_search_feedback_bookmark_id_idx ON visual_search_feedback(bookmark_id);

ALTER TABLE visual_search_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_visual_search_feedback" ON visual_search_feedback;
CREATE POLICY "select_own_visual_search_feedback" ON visual_search_feedback
  FOR SELECT USING (auth.uid() = user_id AND EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = visual_search_feedback.workspace_id AND wm.user_id = auth.uid()));

DROP POLICY IF EXISTS "insert_own_visual_search_feedback" ON visual_search_feedback;
CREATE POLICY "insert_own_visual_search_feedback" ON visual_search_feedback
  FOR INSERT WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = visual_search_feedback.workspace_id AND wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin', 'member')));

DROP POLICY IF EXISTS "delete_own_visual_search_feedback" ON visual_search_feedback;
CREATE POLICY "delete_own_visual_search_feedback" ON visual_search_feedback
  FOR DELETE USING (auth.uid() = user_id AND EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = visual_search_feedback.workspace_id AND wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin', 'member')));

-- ============================================================
-- Design DNA
-- ============================================================

CREATE TABLE IF NOT EXISTS design_dna (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id        UUID        REFERENCES workspaces(id) ON DELETE CASCADE,
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
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS idx_design_dna_workspace_id ON design_dna(workspace_id);
CREATE INDEX IF NOT EXISTS idx_design_dna_user_workspace ON design_dna(user_id, workspace_id);
CREATE INDEX IF NOT EXISTS idx_design_dna_bookmark_id ON design_dna(bookmark_id);
CREATE INDEX IF NOT EXISTS idx_design_dna_extraction_status ON design_dna(extraction_status);
CREATE INDEX IF NOT EXISTS idx_design_dna_created_at ON design_dna(created_at);

ALTER TABLE design_dna ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_design_dna" ON design_dna;
CREATE POLICY "select_own_design_dna" ON design_dna
  FOR SELECT USING (auth.uid() = user_id AND EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = design_dna.workspace_id AND wm.user_id = auth.uid()));

DROP POLICY IF EXISTS "insert_own_design_dna" ON design_dna;
CREATE POLICY "insert_own_design_dna" ON design_dna
  FOR INSERT WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = design_dna.workspace_id AND wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin', 'member')));

DROP POLICY IF EXISTS "update_own_design_dna" ON design_dna;
CREATE POLICY "update_own_design_dna" ON design_dna
  FOR UPDATE USING (auth.uid() = user_id AND EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = design_dna.workspace_id AND wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin', 'member'))) WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = design_dna.workspace_id AND wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin', 'member')));

DROP POLICY IF EXISTS "delete_own_design_dna" ON design_dna;
CREATE POLICY "delete_own_design_dna" ON design_dna
  FOR DELETE USING (auth.uid() = user_id AND EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = design_dna.workspace_id AND wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin', 'member')));

-- ============================================================
-- Bookmark processing queue
-- ============================================================

CREATE TABLE IF NOT EXISTS bookmark_processing_jobs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  bookmark_id   UUID        NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id  UUID        REFERENCES workspaces(id) ON DELETE CASCADE,
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
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS idx_bookmark_jobs_workspace_id
  ON bookmark_processing_jobs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_bookmark_jobs_user_workspace
  ON bookmark_processing_jobs(user_id, workspace_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bookmark_jobs_one_active_per_bookmark
  ON bookmark_processing_jobs(bookmark_id)
  WHERE status IN ('queued', 'processing');

ALTER TABLE bookmark_processing_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_bookmark_processing_jobs" ON bookmark_processing_jobs;
CREATE POLICY "select_own_bookmark_processing_jobs" ON bookmark_processing_jobs
  FOR SELECT USING (auth.uid() = user_id AND EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = bookmark_processing_jobs.workspace_id AND wm.user_id = auth.uid()));

DROP POLICY IF EXISTS "insert_own_bookmark_processing_jobs" ON bookmark_processing_jobs;
CREATE POLICY "insert_own_bookmark_processing_jobs" ON bookmark_processing_jobs
  FOR INSERT WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = bookmark_processing_jobs.workspace_id AND wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin', 'member')));

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
  p_url TEXT,
  p_workspace_id UUID DEFAULT NULL
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
  resolved_workspace_id UUID;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT workspace_id
  INTO resolved_workspace_id
  FROM bookmarks
  WHERE id = p_bookmark_id
    AND user_id = p_user_id
    AND (p_workspace_id IS NULL OR workspace_id = p_workspace_id);

  IF resolved_workspace_id IS NULL THEN
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
      workspace_id = resolved_workspace_id,
      status = 'queued',
      error_message = NULL,
      locked_at = NULL,
      locked_by = NULL,
      run_after = NOW()
    WHERE id = active_job_id
    RETURNING id INTO next_job_id;
  ELSE
    INSERT INTO bookmark_processing_jobs(bookmark_id, user_id, workspace_id, url, status)
    VALUES (p_bookmark_id, p_user_id, resolved_workspace_id, p_url, 'queued')
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
  workspace_id   UUID        REFERENCES workspaces(id) ON DELETE CASCADE,
  workspace_type TEXT        NOT NULL DEFAULT '',
  primary_goal   TEXT        NOT NULL DEFAULT '',
  focus_area     TEXT        NOT NULL DEFAULT '',
  current_step   TEXT        NOT NULL DEFAULT 'welcome',
  completed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_onboarding
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
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
  FOR INSERT WITH CHECK (auth.uid() = user_id AND (workspace_id IS NULL OR EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = user_onboarding.workspace_id AND wm.user_id = auth.uid())));

DROP POLICY IF EXISTS "update_own_user_onboarding" ON user_onboarding;
CREATE POLICY "update_own_user_onboarding" ON user_onboarding
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND (workspace_id IS NULL OR EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = user_onboarding.workspace_id AND wm.user_id = auth.uid())));

DROP POLICY IF EXISTS "delete_own_user_onboarding" ON user_onboarding;
CREATE POLICY "delete_own_user_onboarding" ON user_onboarding
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- Canvas sections
-- ============================================================

CREATE TABLE IF NOT EXISTS canvas_sections (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID       REFERENCES workspaces(id) ON DELETE CASCADE,
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
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS idx_sections_workspace_id ON canvas_sections(workspace_id);
CREATE INDEX IF NOT EXISTS idx_sections_user_workspace ON canvas_sections(user_id, workspace_id);
CREATE INDEX IF NOT EXISTS idx_sections_user_created ON canvas_sections(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sections_user_z ON canvas_sections(user_id, z_index);
CREATE INDEX IF NOT EXISTS idx_sections_workspace_z ON canvas_sections(workspace_id, z_index);

ALTER TABLE canvas_sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_sections" ON canvas_sections;
CREATE POLICY "select_own_sections" ON canvas_sections
  FOR SELECT USING (auth.uid() = user_id AND EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = canvas_sections.workspace_id AND wm.user_id = auth.uid()));

DROP POLICY IF EXISTS "insert_own_sections" ON canvas_sections;
CREATE POLICY "insert_own_sections" ON canvas_sections
  FOR INSERT WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = canvas_sections.workspace_id AND wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin', 'member')));

DROP POLICY IF EXISTS "update_own_sections" ON canvas_sections;
CREATE POLICY "update_own_sections" ON canvas_sections
  FOR UPDATE USING (auth.uid() = user_id AND EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = canvas_sections.workspace_id AND wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin', 'member'))) WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = canvas_sections.workspace_id AND wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin', 'member')));

DROP POLICY IF EXISTS "delete_own_sections" ON canvas_sections;
CREATE POLICY "delete_own_sections" ON canvas_sections
  FOR DELETE USING (auth.uid() = user_id AND EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = canvas_sections.workspace_id AND wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin', 'member')));

-- ============================================================
-- Canvas notes
-- ============================================================

CREATE TABLE IF NOT EXISTS canvas_notes (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id  UUID        REFERENCES workspaces(id) ON DELETE CASCADE,
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
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS idx_notes_workspace_id ON canvas_notes(workspace_id);
CREATE INDEX IF NOT EXISTS idx_notes_user_workspace ON canvas_notes(user_id, workspace_id);
CREATE INDEX IF NOT EXISTS idx_notes_user_created ON canvas_notes(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_section_id ON canvas_notes(section_id);
CREATE INDEX IF NOT EXISTS idx_notes_user_z ON canvas_notes(user_id, z_index);
CREATE INDEX IF NOT EXISTS idx_notes_workspace_z ON canvas_notes(workspace_id, z_index);
CREATE INDEX IF NOT EXISTS idx_notes_user_position ON canvas_notes(user_id, x, y);

ALTER TABLE canvas_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_notes" ON canvas_notes;
CREATE POLICY "select_own_notes" ON canvas_notes
  FOR SELECT USING (auth.uid() = user_id AND EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = canvas_notes.workspace_id AND wm.user_id = auth.uid()));

DROP POLICY IF EXISTS "insert_own_notes" ON canvas_notes;
CREATE POLICY "insert_own_notes" ON canvas_notes
  FOR INSERT WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = canvas_notes.workspace_id AND wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin', 'member')));

DROP POLICY IF EXISTS "update_own_notes" ON canvas_notes;
CREATE POLICY "update_own_notes" ON canvas_notes
  FOR UPDATE USING (auth.uid() = user_id AND EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = canvas_notes.workspace_id AND wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin', 'member'))) WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = canvas_notes.workspace_id AND wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin', 'member')));

DROP POLICY IF EXISTS "delete_own_notes" ON canvas_notes;
CREATE POLICY "delete_own_notes" ON canvas_notes
  FOR DELETE USING (auth.uid() = user_id AND EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = canvas_notes.workspace_id AND wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin', 'member')));

-- ============================================================
-- Captures
-- ============================================================

CREATE TABLE IF NOT EXISTS captures (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id    UUID        REFERENCES workspaces(id) ON DELETE CASCADE,
  path            TEXT        NOT NULL,
  capture_url     TEXT,
  page_url        TEXT,
  page_title      TEXT,
  original_size   INTEGER,
  compressed_size INTEGER,
  source          TEXT        NOT NULL DEFAULT 'extension',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE captures
  ADD COLUMN IF NOT EXISTS user_id UUID,
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS path TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS capture_url TEXT,
  ADD COLUMN IF NOT EXISTS page_url TEXT,
  ADD COLUMN IF NOT EXISTS page_title TEXT,
  ADD COLUMN IF NOT EXISTS original_size INTEGER,
  ADD COLUMN IF NOT EXISTS compressed_size INTEGER,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'extension',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE captures
  DROP CONSTRAINT IF EXISTS captures_user_id_fkey,
  DROP CONSTRAINT IF EXISTS captures_path_check,
  DROP CONSTRAINT IF EXISTS captures_page_url_check,
  DROP CONSTRAINT IF EXISTS captures_page_title_check,
  DROP CONSTRAINT IF EXISTS captures_source_check,
  DROP CONSTRAINT IF EXISTS captures_size_check,
  ADD CONSTRAINT captures_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD CONSTRAINT captures_path_check CHECK (char_length(path) BETWEEN 1 AND 1024),
  ADD CONSTRAINT captures_page_url_check CHECK (page_url IS NULL OR char_length(page_url) <= 2048),
  ADD CONSTRAINT captures_page_title_check CHECK (page_title IS NULL OR char_length(page_title) <= 255),
  ADD CONSTRAINT captures_source_check CHECK (char_length(source) <= 80),
  ADD CONSTRAINT captures_size_check CHECK ((original_size IS NULL OR original_size >= 0) AND (compressed_size IS NULL OR compressed_size >= 0));

CREATE INDEX IF NOT EXISTS captures_user_created
  ON captures(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS captures_workspace_created
  ON captures(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS captures_user_workspace
  ON captures(user_id, workspace_id);

ALTER TABLE captures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own captures" ON captures;
DROP POLICY IF EXISTS "select_own_captures" ON captures;
CREATE POLICY "select_own_captures" ON captures
  FOR SELECT USING (auth.uid() = user_id AND EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = captures.workspace_id AND wm.user_id = auth.uid()));

DROP POLICY IF EXISTS "insert_own_captures" ON captures;
CREATE POLICY "insert_own_captures" ON captures
  FOR INSERT WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = captures.workspace_id AND wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin', 'member')));

DROP POLICY IF EXISTS "delete_own_captures" ON captures;
CREATE POLICY "delete_own_captures" ON captures
  FOR DELETE USING (auth.uid() = user_id AND EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = captures.workspace_id AND wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin', 'member')));

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

-- Private browser-extension screenshot captures. Paths remain user-based;
-- workspace ownership is enforced on the captures table.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'captures',
  'captures',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

DROP POLICY IF EXISTS "Users own their captures" ON storage.objects;
DROP POLICY IF EXISTS "captures_storage_own" ON storage.objects;
CREATE POLICY "captures_storage_own" ON storage.objects
  FOR ALL
  USING (
    bucket_id = 'captures'
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'captures'
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
-- Extension web-session auth codes
-- ============================================================

CREATE TABLE IF NOT EXISTS extension_auth_codes (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash    TEXT        NOT NULL UNIQUE,
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email        TEXT        NOT NULL,
  redirect_uri TEXT        NOT NULL,
  state        TEXT        NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  consumed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE extension_auth_codes
  DROP CONSTRAINT IF EXISTS extension_auth_codes_code_hash_check,
  DROP CONSTRAINT IF EXISTS extension_auth_codes_email_check,
  DROP CONSTRAINT IF EXISTS extension_auth_codes_redirect_uri_check,
  DROP CONSTRAINT IF EXISTS extension_auth_codes_state_check,
  ADD CONSTRAINT extension_auth_codes_code_hash_check CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT extension_auth_codes_email_check CHECK (char_length(email) <= 320),
  ADD CONSTRAINT extension_auth_codes_redirect_uri_check CHECK (char_length(redirect_uri) <= 2048),
  ADD CONSTRAINT extension_auth_codes_state_check CHECK (char_length(state) BETWEEN 16 AND 256);

CREATE UNIQUE INDEX IF NOT EXISTS extension_auth_codes_code_hash_idx
  ON extension_auth_codes(code_hash);

CREATE INDEX IF NOT EXISTS extension_auth_codes_expires_at_idx
  ON extension_auth_codes(expires_at)
  WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS extension_auth_codes_user_created_idx
  ON extension_auth_codes(user_id, created_at DESC);

ALTER TABLE extension_auth_codes ENABLE ROW LEVEL SECURITY;

-- No user-facing policies. This table stores hashed one-time extension auth
-- codes and should only be touched from server code using the service role.

-- ============================================================
-- Bookmark Folders
-- ============================================================

CREATE TABLE IF NOT EXISTS bookmark_folders (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID       REFERENCES workspaces(id) ON DELETE CASCADE,
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
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS idx_bookmark_folders_workspace_id
  ON bookmark_folders(workspace_id);
CREATE INDEX IF NOT EXISTS idx_bookmark_folders_user_workspace
  ON bookmark_folders(user_id, workspace_id);

CREATE INDEX IF NOT EXISTS idx_bookmark_folders_parent_id
  ON bookmark_folders(parent_id);

CREATE INDEX IF NOT EXISTS idx_bookmark_folders_user_parent
  ON bookmark_folders(user_id, parent_id);
CREATE INDEX IF NOT EXISTS idx_bookmark_folders_workspace_parent_sort
  ON bookmark_folders(workspace_id, parent_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_bookmark_folders_sort_order
  ON bookmark_folders(sort_order);

ALTER TABLE bookmark_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_bookmark_folders" ON bookmark_folders;
CREATE POLICY "select_own_bookmark_folders" ON bookmark_folders
  FOR SELECT USING (auth.uid() = user_id AND EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = bookmark_folders.workspace_id AND wm.user_id = auth.uid()));

DROP POLICY IF EXISTS "insert_own_bookmark_folders" ON bookmark_folders;
CREATE POLICY "insert_own_bookmark_folders" ON bookmark_folders
  FOR INSERT WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = bookmark_folders.workspace_id AND wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin', 'member')));

DROP POLICY IF EXISTS "update_own_bookmark_folders" ON bookmark_folders;
CREATE POLICY "update_own_bookmark_folders" ON bookmark_folders
  FOR UPDATE USING (auth.uid() = user_id AND EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = bookmark_folders.workspace_id AND wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin', 'member'))) WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = bookmark_folders.workspace_id AND wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin', 'member')));

DROP POLICY IF EXISTS "delete_own_bookmark_folders" ON bookmark_folders;
CREATE POLICY "delete_own_bookmark_folders" ON bookmark_folders
  FOR DELETE USING (auth.uid() = user_id AND EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = bookmark_folders.workspace_id AND wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin', 'member')));

-- Add folder_id to bookmarks (nullable, ON DELETE SET NULL so deleting folder uncategorizes)
ALTER TABLE bookmarks
  ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES bookmark_folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS bookmarks_folder_id_idx
  ON bookmarks(folder_id);

CREATE INDEX IF NOT EXISTS bookmarks_user_folder_idx
  ON bookmarks(user_id, folder_id);

CREATE INDEX IF NOT EXISTS bookmarks_workspace_folder_idx
  ON bookmarks(workspace_id, folder_id);

-- ============================================================
-- Workspace backfill and required workspace boundaries
-- ============================================================

WITH source_users AS (
  SELECT user_id FROM bookmarks
  UNION SELECT user_id FROM bookmark_folders
  UNION SELECT user_id FROM canvas_notes
  UNION SELECT user_id FROM canvas_sections
  UNION SELECT user_id FROM captures
  UNION SELECT user_id FROM bookmark_processing_jobs
  UNION SELECT user_id FROM bookmark_embeddings
  UNION SELECT user_id FROM bookmark_memory_chunks
  UNION SELECT user_id FROM visual_search_verifications
  UNION SELECT user_id FROM visual_search_feedback
  UNION SELECT user_id FROM design_dna
  UNION SELECT user_id FROM user_onboarding
)
INSERT INTO workspaces (owner_id, name)
SELECT DISTINCT user_id, 'Personal'
FROM source_users su
WHERE su.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.user_id = su.user_id
  );

INSERT INTO workspace_members (workspace_id, user_id, role)
SELECT w.id, w.owner_id, 'owner'
FROM workspaces w
ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role;

UPDATE bookmarks
SET workspace_id = ensure_personal_workspace(user_id)
WHERE workspace_id IS NULL;

UPDATE bookmark_folders
SET workspace_id = ensure_personal_workspace(user_id)
WHERE workspace_id IS NULL;

UPDATE canvas_sections
SET workspace_id = ensure_personal_workspace(user_id)
WHERE workspace_id IS NULL;

UPDATE canvas_notes
SET workspace_id = ensure_personal_workspace(user_id)
WHERE workspace_id IS NULL;

UPDATE captures
SET workspace_id = ensure_personal_workspace(user_id)
WHERE workspace_id IS NULL;

UPDATE bookmark_processing_jobs bpj
SET workspace_id = COALESCE(
  (SELECT b.workspace_id FROM bookmarks b WHERE b.id = bpj.bookmark_id),
  ensure_personal_workspace(bpj.user_id)
)
WHERE bpj.workspace_id IS NULL;

UPDATE bookmark_embeddings be
SET workspace_id = COALESCE(
  (SELECT b.workspace_id FROM bookmarks b WHERE b.id = be.bookmark_id),
  ensure_personal_workspace(be.user_id)
)
WHERE be.workspace_id IS NULL;

UPDATE bookmark_memory_chunks bmc
SET workspace_id = COALESCE(
  (SELECT b.workspace_id FROM bookmarks b WHERE b.id = bmc.bookmark_id),
  ensure_personal_workspace(bmc.user_id)
)
WHERE bmc.workspace_id IS NULL;

UPDATE visual_search_verifications vsv
SET workspace_id = COALESCE(
  (SELECT b.workspace_id FROM bookmarks b WHERE b.id = vsv.bookmark_id),
  ensure_personal_workspace(vsv.user_id)
)
WHERE vsv.workspace_id IS NULL;

UPDATE visual_search_feedback vsf
SET workspace_id = COALESCE(
  (SELECT b.workspace_id FROM bookmarks b WHERE b.id = vsf.bookmark_id),
  ensure_personal_workspace(vsf.user_id)
)
WHERE vsf.workspace_id IS NULL;

UPDATE design_dna dd
SET workspace_id = COALESCE(
  (SELECT b.workspace_id FROM bookmarks b WHERE b.id = dd.bookmark_id),
  ensure_personal_workspace(dd.user_id)
)
WHERE dd.workspace_id IS NULL;

UPDATE user_onboarding
SET workspace_id = ensure_personal_workspace(user_id)
WHERE workspace_id IS NULL;

ALTER TABLE bookmarks ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE bookmark_folders ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE canvas_sections ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE canvas_notes ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE captures ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE bookmark_processing_jobs ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE bookmark_embeddings ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE bookmark_memory_chunks ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE visual_search_verifications ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE visual_search_feedback ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE design_dna ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE user_onboarding ALTER COLUMN workspace_id SET NOT NULL;

-- Force Supabase/PostgREST to refresh its schema cache after new columns,
-- tables, constraints, and policies are created.
NOTIFY pgrst, 'reload schema';
