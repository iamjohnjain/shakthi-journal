import WebKit

/// Clears ONLY the Supabase auth session from the trusted WebView — never
/// the user's IndexedDB health data, general localStorage, or any other
/// website data. `WKWebsiteDataStore` has no API to remove a single
/// LocalStorage key, so this performs the removal via an origin-gated
/// JavaScript injection instead — either into the still-live privileged
/// WebView (if one is mounted) or, if none is available, into a throwaway
/// WebView loaded with a completely INERT, static, same-origin HTML
/// document (no session script, no `jeevanNative` bridge handler, no
/// `<script>` tag at all — see `runEphemeralCleanup()`) that is discarded
/// immediately afterward. The fallback never navigates to the real
/// production URL — doing so would let the real application code run
/// against the still-present old session before this cleanup had a
/// chance to remove it (see the Remediation Pass 3 / P1-1 comment on
/// `runEphemeralCleanup()`). This never falls back to deleting IndexedDB
/// or any other `WKWebsiteDataStore` data wholesale.
///
/// Every cleanup is bound to a monotonically increasing `generation`.
/// `AuthManager.terminateSession()` calls `markPendingForNewCleanup()`
/// *synchronously*, before flipping `authState` or letting the old
/// `WebAppView` unmount — so `isPending`/`generation` are already correct
/// before anything downstream (`MainTabView`'s gate) can observe the new
/// state. A cleanup that was still running for an OLDER generation when a
/// second sign-out/sign-in superseded it can never clear `isPending` for
/// the newer one, and `MainTabView` always awaits the CURRENT generation's
/// cleanup via `ensureCleanupComplete()` before mounting a new privileged,
/// authenticated `WebAppView` — never a fixed delay, never a guess.
@MainActor
final class WebSessionBoundary {
    static let shared = WebSessionBoundary()

    /// The exact (and only) key this coordinator is allowed to remove.
    /// Supabase JS stores the session under `sb-{projectRef}-auth-token`;
    /// must mirror `WebAppView.sessionScript()`'s own `storageKey`.
    static let authStorageKey = "sb-pvtsskfnbxeohbtwafah-auth-token"

    enum CleanupOutcome: Equatable {
        /// No cleanup was pending at all — safe to proceed immediately.
        case notNeeded
        case succeeded
        /// Failed or timed out, OR this call's generation was superseded
        /// by a newer sign-out while it was running — either way, the
        /// caller must not treat this as safe to proceed; it should show a
        /// retry state rather than silently mounting a privileged WebView.
        case failed
    }

    private static let pendingDefaultsKey = "jeevan.authCleanupPending"

    /// Persisted so a cleanup that never got to run (app killed before any
    /// trusted WebView loaded) is still remembered across a relaunch —
    /// never silently dropped.
    private(set) var isPending: Bool {
        get { UserDefaults.standard.bool(forKey: Self.pendingDefaultsKey) }
        set { UserDefaults.standard.set(newValue, forKey: Self.pendingDefaultsKey) }
    }

    /// Bumped by every `markPendingForNewCleanup()` call (i.e. every
    /// sign-out). A cleanup task captures the generation it was started
    /// for; only a completion that STILL matches the current generation
    /// when it finishes is allowed to clear `isPending` or be reported as
    /// a real success — a stale completion for a generation that has
    /// since been superseded is reported as `.failed` so no caller
    /// mistakenly treats it as "safe to proceed."
    private(set) var generation = 0

    private weak var liveTrustedWebView: WKWebView?
    private var inFlightCleanup: Task<Bool, Never>?
    private var inFlightGeneration = -1

    /// Observable test hook (not gated behind `#if DEBUG` — reading a
    /// counter in Release is harmless, and gating it would make it
    /// unavailable to tests run against a Release-configured target).
    /// Incremented every time `runEphemeralCleanup()` actually runs, so
    /// tests can prove the ephemeral fallback path specifically executed
    /// rather than coalescing with a cleanup that started against an
    /// already-live WebView (`registerLiveTrustedWebView`'s own kickoff).
    private(set) var ephemeralCleanupRunCount = 0

    private init() {}

