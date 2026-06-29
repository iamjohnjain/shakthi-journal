# Deployment — Cloudflare Pages

Shakthi Journal is a fully static SPA. No server required. Cloudflare Pages hosts it for free with a global CDN.

---

## Prerequisites

- A GitHub account
- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier is sufficient)
- The project pushed to a GitHub repository

---

## Step 1 — Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/shakthi-journal.git
git push -u origin main
```

---

## Step 2 — Connect to Cloudflare Pages

1. Go to [Cloudflare Dashboard → Pages](https://dash.cloudflare.com/?to=/:account/pages).
2. Click **Create a project** → **Connect to Git**.
3. Authorize Cloudflare to access your GitHub.
4. Select your `shakthi-journal` repository.

---

## Step 3 — Configure build settings

| Setting | Value |
|---|---|
| **Framework preset** | None (leave blank) |
| **Build command** | `npm run build` |
| **Build output directory** | `dist` |
| **Root directory** | `/` (leave blank) |
| **Node.js version** | 20 or 22 |

---

## Step 4 — Environment variables

Under **Settings → Environment variables → Production**, add:

| Variable | Value |
|---|---|
| `VITE_APP_VERSION` | `0.4.0` |
| `VITE_STRAVA_CLIENT_ID` | Your Strava app's Client ID (if using Strava) |
| `VITE_STRAVA_CLIENT_SECRET` | Your Strava app's Client Secret (if using Strava) |
| `VITE_STRAVA_REDIRECT_URI` | `https://YOUR_PROJECT.pages.dev/oauth/strava/callback` |

> **Do not** commit `.env` or `.env.local` to git — they are in `.gitignore`.

---

## Step 5 — Deploy

Click **Save and Deploy**. Cloudflare clones your repo, runs `npm run build`, and publishes `dist/`.

Your app will be live at:

```
https://YOUR_PROJECT_NAME.pages.dev
```

Cloudflare assigns a random subdomain on first deploy. You can rename it under **Pages → Settings → Custom domains**.

---

## Step 6 — Fix SPA routing (important)

React Router handles routing client-side. Cloudflare Pages needs a redirect rule so direct links like `/settings/backup` don't return 404.

Create `public/_redirects` with this content:

```
/*  /index.html  200
```

This tells Cloudflare: serve `index.html` for every route and let React Router handle the rest.

---

## Custom domain (optional)

Under **Pages → Custom domains → Set up a custom domain**, enter your domain. Cloudflare handles SSL automatically.

---

## Subsequent deploys

Every push to `main` triggers a new deploy automatically. Preview deploys are created for every pull request at a unique URL.

---

## Data warning

IndexedDB data is **origin-scoped**. Data from `localhost:5173` is **not** visible at `your-project.pages.dev`, and vice versa.

**Before going live:** export a backup from `localhost:5173`, open the deployed URL, and import it with **Replace all**.

See [BACKUP_RESTORE.md](BACKUP_RESTORE.md).

---

## Offline behavior

The app has a PWA manifest and meta tags, but no service worker. This means:

- **Online:** works fully.
- **Offline after first load:** Cloudflare edge-caches the static assets. Safari and Chrome may serve them from the HTTP cache for a short time.
- **True offline-first:** requires a service worker (not yet implemented). Add one with [Vite PWA plugin](https://vite-pwa-org.netlify.app) when needed.

---

## Cloudflare Pages free tier limits

| Metric | Free limit |
|---|---|
| Builds per month | 500 |
| Bandwidth | Unlimited |
| Requests | Unlimited |
| Sites | Unlimited |
| Custom domains | Unlimited |

This app will never come close to the build limit for personal use.
