# Privacy Architecture
*Shakthi Journal — Privacy Audit & Principles*
*Last updated: 2026-06-30*

---

## Summary

Shakthi Journal is private by default. As of this audit, it collects no telemetry, sends no data to third parties, and processes all health data locally on the user's device. Cloud sync (Supabase) is entirely opt-in through account creation.

**Privacy risk level: Low.** No third-party data brokers, no analytics, no ad network SDKs.

---

## What Data Is Collected

### Data the User Explicitly Creates
| Data | Storage | Leaves Device? |
|---|---|---|
| Name, DOB, sex, height, weight | IndexedDB | Only if user creates account |
| Goal weight, activity level | IndexedDB | Only if user creates account |
| Workout sessions + exercises | IndexedDB | Only if user creates account |
| Nutrition entries (food, calories, macros) | IndexedDB | Only if user creates account |
| Daily logs (mood, energy, sleep quality) | IndexedDB | Only if user creates account |
| Apple Health import (if user imports) | IndexedDB | Only if user creates account |
| Avatar / profile photo | IndexedDB (base64) | Only if user creates account |
| Dashboard preferences | IndexedDB | Only if user creates account |

### Data Automatically Collected
**None.** The app does not:
- Set analytics cookies
- Call any telemetry endpoints on load
- Log page views or session durations
- Track clicks, scrolls, or interactions
- Fingerprint the browser or device
- Collect IP addresses (beyond what any web server logs by default)

### Data Stored in the Browser
- **IndexedDB (`shakthi-journal`):** All user-created health data
- **No localStorage keys** for user data (Supabase tokens are managed by `@supabase/supabase-js` in localStorage, but only after explicit sign-in)
- **No cookies** set by the app itself (Supabase may set a session cookie for its own auth flow)

### Data Sent to Supabase (Opt-In Only)
If the user creates an account, the following is synced to Supabase (Postgres, hosted on AWS via Supabase):
- Everything listed in "What the User Explicitly Creates" above
- Sync queue metadata (store name, record ID, timestamp — no health content in the queue itself, only in the `data` column of sync tables)

**The user can delete their Supabase account and all data at any time** via Settings → Delete Account (when implemented).

---

## What Data Is NOT Collected

| Not Collected | Reason |
|---|---|
| Device identifiers (IDFA, IDFV) | Web app — no device identifier API available |
| Location | Not requested, not used |
| Contacts | Not requested, not used |
| Camera / microphone | Not requested, not used |
| IP address (stored) | Supabase logs may temporarily retain IP; we have no access to this |
| Behavioral analytics (clicks, sessions) | No analytics SDK integrated |
| Crash reports | No crash reporting SDK (Sentry, etc.) integrated |
| A/B test membership | No experimentation platform integrated |
| Social graph | No social features |
| Advertising identifiers | No ad SDK |
| Search queries | No search feature that leaves the device |

---

## Third-Party Services

### Supabase (Cloud Sync — Optional)
- **Purpose:** Auth + database for users who choose to create an account
- **Data sent:** All health data the user has created
- **Hosted:** AWS us-east-1 (Supabase default; can be changed in Supabase project settings)
- **Privacy policy:** https://supabase.com/privacy
- **Data processing agreement:** Available from Supabase for paid plans
- **GDPR status:** Supabase is GDPR-compliant; DPA available on request

### Cloudflare Pages (Hosting)
- **Purpose:** Serving the static web app files
- **Data collected:** Standard web server logs (IP, user agent, request path, timestamp)
- **Retention:** Cloudflare's standard log retention (typically 30 days)
- **Privacy policy:** https://www.cloudflare.com/privacypolicy/
- **Note:** Cloudflare does NOT receive any health data — it only serves the app shell

### No Other Third Parties
The app has **no** integrations with:
- Google Analytics / Firebase
- Mixpanel, Amplitude, Heap, PostHog, Segment
- Sentry, Datadog, LogRocket
- Facebook, Twitter, or any social SDKs
- Payment processors (Stripe, etc.)

---

## Authentication

### Email / Password
- Passwords are hashed by Supabase Auth (bcrypt). The app never sees plaintext passwords after submission.
- Email addresses are stored in Supabase Auth, not in the health data tables.

### Google OAuth
- The app receives an OAuth token from Google. It does NOT receive the user's Google contacts, calendar, or any data beyond their email and name.
- The token is stored by Supabase Auth, not accessible to app code.

### Apple Sign In
- Uses Apple's private email relay by default (user's real email is never revealed to the app unless the user chooses to share it).
- App receives a unique Apple user ID and (optionally) a name — nothing else.

### Guest Mode
- No credentials are created or stored.
- All data stays in IndexedDB.
- No network requests are made (beyond loading the app shell from Cloudflare Pages).

---

## Health Data Handling

### Apple Health Import
- The user manually exports their Apple Health data as a ZIP, extracts the `export.xml` file, and uploads it to the app.
- The XML is parsed entirely **in the browser** — no server sees the file contents.
- Parsed records are written to IndexedDB.
- If the user has a Supabase account, parsed records are synced to their private Supabase table.

### No Automatic Access
The app **never automatically reads** health data from any platform API (Apple Health, Google Fit, Garmin, etc.) without explicit user action. Every import is a deliberate step.