    /// Called synchronously by `AuthManager.terminateSession()` BEFORE
    /// `authState` flips to `.signedOut` and before the outgoing
    /// `WebAppView` unmounts. Returns the new generation so the caller
    /// (or anything racing it) can reason about ordering.
    @discardableResult
    func markPendingForNewCleanup() -> Int {
        isPending = true
        generation += 1
        return generation
    }

    /// Called by `WebAppView.Coordinator` whenever its WebView commits the
    /// trusted origin. If a cleanup is pending, kicks it off immediately
    /// against this (still privileged, but about-to-be-torn-down) WebView
    /// rather than waiting for `ensureCleanupComplete()` to fall back to a
    /// throwaway one — reusing a page that's already loaded is strictly
    /// better when available.
    func registerLiveTrustedWebView(_ webView: WKWebView) {
        liveTrustedWebView = webView
        if isPending {
            let myGeneration = generation
            Task { await self.runCleanup(expectedGeneration: myGeneration, reusing: webView) }
        }
    }

    func clearLiveTrustedWebView(_ webView: WKWebView) {
        if liveTrustedWebView === webView {
            liveTrustedWebView = nil
        }
    }

    /// Silently overwrites the currently-live trusted WebView's auth
    /// LocalStorage entry with a canonical, rotated session — used by
    /// `AuthManager.reconcileWebRefreshedSession` (Remediation Pass 3,
    /// P1-2) after a refresh-token exchange rotates the token, so the
    /// WebView's own (now-stale) copy doesn't try to use a burned token
    /// on its next refresh. Re-checks "is there actually a live, trusted
    /// WebView right now" at WRITE time — not relying on any reference
    /// captured earlier — and is a raw storage write (not
    /// `supabase.auth.setSession()`), so it does not fire the web
    /// client's own `onAuthStateChange` listener and cannot create a
    /// refresh loop back through the bridge. A no-op if no trusted
    /// WebView happens to be live right now; the next time one commits,
    /// its own document-start session script will have already written
    /// whatever was in Keychain at that time regardless.
    func resyncCanonicalSessionIfLive(accessToken: String, refreshToken: String, userId: String, email: String) {
        guard let webView = liveTrustedWebView else { return }
        let expiresAt = Int(Date().timeIntervalSince1970) + 3600
        let script = """
        (function () {
          try {
            if (window.location.origin !== "\(TrustedWebOrigin.productionURL.absoluteString)") { return; }
            var session = {
              "access_token":  "\(accessToken.jsStringEscaped)",
              "token_type":    "bearer",
              "expires_in":    3600,
              "expires_at":    \(expiresAt),
              "refresh_token": "\(refreshToken.jsStringEscaped)",
              "user": {
                "id":            "\(userId.jsStringEscaped)",
                "email":         "\(email.jsStringEscaped)",
                "aud":           "authenticated",
                "role":          "authenticated",
                "app_metadata":  { "provider": "email", "providers": ["email"] },
                "user_metadata": {}
              }
            };
            window.localStorage.setItem('\(Self.authStorageKey)', JSON.stringify(session));
          } catch (e) {}
        })();
        """
        webView.evaluateJavaScript(script)
    }

    /// Awaits the CURRENT generation's cleanup to actually finish — the
    /// one correctness-critical entry point `MainTabView` calls before it
    /// is allowed to mount a new privileged, authenticated `WebAppView`.
    /// Never a fixed delay: this either returns `.notNeeded` immediately,
    /// or genuinely waits for the real JS-eval round trip (or its bounded
    /// timeout) to resolve.
    @discardableResult
    func ensureCleanupComplete() async -> CleanupOutcome {
        guard isPending else { return .notNeeded }
        let myGeneration = generation
        let succeeded: Bool
        if let webView = liveTrustedWebView {
            succeeded = await runCleanup(expectedGeneration: myGeneration, reusing: webView)
        } else {
            succeeded = await runCleanup(expectedGeneration: myGeneration, reusing: nil)
        }
        // If a NEWER sign-out superseded us while this was running, this
        // call's answer is moot — the newer generation's own
        // `ensureCleanupComplete()` call is the one whose answer matters,
        // and ours must not be mistaken for clearing the newer request.
        guard generation == myGeneration else { return .failed }
        return succeeded ? .succeeded : .failed
    }

