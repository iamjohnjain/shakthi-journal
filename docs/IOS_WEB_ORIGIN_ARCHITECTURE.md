# iOS Web-Origin Architecture: Bundled Assets vs. Remote Cloudflare Origin

**Status:** Recommendation only — no architecture change was made this
milestone. Bundling requires explicit owner approval before implementation
(it changes the release/update process, not just a code file).

## The decision

Jeevan's native iOS app is a thin SwiftUI shell (HealthKit sync, Keychain
session, native loading/error chrome) wrapping a single `WKWebView` that
loads the entire product UI from `https://jeevan-health-fitness-app.pages.dev`
— a Cloudflare Pages deployment of the same Vite/React app this repository
builds for the web.

Two options exist for the Release build:

- **Option A — Bundle the reviewed Vite assets into the iOS binary.** `npm
  run build`'s `dist/` output ships inside the app bundle; the WKWebView
  loads it via a local file/app-bound scheme instead of a network request.
  A new release requires a new binary submission.
- **Option B — Continue loading the exact remote origin.** What the app
  does today, now hardened by this milestone's trust-boundary work
  (`TrustedWebOrigin`, navigation/bridge/media gating, etc.).

## Comparison

| Consideration | Option A: Bundled | Option B: Remote |
|---|---|---|
| **App Review determinism** | What Apple reviews is exactly what every user runs until the next approved release — no possibility of the reviewed build and the live build diverging. | Apple reviews whatever is deployed to Cloudflare Pages at review time; nothing stops a later `git push` to the web repo from changing the in-app experience without a new binary review. This is the crux of the Guideline 4.2 risk. |
| **Guideline 4.2 / minimum-functionality risk** | Materially lower — the binary is self-contained and Apple's usual "is this just a repackaged website" concern has a straightforward answer: no, the reviewed code ships in the binary. | Real risk remains. The native HealthKit integration (real device permission flow, Keychain session, background sync) is a genuine point in the app's favor, but a reviewer can still reasonably ask why the core UI isn't native or at least bundled. |
| **Native HealthKit value** | Unchanged either way — HealthKit access is entirely native Swift regardless of where the web UI's assets come from. | Same. |
| **Token/bridge trust boundary** | Simpler to reason about: the loaded content is a known, fixed, reviewed artifact — no "is this origin still the one we trust" question at runtime beyond defense-in-depth. | This milestone's `TrustedWebOrigin`/navigation-policy/bridge-validator work is necessary specifically because the content is fetched live and must be verified every time. |
| **Offline behavior** | Works offline immediately — the UI itself is local; only API calls (Supabase, Groq) need network. | The UI itself cannot load at all without reaching Cloudflare first — "offline" currently means a blank app, mitigated this milestone by the native offline/error overlay, but the overlay can only ever say "try again," not actually load anything. |
| **OAuth/authentication implications** | No change needed — Google/Apple OAuth already round-trips through `ASWebAuthenticationSession`, not the main WKWebView, in both options. | Same. |
| **Update/release process** | A typo fix or urgent bug fix requires a full App Store binary release (review turnaround, Apple's timeline). | Instant — `git push` to the web repo redeploys Cloudflare Pages in seconds, no App Store review needed for web-only changes. This is the single biggest practical cost of bundling. |
| **Rollback** | Roll back to a previous binary via App Store Connect (slower, and Apple does not let you "unpublish" a bad version instantly). | Roll back by redeploying a previous Cloudflare Pages build — seconds, no Apple involvement. |
| **CSP/origin implications** | A bundled app can still call out to Supabase/Groq APIs directly; CSP becomes less about "which origin can the WebView load" (there's only one, the bundle itself) and more about which API hosts the bundled JS is allowed to fetch from. | CSP must additionally consider that the top-level page itself is fetched over the network from a origin the app must verify before trusting (this milestone's work). |
| **Implementation effort** | Nontrivial: needs a build step that copies `dist/` into the Xcode target as a resource, a local-scheme or `file://`-based loading strategy WKWebView can use for SPA routing (client-side React Router needs a rewrite-to-index.html rule, which `file://` doesn't give you for free — likely needs a custom `WKURLSchemeHandler`), and a process to keep the bundled assets in sync with each release. Realistically a multi-day effort on its own, not a drop-in change. | Already done — this is the status quo, now hardened. |

## Recommendation

**Prefer Option A (bundled assets) for the long-term, but do not treat it
as a blocker for this first submission.** The remote-origin risk under
Guideline 4.2 is real but not automatic rejection — plenty of approved App
Store apps are WKWebView wrappers around a web product, provided the app
adds genuine native value (HealthKit here is a strong, legitimate example)
and the trust/security story is solid (this milestone's work directly
addresses that). Given:

- Bundling is a nontrivial, multi-day engineering effort (SPA routing
  inside a bundle needs a custom URL scheme handler — this is not "copy
  `dist/` into Xcode and done").
- The trust-boundary hardening in this milestone already closes the
  specific security gaps (token injection, unchecked navigation, bridge
  authorization, media permission) that would otherwise be the strongest
  argument *against* shipping Option B.
- A v1 submission under time pressure benefits far more from a fast,
  reviewable security fix than from a large, riskier architecture change
  done under the same time pressure.

**Recommendation: ship v1 on Option B** (hardened remote origin, as
implemented this milestone), and schedule Option A as a dedicated
follow-up milestone — specifically because the update-velocity and
rollback advantages of staying remote are large and real, and bundling
should be done carefully, not as a rushed pre-submission change.

If Apple App Review does reject v1 specifically under Guideline 4.2,
Option A becomes the direct, concrete response to that specific rejection
reason — which is a stronger position than speculatively bundling now
against a risk that may not materialize.

## What this milestone did NOT change

- The app still loads `https://jeevan-health-fitness-app.pages.dev` as its
  one and only content origin.
- No custom URL scheme, no bundled `dist/`, no `WKURLSchemeHandler` was
  added.
- If the owner decides to pursue Option A instead, that is new, separate
  work with its own milestone and its own owner approval gate before any
  code is written.
