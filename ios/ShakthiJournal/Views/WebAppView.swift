import SwiftUI
import WebKit

/// Full-screen WKWebView that loads the Jeevan web app — hardened to a
/// single exact trusted origin (`TrustedWebOrigin.production`). See
/// `docs/IOS_WEB_ORIGIN_ARCHITECTURE.md` for the bundled-vs-remote tradeoff
/// and `docs/APP_STORE_READINESS.md` (Milestone 1B) for the full threat
/// model this file implements against.
///
/// Session handoff: the native Keychain session is injected into the
/// WebView's localStorage via a document-start script, origin-gated as its
/// very first executable statement (see `sessionScript()`). The Supabase JS
/// client reads localStorage on init, so the user appears already signed
/// in — no second login required.
///
/// After the initial injection the WebView manages its own token refresh,
/// relayed back to native via the `sessionRefreshed` bridge message —
/// which is now verified against Supabase and the currently-signed-in
/// native user before anything is persisted (see `BridgeMessageValidator`
/// and `Coordinator.handleSessionRefreshed`).
struct WebAppView: UIViewRepresentable {

    let accessToken:  String
    let refreshToken: String
    let userId:       String
    let userEmail:    String
    /// The signed-in session generation this WebAppView was constructed
    /// for (`AuthManager.sessionEpoch`) — captured alongside `userId` by
    /// any in-flight credential verification so an `await` that resumes
    /// after the session has already ended (sign-out bumps the epoch)
    /// can detect it's stale and refuse to write anything.
    let sessionEpoch: Int
    /// Called on the main thread when the web app posts a VALIDATED message
    /// to the native layer — unknown/malformed/untrusted-origin messages
    /// never reach this closure at all.
    var onMessage: (([String: Any]) -> Void)?
    /// Set by a deep link (the widget's tap target) — when non-nil, the
    /// webview navigates here. Cleared immediately once applied. Resolved
    /// through `DeepLinkValidator`, never loaded as a raw string.
    var pendingPath: Binding<String?>?
    /// Reports loading/offline/error/blocked-navigation state up to the
    /// SwiftUI parent so it can render the matching native overlay —
    /// never left as an unexplained blank WebView.
    var onStateChange: ((WebBoundaryState) -> Void)?
    /// Re-validates a captured (userId, epoch) pair against the LIVE
    /// AuthManager state — not just the value this WebAppView happened to
    /// be constructed with, which can go stale if a sign-out (or a second
    /// sign-in) happens while a bridge credential-verification `Task` is
    /// still awaiting a network round-trip.
    var isValidSession: ((String, Int) -> Bool)?

    func makeCoordinator() -> Coordinator {
        Coordinator(
            onMessage: onMessage,
            onStateChange: onStateChange,
            expectedUserId: userId,
            expectedEpoch: sessionEpoch,
            isValidSession: isValidSession
        )
    }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.userContentController.addUserScript(sessionScript())
        // Register the JS → native message bridge. Web calls:
        //   window.webkit.messageHandlers.jeevanNative.postMessage({ type: '...' })
        config.userContentController.add(context.coordinator, name: "jeevanNative")
        config.allowsInlineMediaPlayback = true

