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
| Scheme/target list | 2 targets (`Jeevan` app, `JeevanTests` unit tests), 1 scheme (`Jeevan`), Debug/Release configs | `xcodebuild -list` — the `JeevanTests` target was added during Milestone 1B and carries 47 passing tests as of this session's remediation pass (see Milestone 1B detail) |
| Bundle ID / version / build | `jeevan.health.fitness` / `1.0` / `1` | `-showBuildSettings`, `Info.plist` |
| Device family / orientation | iPhone only (`TARGETED_DEVICE_FAMILY = 1`), portrait only | `-showBuildSettings`, `Info.plist` `UISupportedInterfaceOrientations` |
| Mac Catalyst | `SUPPORTS_MACCATALYST = NO` | `-showBuildSettings` |
| Entitlements | `ShakthiJournal.entitlements`: only `com.apple.developer.healthkit = true` | file read |
| Privacy manifest | **Absent** — no `PrivacyInfo.xcprivacy` anywhere in `ios/` | `find ios -iname "PrivacyInfo.xcprivacy"` → empty |
| Production web origin | **Resolved.** `https://jeevan-health-fitness-app.pages.dev` is the sole authoritative Release origin per owner confirmation (code, deployment docs, and the rebrand commit all agree). `shakthi-journal.pages.dev` currently serves identical assets but is a legacy parallel deployment and must never be privileged. | Milestone 1B implements this as `TrustedWebOrigin.production`, covered by automated tests. |
| Local provisioning profiles / signing identity | **One Apple Development identity** ("Apple Development: johnmundackal11@gmail.com (324DW4RU23)") and **two DEVELOPMENT provisioning profiles** exist locally at `~/Library/Developer/Xcode/UserData/Provisioning Profiles/` (owner-corrected path — not `~/Library/MobileDevice/...`, which doesn't exist on this machine) — confirmed via `security find-identity -v -p codesigning` and `security cms -D -i <profile>` (both decode with well-formed UUIDs, names, and expiration dates). An automatic-signing `xcodebuild … build` succeeded using identity `55A3A55AF634E5A763419D925DE6C5988C8CEE9B` and profile `29b4cc66-...` ("iOS Team Provisioning Profile: jeevan.health.fitness"). **This is Apple Development signing only — NOT Apple Distribution / App Store signing.** No Apple Distribution certificate, no App Store distribution profile, and no successful archive-and-validate (`xcodebuild archive` + `-exportArchive` with an App Store distribution export method, validated via App Store Connect / `xcrun altool --validate-app`) path has been attempted or confirmed in this project. (`notarytool` is a macOS Gatekeeper-notarization tool, not part of the iOS App Store submission path — not applicable here regardless.) A development-signed build succeeding must not be read as App Store signing readiness — those are different certificate/profile types with different portal-side requirements, and the latter remains entirely unverified. **Owner reports** separately that Xcode's own GUI previously showed missing-UUID errors and zero valid identities — that discrepancy (GUI vs. this session's CLI checks) has not been reconciled and may reflect portal-side state (revocation, membership status) this command-line path cannot see; still **flagged for owner reconciliation**, not resolved. |
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
| `ios/ShakthiJournal/Views/WebAppView.swift` | One `print` on a JS-evaluation error, now removed entirely as part of 1B's rewrite (the file no longer calls `evaluateJavaScript` with a completion handler that logs). | ✅ Fixed |
| `ios/ShakthiJournal/Views/MainTabView.swift` | One `print` confirming a Keychain update happened — no values logged | ✅ Already safe |

The four remaining benign `print` statements (AuthManager ×3 after 1B's additions, HealthKitManager ×1) still run in Release but log no sensitive values. Wrapping them in `#if DEBUG` for pure defense-in-depth remains open. 🔲

### 1B. WKWebView trust-boundary hardening — 🟡 PARTIAL (remediation applied this session; needs a live manual matrix pass before being called COMPLETE)

An earlier pass of this milestone was independently reviewed and judged
**PARTIAL, not COMPLETE** — it left WebKit sign-out destructive (full
`WKWebsiteDataStore.removeData(ofTypes: allWebsiteDataTypes())`, capable
of deleting unsynced health data out of IndexedDB), had no native↔web
sign-out synchronization, let a stale `sessionRefreshed` verification
`Task` survive sign-out, hardcoded popup navigation type to `.other`
regardless of the real `WKNavigationType`, and painted a full-screen
black overlay over a merely-blocked (not failed) navigation. This
session's remediation pass fixed all four defect categories — see the
**Milestone 1B Remediation** section below for the defect-by-defect
detail, the new non-destructive sign-out design, the idempotent
sign-out coordinator, the session-epoch/liveness guarding, and the
popup/overlay fixes.

One centralized exact-origin policy (`TrustedWebOrigin.production` =
`https://jeevan-health-fitness-app.pages.dev`, scheme+host+port, no
substring matching) gates navigation, popups, session-token injection,
the JS↔native bridge, HealthKit injection, and camera/microphone grants.
**47 automated tests pass** on a real simulator (`iPhone Duo`, iOS
27.2) — 43 pure-policy unit tests (`WebBoundaryTests.swift`, no WebKit
runtime involved) plus 4 genuine `WKWebView` integration tests
(`WebSessionBoundaryIntegrationTests.swift`, which load real HTML/JS
into a real WebView). Native loading/offline/error/blocked-navigation
states replace the previous "blank WebView on failure" behavior.

**Why this is marked PARTIAL rather than COMPLETE:** the automated
suite covers policy logic and the sign-out/cleanup mechanics directly,
but the full adversarial matrix (real popups, real media permission
prompts, real redirects from a live server, real backgrounded/killed
process timing, an actual multi-session sign-out → sign-in cycle driven
interactively) has not been driven in a running simulator this session
— see the Manual Adversarial Matrix table below, which is explicit
about which rows are genuinely driven vs. code-review-only. Do not
treat this milestone as COMPLETE until that live pass happens.

**Known residual item (intentionally out of this milestone's scope, see
owner instruction):** `ios/ShakthiJournal/Sync/SupabaseClient.swift`'s
`SupabaseError.errorDescription` (around lines 30-52) still surfaces raw,
undecorated Supabase response bodies in user-facing error text for any
HTTP error that isn't one of the four hand-matched auth messages —
including 401/403 responses from data endpoints. Tracked as an open
privacy-hardening item for a future milestone, not redesigned here per
explicit instruction to keep this milestone narrowly scoped to the
trust-boundary work.

### 1C. Remote-WebView App Store risk (Guideline 4.2) — 🟡 Evaluated, conditional

`docs/IOS_WEB_ORIGIN_ARCHITECTURE.md` compares bundled-assets (Option A)
vs. the hardened remote origin (Option B) in full. **Recommendation:
Option B (remote), CONDITIONAL on real release protections being in
place first** — the trust-boundary hardening in 1B addresses the
client-side security gaps, but a remote, instantly-mutable web origin is
itself a privileged supply-chain dependency: whoever can push to
`jeevan-health-fitness-app.pages.dev` can change what the shipped app
executes without another App Review. That is a compliance risk to be
mitigated, not simply an advantage to note. Shipping remote without the
release protections listed in `IOS_WEB_ORIGIN_ARCHITECTURE.md` (immutable
versioned releases, protected deploy approvals, a deployment freeze
during App Review, account MFA/access control on the Cloudflare Pages
project, CSP/security headers, a rollback plan, and synchronized
app/web release governance) is not recommended. Bundling (Option A) is
nontrivial (SPA routing inside a bundle needs a custom
`WKURLSchemeHandler`, not just copying `dist/` into Xcode) — real
follow-up work either way. No architecture change was made; this is a
recommendation awaiting owner sign-off, and bundling alone does not by
itself satisfy Guideline 4.2 — Apple's actual bar is meaningful native
functionality beyond a wrapped web page (HealthKit sync, native sign-out
boundary, etc., per Milestone 1B), independent of whether the web
content ships bundled or remote.

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
| Security headers on deployed origin (CSP, frame-ancestors, HSTS, Referrer-Policy, X-Content-Type-Options, Permissions-Policy) | 🔲 Confirmed missing | `public/_headers` exists and is deployed to Cloudflare Pages, but contains ONLY `Cache-Control` directives for HTML/assets/manifest/icons/models/service-worker — no CSP/HSTS/Referrer-Policy/X-Content-Type-Options/Permissions-Policy directive anywhere in it. This is a confirmed gap, not an unverified unknown, and is one of the release protections `docs/IOS_WEB_ORIGIN_ARCHITECTURE.md` makes the remote-origin recommendation conditional on. |
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
| Signing identity / provisioning profiles | 🔲 Owner action required | One Apple Development identity + two DEVELOPMENT profiles exist and build successfully (see Milestone 0) — but **Apple Distribution / App Store signing is completely unverified**: no Distribution certificate, no App Store distribution profile, no successful archive+validate has been attempted. This is the actual blocker for submission, not the development-signing discrepancy. |
| Export compliance (`ITSAppUsesNonExemptEncryption`) | 🔲 Not yet determined | Needs a dependency-by-dependency pass; initial read suggests only HTTPS (exempt), but not yet confirmed against every third-party SDK |

---

## Milestone 7 — Public Policies & In-App Links

**Status: 🔲 Not started.** No privacy policy, terms, support, deletion, or AI-consent public pages found yet in the web app's routes. Needs owner-provided legal entity name, address, and jurisdiction before any draft can be written — **will not fabricate these**.

---

## Milestone 8 — Submission Packet

**Status: 🔲 Not started.** None of `APP_STORE_SUBMISSION.md`, `APP_PRIVACY_ANSWERS.md`, `APP_REVIEW_NOTES.md`, `THIRD_PARTY_NOTICES.md` (new, submission-scoped version), `PHYSICAL_DEVICE_TEST_MATRIX.md` exist yet.

---

## Open Questions for the Owner

1. ~~Which web origin is authoritative?~~ **Resolved:** `https://jeevan-health-fitness-app.pages.dev`. Implemented as `TrustedWebOrigin.production` in Milestone 1B.
2. **Apple Developer account type:** owner has stated a working default — organization membership for launch. Not yet actioned (requires the owner's own Apple Developer portal access); tracked under Milestone 6E.
3. **Sign in with Apple vs. Google:** owner has stated a working default — remove Google from iOS v1 unless Apple Sign-In is fully configured; email/password + guest for v1. **Not yet implemented** — this milestone was explicitly scoped to exclude authentication-product changes. Tracked for Milestone 6C.
4. **Legal entity details** (name, address, jurisdiction, support contact, retention period) for the privacy policy/terms — still required before any legal draft, will not be invented.
5. **Groq data retention / Zero Data Retention status** — owner has acknowledged this still requires their own vendor-account confirmation; not assumed from documentation.
6. **Release architecture (bundled vs. remote):** owner asked for Claude's assessment, subject to final owner approval. See `docs/IOS_WEB_ORIGIN_ARCHITECTURE.md` — recommendation is to ship v1 remote (Option B, hardened) and treat bundling as a dedicated follow-up, not a pre-submission change.
7. **Signing/provisioning discrepancy:** this session's own `security find-identity`/`security cms`/`xcodebuild` checks found one valid identity and two decodable profiles, with a signed build succeeding — which differs from the owner's report of zero valid identities and missing-UUID errors in Xcode's own UI. See the corrected Milestone 0 evidence row above. **Needs owner reconciliation** (possibly a different machine/Xcode state, or a portal-side issue these CLI tools can't see) before trusting either account fully.

---

## Next Recommended Session Scope

Given the size of what remains, dedicate focused sessions per milestone rather than attempting all of it at once:
1. **WKWebView trust boundary hardening** — 🟡 PARTIAL, two remediation passes applied across this and a prior session; see Milestone 1B detail below. Do not schedule this as "done" — the live manual adversarial matrix pass has not yet happened.
2. **AI function authentication/limits/consent** (Milestone 2) — requires a backend-deploy approval conversation first. **Recommended next.**
3. **Account lifecycle** (Milestone 3: password reset, deletion, sign-out isolation, backup/export reconciliation).
4. **HealthKit narrowing + Info.plist/entitlement cleanup + privacy manifest** (Milestones 4 + 6B) — these are smaller and can likely be combined.
5. **Legal pages + submission packet** (Milestones 7 + 8) — blocked on owner-provided legal/business details.
6. **Signing + archive validation** (Milestone 6E) — blocked on owner's Apple Developer actions; can run in parallel with the above once credentials exist.
7. **Residual Milestone 1B item:** `SupabaseClient.swift`'s raw response-body error text (lines ~30-52) — deliberately deferred, see 1B note above.

---

## Milestone 1B Detail — WKWebView Trust-Boundary Hardening (PARTIAL — see Remediation sections below)

**Starting commit:** `ff96355`. **New files:**
`ios/ShakthiJournal/WebBoundary/{TrustedWebOrigin,WebNavigationPolicy,BridgeMessageValidator,DeepLinkValidator,WebSessionBoundary,WebBoundaryState}.swift`,
`ios/ShakthiJournalTests/WebBoundaryTests.swift`. **Changed:**
`WebAppView.swift` (navigation/popup/bridge/media/HealthKit-injection
rewrite), `MainTabView.swift` (state overlay wiring), `AuthManager.swift`
(sign-out WebKit-session clearing, ×4 sites), `SettingsView.swift`
(centralized origin display), `SupabaseClient.swift` (exposed
`verifiedUser(accessToken:)`), plus the `.xcodeproj`/`.xcscheme` wiring for
the new files and the new `JeevanTests` unit-test target.

### Threat model (abbreviated — see code comments for full detail)

The WKWebView is the one place native trust (Keychain session, HealthKit
data, a privileged JS bridge) meets content this app does not fully
control once it leaves this device — Cloudflare Pages, DNS, TLS
termination, and the content itself are all outside native code's control
at request time. Every privileged behavior (token injection, bridge
message handling, HealthKit injection, camera/mic grants, deep-link
resolution) previously had its own, inconsistent idea of "is this
trusted" (a bare `host != "..."` string compare for navigation; no check
at all for bridge messages, media, or HealthKit injection). The fix is
one source of truth (`TrustedWebOrigin`) and routing every one of those
decision points through it.

### Boundary table

| Boundary | Previous risk | Control | Test | Status |
|---|---|---|---|---|
| Navigation (initial/redirect/form/script/history/reload) | Only `.linkActivated` was checked; everything else (redirects very much included) fell through to `.allow` | `WebNavigationPolicy.decide(url:kind:)` — exact-origin allow, user-link external-open, everything else cross-origin blocked, non-https denied | `test_navigation_*` (6 tests) | ✅ |
| Popups / `target=_blank` / `window.open` | `WKUIDelegate.createWebViewWith` not implemented — default WebKit behavior for a nil-returning delegate is to simply not open anything, so this was accidentally safe, but with no explicit policy and no path for a legitimate same-origin popup either | Explicit `createWebViewWith` now routes the popup URL through the same `WebNavigationPolicy`; trusted → loads in the existing view; external link → opens in Safari; everything else → blocked banner. Never returns a new WKWebView. | Covered by the same `WebNavigationPolicy` unit tests (the popup handler reuses `decide`) — no WebKit-level popup simulation in this test suite (see Manual Matrix) | ✅ (logic); manual verification open |
| Session token handoff | Raw tokens embedded in a document-start `WKUserScript`, unconditionally, before the destination was verified | Origin check is the script's first executable statement (`window.location.origin !== trustedOrigin → return`), before any token value is referenced. Full post-commit "trusted-page API" handoff deferred — documented reasoning in code comment. | Logic reviewed; not independently unit-testable (requires a live WKWebView page load) — see Manual Matrix | 🟡 Hardened, not fully redesigned |
| JS → native bridge (general) | Any `jeevanNative` message with a dict body was accepted — no frame/origin/schema check | `BridgeMessageValidator.validate` requires exact handler name, main-frame, exact trusted origin, dict body, allowlisted `type`, schema-valid fields with length bounds | `test_bridge_*` (9 tests) | ✅ |
| `sessionRefreshed` specifically | Accepted any `accessToken`/`refreshToken`/`userId`/`email` and wrote straight to Keychain — no verification the token was real or belonged to the signed-in user | After schema validation, `Coordinator.handleSessionRefreshed` calls `SupabaseClient.verifiedUser(accessToken:)` and requires the returned id to equal both the claimed `userId` and the `WebAppView`'s `expectedUserId` (the actual signed-in native user) before forwarding anything to `MainTabView` | Schema-level tests above; the Supabase round-trip itself is not unit-tested (would require a live/mocked network call) — tracked as a gap | 🟡 Schema ✅, live-verification path logic-reviewed only |
| HealthKit → web injection | `evaluateJavaScript` fired unconditionally whenever a sync completed, regardless of what the WebView was currently showing | Navigation-generation token captured at sync-completion time, re-checked (plus current-URL-trusted plus not-loading) immediately before `evaluateJavaScript` runs; any mismatch silently drops the injection | Logic reviewed; genuine navigation-race testing needs real WebKit timing, not covered by this unit suite | 🟡 Logic hardened, race condition not independently reproduced in tests |
| Camera / microphone | `requestMediaCapturePermissionFor` returned `.grant` unconditionally for any origin/frame | Exact trusted-origin + main-frame check; returns `.prompt` (not `.grant`) for trusted, `.deny` for everything else | Logic is identical in shape to the bridge/navigation checks (same `TrustedWebOrigin.Origin` construction) — not independently unit-tested since it needs `WKSecurityOrigin`, a WebKit type; reviewed by inspection | 🟡 Logic reviewed, not unit-tested |
| Deep links | `URL(string:relativeTo:)` on a raw path string — an absolute or scheme-relative string would resolve externally, ignoring the base | `DeepLinkValidator.resolve` requires exact allowlist membership, single leading slash, no scheme/host/userinfo, then re-validates the resolved URL against `TrustedWebOrigin` | `test_deepLink_*` (6 tests) | ✅ |
| Sign-out WebKit session boundary | **Original 1B implementation was itself destructive**: it called `WKWebsiteDataStore.removeData(ofTypes: allWebsiteDataTypes())`, which deletes the app's IndexedDB (including unsynced health data) and all LocalStorage, not just auth state — flagged by independent review and fixed in this session's remediation pass (see Milestone 1B Remediation below) | `WebSessionBoundary` now does an exact-origin, trusted-main-frame cleanup handshake that removes ONLY the `sb-pvtsskfnbxeohbtwafah-auth-token` localStorage key via injected JS — never a `WKWebsiteDataStore`-level wipe. Awaitable, idempotent, with a bounded timeout that never falls back to broader deletion. Native+web sign-out converge on one coordinator (`AuthManager.terminateSession()`). | **4 genuine WKWebView integration tests** (`WebSessionBoundaryIntegrationTests.swift`): sentinel IndexedDB record survives cleanup, exact auth key is removed, cleanup is idempotent, cleanup refuses to run against an untrusted origin | ✅ Fixed and automated-tested this session |
| Native loading/error states | None — a failed/blocked/terminated load left a blank WebView with no explanation | `WebBoundaryState` + `WebBoundaryOverlay`/`BlockedNavigationBanner`, wired to `didCommit`/`didFinish`/`didFail`/`didFailProvisionalNavigation`/`webViewWebContentProcessDidTerminate`; Retry always reloads `TrustedWebOrigin.productionURL` only | Visual/behavioral, not unit-tested — see Manual Matrix | 🟡 Implemented, not automated-tested |
| Settings origin display | Hardcoded a second literal copy of the origin string | Reads `TrustedWebOrigin.production.host` | Covered indirectly by the origin tests (same source of truth) | ✅ |

### Test results

| Command | Result | Evidence |
|---|---|---|
| `npx vitest run` | ✅ 108/108 pass | re-verified after this session's remediation |
| `npx tsc --noEmit --pretty false` | ✅ clean | — |
| `npm run build` | ✅ succeeds | — |
| `npm audit --omit=dev` | ✅ 0 vulnerabilities | — |
| Unsigned Release `xcodebuild` (generic/platform=iOS, `CODE_SIGNING_ALLOWED=NO`) | ✅ BUILD SUCCEEDED | re-run after remediation; this is Debug-signing-free generic-device verification only — **not** App Store / Apple Distribution signing, which remains unverified (see Milestone 0/6) |
| **`xcodebuild test` — `JeevanTests` target, simulator `iPhone Duo` (iOS 27.2)** | ✅ **61/61 tests passed**, 0 failures, **0 skipped** | **46 pure-policy unit tests** (`WebBoundaryTests.swift` — plain Swift objects, no WebKit runtime instantiated; of these, 5 are `test_navigation_*` and 10 are `test_bridge_*`) + **9 genuine `WKWebView` integration tests** (`WebSessionBoundaryIntegrationTests.swift` — real `WKWebView` instances loaded with real local HTML/JS via `loadHTMLString`, exercising actual IndexedDB/localStorage, now including lifecycle tests that drive `markPendingForNewCleanup`/`registerLiveTrustedWebView`/`clearLiveTrustedWebView`/`ensureCleanupComplete` rather than only a low-level direct-cleanup call) + **6 `AuthManagerRaceTests`** (pure guard-predicate tests plus two genuine functional tests of `applyWebRefreshedSession`, exercised entirely through `@testable import Jeevan` — no network, no mocking). This distinction matters: the pure-policy tests prove the decision logic is correct in isolation; only the integration tests prove the actual WebKit storage APIs behave as the logic assumes. A setup step that fails to reach a ready state is now a hard `XCTFail`, not a silent `XCTSkip` — this run reports 0 skipped. |

The native test target did not exist before Milestone 1B's first pass
(confirmed in Milestone 0's baseline). It was added by direct
`project.pbxproj`/`.xcscheme` editing (the `xcodeproj` Ruby gem failed to
install in this environment — native extension build failure against
this machine's bundled Ruby/SDK — so this was hand-edited, verified with
`plutil -lint` after every step, with backups taken before each editing
pass). `JeevanTests` is a hosted unit-test bundle (`TEST_HOST`/
`BUNDLE_LOADER` pointing at the app target). As of this remediation pass,
the `WebBoundary` source files are compiled ONLY into the app target —
their earlier second, separate build-file membership inside
`JeevanTests`'s own Sources phase (which produced a second, distinct
per-module copy of each type and required an explicit
`Jeevan.WebNavigationPolicy.decide(...)` qualification to disambiguate)
was removed. Every test file now reaches the app's types exclusively
through `@testable import Jeevan` against the real app binary via
`BUNDLE_LOADER`/`TEST_HOST` — no duplicate compiled copies remain.

### Manual adversarial matrix

Everything below is **code-review-level reasoning against the implemented
policy**, not a live, interactive run of the app in a simulator/device —
this session did not drive the SwiftUI app interactively (tap a real
link, submit a real form, etc.). Marked accordingly.

| Scenario | Expected per policy | Verified how | Status |
|---|---|---|---|
| User-clicked external link | Opens in Safari, WebView unaffected | Unit-tested (`test_navigation_userClickedExternalLink_opensExternally`) | ✅ Automated |
| Server 302 to external origin | Blocked, banner shown, original page intact | Unit-tested at the policy level (`test_navigation_nonUserInitiatedCrossOrigin_blocked` with `kind: .other`, which is what a redirect's navigation action arrives as) | ✅ Automated (policy); not run against a real redirecting server |
| JavaScript `window.location` to external origin | Blocked (arrives as `.other` → `.block`) | Same test as above | ✅ Automated (policy) |
| Form POST to external origin | Blocked (`.formSubmitted` → `.block`) | Unit-tested | ✅ Automated |
| `target=_blank` / `window.open` | Trusted → loads in same view; external → opens in Safari; else → blocked | **Fixed and unit-tested this session**: the popup handler previously hardcoded `.other` as the navigation kind regardless of the real `WKNavigationType`, which meant a user-activated external link opening as a popup was indistinguishable from a scripted one. Both now route through the same `navigationKind(for:)` mapping as main-frame navigation, preserving the real type. `test_popupNavigationKind_userActivatedLink_mapsToLinkActivated` and others cover the mapping; not run against a live popup in a simulator. | ✅ Automated (policy, including the regression fix); 🟡 live popup still code-review only |
| Cross-origin iframe bridge attempt | `message.frameInfo.isMainFrame == false` → rejected | Unit-tested (`test_bridge_trustedSubframe_rejected`) | ✅ Automated |
| Untrusted `getUserMedia` request | `.deny` | Logic reviewed (same origin-construction path as bridge/navigation, which are tested) — `WKSecurityOrigin` itself isn't exercised in XCTest | 🟡 Code review only |
| Trusted camera request | `.prompt` (not auto-grant) | Logic reviewed | 🟡 Code review only |
| Trusted microphone request | `.prompt` (not auto-grant) | Logic reviewed, same code path as camera (type-parameterized) | 🟡 Code review only |
| Deep-link escape attempt (`//evil.example`, absolute URL, `javascript:`) | Rejected | Unit-tested (3 separate tests) | ✅ Automated |
| Navigation during HealthKit injection | Generation-token mismatch blocks injection | Logic reviewed; genuine timing race not reproduced (would need a real WKWebView mid-navigation at the exact moment a sync completes) | 🟡 Code review only |
| Web/native sign-out followed by immediate re-sign-in (second remediation pass) | `MainTabView` no longer waits a fixed 1.5s — it synchronously marks cleanup pending in `AuthManager.terminateSession()` (before `authState` flips), then `MainTabView.runPendingAuthCleanupCheck()` genuinely AWAITS `WebSessionBoundary.ensureCleanupComplete()` (reusing the outgoing WebView if still live, or an ephemeral unprivileged one otherwise) before mounting a new privileged `WebAppView`; a cleanup that fails/times out shows a Retry state rather than mounting anyway | Automated: `WebSessionBoundaryIntegrationTests` now drive the real lifecycle API (`markPendingForNewCleanup`/`registerLiveTrustedWebView`/`clearLiveTrustedWebView`/`ensureCleanupComplete`) including a second-sign-out-supersedes-the-first generation test and an ephemeral-WebView-fallback test; the SwiftUI-level "new WebAppView actually waits for `.ready`" wiring itself is logic-reviewed, not driven through an actual on-screen sign-out → sign-in tap sequence | 🟡 Cleanup/generation mechanics ✅ automated (9 integration tests); the on-screen SwiftUI sequence itself code-review only |
| Pending refresh followed by sign-out (native-refresh race) | A `sessionRefreshed` verification task in flight when sign-out happens must not repopulate Keychain afterward; `restoreSession()`/`refreshAndGetToken()`'s own completions must do the same | `Coordinator.handleSessionRefreshed` re-checks coordinator liveness, native auth state, user-id match, and session epoch after every `await`; `restoreSession()`/`refreshAndGetToken()` now carry the identical `isCurrentSession(userId:epoch:)` guard after their own network awaits (added this pass — previously ONLY the WebView bridge task had this). `AuthManagerRaceTests` tests the exact guard PREDICATE these methods check (via a `#if DEBUG`-only `setSignedInForTesting` hook, since the real network round trips can't be exercised without hitting production Supabase) and, for `applyWebRefreshedSession` specifically (the synchronous half of the bridge path, needing no network), two genuine end-to-end functional tests. **Honest caveat:** the live network race itself — a real in-flight `refreshSession()`/`verifiedUser()` call resolving after a real sign-out — is NOT reproduced; the predicate tests prove the guard condition is correct, not that the full async method observes it under real network timing | 🟡 Guard predicate + `applyWebRefreshedSession` ✅ automated; live network race itself code-review only |
| Account switch while a HealthKit sync is in flight (new this pass) | `SyncEngine.sync()` captures `(userId, epoch)` at start and re-checks after HealthKit fetch and after upload/refresh; `MainTabView.autoSync()` tracks its Task and cancels it in `onDisappear`; the completion notification now carries `(userId, epoch)`, and `WebAppView.Coordinator.handleNativeSyncComplete` requires both to match its own expected session (via `isValidSession`) before ever injecting into IndexedDB | Not automated — reproducing a real HealthKit fetch + Supabase upload race deterministically would need a mocked HealthKit/network layer this codebase doesn't have; the guarding logic mirrors the already-tested `isCurrentSession`/epoch pattern exactly but is not independently exercised under a live race | 🟡 Code review only — explicitly NOT claimed as tested |
| Offline launch/retry | `.offline` state (NSURLErrorNotConnectedToInternet et al.), Retry reloads trusted root | Logic reviewed; not run with the simulator's network actually disabled | 🟡 Code review only |
| Web-content process termination/recovery | `.processTerminated` state shown, Retry available | Logic reviewed; not forced via Simulator's "Simulate Memory Warning"/process-kill tooling | 🟡 Code review only |
| Blocked-navigation banner timer vs. a later genuine failure (new this pass) | The 3-second auto-dismiss timer on the blocked-navigation banner must not fire AFTER a real offline/serverError/sessionExpired/processTerminated state and silently reset it back to `.ready` | `invalidateBlockedBannerTimer()` is now called from `didFail`, `didFailProvisionalNavigation`, `webViewWebContentProcessDidTerminate`, the `didCommit` serverError branch, and `invalidate()` — not independently unit-tested (the prior bug and its fix are both about WebKit delegate-callback ordering, which this test suite doesn't simulate) | 🟡 Code review only |

**Honest summary:** the parts of this matrix expressible as pure-function
unit tests (origin matching, navigation-kind decisions, deep-link
resolution, bridge message schema/frame/origin validation, sessionRefreshed
access/refresh-token pairing) are automated and passing — 46/46,
independently re-runnable. The sign-out cleanup mechanics (non-destructive
IndexedDB preservation, an unrelated localStorage key surviving cleanup,
exact auth-key removal, idempotency, untrusted-origin refusal, and now the
real lifecycle API — pending-generation bookkeeping, live-WebView
registration/fallback) are automated against a genuine `WKWebView` — 9/9
passing. The `AuthManager` race-guard predicates (restore-then-sign-out,
account-B-signs-in, late-failure-cannot-sign-out-B) and two genuine
`applyWebRefreshedSession` functional tests are automated without network
— 6/6 passing. What's still **not** genuinely driven, and is explicitly
NOT claimed as tested: actual popups opening in a live simulator, actual
media permission prompts, actual redirects from a real server, actual
backgrounded/killed-process timing, a full interactive sign-out →
sign-in-as-different-user tap sequence on screen, the live network race
inside `restoreSession()`/`refreshAndGetToken()` itself (as opposed to the
guard predicate they use), and a real HealthKit-sync-in-flight account
switch. Those remain implemented per reviewed logic but not interactively
verified — this would need either a UI-automation pass (XCUITest), a
mocked network/HealthKit layer, or manual QA on a device, and should
happen before this milestone is called COMPLETE rather than PARTIAL.

### Bundled-assets vs. remote-origin recommendation

See full comparison in `docs/IOS_WEB_ORIGIN_ARCHITECTURE.md`. **Recommendation: ship v1 on the hardened remote origin (Option B)**; treat bundling (Option A) as a dedicated follow-up milestone, not a pre-submission change.

### Remaining Milestone 3 dependency

This milestone's sign-out boundary work (`WebSessionBoundary`) removes
**exactly one LocalStorage key** — the Supabase auth token
(`sb-pvtsskfnbxeohbtwafah-auth-token`) — from the trusted origin. It does
NOT clear cookies, does NOT clear any other LocalStorage key, and does
NOT touch IndexedDB, cache storage, or any other `WKWebsiteDataStore`
data at all — that is the entire point of the non-destructive redesign
(the original implementation's bug was clearing ALL of those; the fix is
narrower, not broader). It does NOT address general per-user data isolation
during normal (non-sign-out) operation — e.g. two accounts used on the
same device without ever fully signing out between them, or the broader
question of whether the web app's own IndexedDB schema is keyed per-user
at all. That full account-isolation design is explicitly Milestone 3's
scope and remains open.

---

## Milestone 1B Remediation (this session)

An independent review judged the first 1B pass **PARTIAL, not
COMPLETE**, citing four defect categories. Starting commit for this
remediation: `9a53d54f5924c6636e7d4f6052ba70d44c1e97eb`.

1. **Destructive sign-out → non-destructive.** `WebSessionBoundary`
   previously wiped all WebKit data types via `WKWebsiteDataStore`,
   capable of deleting unsynced health data from the app's own
   IndexedDB. Rewritten to an exact-origin, trusted-main-frame JS
   cleanup handshake that removes only the
   `sb-pvtsskfnbxeohbtwafah-auth-token` localStorage key. Awaitable,
   idempotent, bounded-timeout, never falls back to a broader wipe.
   Per-user IndexedDB isolation remains explicitly Milestone 3 scope.

2. **Sign-out synchronization.** Web-initiated sign-out now posts a
   validated `{type: "signOut"}` bridge message (accepted only from the
   trusted main frame + exact canonical origin) even if the Supabase
   request itself fails (`AuthContext.tsx`'s `signOut()` try/finally).
   Native and web sign-out both converge on
   `AuthManager.terminateSession()` — a single idempotent coordinator,
   so repeated triggers from either direction are safe no-ops. **This is
   the single session authority**: `AuthManager` owns Keychain state and
   the signed-in/out transition; the WebView's own Supabase client is
   downstream of it, not a second authority — a web-side token refresh
   is verified against `AuthManager`'s live state before anything is
   persisted, and a web-side sign-out always round-trips through
   `AuthManager.signOut()` rather than clearing its own state
   independently.

3. **Post-sign-out refresh resurrection eliminated.** `AuthManager`
   gained a `sessionEpoch` counter and `isCurrentSession(userId:epoch:)`.
   `WebAppView.Coordinator` tracks its in-flight `sessionRefreshed`
   verification task, cancels it on `invalidate(_:)` (called from
   `dismantleUIView`), and re-checks coordinator liveness + native auth
   state + user-id match + session epoch after every `await` before
   writing anything to Keychain. `MainTabView.handleWebMessage`'s
   `sessionRefreshed` case independently re-verifies `auth.userId == uid`
   as a second, live check. The bridge-provided email is never trusted —
   the server-verified identity (`SupabaseClient.verifiedUser`) is what
   gets forwarded. Full token-free bridge elimination (native as sole
   refresher, pushing to web) was evaluated and intentionally not
   implemented this pass — it's a larger redesign than this remediation
   scope; the credential-in-bridge path was hardened to the owner's
   stated fallback-acceptable bar instead (server verification, identity
   + epoch matching, no bridge-provided email trust).

4. **Boundary behavior corrections.** (a) Popups now preserve the real
   `WKNavigationType` through a shared `navigationKind(for:)` mapping
   used by both main navigation and the popup handler — previously
   popups hardcoded `.other`, which could not distinguish a user-clicked
   external link from a scripted one. (b) `WebBoundaryState.showsFullScreenOverlay`
   explicitly excludes `.blockedNavigation`, fixing a bug where a merely
   blocked (not failed) navigation painted an opaque full-screen overlay
   over an otherwise-intact page. (c) Both HealthKit-injection JS strings
   now start with an execution-time origin guard
   (`window.location.origin !== trustedOrigin → return`), so a
   navigation that begins after the native preflight check can't let the
   injection execute against a different origin.

5. **Regression coverage.** 4 new tests covering the signOut bridge
   message, `showsFullScreenOverlay` (including the specific blocked-
   navigation regression), and popup navigation-kind mapping (including
   the specific user-activated-link regression) were added to
   `WebBoundaryTests.swift` (pure policy, no WebKit runtime). A new file,
   `WebSessionBoundaryIntegrationTests.swift`, adds 4 genuine `WKWebView`
   integration tests covering: sign-out cleanup never deletes a sentinel
   IndexedDB record; the exact Supabase auth key is removed; cleanup is
   idempotent; cleanup refuses to run against an untrusted origin. Total:
   **47/47 passing** (43 pure-policy + 4 integration). See the Manual
   Adversarial Matrix above for exactly which scenarios were genuinely
   WebKit-driven vs. code-review-only — the claim is never stronger than
   that distinction.

**Verification run this session:** `npx vitest run` (108/108),
`npx tsc --noEmit --pretty false` (clean), `npm run build` (succeeds),
`npm audit --omit=dev` (0 vulnerabilities), `xcodebuild test` on
`iPhone Duo` (iOS 27.2) — 47/47 native tests passing, unsigned generic-
device Release `xcodebuild` with `CODE_SIGNING_ALLOWED=NO` (BUILD
SUCCEEDED), `git diff --check` (clean). No Edge Function, database
migration, Cloudflare, or other production resource was deployed this
session. The pre-existing `docs/BETA_LAUNCH_CHECKLIST.md` deletion from
before this remediation pass was left untouched.

**Status at the end of pass 1: still PARTIAL, not COMPLETE** — the four
defect categories were fixed and automated-tested, but a second
independent review found further defects in the pass-1 design itself
(below), so pass 1's "fixed" claim for items 1-2 did not hold up.

---

## Milestone 1B Remediation — Pass 2 (this session)

A second independent review found that pass 1's fixes, while real
improvements, still had race windows and design gaps. Starting commit
for this pass: `1810833c381b0e6b340918990744effbd80490ce`.

1. **Pending-cleanup gate redesigned — the 1.5-second sleep was not a
   real gate.** `MainTabView` previously just slept a fixed 1.5s and then
   mounted a new session regardless of whether cleanup had actually
   finished; an old pending cleanup could in principle run against the
   next user's already-injected WebView. Replaced with: `AuthManager.
   terminateSession()` now calls `WebSessionBoundary.
   markPendingForNewCleanup()` SYNCHRONOUSLY — before `authState` flips
   and before the outgoing WebView unmounts — bumping a monotonically
   increasing `generation`. `MainTabView.runPendingAuthCleanupCheck()`
   genuinely AWAITS `WebSessionBoundary.ensureCleanupComplete()`, which
   either reuses the still-live outgoing WebView or, if none is
   available, spins up a throwaway *unprivileged* WebView (no session
   script, no bridge handler) purely to run the cleanup, then discards
   it — never falling back to deleting IndexedDB or any other
   `WKWebsiteDataStore` data. A completion for a generation that's since
   been superseded by a newer sign-out can never clear the newer
   request's `isPending` or be reported as that request's success. A
   failed/timed-out cleanup shows a Retry UI instead of silently
   mounting the new session anyway. The previous `withTaskGroup`-based
   timeout was also replaced — `withTaskGroup` implicitly awaits ALL
   child tasks when its closure returns, so cancelling a child whose
   `evaluateJavaScript` completion handler never fires does not actually
   unblock that `await`; the new `evaluateWithTimeout` instead resumes a
   single `CheckedContinuation` directly from whichever of the real
   callback or a timer fires first, guarded by a lock-based
   `ResumeOnce` so it can never double-resume.

2. **AuthManager race-guarding extended to every async identity
   operation, not just the WebView bridge task.** `restoreSession()` and
   `refreshAndGetToken()` previously had no equivalent of the epoch/
   liveness check `WebAppView.Coordinator` already had for
   `sessionRefreshed` — a late success or 400/401 failure from either
   could persist to Keychain or sign out whatever account was actually
   live by the time the network round trip resolved. Both now capture
   `(expectedUserId, expectedEpoch)` before their `await` and re-check
   `isCurrentSession(userId:epoch:)` — plus, for a successful response,
   that the returned Supabase user id matches the expected user — before
   persisting anything or calling `terminateSession()`. `refreshAndGetToken()`
   also now coalesces concurrent callers onto one in-flight `Task` rather
   than firing a second independent refresh. All Keychain writes for the
   web-bridge refresh path are now centralized in a new
   `AuthManager.applyWebRefreshedSession(...)` method — `MainTabView` no
   longer writes Keychain directly at all.

3. **`sessionRefreshed`'s refresh token is now bound to its access
   token, not merely paired with it.** The pass-1 design verified the
   access token against Supabase but persisted whatever refresh token
   happened to arrive in the same bridge message, with nothing actually
   confirming the two belonged together. `Coordinator.handleSessionRefreshed`
   now EXCHANGES the claimed refresh token with Supabase directly
   (`SupabaseClient.refreshSession`) in parallel with verifying the
   access token, and requires a pure, unit-tested predicate
   (`isPairedSessionValid`) to hold: the access-token user, the
   refresh-exchange's own returned user, and the bridge's claimed
   `userId` must all agree. Only the CANONICAL tokens/identity the
   exchange returns are ever persisted or forwarded — never the bridge's
   own raw refresh token or claimed email. If the exchange rotated the
   refresh token (Supabase's are single-use), the WebView's own
   localStorage is silently overwritten with the canonical session via a
   raw storage write (not `supabase.auth.setSession()`), which does not
   fire the web client's own `onAuthStateChange` listener and therefore
   cannot create a refresh loop back through this same handler. A true
   token-free bridge redesign (native as sole refresher, pushing to web)
   remains out of scope for this pass, same as pass 1's reasoning.

4. **HealthKit sync is now bound to the session it started under.**
   `MainTabView.autoSync()`'s `Task {}` was previously untracked and
   uncancellable; `SyncEngine.sync()` had no epoch/identity awareness at
   all. `SyncEngine.sync()` now captures `(userId, epoch)` at the start
   and re-checks `authManager.isCurrentSession(...)` after the HealthKit
   fetch and after the upload/refresh, aborting without touching
   persisted sync state or posting a completion if the check fails. The
   completion notification itself now carries `(userId, epoch)`.
   `WebAppView.Coordinator.handleNativeSyncComplete` requires `isActive`
   PLUS both values to match its own expected session (via
   `isValidSession`) before ever injecting into IndexedDB — a sync
   started under account A can no longer inject into account B's
   WebView just because it happened to complete after B became active.
   `MainTabView` now tracks the sync `Task` in `@State` and cancels it in
   `.onDisappear`.

5. **Web sign-out is now actually guaranteed, not best-effort-shaped
   around one unguarded call.** `AuthContext.tsx`'s `signOut()` previously
   called `clearQueueForUser(user.id)` OUTSIDE any try/catch, BEFORE the
   try/finally that notified native — a thrown IndexedDB error there
   aborted the whole function before native ever heard about the
   sign-out. Every step (`clearQueueForUser`, the Supabase sign-out call,
   the native bridge `signOut` postMessage, each `setSetting` write) is
   now independently wrapped so a failure in any one of them cannot skip
   the others — the native bridge notification and the local
   `setSession(null)`/`setUser(null)`/`setMode('guest')` clearing always
   run.

6. **Blocked-navigation banner timer could overwrite a later genuine
   failure.** The 3-second auto-dismiss `DispatchWorkItem` that resets
   the WebView state back to `.ready` after a blocked navigation was
   never cancelled if a REAL failure (offline/serverError/sessionExpired/
   processTerminated) arrived in the meantime — the banner's timer firing
   afterward would silently paper back over a genuine, still-current
   failure state with `.ready`. `invalidateBlockedBannerTimer()` is now
   called from every delegate callback that reports one of those four
   states, plus from `invalidate()`.

7. **Test architecture.** The `WebBoundary` source files no longer carry
   a second, separate build-file membership inside `JeevanTests`'s own
   Sources phase (removed from `project.pbxproj`) — every test now
   reaches the app's types exclusively through `@testable import Jeevan`,
   eliminating the cross-module type-identity workaround pass 1 needed.
   `WebSessionBoundaryIntegrationTests.swift` gained 5 new lifecycle
   tests (exercising `markPendingForNewCleanup`/`registerLiveTrustedWebView`/
   `clearLiveTrustedWebView`/`ensureCleanupComplete` directly, including a
   second-sign-out-supersedes-the-first generation test and an
   unrelated-localStorage-key-survives assertion) rather than only the
   low-level `runCleanup(on:)` bypass pass 1 used, plus a strengthened
   untrusted-origin test that asserts the committed URL, `window.location.origin`,
   and page content BEFORE testing refusal. A new `AuthManagerRaceTests.swift`
   adds 6 tests for item 2's guard logic. Setup-step failures are now
   `XCTFail`, not `XCTSkip` — this run reports 0 skipped tests.

8. **Account isolation — NOT claimed safe.** `src/context/AuthContext.tsx`'s
   `hasSignificantLocalData` had a real bug fixed this pass: `healthMetrics`
   was already being fetched into `LocalDataSummary` but never actually
   checked, so a health-only local dataset silently fell through to an
   unprompted `syncEngine.downloadAll()` instead of the merge-choice
   prompt. `LocalDataSummary`/the check now also cover `progress_photos`
   and a saved `profile` record. This reduces, but does NOT eliminate,
   the risk — IndexedDB is still not partitioned by user at all, and two
   accounts used on the same device without ever fully signing out
   between them are still not safely isolated. **This remains a
   Milestone 3 launch blocker**, not resolved by this pass.

**Verification run this pass:** `npx vitest run`, `npx tsc --noEmit
--pretty false`, `npm run build`, `npm audit --omit=dev`, `xcodebuild
test` on `iPhone Duo` (iOS 27.2) — **61/61 native tests passing, 0
skipped**, unsigned generic-device Release `xcodebuild` with
`CODE_SIGNING_ALLOWED=NO`, `git diff --check` (clean). No Edge Function,
database migration, Cloudflare, or other production resource was
deployed. Nothing was pushed. The pre-existing `docs/BETA_LAUNCH_CHECKLIST.md`
deletion was left untouched.

**Status: still PARTIAL, not COMPLETE.** All ten items in this pass's
remediation spec have corresponding code and/or test changes, but the
live, interactive adversarial matrix pass — real popups, real media
prompts, a real on-screen multi-identity sign-out/sign-in cycle, a real
HealthKit-sync-in-flight account switch — has still not happened. Do not
advance this milestone to COMPLETE until that pass runs.
