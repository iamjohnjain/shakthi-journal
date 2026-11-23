import WebKit

/// Clears ONLY the Supabase auth session from the trusted WebView — never
/// the user's IndexedDB health data, general localStorage, or any other
/// website data. `WKWebsiteDataStore` has no API to remove a single
/// LocalStorage key, so this performs the removal via an origin-gated
/// JavaScript injection instead — either into the still-live privileged
/// WebView (if one is mounted) or, if none is available, into a throwaway
/// *unprivileged* WebView created solely for this cleanup (no session
/// script, no `jeevanNative` bridge handler) that is discarded immediately
/// afterward. This never falls back to deleting IndexedDB or any other
/// `WKWebsiteDataStore` data wholesale.
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
        let task = Task<Bool, Never> { [weak webView] in
            if let webView {
                guard let url = await webView.url, TrustedWebOrigin.matches(url) else { return false }
                return await Self.injectAndEvaluate(in: webView)
            } else {
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

    /// Spins up a throwaway, unprivileged `WKWebView` — no session-
    /// injection script, no `jeevanNative` bridge handler registered at
    /// all — purely to load the trusted origin and run the auth-key
    /// removal script, then lets it be deallocated. Used only when no
    /// live privileged WebView is currently mounted (e.g. sign-out
    /// happened with no WebView in the view hierarchy at all): the
    /// alternative would be waiting indefinitely for one to appear, which
    /// could block a later sign-in forever.
    private static func runEphemeralCleanup() async -> Bool {
        let webView = WKWebView(frame: .zero)
        webView.load(URLRequest(url: TrustedWebOrigin.productionURL))
        let committed = await Self.waitForTrustedCommit(webView, timeoutNanoseconds: 8_000_000_000)
        guard committed else { return false }
        return await Self.injectAndEvaluate(in: webView)
    }

    /// Bounded poll — this WebView exists only for this one operation, so
    /// a full navigation-delegate wiring isn't warranted; a short poll on
    /// `url`/`isLoading` is sufficient and avoids adding another delegate
    /// surface purely for a throwaway object.
    private static func waitForTrustedCommit(_ webView: WKWebView, timeoutNanoseconds: UInt64) async -> Bool {
        let deadline = DispatchTime.now().uptimeNanoseconds + timeoutNanoseconds
        while DispatchTime.now().uptimeNanoseconds < deadline {
            if let url = webView.url, TrustedWebOrigin.matches(url), !webView.isLoading {
                return true
            }
            try? await Task.sleep(nanoseconds: 100_000_000)
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
