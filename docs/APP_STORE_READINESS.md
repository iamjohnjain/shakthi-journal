# Jeevan — App Store Readiness (Living Document)

**Status as of this entry: NOT READY.**

This document tracks every requirement in the App Store submission program.
It is updated at the end of each work session. Do not treat any requirement
as closed unless it has a Status of ✅ and linked evidence (command output,
file path + line, or test name). Items marked 🔲 are not yet started. Items
marked 🟡 are partially done or audited-but-not-fixed.

Owner-only actions (Apple Developer portal, vendor dashboards, legal
decisions) are called out explicitly — Claude cannot perform these.

---

## 0. Baseline (this session)

| Check | Result | Evidence |
|---|---|---|
| `git status --short --branch` | Clean except pre-existing, intentionally-untouched `docs/BETA_LAUNCH_CHECKLIST.md` deletion | HEAD `6eaa1a3`, in sync with `origin/main` |
| `git diff --check` | No whitespace/conflict markers | clean output |
| `npx vitest run` | 108/108 pass, 5 files | — |
| `npx tsc --noEmit --pretty false` | Clean | — |
| `npm run build` | Succeeds | `dist/` produced, largest chunk 1.14MB (pre-existing code-split warning, not a blocker) |
| `npm audit --omit=dev` | **0 vulnerabilities** (was 2 high — `react-router`/`react-router-dom` CSRF bypass, GHSA-qwww-vcr4-c8h2) | Fixed this session: bumped `react-router-dom` 7.18.0 → 7.18.6 (patched, within existing `^7.18.0` semver range). Re-ran `npm audit --omit=dev` → `found 0 vulnerabilities`. tsc/vitest/build re-verified green after the bump. |
| `xcodebuild … CODE_SIGNING_ALLOWED=NO clean build` (unsigned Release, generic iOS) | **BUILD SUCCEEDED** | `/private/tmp/jeevan-appstore-baseline`, reconfirmed after the logging fix below at `/private/tmp/jeevan-appstore-verify1` |
| Scheme/target list | 1 target (`Jeevan`), 1 scheme (`Jeevan`), Debug/Release configs, **no test target** | `xcodebuild -list` |
| Bundle ID / version / build | `jeevan.health.fitness` / `1.0` / `1` | `-showBuildSettings`, `Info.plist` |
| Device family / orientation | iPhone only (`TARGETED_DEVICE_FAMILY = 1`), portrait only | `-showBuildSettings`, `Info.plist` `UISupportedInterfaceOrientations` |
| Mac Catalyst | `SUPPORTS_MACCATALYST = NO` | `-showBuildSettings` |
| Entitlements | `ShakthiJournal.entitlements`: only `com.apple.developer.healthkit = true` | file read |
| Privacy manifest | **Absent** — no `PrivacyInfo.xcprivacy` anywhere in `ios/` | `find ios -iname "PrivacyInfo.xcprivacy"` → empty |
| Local provisioning profiles | None found at the standard path | `~/Library/MobileDevice/Provisioning Profiles/` does not exist on this machine — owner's "two malformed profiles" are presumably Xcode-managed (Signing & Capabilities UI) or on the owner's own machine, not reproducible here |
| IndexedDB stores | **18** confirmed by `createObjectStore` calls in `src/db/index.ts` | `health_metrics, sync_history, settings, daily_logs, profile, workouts, nutrition_entries, training_profile, workout_plans, exercise_library, workout_templates, sync_queue, weekly_reviews, monthly_reviews, achievements, coach_memory, coach_chat, progress_photos` |
| Auth providers | `google: enabled, email: enabled, guest: enabled, apple: disabled` | `src/lib/authProviders.ts` |
| AI functions `verify_jwt` | **All 7 functions set `verify_jwt = false`** | `supabase/config.toml` — confirmed for `chat-coach`, `analyze-meal-photo`, `parse-workout-text`, `analyze-workout-photo`, `parse-workout-plan`, `parse-meal`, `transcribe-audio` |
| Production dev routes | `/dev` → `DevDiagnostics`, `/dev/sync-test` → `SyncTestPage`, both registered unconditionally in `src/App.tsx` (no env/flag gate) | lines 66–67 |
| In-app account deletion | **Not found** — no deletion UI/flow in `src/pages/Settings.tsx` | grep returned no hits |

---

## Milestone 1 — Security & Privacy

### 1A. Sensitive native logging

