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
| **App Review determinism** | What Apple reviews is exactly what every user runs until the next approved release — no possibility of the reviewed build and the live build diverging. | Apple reviews whatever is deployed to Cloudflare Pages at review time; nothing stops a later `git push` to the web repo from changing the in-app experience without a new binary review. This is the crux of the Guideline 4.2 risk, and it is a **compliance risk to actively mitigate, not merely a tradeoff to note** — "instant changes without App Review" cuts against App Review's own purpose unless real release protections (see Recommendation below) are in place to keep what ships to the WebView provably equivalent to what was reviewed. |
| **Guideline 4.2 / minimum-functionality risk** | Materially lower — the binary is self-contained and Apple's usual "is this just a repackaged website" concern has a straightforward answer: no, the reviewed code ships in the binary. | Real risk remains, and it is **independent of whether the content is bundled or remote** — bundling the exact same thin-wrapper UI into the binary does not, by itself, satisfy Guideline 4.2. Apple's actual bar is meaningful native functionality beyond a repackaged website; HealthKit sync, the native sign-out/session boundary, and Keychain-backed auth state (Milestone 1B) are the real answer to this concern, and they apply whether the web UI's assets are bundled or fetched remotely. |
| **Native HealthKit value** | Unchanged either way — HealthKit access is entirely native Swift regardless of where the web UI's assets come from. | Same. |
| **Token/bridge trust boundary** | Simpler to reason about: the loaded content is a known, fixed, reviewed artifact — no "is this origin still the one we trust" question at runtime beyond defense-in-depth. | This milestone's `TrustedWebOrigin`/navigation-policy/bridge-validator work is necessary specifically because the content is fetched live and must be verified every time. |
| **Offline behavior** | Works offline immediately — the UI itself is local; only API calls (Supabase, Groq) need network. | The UI itself cannot load at all without reaching Cloudflare first — "offline" currently means a blank app, mitigated this milestone by the native offline/error overlay, but the overlay can only ever say "try again," not actually load anything. |
| **OAuth/authentication implications** | No change needed either way. | Google sign-in on native iOS round-trips through `ASWebAuthenticationSession` (`AuthManager.signInWithGoogle()`), not the main WKWebView — confirmed in code. **Apple Sign-In does NOT currently use `ASWebAuthenticationSession` on native iOS at all** — `authProviders.ts` shows Apple disabled (`apple: disabled`), and no native Sign in with Apple flow exists in `AuthManager.swift`; the only `signInWithApple` path is the web app's own Supabase OAuth redirect (`AuthContext.tsx`), which on native would run inside the main WKWebView like any other web navigation, not a system auth sheet. Do not describe Apple OAuth as already isolated from the main WebView — it isn't, because it isn't implemented on native at all yet (tracked under Milestone 6C / Open Question #3). |
| **Update/release process** | A typo fix or urgent bug fix requires a full App Store binary release (review turnaround, Apple's timeline). | **Confirmed this session: a push to `main` on this repo auto-deploys to Cloudflare Pages — there is currently no manual approval step, no deployment freeze, and no protection in front of this at all.** `git push` redeploys in seconds, no App Store review needed for web-only changes — real operational upside, but also the exact mechanism of the Guideline 4.2/supply-chain risk above: whoever can push to `main` has, right now, unreviewed, unapproved, un-frozen control over what the shipped app's WebView executes. The practical cost of bundling is real; so is the governance cost of staying remote with the CURRENT (unprotected) deploy setup. |
| **Rollback** | Submitting a new App Store binary version is the only way to change what a reviewed native binary does — Apple does not offer a "revert users to the previous binary" button; a *previously-approved* version can only be re-promoted from App Store Connect's own release management if that flow was already set up, which is not confirmed here. | Roll back by redeploying a previous Cloudflare Pages build/commit — seconds, no Apple involvement, PROVIDED a rollback procedure is actually defined and tested (not yet confirmed to exist for this project — see the release-protections list below). |
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

**Recommendation: ship v1 on Option B (hardened remote origin), CONDITIONAL
on real release protections being in place first** — this is not an
unconditional endorsement of remote. Treating "no App Review needed for
instant changes" as a pure advantage, without the controls below, ships
a privileged, mutable supply-chain dependency into a reviewed app.
Before relying on Option B for submission, the following should exist:

**None of these currently exist — confirmed this session, not assumed:**

- **Immutable, versioned releases** on the Cloudflare Pages side — a
  specific deployment is what the app points at (or can be pinned to),
  not implicitly "whatever is live right now." **Not in place: a push to
  `main` auto-deploys with no pinning.**
- **Protected deploy approvals** — pushes to the production branch/
  project require review, not direct unreviewed pushes by anyone with
  repo access. **Not in place: confirmed this session that a push to
  `main` auto-deploys with no approval gate at all.**
- **A deployment freeze during App Review** — nothing changes on the
  live origin between submission and approval, so what Apple tested is
  what ships. **Not in place — no freeze mechanism exists.**
- **Account MFA / access control** on the Cloudflare Pages project and
  the repo that deploys to it — the origin's trustworthiness is only as
  good as who can push to it. **Not verified from code — requires owner
  confirmation of the actual Cloudflare/GitHub account security posture.**
- **CSP / security headers** on the deployed origin. **Confirmed this
  session: `public/_headers` exists but contains ONLY `Cache-Control`
  directives for HTML/assets/manifest/icons/models/service-worker — there
  is no `Content-Security-Policy`, `Strict-Transport-Security`,
  `Referrer-Policy`, `X-Content-Type-Options`, or `Permissions-Policy`
  directive anywhere in it. This is a real gap, not a "not yet verified"
  unknown (see also Milestone 5).**
- **A rollback plan** — a known, fast, tested way to revert a bad deploy,
  not just the theoretical capability.
- **Synchronized app/web release governance** — a shared understanding
  of which web changes are safe to ship independently of a native
  release and which require coordinating both (e.g. a native-side schema
  or bridge-protocol change should not go out from the web side alone).

With those in place, schedule Option A (bundling) as a dedicated
follow-up milestone rather than a rushed pre-submission change — the
update-velocity and rollback advantages of staying remote are real, but
they are only a net positive once the release process around them is
actually governed, not merely fast.

If Apple App Review does reject v1 specifically under Guideline 4.2,
Option A becomes the direct, concrete response to that specific rejection
reason — which is a stronger position than speculatively bundling now
against a risk that may not materialize. Note again that bundling alone
would not have prevented a 4.2 rejection grounded in "insufficient native
functionality" — only the native-functionality work (HealthKit, the
session boundary, Keychain-backed auth) does that; bundling only answers
the separate "is the reviewed code what actually ships" concern.

## What this milestone did NOT change

- The app still loads `https://jeevan-health-fitness-app.pages.dev` as its
  one and only content origin.
- No custom URL scheme, no bundled `dist/`, no `WKURLSchemeHandler` was
  added.
- If the owner decides to pursue Option A instead, that is new, separate
  work with its own milestone and its own owner approval gate before any
  code is written.
