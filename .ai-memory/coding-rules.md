# Coding Rules

## General

- Prefer incremental, compatibility-preserving changes.
- Do not rewrite whole surfaces unless the task explicitly requires it.
- Do not remove working behavior just to simplify a change.
- Keep Nyabag-specific terminology in docs and code comments.

## Next.js and mutations

- Read the matching docs in `node_modules/next/dist/docs/` before changing Next.js behavior.
- Use module-level `"use server"` files for shared mutations when that matches the existing pattern.
- Verify auth and ownership inside every mutation path.
- Revalidate the affected routes after writes.
- Keep route, layout, loading, and route-handler files aligned with the actual app structure.

## UI and styling

- Preserve the current visual identity unless the task is explicitly a redesign.
- Favor shared UI primitives under `src/components/ui`.
- Render product UI icons through `HugeIcon` and semantic aliases from `src/components/ui/icons.ts`; Nyabag uses Hugeicons Stroke Rounded only.
- Render app icons at `18px` by default; the `HugeIcon` wrapper clamps smaller numeric sizes up to 18px.
- Keep the dashboard shell curve viewport-fixed at the sidebar/main-panel boundary; do not rely only on a scrolling content element for that visible curve.
- Keep desktop-first spacing and layout rules intact.
- Treat mobile as a constrained capture surface unless the task says otherwise.

## Data and schema

- Treat `supabase/schema.sql` as the canonical schema.
- Avoid schema edits unless the task explicitly includes database work.
- Do not introduce one-off data paths when a shared helper already exists.

## Documentation maintenance

- Update the matching memory file when the repo surface changes.
- Update `docs/NYABAG_TECHNICAL_DOCUMENTATION.md` for major functional or architectural changes.
- Keep `feature-registry.md` current when a user-facing surface is added or materially changed.
- Add a decision to `decision-log.md` when a choice affects future implementation work.

## Verification

- Use `npm run build` as the main high-signal check.
- Use targeted checks or script runs for the area you changed.
- Keep the reminder script warnings-only.
