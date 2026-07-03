# Nyabag App

Nyabag is a desktop-first design memory workspace for saving, organizing, and rediscovering visual references.

This repo is the app-only deployment target for `app.nyabag.com`. The authenticated product opens at `/`; legacy `/app/*` URLs redirect to root equivalents.

## Local Development

```bash
npm install
npm run dev
```

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
