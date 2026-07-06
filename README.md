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
```

Nyabag sends newly created bookmarks to Cortex `/ingest` and uses Cortex `/search` as the active bookmark search backend. `CORTEX_API_URL` is server-only and must not be prefixed with `NEXT_PUBLIC_`. Bookmark creation still succeeds if Cortex is unavailable; active search shows a small unavailable state instead of falling back to the old local/Gemini search stack.

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
npm run check:bookmark-processor
```
