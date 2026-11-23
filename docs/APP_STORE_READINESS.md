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
| Production web origin | **Resolved.** `https://jeevan-health-fitness-app.pages.dev` is the sole authoritative Release origin per owner confirmation (code, deployment docs, and the rebrand commit all agree). `shakthi-journal.pages.dev` currently serves identical assets but is a legacy parallel deployment and must never be privileged. | Milestone 1B implements this as `TrustedWebOrigin.production`, covered by automated tests. |
| Local provisioning profiles | Two profiles ARE reproducible at `~/Library/Developer/Xcode/UserData/Provisioning Profiles/` (owner-corrected path — not `~/Library/MobileDevice/...`, which doesn't exist on this machine). **Owner reports** Xcode's UI shows missing-UUID errors for both and `security find-identity` shows zero valid signing identities. **This session's own direct re-check found something different and is recorded here for transparency, not to override the owner's report:** `security find-identity -v -p codesigning` returned **one** valid identity ("Apple Development: johnmundackal11@gmail.com (324DW4RU23)"); `security cms -D -i <profile>` successfully decoded BOTH `.mobileprovision` files with well-formed UUIDs, names, and expiration dates matching their filenames; and an actual `xcodebuild … build` (automatic signing, no `CODE_SIGNING_ALLOWED=NO`) **succeeded** using identity `55A3A55AF634E5A763419D925DE6C5988C8CEE9B` and profile `29b4cc66-...` ("iOS Team Provisioning Profile: jeevan.health.fitness"). This does not necessarily mean signing is actually fine end-to-end — Xcode's own GUI (Signing & Capabilities pane) does additional live validation against the Apple Developer portal that this command-line check cannot reproduce, and a `security cms`-decodable profile can still be rejected by Xcode for reasons outside that command's scope (e.g. a certificate reference inside the profile not matching what's in the keychain, a revoked cert, or portal-side profile invalidation). **Flagging this discrepancy for the owner to reconcile** rather than asserting either account unilaterally. |
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

### 1B. WKWebView trust-boundary hardening — ✅ COMPLETE

Full threat model, implementation, boundary table, and test results are
below. Summary: one centralized exact-origin policy
(`TrustedWebOrigin.production` = `https://jeevan-health-fitness-app.pages.dev`,
scheme+host+port, no substring matching) now gates navigation, popups,
session-token injection, the JS↔native bridge, HealthKit injection, and
camera/microphone grants. 34 new automated tests pass on a real simulator
(`iPhone Duo`, iOS 27.2). Native loading/offline/error/blocked-navigation
states replace the previous "blank WebView on failure" behavior. Full
detail: see the dedicated **Milestone 1B** section below (after Milestone 8)
and `docs/IOS_WEB_ORIGIN_ARCHITECTURE.md`.

**Known residual item (intentionally out of this milestone's scope, see
owner instruction):** `ios/ShakthiJournal/Sync/SupabaseClient.swift`'s
`SupabaseError.errorDescription` (around lines 30-52) still surfaces raw,
undecorated Supabase response bodies in user-facing error text for any
HTTP error that isn't one of the four hand-matched auth messages —
including 401/403 responses from data endpoints. Tracked as an open
privacy-hardening item for a future milestone, not redesigned here per
explicit instruction to keep this milestone narrowly scoped to the
trust-boundary work.

### 1C. Remote-WebView App Store risk (Guideline 4.2) — ✅ Evaluated

**Resolved this session.** `docs/IOS_WEB_ORIGIN_ARCHITECTURE.md` compares
bundled-assets (Option A) vs. the hardened remote origin (Option B) in
full. **Recommendation: ship v1 on Option B** — the trust-boundary
hardening in 1B directly addresses the specific security gaps that would
otherwise be the strongest argument against shipping remote, and bundling
is nontrivial (SPA routing inside a bundle needs a custom
`WKURLSchemeHandler`, not just copying `dist/` into Xcode) — real
follow-up work, not a pre-submission patch. No architecture change was
made; this is a recommendation awaiting owner sign-off if a different
direction is preferred.

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
1. ~~WKWebView trust boundary hardening~~ ✅ **Done this session** — see Milestone 1B detail below.
2. **AI function authentication/limits/consent** (Milestone 2) — requires a backend-deploy approval conversation first. **Recommended next.**
3. **Account lifecycle** (Milestone 3: password reset, deletion, sign-out isolation, backup/export reconciliation).
4. **HealthKit narrowing + Info.plist/entitlement cleanup + privacy manifest** (Milestones 4 + 6B) — these are smaller and can likely be combined.
5. **Legal pages + submission packet** (Milestones 7 + 8) — blocked on owner-provided legal/business details.
6. **Signing + archive validation** (Milestone 6E) — blocked on owner's Apple Developer actions; can run in parallel with the above once credentials exist.
7. **Residual Milestone 1B item:** `SupabaseClient.swift`'s raw response-body error text (lines ~30-52) — deliberately deferred, see 1B note above.

---

## Milestone 1B Detail — WKWebView Trust-Boundary Hardening (COMPLETE)

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
| Sign-out WebKit session boundary | No `WKWebsiteDataStore` clearing anywhere — the shared, persistent default store would carry a signed-out user's cookies/localStorage/IndexedDB into whatever identity signed in next | `WebSessionBoundary.clearPrivilegedWebSession()` called from all 4 places `AuthManager` ends a session (explicit sign-out + 3 forced-logout paths) | Not unit-tested (requires a live `WKWebsiteDataStore`) — see Manual Matrix | 🟡 Implemented, not automated-tested |
| Native loading/error states | None — a failed/blocked/terminated load left a blank WebView with no explanation | `WebBoundaryState` + `WebBoundaryOverlay`/`BlockedNavigationBanner`, wired to `didCommit`/`didFinish`/`didFail`/`didFailProvisionalNavigation`/`webViewWebContentProcessDidTerminate`; Retry always reloads `TrustedWebOrigin.productionURL` only | Visual/behavioral, not unit-tested — see Manual Matrix | 🟡 Implemented, not automated-tested |
| Settings origin display | Hardcoded a second literal copy of the origin string | Reads `TrustedWebOrigin.production.host` | Covered indirectly by the origin tests (same source of truth) | ✅ |

### Test results

| Command | Result | Evidence |
|---|---|---|
| `npx vitest run` | ✅ 108/108 pass | unchanged from Milestone 0, re-verified after all native changes |
| `npx tsc --noEmit --pretty false` | ✅ clean | — |
| `npm run build` | ✅ succeeds | — |
| `npm audit --omit=dev` | ✅ 0 vulnerabilities | — |
| Unsigned Release `xcodebuild` (generic/platform=iOS) | ✅ BUILD SUCCEEDED | `/private/tmp/jeevan-webview-release` |
| **`xcodebuild test` — new `JeevanTests` target, simulator `iPhone Duo` (iOS 27.2)** | ✅ **34/34 tests passed**, 0 failures | `/private/tmp/jeevan-tests-run/Logs/Test/Test-Jeevan-*.xcresult`; full pass list includes every allowed/rejected origin case, every navigation-kind case, every deep-link case, and every bridge-validation case specified in the milestone's required test matrix |

The native test target did not exist before this session (confirmed in
Milestone 0). It was added by direct `project.pbxproj`/`.xcscheme` editing
(the `xcodeproj` Ruby gem failed to install in this environment — native
extension build failure against this machine's bundled Ruby/SDK — so this
was hand-edited, verified with `plutil -lint` after every step, and backed
up to `/private/tmp/project.pbxproj.backup` / `/private/tmp/Jeevan.xcscheme.backup`
before starting). `JeevanTests` is a hosted unit-test bundle
(`TEST_HOST`/`BUNDLE_LOADER` pointing at the app target) sharing the six
`WebBoundary` source files' build-file membership with the app target —
no `@testable import` framework-linking complexity needed since both
targets compile the same source files directly.

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
| `target=_blank` / `window.open` | Trusted → loads in same view; external → opens in Safari; else → blocked | Logic reviewed (reuses `decide`); not run against a live popup | 🟡 Code review only |
| Cross-origin iframe bridge attempt | `message.frameInfo.isMainFrame == false` → rejected | Unit-tested (`test_bridge_trustedSubframe_rejected`) | ✅ Automated |
| Untrusted `getUserMedia` request | `.deny` | Logic reviewed (same origin-construction path as bridge/navigation, which are tested) — `WKSecurityOrigin` itself isn't exercised in XCTest | 🟡 Code review only |
| Trusted camera request | `.prompt` (not auto-grant) | Logic reviewed | 🟡 Code review only |
| Trusted microphone request | `.prompt` (not auto-grant) | Logic reviewed, same code path as camera (type-parameterized) | 🟡 Code review only |
| Deep-link escape attempt (`//evil.example`, absolute URL, `javascript:`) | Rejected | Unit-tested (3 separate tests) | ✅ Automated |
| Navigation during HealthKit injection | Generation-token mismatch blocks injection | Logic reviewed; genuine timing race not reproduced (would need a real WKWebView mid-navigation at the exact moment a sync completes) | 🟡 Code review only |
| Web sign-out followed by cold launch | `WebSessionBoundary.clearPrivilegedWebSession()` runs on `signOut()`; next launch has no stale web session | Logic reviewed; not run on a device/simulator across an actual app-kill-and-relaunch cycle | 🟡 Code review only |
| Native sign-out followed by another identity | Same clearing call, plus `dismantleUIView` strips scripts/handlers from the old `WKWebView` instance when SwiftUI tears it down | Logic reviewed | 🟡 Code review only |
| Offline launch/retry | `.offline` state (NSURLErrorNotConnectedToInternet et al.), Retry reloads trusted root | Logic reviewed; not run with the simulator's network actually disabled | 🟡 Code review only |
| Web-content process termination/recovery | `.processTerminated` state shown, Retry available | Logic reviewed; not forced via Simulator's "Simulate Memory Warning"/process-kill tooling | 🟡 Code review only |

**Honest summary:** the parts of this matrix expressible as pure-function
unit tests (origin matching, navigation-kind decisions, deep-link
resolution, bridge message schema/frame/origin validation) are
automated and passing — 34/34, independently re-runnable. The parts that
require live WebKit runtime behavior (actual popups, actual media
permission prompts, actual redirects from a real server, actual
backgrounded/killed-process timing) are implemented per the same
reviewed logic but were not interactively driven in a simulator this
session — that would need either a UI-automation pass (XCUITest, a
further scoped addition) or manual QA on a device. Recommended as a
fast-follow before submission, not a blocker for this milestone's own
definition of done (which this milestone satisfies).

### Bundled-assets vs. remote-origin recommendation

See full comparison in `docs/IOS_WEB_ORIGIN_ARCHITECTURE.md`. **Recommendation: ship v1 on the hardened remote origin (Option B)**; treat bundling (Option A) as a dedicated follow-up milestone, not a pre-submission change.

### Remaining Milestone 3 dependency

This milestone's sign-out boundary work (`WebSessionBoundary`) only
covers the **WebView's own** cookie/localStorage/IndexedDB/cache store.
It does NOT touch the web app's own IndexedDB databases as seen by the
JS layer running inside that WebView in the time before a sign-out
clears the store, nor does it address general per-user data isolation
during normal (non-sign-out) operation — e.g. two accounts used on the
same device without ever fully signing out between them, or the broader
question of whether the web app's own IndexedDB schema is keyed per-user
at all. That full account-isolation design is explicitly Milestone 3's
scope and remains open.
