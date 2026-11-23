import XCTest
import WebKit
@testable import Jeevan

/// Genuine WKWebView integration tests — these instantiate a real
/// `WKWebView` and load real HTML/JS into it, unlike `WebBoundaryTests`
/// (pure policy objects, no WebKit runtime involved at all). Each test
/// loads local HTML via `loadHTMLString(_:baseURL:)` with the trusted
/// production origin as the base URL — WebKit treats the committed page's
/// `document.location`/origin as exactly that URL's origin for
/// localStorage/IndexedDB purposes, so this exercises the real origin-gated
/// JavaScript without any network access to the live Cloudflare deployment.
///
/// Exercises `WebSessionBoundary` through its real public lifecycle API
/// (`markPendingForNewCleanup`, `registerLiveTrustedWebView`,
/// `clearLiveTrustedWebView`, `ensureCleanupComplete`) rather than a
/// lower-level direct-cleanup bypass — this is deliberate: the Milestone
/// 1B Remediation #2 pass found that a test harness bypassing the pending/
/// generation bookkeeping could pass while the actual gating logic
/// `MainTabView` depends on remained unexercised. `WebSessionBoundary`
/// is a true singleton with persisted (`UserDefaults`) state, so every
/// test calls `resetForTesting()` (a `#if DEBUG`-only, test-only reset) in
/// `setUp()` for deterministic, order-independent behavior.
///
/// A setup step that fails to reach a ready state is treated as a TEST
/// FAILURE (`XCTFail`), not silently downgraded to `XCTSkip` — a skip
/// would make a genuinely broken environment or a genuinely broken
/// implementation invisible in the pass/fail count.
@MainActor
final class WebSessionBoundaryIntegrationTests: XCTestCase {

    private let origin = TrustedWebOrigin.productionURL

    /// A second, distinct LocalStorage key the cleanup must never touch —
    /// stands in for any of the app's own non-auth settings/preferences
    /// that happen to live in the same origin's localStorage.
    private let unrelatedKey = "jeevan.unrelated.setting"

    override func setUp() async throws {
        try await super.setUp()
        WebSessionBoundary.shared.resetForTesting()
    }

    override func tearDown() async throws {
        WebSessionBoundary.shared.resetForTesting()
        try await super.tearDown()
    }

    // MARK: - Harness

    private func makeSeededWebView() async throws -> WKWebView {
        let webView = WKWebView(frame: .zero)
        let html = """
        <html><body><script>
          window.seedReady = false;
          localStorage.setItem('\(WebSessionBoundary.authStorageKey)', JSON.stringify({ fake: 'session' }));
          localStorage.setItem('\(unrelatedKey)', 'keep-me');
          var req = indexedDB.open('jeevan-test-db', 1);
          req.onupgradeneeded = function (e) {
            e.target.result.createObjectStore('sentinel_store', { keyPath: 'id' });
          };
          req.onsuccess = function (e) {
            var db = e.target.result;
            var tx = db.transaction('sentinel_store', 'readwrite');
            tx.objectStore('sentinel_store').put({ id: 'sentinel-1', value: 'unsynced-health-record' });
            tx.oncomplete = function () { db.close(); window.seedReady = true; };
          };
        </script></body></html>
        """
        webView.loadHTMLString(html, baseURL: origin)
        try await waitForLoad(webView)
        // Plain `evaluateJavaScript` does NOT unwrap a returned Promise —
        // that only happens via `callAsyncJavaScript`. A bare Promise
        // completion value instead fails with "unsupported type", so the
        // seed state is polled as a plain boolean instead of awaited as a
        // Promise.
        for _ in 0..<50 {
            if let ready = try? await evaluate("window.seedReady === true", in: webView) as? Bool, ready {
                return webView
            }
            try await Task.sleep(nanoseconds: 50_000_000)
        }
        XCTFail("Seed script never finished writing IndexedDB/localStorage in time")
        return webView
    }

