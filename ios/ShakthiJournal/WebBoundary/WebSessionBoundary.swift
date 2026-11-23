import WebKit

/// Clears ONLY the Supabase auth session from the trusted WebView — never
/// the user's IndexedDB health data, general localStorage, or any other
/// website data. The prior design here (`WKWebsiteDataStore.removeData(
/// ofTypes: allWebsiteDataTypes(), ...)`) was a blanket wipe that destroyed
/// the web app's own IndexedDB (including any not-yet-synced health
/// records) on every sign-out — a real, confirmed data-loss bug, not just
/// an over-broad security measure. Renamed in spirit to "auth cleanup" —
/// kept this file/type name (`WebSessionBoundary`) to avoid an unrelated
/// project.pbxproj/group rename on top of an already-large diff.
///
/// `WKWebsiteDataStore` has no API to remove a single LocalStorage key, so
/// this performs the removal via an origin-gated JavaScript injection into
/// the live, trusted WebView instead — the same approach already used for
/// HealthKit metric injection. If no trusted WebView is currently mounted
/// (e.g. the app is between a sign-out and the next sign-in with no
/// WebView in the hierarchy), the cleanup is marked pending and performed
/// the next time a trusted WebView commits the production origin —
/// `MainTabView` must not hand a new session's tokens to a `WebAppView`
/// while a cleanup is still pending (see `MainTabView.webContent`).
@MainActor
final class WebSessionBoundary {
    static let shared = WebSessionBoundary()

    /// The exact (and only) key this coordinator is allowed to remove.
    /// Supabase JS stores the session under `sb-{projectRef}-auth-token`;
    /// must mirror `WebAppView.sessionScript()`'s own `storageKey`.
    static let authStorageKey = "sb-pvtsskfnbxeohbtwafah-auth-token"

    private static let pendingDefaultsKey = "jeevan.authCleanupPending"

    /// Persisted so a cleanup that never got to run (app killed before any
    /// trusted WebView loaded) is still remembered across a relaunch —
    /// never silently dropped.
    private(set) var isPending: Bool {
        get { UserDefaults.standard.bool(forKey: Self.pendingDefaultsKey) }
        set { UserDefaults.standard.set(newValue, forKey: Self.pendingDefaultsKey) }
    }

    private weak var liveTrustedWebView: WKWebView?
    private var inFlightCleanup: Task<Bool, Never>?

    private init() {}

    /// Called by `WebAppView.Coordinator` whenever its WebView commits the
    /// trusted origin — the only point a pending cleanup can actually run,
    /// since it needs a live page to inject JavaScript into.
    func registerLiveTrustedWebView(_ webView: WKWebView) {
        liveTrustedWebView = webView
        if isPending {
            Task { await runCleanup(on: webView) }
        }
    }

    func clearLiveTrustedWebView(_ webView: WKWebView) {
        if liveTrustedWebView === webView {
            liveTrustedWebView = nil
        }
    }

    /// Marks a cleanup pending and attempts it immediately if a trusted
    /// WebView happens to be live right now (the common case — sign-out is
    /// almost always initiated while one is on screen). Coalesces with any
    /// already-in-flight attempt rather than racing a second one.
    @discardableResult
    func requestCleanup() async -> Bool {
        isPending = true
        if let existing = inFlightCleanup {
            return await existing.value
        }
        guard let webView = liveTrustedWebView else { return false }
        return await runCleanup(on: webView)
    }

    /// Never falls back to deleting anything else on failure/timeout —
    /// `isPending` simply stays `true` and the next opportunity (another
    /// `registerLiveTrustedWebView` or `requestCleanup` call) retries.
    @discardableResult
    func runCleanup(on webView: WKWebView) async -> Bool {
        if let existing = inFlightCleanup {
            return await existing.value
        }
        let task = Task<Bool, Never> { [weak webView] in
            guard let webView else { return false }
            guard let url = await webView.url, TrustedWebOrigin.matches(url) else { return false }

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

            let outcome = await Self.race(
                evaluate: { await Self.evaluate(script, in: webView) },
                timeoutNanoseconds: 5_000_000_000
            )
            return outcome == "ok"
        }
        inFlightCleanup = task
        let result = await task.value
        inFlightCleanup = nil
        if result {
            isPending = false
        }
        return result
    }

    private static func evaluate(_ script: String, in webView: WKWebView) async -> String? {
        await withCheckedContinuation { continuation in
            webView.evaluateJavaScript(script) { value, _ in
                continuation.resume(returning: value as? String)
            }
        }
    }

    /// Races the JS evaluation against a timeout — a hung/unresponsive page
    /// must not block sign-out forever, but a timeout is reported as
    /// non-success (not as "ok"), so `isPending` correctly stays set.
    private static func race(evaluate: @escaping () async -> String?, timeoutNanoseconds: UInt64) async -> String? {
        await withTaskGroup(of: String?.self) { group in
            group.addTask { await evaluate() }
            group.addTask {
                try? await Task.sleep(nanoseconds: timeoutNanoseconds)
                return "timeout"
            }
            let first = await group.next() ?? "timeout"
            group.cancelAll()
            return first
        }
    }
}
