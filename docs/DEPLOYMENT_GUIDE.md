# Deploying Shakthi Journal — Beginner's Guide

This guide assumes you have never deployed a website. Follow each step in order.

When you're done, you'll have a live URL like `https://shakthi-journal.pages.dev` accessible from any device, anywhere.

---

## What you'll need

- A GitHub account — [github.com/signup](https://github.com/signup)
- A Cloudflare account — [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up) (free)
- Your project code (the `Projects/` folder on your Mac)
- 20 minutes

---

## Step 1 — Create a GitHub repository

1. Sign in to [github.com](https://github.com).
2. Click the **+** icon in the top-right corner → **New repository**.
3. Fill in:
   - **Repository name:** `shakthi-journal`
   - **Visibility:** Private (recommended — only you can see the code)
   - **Do NOT** check "Add a README file" (you already have one)
4. Click **Create repository**.
5. GitHub shows you a page with setup commands. Copy the URL — it looks like:
   `https://github.com/YOUR_USERNAME/shakthi-journal.git`

---

## Step 2 — Push the project to GitHub

Open **Terminal** on your Mac. Run these commands one at a time:

```bash
cd ~/Projects
```

```bash
git init
git add .
git commit -m "Initial release — Phase 11"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/shakthi-journal.git
git push -u origin main
```

Replace `YOUR_USERNAME` with your actual GitHub username.

When prompted, enter your GitHub username and password (or personal access token if you use one).

**How to verify:** Refresh the GitHub page for your repository — you should see all your files listed there.

---

## Step 3 — Create a Cloudflare account

1. Go to [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up).
2. Enter your email and a password.
3. Verify your email address.
4. You don't need to add a domain or credit card.

---

## Step 4 — Go to Cloudflare Pages

1. In the Cloudflare dashboard, look at the left sidebar.
2. Click **Workers & Pages**.
3. Click the **Pages** tab.
4. Click **Create a project**.

---

## Step 5 — Connect GitHub

1. Click **Connect to Git**.
2. Click **Connect GitHub**.
3. A GitHub authorization page appears — click **Authorize Cloudflare Pages**.
4. Click **Install & Authorize** and select your `shakthi-journal` repository.
5. Back in Cloudflare, click **Begin setup** next to `shakthi-journal`.

---

## Step 6 — Configure the build

Fill in these fields exactly:

| Field | Value |
|---|---|
| **Project name** | `shakthi-journal` (or whatever you want in the URL) |
| **Production branch** | `main` |
| **Framework preset** | None |
| **Build command** | `npm run build` |
| **Build output directory** | `dist` |
| **Root directory** | *(leave empty)* |
| **Node.js version** | 20 |

To set the Node.js version:
1. Scroll down to **Environment variables**.
2. Click **Add variable**.
3. Name: `NODE_VERSION`, Value: `20`.

Add these variables too if you use Strava integration:

| Variable | Value |
|---|---|
| `VITE_APP_VERSION` | `0.4.0` |
| `VITE_STRAVA_CLIENT_ID` | *(your Strava app client ID)* |
| `VITE_STRAVA_CLIENT_SECRET` | *(your Strava app client secret)* |
| `VITE_STRAVA_REDIRECT_URI` | `https://YOUR_PROJECT.pages.dev/oauth/strava/callback` |

---

## Step 7 — Deploy

Click **Save and Deploy**.

Cloudflare will:
1. Clone your GitHub repository
2. Run `npm install`
3. Run `npm run build`
4. Publish the `dist/` folder

This takes about 60–90 seconds. You'll see a build log scroll by. A green checkmark means success.

---

## Step 8 — Verify the deployment

When the build finishes, Cloudflare shows you your live URL:

```
https://shakthi-journal.pages.dev
```

Click it. The app should open exactly as it does on localhost.

**Things to check:**
- [ ] App loads without white flash
- [ ] Navigation works (click through Today, Workouts, Nutrition, Settings)
- [ ] Refreshing a non-root page (e.g. `/settings`) doesn't return 404
- [ ] Settings → Backup & Restore → Export All Data downloads a file
- [ ] The page title in the browser tab says "Shakthi Journal"
- [ ] On iPhone: open in Safari → Share → Add to Home Screen → confirm the icon appears

If a page refresh gives a 404 error, check that `public/_redirects` exists with content `/* /index.html 200`. It should already be there.

---

## Step 9 — Share the URL

Your app is now live at `https://shakthi-journal.pages.dev`.

Share this URL with anyone you want to give access. They open it in any browser — no app store needed.

For iPhone users who want to install it:
1. Open the URL in **Safari** (not Chrome — Chrome doesn't support PWA install on iOS).
2. Tap **Share** → **Add to Home Screen** → **Add**.

---

## Ongoing workflow — how to update the app

Every time you push code to GitHub, Cloudflare automatically rebuilds and redeploys:

```bash
git add .
git commit -m "Description of changes"
git push
```

The update is live in ~60 seconds. No manual step needed.

---

## Your free URL

Cloudflare gives you:

```
https://YOUR_PROJECT_NAME.pages.dev
```

- Free forever on the free tier
- HTTPS included automatically
- Global CDN
- Unlimited bandwidth and requests

Optional: connect a custom domain under **Pages → Custom domains** (requires owning a domain, e.g. `shakthi.app`).

---

## Troubleshooting

**Build fails with `tsc: command not found`**
→ TypeScript is a dev dependency. Make sure your build command is `npm run build` (not just `tsc`).

**Build fails with missing env vars**
→ Add `NODE_VERSION=20` as an environment variable in Cloudflare. Also ensure all `VITE_*` vars are set.

**Blank page after deploy**
→ Check the browser console for errors. Usually means a missing `dist/index.html` or a JavaScript error.

**Page refresh gives 404**
→ Verify that `public/_redirects` contains `/* /index.html 200`.

**Strava login doesn't work**
→ Update `VITE_STRAVA_REDIRECT_URI` in Cloudflare env vars to point to your `.pages.dev` URL, not localhost.

---

## After deployment — migrate your local data

Your local data on `localhost:5173` will **not** automatically appear on the deployed URL. They are different origins.

To move your data:
1. On `localhost:5173`: Settings → Backup & Restore → **Export All Data**.
2. On `https://shakthi-journal.pages.dev`: Settings → Backup & Restore → **Choose Backup File** → **Replace all**.

See [BACKUP_RESTORE.md](BACKUP_RESTORE.md) for full details.