### Photo Data
Profile photos uploaded by the user are stored as base64 data URLs in IndexedDB and (if signed in) in the Supabase `profiles` table. Photos are private to the user's account. They are not:
- Served to any third party
- Used for facial recognition or ML
- Shared with other users

**Recommendation:** Future improvement — store photos in Supabase Storage (not in the database row) to avoid large row sizes. Photos in a row bloat the `profiles` table and backup payloads.

---

## Data Retention

### Local (IndexedDB)
Data persists until:
- The user clears site data in browser settings
- The user uses the "Erase All Data" option in Settings
- The browser's IndexedDB is evicted under storage pressure (browsers give apps under 5% of available disk space; eviction is rare for actively-used PWAs)

**Mitigation for eviction risk:** The app should prompt users to back up their data if the estimated disk usage is high. Backup + restore is already implemented.

### Cloud (Supabase)
Data persists until:
- The user deletes their account (to be implemented: a "Delete Account" flow that calls Supabase's admin delete-user API)
- The Supabase project is deleted (admin action)

**Data deletion on account closure** must be implemented before a public launch. Currently, signing out does not delete cloud data — it only removes local access tokens. A "Delete Account" button should:
1. Delete all rows in all tables for `user_id`
2. Delete the Supabase Auth user record
3. Clear local IndexedDB (optional, user-controlled)

---

## Row Level Security (Supabase)

All Supabase tables must have RLS enabled:
```sql
-- Example pattern for each table:
ALTER TABLE workouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only read their own workouts"
  ON workouts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can only insert their own workouts"
  ON workouts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can only update their own workouts"
  ON workouts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can only delete their own workouts"
  ON workouts FOR DELETE
  USING (auth.uid() = user_id);
```

**If RLS is not enabled, any authenticated user can read any other user's health data.** This must be verified in the Supabase dashboard before any public beta.

---

## Permissions the App Requests

### Web App (Current)
| Permission | When | Why |
|---|---|---|
| Storage (IndexedDB) | App load | Store all user data locally |
| Clipboard write | User clicks "Copy URL" | Copy app URL for health data step |
| Notification (future) | User opts in | Workout reminders (not yet implemented) |
| Camera (future) | User uploads profile photo | Photo upload (iOS only, not yet implemented) |

### What the App Never Requests
- Location
- Contacts
- Microphone
- Any platform health API (HealthKit, Google Fit) — web access is blocked at the OS level

---

## GDPR / CCPA Compliance

### User Rights Under GDPR
| Right | Implementation Status |
|---|---|
| Right to access | ✅ Export (backup JSON) implemented |
| Right to portability | ✅ Backup JSON is portable |
| Right to erasure | ⚠️ Local: Settings → Erase All Data. Cloud: "Delete Account" not yet implemented |
| Right to rectification | ✅ User can edit any data field |
| Right to restrict processing | ✅ Guest mode = no processing; sign out = stops sync |
| Right to object | ✅ Sync can be stopped by signing out |

### CCPA
CCPA applies to businesses with >$25M revenue or >100K CA consumers. At beta scale, Shakthi Journal is not a covered business. Maintain good practices regardless.

### Data Minimization
The app collects only what the user explicitly enters. No inferred data, no derived data shared with third parties. Profile fields (DOB, sex, height, weight) are optional and are used only to calculate personalized nutrition targets.

---

## Privacy Risks and Mitigations

| Risk | Severity | Current Status | Mitigation |
|---|---|---|---|
| Supabase misconfigured (RLS off) | CRITICAL | Unknown — must verify | Verify RLS in Supabase dashboard before beta |
| Photo stored in DB row (large payload) | Low | Active | Future: move to Supabase Storage |
| No "Delete Account" flow | Medium | Missing | Implement before public launch |
| Browser storage eviction loses data | Medium | Mitigated by IDB | Prompt for backup if storage is high |
| Auth tokens in localStorage | Low | Supabase default | Acceptable for web; native app uses Keychain |
| Cloudflare logs IP addresses | Low | Cloudflare's servers only | Standard web hosting; no user data in logs |
| Third-party libraries (lucide-react, idb, react-router) | Low | Open source, well-audited | No network requests from these libraries |

---

## Privacy Commitments

These commitments are non-negotiable and must be preserved through all future development:

1. **Health data is never sold.** It will not be sold to insurers, employers, advertisers, or data brokers.
2. **Health data is never used for advertising targeting.** We have no ad network and will not integrate one.
3. **Analytics are opt-in only.** If any analytics are ever added, they must be opt-in, anonymous, and disclosed to the user.
4. **Guest mode is free forever.** A user who never creates an account has no data leaving their device.
5. **Exports always work.** The backup/export feature must remain functional regardless of account status or future pricing changes.
6. **Data can always be deleted.** The user can permanently delete all data — local and cloud — at any time.

---

## Audit Checklist

Run before every major release:

- [ ] `grep -r "analytics\|gtag\|mixpanel\|segment\|amplitude\|sentry\|hotjar\|posthog" src/` — should return zero results
- [ ] Check `package.json` for analytics, tracking, or ad SDK dependencies
- [ ] Verify Supabase RLS is enabled on all tables
- [ ] Verify no `console.log` statements print user health data
- [ ] Verify backup export works end-to-end
- [ ] Verify "Erase All Data" removes all IndexedDB data
- [ ] Test guest mode: confirm no network requests except to Cloudflare Pages (app shell)
