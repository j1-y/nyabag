# Workflows

## Feature Addition Workflow

- Files to inspect:
  - `docs/NYABAG_TECHNICAL_DOCUMENTATION.md`
  - `.ai-memory/feature-registry.md`
  - `.ai-memory/architecture.md`
  - Relevant route, component, and action files
- Files to update:
  - The feature implementation
  - `feature-registry.md`
  - `architecture.md` if the surface or flow changes
  - `decision-log.md` if the implementation choice matters later
- Validation steps:
  - Run `npm run build`
  - Run any focused checks for the touched area
- Memory updates required:
  - Feature surface changes always update `feature-registry.md`

## Bug Fix Workflow

- Files to inspect:
  - The failing route or component
  - The matching action or helper in `src/lib`
  - `docs/NYABAG_TECHNICAL_DOCUMENTATION.md` if the bug reveals a doc mismatch
- Files to update:
  - The bug source
  - `architecture.md` if the fix changes the flow
  - `decision-log.md` if the fix codifies a non-obvious choice
- Validation steps:
  - Reproduce the bug locally
  - Run `npm run build`
  - Run a targeted smoke or script check
- Memory updates required:
  - Update memory only if the bug fix changes the documented behavior

## Database Change Workflow

- Files to inspect:
  - `supabase/schema.sql`
  - `src/lib/actions.ts`
  - `src/lib/canvas-actions.ts`
  - `src/lib/folder-actions.ts`
  - Any route or component that depends on the changed fields
- Files to update:
  - `supabase/schema.sql`
  - Any related server action or loader
  - `architecture.md`
  - `decision-log.md` when the schema choice matters
- Validation steps:
  - Re-run the schema locally or in Supabase SQL editor
  - Run `npm run build`
- Memory updates required:
  - Update `architecture.md` and the relevant feature entry

## Bookmark Search Workflow

- Files to inspect:
  - `src/hooks/useBookmarks.tsx`
  - `src/lib/actions.ts`
  - `src/lib/cortex.ts`
  - `supabase/schema.sql`
  - `docs/BOOKMARK_SEARCH_ARCHITECTURE.md`
- Files to update:
  - Cortex client/action/hook/UI implementation
  - `supabase/schema.sql` only when a separately approved migration changes legacy search objects
  - `.ai-memory/architecture.md` and `.ai-memory/feature-registry.md`
  - `docs/BOOKMARK_SEARCH_ARCHITECTURE.md` for operational changes
- Validation steps:
  - Run `npm run build`
  - Run `npm run lint`
  - Run `npm run check:bookmark-processor` when create/processor behavior changes
- Memory updates required:
  - Update feature registry for search behavior, architecture for action/schema boundaries, and decision log for ranking strategy changes

## UI Change Workflow

- Files to inspect:
  - `src/app/globals.css`
  - The target component or page
  - `src/components/ui/*` if a shared primitive already exists
- Files to update:
  - The touched UI component
  - `architecture.md` if the surface or shell changes
  - `feature-registry.md` if the UI represents a new product surface
- Validation steps:
  - Run `npm run build`
  - Check the affected route in the browser if the change is visual
- Memory updates required:
  - Update the surface entry and any changed route description

## Infrastructure Change Workflow

- Files to inspect:
  - `processor/*`
  - `scripts/*`
  - `.github/workflows/*`
  - `docs/NYABAG_TECHNICAL_DOCUMENTATION.md`
- Files to update:
  - The script, workflow, or processor file
  - `architecture.md`
  - `roadmap.md` if the change shifts future work
- Validation steps:
  - Run the targeted script or workflow locally when possible
  - Run `npm run build`
- Memory updates required:
  - Update `architecture.md` and `roadmap.md` if operational behavior changes

## Documentation Update Workflow

- Files to inspect:
  - `AGENTS.md`
  - `.ai-memory/*`
  - `docs/NYABAG_TECHNICAL_DOCUMENTATION.md`
  - `README.md`
  - `CODEX_PROMPT.md`
- Files to update:
  - The specific memory file that matches the change
  - The canonical technical documentation for major behavior changes
- Validation steps:
  - Check that file paths in the docs are real
  - Keep the update narrow and Nyabag-specific
- Memory updates required:
  - Documentation changes should never drift from the live repo
