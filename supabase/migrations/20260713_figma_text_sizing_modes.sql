DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'canvas_notes'
      AND column_name = 'text_sizing_mode'
  ) THEN
    ALTER TABLE canvas_notes
      ADD COLUMN text_sizing_mode TEXT NOT NULL DEFAULT 'fixed';

    UPDATE canvas_notes
    SET text_sizing_mode = CASE
      WHEN type = 'text_frame' AND height <= 80 THEN 'auto_width'
      ELSE 'fixed'
    END;
  END IF;
END
$$;

ALTER TABLE canvas_notes
  DROP CONSTRAINT IF EXISTS canvas_notes_text_sizing_mode_check,
  ADD CONSTRAINT canvas_notes_text_sizing_mode_check
    CHECK (text_sizing_mode IN ('auto_width', 'auto_height', 'fixed'));