        let wv = WKWebView(frame: .zero, configuration: config)
        wv.navigationDelegate = context.coordinator
        wv.uiDelegate = context.coordinator
        context.coordinator.webView = wv
        wv.allowsBackForwardNavigationGestures = true
        wv.scrollView.contentInsetAdjustmentBehavior = .never
        wv.scrollView.bounces = false
        wv.load(URLRequest(url: TrustedWebOrigin.productionURL))
        return wv
    }

    func updateUIView(_ wv: WKWebView, context: Context) {
        // Keep the coordinator's notion of "the currently signed-in native
        // user" fresh — this is the identity `sessionRefreshed` messages
        // are checked against before anything is persisted.
        context.coordinator.expectedUserId = userId
        context.coordinator.onMessage = onMessage
        context.coordinator.onStateChange = onStateChange
        context.coordinator.isValidSession = isValidSession

        if let path = pendingPath?.wrappedValue {
            if let target = DeepLinkValidator.resolve(path) {
                wv.load(URLRequest(url: target))
            }
            // Whether or not it resolved, consume it — an invalid deep link
            // should not keep re-attempting on every re-render.
            DispatchQueue.main.async {
                pendingPath?.wrappedValue = nil
            }
        }
    }

    static func dismantleUIView(_ wv: WKWebView, coordinator: Coordinator) {
        // Prevent a stale privileged bridge handler from surviving past
        // this view's lifetime (e.g. into whatever replaces it after a
        // sign-out/identity change) — and cancel any in-flight credential
        // verification Task so it can't resolve and write to Keychain
        // after this WebAppView (and the session it belonged to) is gone.
        coordinator.invalidate(wv)
        wv.configuration.userContentController.removeAllUserScripts()
        wv.configuration.userContentController.removeScriptMessageHandler(forName: "jeevanNative")
        wv.navigationDelegate = nil
        wv.uiDelegate = nil
        wv.stopLoading()
    }

    /// Retries by loading only the trusted root — never whatever the
    /// WebView's current (possibly blocked/failed) URL happens to be.
    static func retry(_ wv: WKWebView) {
        wv.load(URLRequest(url: TrustedWebOrigin.productionURL))
    }

    // MARK: - Session injection

    private func sessionScript() -> WKUserScript {
        let projectRef = "pvtsskfnbxeohbtwafah"
        let storageKey = "sb-\(projectRef)-auth-token"
        let expiresAt = Int(Date().timeIntervalSince1970) + 3600
        let trustedOrigin = TrustedWebOrigin.productionURL.absoluteString

        let tok     = accessToken .jsStringEscaped
        let refresh = refreshToken.jsStringEscaped
        let uid     = userId      .jsStringEscaped
        let email   = userEmail   .jsStringEscaped

        // A document-start WKUserScript is the pragmatic design here rather
        // than waiting for didFinish and handing off via an explicit
        // trusted-page API (the generally-preferred design) — doing the
        // latter properly needs a web-app-side API to receive the session
        // and a visible "signing you in…" state coordinated across both
        // layers, which is real scope beyond this milestone's native-only
        // trust-boundary work (tracked in
        // docs/IOS_WEB_ORIGIN_ARCHITECTURE.md). What changes here: the
        // FIRST executable statement compares `window.location.origin`
        // against the exact trusted origin and returns immediately on any
        // mismatch — before the token/user values are even referenced —
        // so this script is inert on anything but the one trusted page,
        // regardless of why it ended up injected into that frame.
        let source = """
        (function () {
          try {
            if (window.location.origin !== "\(trustedOrigin)") { return; }

            window.__jeevanNativeApp = true;

            var session = {
              "access_token":  "\(tok)",
              "token_type":    "bearer",
              "expires_in":    3600,
              "expires_at":    \(expiresAt),
              "refresh_token": "\(refresh)",
              "user": {
                "id":                 "\(uid)",
                "email":              "\(email)",
                "aud":                "authenticated",
                "role":               "authenticated",
                "app_metadata":       { "provider": "email", "providers": ["email"] },
                "user_metadata":      {}
              }
            };
            window.localStorage.setItem('\(storageKey)', JSON.stringify(session));
          } catch (e) {
            // Never log the session payload — only that injection failed.
            console.warn('[Jeevan] Auth session injection failed');
          }
        })();
        """

        return WKUserScript(
            source: source,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
    }

    // MARK: - Coordinator

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {

        var onMessage: (([String: Any]) -> Void)?
        var onStateChange: ((WebBoundaryState) -> Void)?
        /// The native user this WebAppView instance was constructed for —
        /// `sessionRefreshed` messages are rejected unless they verify to
        /// this exact id. Updated on every `updateUIView` so it never goes
        /// stale across a re-render, but a brand-new identity always gets a
        /// brand-new `WebAppView`/`Coordinator` (SwiftUI recreates the whole
        /// subtree when `ContentView` switches between `.signedOut` and
        /// `.signedIn`), so this is defense in depth, not the only gate.
        var expectedUserId: String
        let expectedEpoch: Int
        var isValidSession: ((String, Int) -> Bool)?
        weak var webView: WKWebView?

        /// Flipped false in `invalidate()` (called from `dismantleUIView`
        /// and on sign-out) — every in-flight async callback checks this
        /// after its `await` before touching Keychain or forwarding
        /// anything, so a Task that outlives this Coordinator's real
        /// lifetime (WebKit's completion handlers aren't automatically
        /// cancelled just because the Swift object they were bound to is
        /// "supposed to be done") can't resurrect a dead session.
        private var isActive = true

        /// Incremented on every new top-level navigation attempt. Captured
        /// by `handleNativeSyncComplete` before the async
        /// `evaluateJavaScript` call and re-checked immediately before it
        /// runs — if a navigation started in between, the generation no
        /// longer matches and the injection is dropped instead of racing
        /// into whatever page is now loading.
        private var navigationGeneration = 0
        private var blockedNavigationWorkItem: DispatchWorkItem?

        init(
            onMessage: (([String: Any]) -> Void)?,
            onStateChange: ((WebBoundaryState) -> Void)?,
            expectedUserId: String,
            expectedEpoch: Int,
            isValidSession: ((String, Int) -> Bool)?
        ) {
            self.onMessage = onMessage
            self.onStateChange = onStateChange
            self.expectedUserId = expectedUserId
            self.expectedEpoch = expectedEpoch
            self.isValidSession = isValidSession
            super.init()
            NotificationCenter.default.addObserver(
                self,
                selector: #selector(handleNativeSyncComplete(_:)),
                name: .jeevanNativeSyncComplete,
                object: nil
            )
        }

        deinit {
            NotificationCenter.default.removeObserver(self)
        }

        /// Called from `dismantleUIView` (this WebAppView is being torn
        /// down — sign-out, identity change, or SwiftUI recreating the
        /// view for Retry) and from a validated `signOut` bridge message.
        /// Cancels any in-flight credential verification so it can never
        /// resolve into a Keychain write after this point, and unregisters
        /// this WebView from `WebSessionBoundary` so a later cleanup
        /// doesn't try to inject into a WebView that's going away.
        func invalidate(_ webView: WKWebView) {
            isActive = false
            invalidateBlockedBannerTimer()
            WebSessionBoundary.shared.clearLiveTrustedWebView(webView)
        }

        // MARK: Navigation policy

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard let url = navigationAction.request.url else {
                decisionHandler(.cancel)
                return
            }
            switch WebNavigationPolicy.decide(url: url, kind: Self.navigationKind(for: navigationAction.navigationType)) {
            case .allow:
                navigationGeneration += 1
                decisionHandler(.allow)
            case .openExternally:
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
            case .block:
                showBlockedBanner()
                decisionHandler(.cancel)
            case .deny:
                decisionHandler(.cancel)
            }
        }

        /// Defense in depth beyond the action-level check — re-validates
        /// the URL a navigation actually resolved to (after following any
        /// server-side redirect chain) before WebKit is allowed to start
        /// rendering the response body.
        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationResponse: WKNavigationResponse,
            decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void
        ) {
            guard navigationResponse.isForMainFrame,
                  let url = navigationResponse.response.url
            else {
                decisionHandler(.allow)
                return
            }
            if TrustedWebOrigin.matches(url) {
                decisionHandler(.allow)
            } else {
                showBlockedBanner()
                decisionHandler(.cancel)
            }
        }

        func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
            guard let url = webView.url else { return }
            if TrustedWebOrigin.matches(url) {
                onStateChange?(.ready)
                WebSessionBoundary.shared.registerLiveTrustedWebView(webView)
            } else {
                // Should be unreachable given the checks above — fail
                // closed anyway: stop loading, strip the bridge, show a
                // safe error state. Never log the committed URL itself
                // (it may carry sensitive query parameters).
                stripPrivilegedAccess(of: webView)
                invalidateBlockedBannerTimer()
                onStateChange?(.serverError)
            }
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            guard let url = webView.url, TrustedWebOrigin.matches(url) else { return }
            onStateChange?(.ready)
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            // The blocked-navigation banner's own 3-second auto-dismiss
            // timer (`showBlockedBanner`) must never fire AFTER this and
            // silently overwrite a genuine failure state back to `.ready`
            // — cancel it any time a real failure state is about to be
            // reported, not just when a new blocked navigation starts.
            invalidateBlockedBannerTimer()
            onStateChange?(networkState(for: error))
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            invalidateBlockedBannerTimer()
            onStateChange?(networkState(for: error))
        }

        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            invalidateBlockedBannerTimer()
            onStateChange?(.processTerminated)
        }

        /// Maps WebKit's navigation-type enum to the WebKit-independent
        /// `WebNavigationPolicy.Kind` — shared by both the main navigation
        /// decision and the popup decision below. Previously the popup path
        /// hardcoded `.other` regardless of the real navigation type, which
        /// meant a user tapping a genuine `target="_blank"` link (WebKit
        /// reports this as `.linkActivated` same as any other link tap)
        /// was treated as if it were a script-driven popup — blocked
        /// in-app instead of correctly opening in Safari.
        static func navigationKind(for type: WKNavigationType) -> WebNavigationPolicy.Kind {
            switch type {
            case .linkActivated:  return .linkActivated
            case .formSubmitted, .formResubmitted: return .formSubmitted
            case .backForward:    return .backForward
            case .reload:         return .reload
            default:              return .other
            }
        }

        private func networkState(for error: Error) -> WebBoundaryState {
            let nsError = error as NSError
            guard nsError.domain == NSURLErrorDomain else { return .serverError }
            switch nsError.code {
            case NSURLErrorNotConnectedToInternet, NSURLErrorNetworkConnectionLost, NSURLErrorDataNotAllowed:
                return .offline
            case NSURLErrorCancelled:
                // We ourselves cancelled this (a blocked/denied navigation) —
                // already handled by showBlockedBanner at the decision
                // point; don't also surface it as a server error.
                return .ready
            default:
                return .serverError
            }
        }

        private func showBlockedBanner() {
            onStateChange?(.blockedNavigation)
            blockedNavigationWorkItem?.cancel()
            let work = DispatchWorkItem { [weak self] in self?.onStateChange?(.ready) }
            blockedNavigationWorkItem = work
            DispatchQueue.main.asyncAfter(deadline: .now() + 3, execute: work)
        }

        /// Cancels the blocked-navigation banner's pending auto-dismiss
        /// work item. Must be called any time a genuine failure state
        /// (offline/serverError/sessionExpired/processTerminated) is about
        /// to be reported — without this, a blocked navigation's 3-second
        /// timer firing afterward would silently reset the state back to
        /// `.ready`, overwriting a real, still-current failure.
        private func invalidateBlockedBannerTimer() {
            blockedNavigationWorkItem?.cancel()
            blockedNavigationWorkItem = nil
        }

        private func stripPrivilegedAccess(of webView: WKWebView) {
            webView.stopLoading()
            webView.configuration.userContentController.removeAllUserScripts()
            webView.configuration.userContentController.removeScriptMessageHandler(forName: "jeevanNative")
        }

        // MARK: Popups — never a second privileged WebView

        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for navigationAction: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            guard let url = navigationAction.request.url else { return nil }
            switch WebNavigationPolicy.decide(url: url, kind: Self.navigationKind(for: navigationAction.navigationType)) {
            case .allow:
                // Trusted-origin popup target — load it in the existing
                // privileged view instead of spawning a second one.
                webView.load(URLRequest(url: url))
            case .openExternally:
                UIApplication.shared.open(url)
            case .block, .deny:
                showBlockedBanner()
            }
            return nil
        }

        // MARK: Camera / microphone permission

        func webView(
            _ webView: WKWebView,
            requestMediaCapturePermissionFor origin: WKSecurityOrigin,
            initiatedByFrame frame: WKFrameInfo,
            type: WKMediaCaptureType,
            decisionHandler: @escaping (WKPermissionDecision) -> Void
        ) {
            guard frame.isMainFrame, isTrustedSecurityOrigin(origin) else {
                decisionHandler(.deny)
                return
            }
            // .prompt, not .grant — the user retains control via iOS's own
            // system permission sheet (driven by NSCameraUsageDescription/
            // NSMicrophoneUsageDescription); this only tells WKWebView the
            // request is legitimate enough to forward to that system
            // prompt at all, for the one trusted origin.
            decisionHandler(.prompt)
        }

        private func isTrustedSecurityOrigin(_ origin: WKSecurityOrigin) -> Bool {
            let port = origin.port != 0 ? origin.port : (origin.protocol == "https" ? 443 : 80)
            guard let o = TrustedWebOrigin.Origin(scheme: origin.protocol, host: origin.host, port: port) else { return false }
            if o == TrustedWebOrigin.production { return true }
            #if DEBUG
            if let override = TrustedWebOrigin.debugOverride, o == override { return true }
            #endif
            return false
        }

        // MARK: JS → Native messages

        func userContentController(
            _ userContentController: WKUserContentController,
            didReceive message: WKScriptMessage
        ) {
            let frame = BridgeMessageValidator.FrameContext(
                isMainFrame: message.frameInfo.isMainFrame,
                originScheme: message.frameInfo.securityOrigin.protocol,
                originHost: message.frameInfo.securityOrigin.host,
                originPort: message.frameInfo.securityOrigin.port != 0
                    ? message.frameInfo.securityOrigin.port
                    : (message.frameInfo.securityOrigin.protocol == "https" ? 443 : 80)
            )
            guard let validated = BridgeMessageValidator.validate(
                handlerName: message.name,
                frame: frame,
                body: message.body
            ) else { return }

            switch validated {
            case .openHealthSync:
                DispatchQueue.main.async { [weak self] in
                    self?.onMessage?(["type": "openHealthSync"])
                }
            case .sessionRefreshed(let accessToken, let refreshToken, let userId, _):
                // Forwarded UNVERIFIED — as of Remediation Pass 3 (P1-2),
                // this Coordinator no longer does its own access-token
                // verification or refresh-token exchange at all. Both now
                // happen exclusively inside `AuthManager.
                // reconcileWebRefreshedSession`, which outlives this
                // (disposable) Coordinator/WebView — a sign-out, Retry,
                // or a brand-new `WebAppView` instance tearing this
                // Coordinator down mid-flight can no longer discard an
                // exchange that may have already reached Supabase and
                // rotated the refresh token. The bridge-provided `email`
                // is still discarded here regardless — AuthManager only
                // ever persists/forwards the server-verified email.
                DispatchQueue.main.async { [weak self] in
                    self?.onMessage?([
                        "type": "sessionRefreshed",
                        "accessToken": accessToken,
                        "refreshToken": refreshToken,
                        "userId": userId,
                    ])
                }
            case .signOut:
                DispatchQueue.main.async { [weak self] in
                    self?.onMessage?(["type": "signOut"])
                }
            }
        }

        // MARK: Native → Web injection (HealthKit sync results)

        @objc private func handleNativeSyncComplete(_ note: Notification) {
            guard let wv = webView, isActive else { return }
            // The sync that completed must actually be FOR this
            // WebAppView's own session — SyncEngine stamps userId/epoch
            // onto the notification at the moment the sync itself started
            // (see SyncEngine.sync), so this rejects a sync that began
            // under account A but completed after account B became the
            // active session, rather than silently injecting A's data
            // into B's WebView.
            guard
                let syncUserId = note.userInfo?["userId"] as? String,
                let syncEpoch  = note.userInfo?["epoch"] as? Int,
                syncUserId == expectedUserId,
                syncEpoch == expectedEpoch,
                isValidSession?(syncUserId, syncEpoch) ?? false
            else { return }

            let metrics = (note.userInfo?["metrics"] as? [HealthMetric]) ?? []
            let generationAtCapture = navigationGeneration

            func revalidated() -> Bool {
                guard isActive else { return false }
                guard generationAtCapture == navigationGeneration else { return false }
                guard let url = wv.url, TrustedWebOrigin.matches(url) else { return false }
                guard !wv.isLoading else { return false }
                guard isValidSession?(syncUserId, syncEpoch) ?? false else { return false }
                return true
            }

            guard !metrics.isEmpty else {
                DispatchQueue.main.async {
                    guard revalidated() else { return }
                    wv.evaluateJavaScript("""
                    (function() {
                      if (window.location.origin !== "\(TrustedWebOrigin.productionURL.absoluteString)") { return; }
                      window.dispatchEvent(new CustomEvent('native-health-sync-complete', { detail: { count: 0 } }));
                    })();
                    """)
                }
                return
            }

            guard
                let json = try? JSONEncoder().encode(metrics),
                let jsonString = String(data: json, encoding: .utf8)
            else { return }

            let script = """
            (function() {
              try {
                // Belt-and-suspenders beyond the native-side `revalidated()`
                // check above: that check and this script's actual
                // execution inside WebKit are two different points in time
                // separated by an async hop, and a navigation can begin in
                // between. If it has, this guard refuses to touch
                // localStorage/IndexedDB on whatever page is now loading.
                if (window.location.origin !== "\(TrustedWebOrigin.productionURL.absoluteString)") { return; }
                var metrics = \(jsonString);
                var req = indexedDB.open('jeevan');
                req.onsuccess = function(e) {
                  var db = e.target.result;
                  if (!db.objectStoreNames.contains('health_metrics')) {
                    db.close();
                    return;
                  }
                  var tx = db.transaction(['health_metrics', 'sync_history'], 'readwrite');
                  var metricsStore = tx.objectStore('health_metrics');
                  metrics.forEach(function(m) { metricsStore.put(m); });
                  var histStore = tx.objectStore('sync_history');
                  var types = [...new Set(metrics.map(function(m) { return m.type; }))];
                  histStore.put({
                    id: crypto.randomUUID(),
                    sourceId: 'apple_health',
                    sourceName: 'Apple Health (HealthKit)',
                    status: 'success',
                    recordCount: metrics.length,
                    dataTypes: types,
                    dataMode: 'imported',
                    startedAt: new Date().toISOString(),
                    completedAt: new Date().toISOString(),
                    durationMs: 0,
                  });
                  tx.oncomplete = function() {
                    db.close();
                    window.dispatchEvent(new CustomEvent('native-health-sync-complete', {
                      detail: { count: metrics.length }
                    }));
                  };
                  tx.onerror = function() { db.close(); };
                };
              } catch (e) {}
            })();
            """

            DispatchQueue.main.async {
                guard revalidated() else { return }
                wv.evaluateJavaScript(script)
            }
        }
    }
}

// MARK: - String helper

private extension String {
    var jsStringEscaped: String {
        self
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")
            .replacingOccurrences(of: "\n", with: "\\n")
            .replacingOccurrences(of: "\r", with: "\\r")
    }
}
