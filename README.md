# Nyabag App

Nyabag is a desktop-first design memory workspace for saving, organizing, and rediscovering visual references.

This repo is the app-only deployment target for `app.nyabag.com`. The authenticated product opens at `/`; legacy `/app/*` URLs redirect to root equivalents.

## Local Development

```bash
npm install
npm run dev
```

Hosted Cortex search:

```text
CORTEX_API_URL=https://your-cortex-render-url.onrender.com
CORTEX_INTERNAL_API_KEY=shared-server-secret
```

Nyabag sends bookmarks to Cortex `/ingest` only after Oracle marks them ready and a screenshot URL exists. Cortex `/search` is the active bookmark search backend, and bookmark deletion best-effort calls Cortex to remove matching Neon memory and embedding rows. `CORTEX_API_URL` and `CORTEX_INTERNAL_API_KEY` are server-only and must not be prefixed with `NEXT_PUBLIC_`. Bookmark creation/deletion still succeeds if Cortex is unavailable; active search shows a small unavailable state instead of falling back to the old local/Gemini search stack.

Nyabag no longer runs app-side Gemini bookmark enrichment. The retired `bookmark_ai_metadata`, `bookmark_visual_facts`, and bookmark `ai_*` fields are removed by migration; Cortex owns AI memory/search.

Expected support routes:

- `/` protected bookmarks dashboard
- `/canvas`
- `/captures`
- `/folders/[folderId]`
- `/bookmarks/[id]`
- `/profile`
- `/login`
- `/signup`
- `/onboarding`
- `/privacy`
- `/terms`

## Verification

```bash
npm run build
npm run lint
```