    /// Never falls back to deleting anything else on failure/timeout —
    /// `isPending` simply stays `true` (unless a newer generation already
    /// superseded this one) and the next opportunity retries.
    @discardableResult
    private func runCleanup(expectedGeneration: Int, reusing webView: WKWebView?) async -> Bool {
        if let existing = inFlightCleanup, inFlightGeneration == expectedGeneration {
            return await existing.value
        }
        let task = Task<Bool, Never> { [weak webView, weak self] in
            if let webView {
                guard let url = webView.url, TrustedWebOrigin.matches(url) else { return false }
                return await Self.injectAndEvaluate(in: webView)
            } else {
                self?.ephemeralCleanupRunCount += 1
                return await Self.runEphemeralCleanup()
            }
        }
        inFlightCleanup = task
        inFlightGeneration = expectedGeneration
        let result = await task.value
        if inFlightGeneration == expectedGeneration {
            inFlightCleanup = nil
        }
        // Only clear isPending if this is STILL the generation in effect —
        // a stale completion for a superseded generation must never clear
        // a newer pending request.
        if result, generation == expectedGeneration {
            isPending = false
        }
        return result
    }

    /// Spins up a throwaway WKWebView and loads a completely INERT, static
    /// HTML string via `loadHTMLString(_:baseURL:)` with the trusted
    /// production origin as the base URL — never a real network request
    /// to Cloudflare, and never any real application JavaScript.
    ///
    /// This replaces an earlier, flawed design (Remediation Pass 3, P1-1)
    /// that called `webView.load(URLRequest(url: TrustedWebOrigin.
    /// productionURL))` — a REAL navigation to the live production app.
    /// Since the persistent `WKWebsiteDataStore` can still contain the
    /// old account's Supabase session at that point (cleanup hasn't run
    /// yet), the real React app got a genuine window to read that
    /// session from localStorage, activate the old account, and start its
    /// sync engine BEFORE this cleanup script ever ran — a real data/
    /// cross-account exposure race, not a hypothetical one.
    ///
    /// `loadHTMLString(_:baseURL:)` sets the loaded document's security
    /// origin to the given `baseURL` for storage purposes (confirmed by
    /// `WebSessionBoundaryIntegrationTests`, which use the identical
    /// technique to seed/verify localStorage and IndexedDB against the
    /// trusted origin without any network access) — so this inert page
    /// shares the EXACT SAME storage partition the real app would, while
    /// executing zero bytes of real application code. Correctness here
    /// does not depend on Cloudflare being reachable at all.
    private static func runEphemeralCleanup() async -> Bool {
        let webView = WKWebView(frame: .zero)
        webView.loadHTMLString(inertCleanupDocumentHTML, baseURL: TrustedWebOrigin.productionURL)
        let committed = await Self.waitForInertDocumentReady(webView, timeoutNanoseconds: 3_000_000_000)
        // Fail closed: if this throwaway page never even reached
        // `readyState === "complete"`, do not attempt the cleanup script
        // against it and do not clear `isPending` — the caller reports
        // `.failed` and the real-WebView/retry path gets another chance.
        guard committed else { return false }
        let result = await Self.injectAndEvaluate(in: webView)
        // A short grace period before `webView` goes out of scope and is
        // deallocated — `loadHTMLString`'s internal WKNavigation state
        // machine needs a brief moment to reach a terminal phase even
        // though `evaluateJavaScript` has already returned; deallocating
        // immediately can otherwise surface an unrelated internal WebKit
        // `InvalidTransition` error with no bearing on whether the
        // cleanup script itself actually ran (it already has, by this
        // point — `result` is already captured).
        try? await Task.sleep(nanoseconds: 150_000_000)
        return result
    }

    /// A static, same-origin, zero-script HTML document — no `<script>`
    /// tag at all, so there is no possibility of it executing anything
    /// beyond the cleanup script this file explicitly injects afterward.
    private static let inertCleanupDocumentHTML =
        "<!doctype html><html><head><title>cleanup</title></head><body></body></html>"

