# HireBot

International tech job aggregator (Arbeitnow, Jobicy, Remote OK) — hosted on **Cloudflare Pages**.

## How it works
- `scripts/fetch-jobs.mjs` fetches the 3 sources in parallel, merges duplicates, detects each job's real country (flag) and writes `public/data/jobs.json`.
- `.github/workflows/refresh-jobs.yml` runs it every 3 hours and commits the snapshot → Cloudflare Pages redeploys automatically.
- `functions/` (Pages Functions) serves `POST|GET /search`, `GET /sources`, `GET /health` from that snapshot.
- `public/index.html` is the UI.

Filters: **Germany** (Germany only) · **Europe** (Germany first, then other European countries) · **Worldwide** (Germany → Europe → rest of the world). Sorted by geographic priority, then by date.

## Cloudflare Pages settings
Framework preset: None · Build command: *(empty)* · Build output directory: `public`

## Local checks
```bash
node scripts/test.mjs      # offline tests with mocked APIs
node scripts/fetch-jobs.mjs  # real fetch -> public/data/jobs.json
```
`legacy-python/` keeps the previous FastAPI/Docker version.