    private func waitForLoad(_ webView: WKWebView) async throws {
        // loadHTMLString's completion isn't exposed via a delegate in this
        // minimal harness — polling readyState is simple and reliable for
        // a same-process, local-content load like this one.
        for _ in 0..<50 {
            if let state = try? await evaluate("document.readyState", in: webView) as? String, state == "complete" {
                return
            }
            try await Task.sleep(nanoseconds: 50_000_000)
        }
        XCTFail("Local HTML page never reached readyState 'complete' in time")
    }

    @discardableResult
    private func evaluate(_ script: String, in webView: WKWebView) async throws -> Any? {
        try await webView.evaluateJavaScript(script)
    }

    private func sentinelStillPresent(in webView: WKWebView) async throws -> Bool {
        // Same constraint as `makeSeededWebView` — `evaluateJavaScript`
        // doesn't unwrap a returned Promise, so the lookup writes its
        // result to a plain global and is polled rather than awaited.
        let kickoff = """
        window.sentinelCheckResult = undefined;
        (function () {
          var req = indexedDB.open('jeevan-test-db', 1);
          req.onsuccess = function (e) {
            var db = e.target.result;
            if (!db.objectStoreNames.contains('sentinel_store')) { window.sentinelCheckResult = false; return; }
            var tx = db.transaction('sentinel_store', 'readonly');
            var getReq = tx.objectStore('sentinel_store').get('sentinel-1');
            getReq.onsuccess = function () { window.sentinelCheckResult = !!getReq.result; };
            getReq.onerror = function () { window.sentinelCheckResult = false; };
          };
          req.onerror = function () { window.sentinelCheckResult = false; };
        })();
        """
        _ = try await evaluate(kickoff, in: webView)
        for _ in 0..<50 {
            if let result = try? await evaluate("window.sentinelCheckResult", in: webView) as? Bool {
                return result
            }
            try await Task.sleep(nanoseconds: 50_000_000)
        }
        XCTFail("IndexedDB sentinel lookup never completed in time")
        return false
    }

    private func authKeyStillPresent(in webView: WKWebView) async throws -> Bool {
        let script = "localStorage.getItem('\(WebSessionBoundary.authStorageKey)') !== null"
        return (try await evaluate(script, in: webView) as? Bool) ?? false
    }

    private func unrelatedKeyStillPresent(in webView: WKWebView) async throws -> Bool {
        let script = "localStorage.getItem('\(unrelatedKey)') === 'keep-me'"
        return (try await evaluate(script, in: webView) as? Bool) ?? false
    }

    /// Drives the real lifecycle path: mark pending, THEN register the
    /// live trusted WebView (mirroring `WebAppView.Coordinator.didCommit`
    /// calling `registerLiveTrustedWebView` after the cleanup was already
    /// marked pending by a prior sign-out), then await completion exactly
    /// as `MainTabView.runPendingAuthCleanupCheck()` does.
    @discardableResult
    private func runCleanupViaLifecycle(on webView: WKWebView) async -> WebSessionBoundary.CleanupOutcome {
        WebSessionBoundary.shared.markPendingForNewCleanup()
        WebSessionBoundary.shared.registerLiveTrustedWebView(webView)
        return await WebSessionBoundary.shared.ensureCleanupComplete()
    }

    // MARK: - Core cleanup behavior (via the real lifecycle API)

    func test_cleanup_doesNotDeleteSentinelIndexedDBRecord() async throws {
        let webView = try await makeSeededWebView()
        let before = try await sentinelStillPresent(in: webView)
        XCTAssertTrue(before, "Precondition: sentinel record should exist before cleanup")

        let outcome = await runCleanupViaLifecycle(on: webView)
        XCTAssertEqual(outcome, .succeeded)

        let after = try await sentinelStillPresent(in: webView)
        XCTAssertTrue(after, "Sign-out cleanup must never delete IndexedDB data")
    }

    func test_cleanup_removesExactSupabaseAuthLocalStorageKey() async throws {
        let webView = try await makeSeededWebView()
        let before = try await authKeyStillPresent(in: webView)
        XCTAssertTrue(before, "Precondition: auth key should exist before cleanup")

        let outcome = await runCleanupViaLifecycle(on: webView)
        XCTAssertEqual(outcome, .succeeded)

        let after = try await authKeyStillPresent(in: webView)
        XCTAssertFalse(after, "The exact Supabase auth localStorage key must be removed")
    }