    /// Bounded poll — this WebView exists only for this one operation, so
    /// a full navigation-delegate wiring isn't warranted. `loadHTMLString`
    /// commits synchronously from WebKit's perspective almost immediately
    /// (no network round trip), so this poll is a short, bounded safety
    /// margin, not a real wait for a network load.
    private static func waitForInertDocumentReady(_ webView: WKWebView, timeoutNanoseconds: UInt64) async -> Bool {
        let deadline = DispatchTime.now().uptimeNanoseconds + timeoutNanoseconds
        while DispatchTime.now().uptimeNanoseconds < deadline {
            if let url = webView.url, TrustedWebOrigin.matches(url), !webView.isLoading {
                return true
            }
            try? await Task.sleep(nanoseconds: 50_000_000)
        }
        return false
    }

    private static func injectAndEvaluate(in webView: WKWebView) async -> Bool {
        let script = """
        (function () {
          try {
            if (window.location.origin !== "\(TrustedWebOrigin.productionURL.absoluteString)") { return 'origin-mismatch'; }
            localStorage.removeItem('\(Self.authStorageKey)');
            return 'ok';
          } catch (e) {
            return 'error';
          }
        })();
        """
        let outcome = await Self.evaluateWithTimeout(script, in: webView, timeoutNanoseconds: 5_000_000_000)
        return outcome == "ok"
    }

    /// Genuinely bounded, unlike the previous `withTaskGroup`-based race:
    /// `withTaskGroup` implicitly awaits ALL child tasks when its closure
    /// returns (an implicit `waitForAll()` at scope exit). Cancelling a
    /// child task whose `evaluateJavaScript` completion handler never
    /// fires (a hung/unresponsive page) does NOT force that continuation
    /// to resume — cancellation only sets a flag — so the group's scope
    /// exit would hang forever waiting for a child that can never finish.
    /// This instead resumes the SAME continuation directly from whichever
    /// of (a) WebKit's completion handler or (b) the timer fires first,
    /// guarded by `ResumeOnce` so only the first call actually resumes.
    private static func evaluateWithTimeout(
        _ script: String,
        in webView: WKWebView,
        timeoutNanoseconds: UInt64
    ) async -> String? {
        await withCheckedContinuation { continuation in
            let box = ResumeOnce(continuation)
            webView.evaluateJavaScript(script) { value, _ in
                box.resume(value as? String)
            }
            Task {
                try? await Task.sleep(nanoseconds: timeoutNanoseconds)
                box.resume("timeout")
            }
        }
    }

    /// Thread-safe "resume exactly once" guard around a `CheckedContinuation`.
    /// `evaluateJavaScript`'s completion handler and the timeout `Task`
    /// race to resume the same continuation; resuming a `CheckedContinuation`
    /// twice is a runtime trap, so this must be correct regardless of which
    /// thread each caller fires on — hence a lock rather than relying on
    /// actor isolation.
    #if DEBUG
    /// Test-only. `WebSessionBoundary.shared` is a true singleton with
    /// persisted (`UserDefaults`) pending state, so integration tests
    /// that need deterministic, order-independent behavior call this in
    /// `setUp()` rather than relying on running first. Never compiled
    /// into Release.
    func resetForTesting() {
        isPending = false
        generation = 0
        liveTrustedWebView = nil
        inFlightCleanup = nil
        inFlightGeneration = -1
        ephemeralCleanupRunCount = 0
    }
    #endif

    private final class ResumeOnce: @unchecked Sendable {
        private let lock = NSLock()
        private var didResume = false
        private let continuation: CheckedContinuation<String?, Never>

        init(_ continuation: CheckedContinuation<String?, Never>) {
            self.continuation = continuation
        }

        func resume(_ value: String?) {
            lock.lock()
            defer { lock.unlock() }
            guard !didResume else { return }
            didResume = true
            continuation.resume(returning: value)
        }
    }
}

private extension String {
    var jsStringEscaped: String {
        self
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")
            .replacingOccurrences(of: "\n", with: "\\n")
            .replacingOccurrences(of: "\r", with: "\\r")
    }
}
