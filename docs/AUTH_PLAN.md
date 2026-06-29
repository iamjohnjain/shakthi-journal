# Authentication & Data Storage Plan

## Current State: Local-Only, No Auth

Right now, Shakthi Journal has zero authentication. All data lives in:
- **IndexedDB** — health metrics, sync history, settings (persists across sessions in this browser)
- **localStorage** — Strava OAuth token only

This is intentional. For a single-person health journal on your own device, authentication adds complexity with no benefit. Your data never leaves your browser.

---

## Phase 1–3: Stay Local (Recommended)

### What this means:
- No accounts, no passwords, no cloud
- Data is in IndexedDB — persists until you clear browser data or delete it from Settings
- Works offline, works forever, no subscription required
- Privacy is guaranteed by design: health data never touches a server

### Risks of local-only:
- If you clear browser data, data is gone (mitigated by: export feature in Phase 2)
- Can't access data from another device (phone, different Mac)
- No backup unless you export regularly

### Verdict: This is the right choice for Phase 1–3. Don't add auth until you need multi-device.

---

## Phase 4: Consider Cloud Auth + Sync

### When to add it:
When you genuinely want to access your dashboard from your iPhone or a second Mac, and you're comfortable that data will leave your local device.

### Option A: Supabase (Recommended for Phase 4)

**What it is:** Open-source Firebase alternative. Postgres database, built-in auth, real-time subscriptions.

**Why Supabase:**
- Row-Level Security (RLS) means your health data is only readable by your own account
- Auth built in (supports Apple Sign-In via OAuth provider)
- Free tier: 500MB DB, 2GB bandwidth/month — more than enough
- Self-hostable if privacy is paramount
- Good TypeScript SDK

**How it would work:**
1. User signs in with Apple ID (via Supabase's Apple OAuth provider)
2. Supabase issues a JWT
3. All IndexedDB writes also write to Supabase tables
4. Data can be accessed from any device

**Tables needed:**
```sql
health_metrics (id, user_id, date, type, value, unit, source_id, data_mode, created_at)
sync_history   (id, user_id, source_id, status, records, started_at, completed_at)
settings       (user_id, key, value, updated_at)
```

**Privacy tradeoff:** Health data would be stored on Supabase servers (hosted by AWS). Encrypted at rest, row-level isolated, but leaves your device. If this is unacceptable, consider self-hosting Supabase.

### Option B: Apple Sign-In Only (Phase 4 alternative)

If you want Apple's privacy-first auth without a cloud DB, you could use:
- Apple Sign-In for identity (via Supabase or Clerk)
- Keep data in IndexedDB locally
- Use iCloud or a sync mechanism of your choice for backup

This gives you the convenience of "sign in with Apple" without storing health data in the cloud.

### Option C: Google Sign-In

Similar to Apple Sign-In but Google. Not recommended since this is a health journal and Google's data practices are less aligned with privacy goals.

---

## Phase 5: Custom Domain

When you host this publicly (even for personal use), you'll want:
1. A domain: e.g., `shakthi.health` or `journal.yourdomain.com`
2. HTTPS: required for Strava OAuth and any cookie-based auth
3. Hosting: Vercel, Netlify, or Cloudflare Pages (all free tier, all serve static React apps)

### On localhost vs domain:
- `http://localhost:5173` — only works on your own machine. Not accessible from your phone or other devices.
- A custom domain — accessible from anywhere. Strava's OAuth redirect URI must be updated to match.

**Cost estimate (Phase 5):**
- Domain: ~$12/year
- Hosting (Vercel/Netlify): Free for a personal app
- Supabase: Free tier covers it
- Total: ~$1/month

---

## Implementation Checklist (Do NOT implement yet)

When Phase 4 is ready:

- [ ] Create Supabase project
- [ ] Add Apple Sign-In provider in Supabase dashboard
- [ ] Install `@supabase/supabase-js`
- [ ] Create `src/services/supabase.ts` client
- [ ] Wrap app in `AuthProvider` that checks session
- [ ] Create auth routes: `/login`, `/auth/callback`
- [ ] Migrate IndexedDB write operations to also write to Supabase
- [ ] Add RLS policies: `auth.uid() = user_id`
- [ ] Add to `.env`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- [ ] Update `docs/PRIVACY_SECURITY.md` to reflect data now leaves device

---

## Current .env additions needed (future):

```bash
# Phase 4 — Supabase (DO NOT add yet)
# VITE_SUPABASE_URL=https://your-project.supabase.co
# VITE_SUPABASE_ANON_KEY=your-anon-key
```

---

## Bottom Line

**Phase 1–3 (now):** No auth. Local only. Perfect for a personal health journal on one machine.

**Phase 4:** Add Supabase + Apple Sign-In when you want multi-device access. Health data will then be stored in Supabase's cloud (opt-in).

**Phase 5:** Custom domain + HTTPS. Strava OAuth works properly (requires HTTPS in production).

**Phase 6:** Native iOS app via Expo or Swift with HealthKit access. The end state is an iOS app that reads directly from Apple Health in real time, with the web dashboard as a companion view.
