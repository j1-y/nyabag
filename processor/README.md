# Nyabag Bookmark Processor

This worker processes queued bookmark preview jobs outside the Next.js app. It claims jobs from Supabase, opens each URL with Playwright Chromium, captures a normal top-viewport screenshot for onboarding, captures a long full-page screenshot for app previews and visual memory, compresses both to WebP with Sharp, uploads them to Supabase Storage, and updates the bookmark row.

## Local Run

```bash
cd processor
npm install
npm run install-browsers
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... MAX_JOBS_PER_RUN=1 npm run process
```

On Windows PowerShell:

```powershell
cd processor
npm install
npm run install-browsers
$env:SUPABASE_URL="..."
$env:SUPABASE_SERVICE_ROLE_KEY="..."
$env:MAX_JOBS_PER_RUN="1"
npm run process
```

## Required Environment

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MAX_JOBS_PER_RUN`, default `5`
- `SCREENSHOT_TIMEOUT_MS`, default `15000`
- `SCREENSHOT_WIDTH`, default `1440`
- `SCREENSHOT_HEIGHT`, default `900`
- `MAX_WEBP_HEIGHT`, default `900`
- `LONG_SCREENSHOT_HEIGHT`, default `900`
- `LONG_SCREENSHOT_MAX_WEBP_HEIGHT`, default `4000`
- `WEBP_QUALITY`, default `76`

The service role key must only run in trusted server or CI environments.
