# Roadmap

## Near term

- Keep the bookmark, folder, canvas, capture, profile, and onboarding surfaces aligned with the canonical architecture doc.
- Keep workspace scoping consistent across bookmarks, folders, canvas, captures, extension, Oracle, and Cortex paths.
- Keep Cortex-backed active search reliable, observable, and clearly separated from Supabase-owned bookmark rows.
- Keep the canvas stable as note, media, and section behavior evolves.
- Improve documentation coverage as the repo grows.

## In progress themes

- Cortex search quality, unavailable-state handling, and stale-ID cleanup planning.
- Workspaces V1 hardening after rollout: migration verification, extension workspace selection, and edge-case fallback handling.
- Processor reliability and job provenance.
- Canvas media handling and hot-save correctness.
- App-only deployment clarity for `app.nyabag.com`.
- Admin tooling and operational visibility.

## Likely future work

- Cortex search quality tuning with real-user feedback and hosted-service observability.
- Workspace team membership, invites, deletion/archive, collaboration, sharing, and billing controls.
- Browser extension polish and sync flow improvements.
- Figma integration or design-system export pathways.
- Richer Cortex evidence surfacing.
- Better monitoring for screenshot, enrichment, and storage failures.
- Reintroduce a separate marketing/content deployment only if product direction requires it.

## Constraints on roadmap changes

- Preserve desktop-first behavior.
- Keep mobile capture limited unless product direction changes.
- Do not claim unfinished AI features as complete.
- Do not expose workspace delete, invite, team, billing, sharing, or collaboration behavior until those semantics are deliberately designed.
- Update the memory layer whenever the roadmap meaningfully shifts.