    func test_cleanup_leavesUnrelatedLocalStorageKeyIntact() async throws {
        let webView = try await makeSeededWebView()
        let before = try await unrelatedKeyStillPresent(in: webView)
        XCTAssertTrue(before, "Precondition: unrelated key should exist before cleanup")

        let outcome = await runCleanupViaLifecycle(on: webView)
        XCTAssertEqual(outcome, .succeeded)

        let after = try await unrelatedKeyStillPresent(in: webView)
        XCTAssertTrue(after, "Cleanup must remove ONLY the exact auth key — an unrelated localStorage entry must survive")
    }

    func test_cleanup_isIdempotent_secondRunStillSucceedsAndDataStaysIntact() async throws {
        let webView = try await makeSeededWebView()

        let first = await runCleanupViaLifecycle(on: webView)
        XCTAssertEqual(first, .succeeded)
        // Second sign-out cycle against the same (already-cleaned) page.
        let second = await runCleanupViaLifecycle(on: webView)
        // Removing an already-absent key is a no-op success, not a failure —
        // idempotent by construction (localStorage.removeItem on a missing
        // key never throws).
        XCTAssertEqual(second, .succeeded)

        let sentinelIntact = try await sentinelStillPresent(in: webView)
        XCTAssertTrue(sentinelIntact)
    }

    // MARK: - Untrusted origin: committed state asserted BEFORE refusal

    func test_cleanup_onUntrustedOrigin_doesNothingAndReportsFailure() async throws {
        // Deliberately does not attempt to write localStorage from the
        // untrusted page's own script (a cross-origin `localStorage.setItem`
        // against an arbitrary host hits WebKit storage-initialization
        // restrictions specific to running inside an XCTest host process —
        // confirmed independent of this test's actual subject, since the
        // exact same call succeeds for the app's own trusted origin, whose
        // storage was already provisioned by real app runs on this
        // simulator). That is an environment limitation unrelated to the
        // code under test; what this test verifies is the origin gate.
        let untrustedOrigin = URL(string: "https://evil-imposter.pages.dev")!
        let webView = WKWebView(frame: .zero)
        let pageBody = "untrusted origin marker: evil-imposter-page"
        webView.loadHTMLString("<html><body>\(pageBody)</body></html>", baseURL: untrustedOrigin)
        try await waitForLoad(webView)

        // Assert the page actually committed where/what we think it did
        // BEFORE testing refusal — otherwise a webView stuck on a blank
        // `about:blank` would trivially "fail to match the trusted
        // origin" for the wrong reason and the test would prove nothing.
        // `readyState == "complete"` can momentarily still describe the
        // document ABOUT to be replaced during a same-process navigation,
        // so these are polled rather than asserted on the first read.
        var committedOrigin: String?
        var committedBody: String?
        for _ in 0..<50 {
            committedOrigin = try? await evaluate("window.location.origin", in: webView) as? String
            committedBody = try? await evaluate("document.body.textContent", in: webView) as? String
            if committedOrigin == "https://evil-imposter.pages.dev" && committedBody == pageBody { break }
            try await Task.sleep(nanoseconds: 50_000_000)
        }
        XCTAssertEqual(webView.url?.host, untrustedOrigin.host, "Precondition: WebView should have committed the untrusted URL")
        XCTAssertEqual(committedOrigin, "https://evil-imposter.pages.dev", "Precondition: document.location.origin should be the untrusted origin")
        XCTAssertEqual(committedBody, pageBody, "Precondition: the untrusted page's own content should have actually loaded")

        let outcome = await runCleanupViaLifecycle(on: webView)
        XCTAssertEqual(outcome, .failed, "Cleanup must refuse to run against a non-trusted origin")
    }

    // MARK: - Lifecycle: pending persistence, registration, dismantle, second identity