| File | Finding | Status |
|---|---|---|
| `ios/ShakthiJournal/Sync/SupabaseClient.swift` | **Fixed this session.** Previously printed (unconditionally, in all build configs including Release): the full backend REST URL, truncated-but-real Authorization/apikey header prefixes, a fully decoded health-data record (first record of every batch — actual weight/steps/etc. values), and the raw HTTP response body, on every `upsertHealthMetrics` call. Replaced with a single non-identifying line logged **only on non-2xx failure** (`"upsertHealthMetrics failed: HTTP <status>"`). No token, URL, health record, or response body is logged anymore. | ✅ Fixed, rebuild verified (`/private/tmp/jeevan-appstore-verify1` → BUILD SUCCEEDED) |
| `ios/ShakthiJournal/Auth/AuthManager.swift` | One `print` on refresh-token rejection — logs only an HTTP status code, no token/user data | ✅ Already safe, no change needed |
| `ios/ShakthiJournal/HealthKit/HealthKitManager.swift` | One `print` on a per-type fetch error — logs type id + localized error string, no health values | ✅ Already safe |
| `ios/ShakthiJournal/Views/WebAppView.swift` | One `print` on a JS-evaluation error — logs the `Error` object only | 🟡 Acceptable for now; should move behind `#if DEBUG` as part of 1B hardening |
| `ios/ShakthiJournal/Views/MainTabView.swift` | One `print` confirming a Keychain update happened — no values logged | ✅ Already safe |

**Remaining for 1A:** wrap the four benign `print` statements in `#if DEBUG` so Release truly emits nothing (defense in depth, not currently leaking data but not "no raw logging in Release" by the letter of the requirement either). 🔲

### 1B. WKWebView trust boundary

**Status: 🔲 Not started.** This is the single largest remaining engineering item in the whole program. Confirmed-by-reading issues in `ios/ShakthiJournal/Views/WebAppView.swift`:

- Session tokens are injected via `WKUserScript` at `.atDocumentStart` into `localStorage`, unconditionally, before the destination is verified.
- `decidePolicyFor` only inspects `action.navigationType == .linkActivated`; redirects, form submissions, and `window.location` assignment are not checked at all and fall through to `.allow`.
- `requestMediaCapturePermissionFor` grants camera/mic to **any** requesting origin unconditionally (`decisionHandler(.grant)`), not just the trusted production origin.
- `userContentController(_:didReceive:)` accepts any `jeevanNative` message body without checking `message.frameInfo` or `message.frameInfo.securityOrigin` — any frame (including an injected/redirected one) could in principle post a message the native layer treats as privileged (e.g. `sessionRefreshed`, which writes to Keychain).
- No explicit `WKWebsiteDataStore` clearing on sign-out — a second account on the same device would inherit the first account's `localStorage`/IndexedDB/cache inside the WebView's persistent data store unless something elsewhere handles this (not found in the files audited).
- No native offline/error/session-expired/retry UI — a network failure or 4xx/5xx from the production origin currently has no documented fallback (needs confirmation against the live `ContentView`/`WebAppView` state machine, not yet traced).

**Required before this can move to ✅ (per the program spec):**
1. A single, centralized origin-policy type doing **exact** scheme+host+port comparison (not substring/suffix) against the one approved production origin, applied at every decision point listed above.
2. Reject lookalike/sub-domains, unexpected ports, `http://`, and malformed URLs.
3. Gate token injection and bridge-message handling on "is this the verified main frame of the approved origin" — never inject into, or accept privileged messages from, anything else.
4. Camera/mic granted only to the approved origin, only after a user-initiated in-page action (not a blanket grant).
5. Explicit `WKWebsiteDataStore.default().removeData(...)` (or an isolated, per-account data store) on sign-out/account switch/deletion.
6. Native loading/offline/server-error/session-expired/retry states — no blank WebView ever.
7. A native test target (does not exist yet) with automated tests for: exact-host match, lookalike domain, subdomain, wrong port, `http://`, malformed URL, redirect, popup/new-window, and bridge-message authorization.

This is real security-engineering work (new Swift types, a state machine for the WebView container view, and a first-ever native test target) and should be scoped as its own dedicated session with its own commit(s), not rushed alongside everything else. **Recommend this be the very next session's sole focus.**

### 1C. Remote-WebView App Store risk (Guideline 4.2)

