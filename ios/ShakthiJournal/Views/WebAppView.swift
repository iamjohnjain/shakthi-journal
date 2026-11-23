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

    func makeCoordinator() -> Coordinator {
        Coordinator(onMessage: onMessage, onStateChange: onStateChange, expectedUserId: userId)
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
        // sign-out/identity change).
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
        weak var webView: WKWebView?

        /// Incremented on every new top-level navigation attempt. Captured
        /// by `handleNativeSyncComplete` before the async
        /// `evaluateJavaScript` call and re-checked immediately before it
        /// runs — if a navigation started in between, the generation no
        /// longer matches and the injection is dropped instead of racing
        /// into whatever page is now loading.
        private var navigationGeneration = 0
        private var blockedNavigationWorkItem: DispatchWorkItem?

        init(onMessage: (([String: Any]) -> Void)?, onStateChange: ((WebBoundaryState) -> Void)?, expectedUserId: String) {
            self.onMessage = onMessage
            self.onStateChange = onStateChange
            self.expectedUserId = expectedUserId
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
            let kind: WebNavigationPolicy.Kind
            switch navigationAction.navigationType {
            case .linkActivated:  kind = .linkActivated
            case .formSubmitted, .formResubmitted: kind = .formSubmitted
            case .backForward:    kind = .backForward
            case .reload:         kind = .reload
            default:              kind = .other
            }

            switch WebNavigationPolicy.decide(url: url, kind: kind) {
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
            } else {
                // Should be unreachable given the checks above — fail
                // closed anyway: stop loading, strip the bridge, show a
                // safe error state. Never log the committed URL itself
                // (it may carry sensitive query parameters).
                stripPrivilegedAccess(of: webView)
                onStateChange?(.serverError)
            }
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            guard let url = webView.url, TrustedWebOrigin.matches(url) else { return }
            onStateChange?(.ready)
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            onStateChange?(networkState(for: error))
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            onStateChange?(networkState(for: error))
        }

        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            onStateChange?(.processTerminated)
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
            switch WebNavigationPolicy.decide(url: url, kind: .other) {
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
            case .sessionRefreshed(let accessToken, let refreshToken, let userId, let email):
                handleSessionRefreshed(accessToken: accessToken, refreshToken: refreshToken, userId: userId, email: email)
            }
        }

        /// `sessionRefreshed` is the one bridge message that carries
        /// credential material, so it gets an extra, async check beyond
        /// `BridgeMessageValidator`'s schema validation: the access token
        /// is verified directly with Supabase, and the user id Supabase
        /// returns for it must equal the user this WebAppView was
        /// constructed for. A message claiming a different identity is
        /// dropped — never persisted to Keychain, never forwarded.
        private func handleSessionRefreshed(accessToken: String, refreshToken: String, userId: String, email: String) {
            let expected = expectedUserId
            Task { @MainActor [weak self] in
                guard let self else { return }
                do {
                    let verified = try await SupabaseClient.verifiedUser(accessToken: accessToken)
                    guard verified.id == expected, verified.id == userId else { return }
                    self.onMessage?([
                        "type": "sessionRefreshed",
                        "accessToken": accessToken,
                        "refreshToken": refreshToken,
                        "userId": userId,
                        "email": email,
                    ])
                } catch {
                    // Token didn't verify — say nothing further, never log
                    // the token or the error body.
                }
            }
        }

        // MARK: Native → Web injection (HealthKit sync results)

        @objc private func handleNativeSyncComplete(_ note: Notification) {
            guard let wv = webView else { return }
            let metrics = (note.userInfo?["metrics"] as? [HealthMetric]) ?? []
            let generationAtCapture = navigationGeneration

            func revalidated() -> Bool {
                guard generationAtCapture == navigationGeneration else { return false }
                guard let url = wv.url, TrustedWebOrigin.matches(url) else { return false }
                guard !wv.isLoading else { return false }
                return true
            }

            guard !metrics.isEmpty else {
                DispatchQueue.main.async {
                    guard revalidated() else { return }
                    wv.evaluateJavaScript(
                        "window.dispatchEvent(new CustomEvent('native-health-sync-complete', { detail: { count: 0 } }));"
                    )
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
