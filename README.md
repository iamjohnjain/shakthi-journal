# Shakthi Journal

A personal health OS — daily readiness, workouts, nutrition, and Apple Health data in a beautiful local-first dashboard.

**No accounts. No cloud. Everything lives in your browser's IndexedDB.**

## Tech

- Vite 6 + React 18 + TypeScript (strict)
- react-router-dom v7
- IndexedDB via `idb` v8
- Pure CSS, dark-mode-first

## Getting started

```bash
npm install
npm run dev          # → http://localhost:5173
```

## Mobile testing

```bash
npm run mobile       # starts with host mode
```

Then open the printed Network URL on your phone (same Wi-Fi).

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server at localhost:5173 |
| `npm run mobile` | Dev server accessible on local network |
| `npm run build` | Production build → `dist/` |
| `npm run preview` | Preview the production build |
| `npm test` | Run unit tests (Vitest) |
| `npx tsc --noEmit` | TypeScript check |

## Deploying

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for full Cloudflare Pages instructions.

## Data safety

All data is local. Export a backup before switching devices, browsers, or domains.

Settings → Backup & Restore → Export All Data

See [docs/BACKUP_RESTORE.md](docs/BACKUP_RESTORE.md) for details.

## Environment variables

Create `.env.local` (never committed):

```env
VITE_STRAVA_CLIENT_ID=
VITE_STRAVA_CLIENT_SECRET=
VITE_STRAVA_REDIRECT_URI=http://localhost:5173/oauth/strava/callback
VITE_APP_VERSION=0.4.0
```