**Status: 🔲 Not evaluated in depth yet.** Confirmed: `WebAppView.appURL` points at `https://jeevan-health-fitness-app.pages.dev` (note: the audit prompt's origin and the live code's origin differ slightly in subdomain — **this itself needs reconciling before any origin allowlist is written**, see Open Question below). A mutable, continuously-redeployed Cloudflare Pages site is the live Release experience with no version pinning. Per the program spec, two options exist (bundle reviewed assets into the binary for Release vs. keep remote with hardening + documented risk acceptance) — **owner decision required**, this is not something to decide unilaterally given it changes the whole app's architecture and release process.

**OWNER ACTION REQUIRED:** Confirm which production web origin is authoritative (see Open Question below), then decide bundled-assets vs. remote-with-hardening for Release.

---

## Milestone 2 — AI Authentication, Consent, Abuse Protection

**Status: 🔲 Not started.** Confirmed via `supabase/config.toml`: all 7 AI Edge Functions (`analyze-meal-photo`, `analyze-workout-photo`, `chat-coach`, `parse-meal`, `parse-workout-plan`, `parse-workout-text`, `transcribe-audio`) have `verify_jwt = false`, by original design to support guest (no-login) usage. This means anyone with the public anon key (which ships in the client bundle — it is not a secret) can invoke every AI function, including the paid Groq-backed ones, with no rate limit, quota, or abuse control currently confirmed in code.

This requires: a decision on whether guest AI ships in v1 at all (program spec recommends disabling it unless a scoped guest-credential + quota system is built and tested), real request validation in front of each function, CORS allowlisting, payload/rate/cost limits, and a first-run AI-consent flow with persisted consent records. None of this is started. This is backend (Supabase Edge Function) work requiring deploys to a real environment — **per the operating rules, no Edge Function deploys happen without explicit approval**, so even the engineering work here needs an explicit go-ahead before anything reaches a real Supabase project, and testing needs to happen against a non-production project or very carefully against production with synthetic data only.

**OWNER ACTION REQUIRED:** Confirm Groq account retention/Zero Data Retention status directly with Groq — this cannot be verified from code and must not be assumed.

---

## Milestone 3 — Account Lifecycle & User Data

**Status: 🔲 Not started.** Confirmed: no password-recovery flow, no in-app account-deletion flow, no explicit sign-out data-clearing audit performed yet, and backup/restore coverage vs. the real 18-store inventory has not yet been reconciled (program spec says backup currently covers 11 of an unspecified total — this session confirmed the total is 18 stores; which 11 are currently backed up is not yet traced).

---

## Milestone 4 — HealthKit Compliance

**Status: 🟡 Audited, not fixed.** Confirmed in `ios/ShakthiJournal/Info.plist`:
- `NSHealthShareUsageDescription` present, text says data "is never shared with anyone" — **false**, given Supabase cloud sync and AI processing both exist. Must be rewritten.
- `NSHealthUpdateUsageDescription` present, explicitly says write access is "requested now for future use" / "Phase iOS 2+" — the app does not write to HealthKit today. Apple review guidance disfavors requesting permissions for unimplemented features. Should be removed for v1, along with the corresponding `typesToShare` write-authorization request in `HealthKitManager.swift` (confirmed present: `bodyMass`, `bodyFatPercentage`, `HKWorkoutType` requested for write) and any matching future-use copy in `PermissionsView.swift` (not yet read this session).

**Required:** read-only v1 (drop `typesToShare`/the update-usage-description key), rewrite the share-usage description to be accurate, and device-test allow/deny/partial/revoked/no-data paths (cannot be done without a physical device and a real Apple Developer signing setup — blocked on Milestone 6E owner actions).

---

## Milestone 5 — Production Controls & Dependencies

| Item | Status | Evidence |
|---|---|---|
| `/dev`, `/dev/sync-test` reachable in production build | 🔲 Not gated | `src/App.tsx:66-67`, unconditional routes |
| `react-router`/`react-router-dom` high-severity advisory | ✅ Fixed | bumped to 7.18.6, `npm audit --omit=dev` → 0 vulnerabilities |
| Security headers on deployed origin (CSP, frame-ancestors, HSTS, Referrer-Policy, X-Content-Type-Options, Permissions-Policy) | 🔲 Not verified | Needs a `curl -I` against the live, authoritative origin once Open Question #1 (below) is resolved, plus Cloudflare Pages header configuration (likely a `_headers` file in the web repo) |
| Legacy "Shakthi" branding | 🟡 Partially present | Native Xcode project, scheme, and several Swift file names are still `ShakthiJournal`/`Jeevan Health & Fitness App` — cosmetic/internal, but `CFBundleURLSchemes` and some user-facing Settings copy should be checked for leftover "Shakthi" text (not yet grepped) |
| `THIRD_PARTY_NOTICES.md` / `public/models/CREDITS.md` | 🔲 Not yet verified present/complete | — |