    func test_lifecycle_registerLiveTrustedWebView_runsAlreadyPendingCleanupAutomatically() async throws {
        let webView = try await makeSeededWebView()

        // Mark pending WITHOUT a live WebView yet (mirrors a sign-out that
        // happens with no WebView currently mounted) — then register one
        // afterward, as `WebAppView.Coordinator.didCommit` does on the
        // very next trusted page load. Registration itself should kick
        // off the cleanup without any further explicit call.
        WebSessionBoundary.shared.markPendingForNewCleanup()
        XCTAssertTrue(WebSessionBoundary.shared.isPending)

        WebSessionBoundary.shared.registerLiveTrustedWebView(webView)

        var clearedPending = false
        for _ in 0..<50 {
            if !WebSessionBoundary.shared.isPending { clearedPending = true; break }
            try await Task.sleep(nanoseconds: 50_000_000)
        }
        XCTAssertTrue(clearedPending, "registerLiveTrustedWebView should have run the already-pending cleanup to completion")

        let authKeyGone = try await !authKeyStillPresent(in: webView)
        XCTAssertTrue(authKeyGone)
    }

    func test_lifecycle_clearLiveTrustedWebView_fallsBackToEphemeralCleanupSuccessfully() async throws {
        let webView = try await makeSeededWebView()

        WebSessionBoundary.shared.markPendingForNewCleanup()
        WebSessionBoundary.shared.registerLiveTrustedWebView(webView)
        // Mirrors `WebAppView.dismantleUIView` calling `coordinator.invalidate`
        // (which calls this) — the WebView that was live a moment ago is no
        // longer registered, so `ensureCleanupComplete()` must fall back to
        // its own throwaway unprivileged WebView rather than failing.
        WebSessionBoundary.shared.clearLiveTrustedWebView(webView)

        let outcome = await WebSessionBoundary.shared.ensureCleanupComplete()
        XCTAssertEqual(outcome, .succeeded, "Losing the live WebView reference must fall back to an ephemeral cleanup, not fail outright")
    }

    func test_lifecycle_pendingPersistsAcrossGenerations_untilCleanupSucceeds() {
        XCTAssertFalse(WebSessionBoundary.shared.isPending)
        let g1 = WebSessionBoundary.shared.markPendingForNewCleanup()
        XCTAssertTrue(WebSessionBoundary.shared.isPending)
        XCTAssertEqual(WebSessionBoundary.shared.generation, g1)

        // A second sign-out before the first cleanup ever got a chance to
        // run (e.g. no WebView was ever live) bumps the generation again
        // — `isPending` must still read true; it is not accidentally
        // cleared just by requesting a newer cleanup.
        let g2 = WebSessionBoundary.shared.markPendingForNewCleanup()
        XCTAssertEqual(g2, g1 + 1)
        XCTAssertTrue(WebSessionBoundary.shared.isPending)
    }

    func test_lifecycle_secondIdentitySignIn_ensureCleanupCompleteRunsForLatestGenerationOnly() async throws {
        let webViewA = try await makeSeededWebView()

        // Sign-out #1 (account A) — pending, but never registered live.
        WebSessionBoundary.shared.markPendingForNewCleanup()
        // Sign-out #2 arrives before #1 ever ran against a live WebView —
        // simulates account B signing out again in quick succession, or a
        // second rapid sign-out/sign-in cycle. This is the CURRENT
        // generation now.
        let latestGeneration = WebSessionBoundary.shared.markPendingForNewCleanup()

        // Only now does a trusted WebView become available (webViewA
        // stands in for whichever WebView happens to be live at this
        // point — the specific account it belongs to is irrelevant to
        // this test; what matters is which GENERATION ensureCleanupComplete
        // resolves against).
        WebSessionBoundary.shared.registerLiveTrustedWebView(webViewA)

        let outcome = await WebSessionBoundary.shared.ensureCleanupComplete()
        XCTAssertEqual(outcome, .succeeded)
        XCTAssertEqual(WebSessionBoundary.shared.generation, latestGeneration, "No further generation should have been created")
        XCTAssertFalse(WebSessionBoundary.shared.isPending, "The latest generation's cleanup succeeding should clear isPending")
    }
}