---

## Milestone 6 — Xcode & App Store Binary

| Item | Status | Evidence |
|---|---|---|
| `CFBundleShortVersionString`/`CFBundleVersion` hardcoded instead of `$(MARKETING_VERSION)`/`$(CURRENT_PROJECT_VERSION)` | 🔲 Confirmed, not fixed | `Info.plist` lines 62-65: literal `1.0` / `1` instead of the build-setting variables (the build settings themselves are correct — `MARKETING_VERSION = 1.0`, `CURRENT_PROJECT_VERSION = 1` — just not referenced from the plist) |
| Native Settings "iOS 2.0" text vs. binary 1.0 | 🔲 Not yet located | Needs a grep of `SettingsView.swift`/`PermissionsView.swift` for version strings |
| Privacy manifest (`PrivacyInfo.xcprivacy`) | 🔲 Does not exist | — |
| Sign in with Apple vs. Google removal (Guideline 4.8) | 🔲 Undecided | `authProviders.ts`: Google enabled, Apple disabled. **Per program default: ship Option 2 (remove/hide Google from iOS Release, email+guest only) unless the owner confirms Apple Sign-In credentials/config are ready.** No change made yet — this flips user-facing auth UI and needs explicit owner confirmation first. |
| Signing identity / provisioning profiles | 🔲 Owner action required | No valid local signing identity; profile issue reported by owner not reproducible on this machine (see Milestone 0) |
| Export compliance (`ITSAppUsesNonExemptEncryption`) | 🔲 Not yet determined | Needs a dependency-by-dependency pass; initial read suggests only HTTPS (exempt), but not yet confirmed against every third-party SDK |

---

## Milestone 7 — Public Policies & In-App Links

**Status: 🔲 Not started.** No privacy policy, terms, support, deletion, or AI-consent public pages found yet in the web app's routes. Needs owner-provided legal entity name, address, and jurisdiction before any draft can be written — **will not fabricate these**.

---

## Milestone 8 — Submission Packet

**Status: 🔲 Not started.** None of `APP_STORE_SUBMISSION.md`, `APP_PRIVACY_ANSWERS.md`, `APP_REVIEW_NOTES.md`, `THIRD_PARTY_NOTICES.md` (new, submission-scoped version), `PHYSICAL_DEVICE_TEST_MATRIX.md` exist yet.

---

## Open Questions for the Owner

1. **Which web origin is authoritative?** The task's audit snapshot and this session's own earlier work referenced `https://shakthi-journal.pages.dev`, the live `WebAppView.swift` points at `https://jeevan-health-fitness-app.pages.dev`, and this task prompt's "CURRENT AUDIT SNAPSHOT" doesn't state one explicitly. The WKWebView origin-allowlist (Milestone 1B/1C) and every security header check depend on this being a single, confirmed value. **Please confirm the one production origin before that work starts.**
2. **Apple Developer account type:** individual or organization? Health apps are recommended to use an organization/legal-entity account — confirm before App ID registration.
3. **Sign in with Apple:** is Apple provider configuration (Supabase + Apple Developer) available/desired, or should Google be removed for v1 (program default)?
4. **Legal entity details** (name, address, jurisdiction, support contact, retention period) for the privacy policy/terms — required before any legal draft, will not be invented.
5. **Groq data retention / Zero Data Retention status** — must be confirmed directly in the Groq vendor account, not assumed from documentation.

---

## Next Recommended Session Scope

Given the size of what remains, dedicate focused sessions per milestone rather than attempting all of it at once:
1. **WKWebView trust boundary hardening** (Milestone 1B) + a first native test target — the largest, most security-critical single item.
2. **AI function authentication/limits/consent** (Milestone 2) — requires a backend-deploy approval conversation first.
3. **Account lifecycle** (Milestone 3: password reset, deletion, sign-out isolation, backup/export reconciliation).
4. **HealthKit narrowing + Info.plist/entitlement cleanup + privacy manifest** (Milestones 4 + 6B) — these are smaller and can likely be combined.
5. **Legal pages + submission packet** (Milestones 7 + 8) — blocked on owner-provided legal/business details.
6. **Signing + archive validation** (Milestone 6E) — blocked on owner's Apple Developer actions; can run in parallel with the above once credentials exist.
