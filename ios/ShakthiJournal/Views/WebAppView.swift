import SwiftUI
import WebKit

/// Full-screen WKWebView that loads the Shakthi Journal web app.
///
/// Session handoff: the native Keychain session is injected into the WebView's
/// localStorage before the page scripts run. The Supabase JS client reads
/// localStorage on init, so the user appears already signed in — no second
/// login required.
///
/// After the initial injection the WebView manages its own token refresh.
/// When the user signs out natively, ContentView destroys this view, which
/// also destroys the WKWebView and its isolated localStorage.
struct WebAppView: UIViewRepresentable {

    static let appURL = URL(string: "https://shakthi-journal.pages.dev")!

    let accessToken:  String
    let refreshToken: String
    let userId:       String
    let userEmail:    String
    /// Called on the main thread when the web app posts a message to the native layer.
    var onMessage: (([String: Any]) -> Void)?

    func makeCoordinator() -> Coordinator { Coordinator(onMessage: onMessage) }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        // Inject the Supabase session into localStorage before any page script runs
        config.userContentController.addUserScript(sessionScript())
        // Register the JS → native message bridge. Web calls:
        //   window.webkit.messageHandlers.shakthiNative.postMessage({ type: 'openHealthSync' })
        config.userContentController.add(context.coordinator, name: "shakthiNative")
        // Allow inline media (web app may use audio/video)
        config.allowsInlineMediaPlayback = true

        let wv = WKWebView(frame: .zero, configuration: config)
        wv.navigationDelegate = context.coordinator
        wv.allowsBackForwardNavigationGestures = true
        // Let the web app handle safe-area padding via CSS env()
        wv.scrollView.contentInsetAdjustmentBehavior = .always
        wv.load(URLRequest(url: Self.appURL))
        return wv
    }

    func updateUIView(_ wv: WKWebView, context: Context) {
        // The session is baked into the WKUserScript at construction time.
        // SwiftUI recreates this view (and thus the WKWebView) whenever the
        // signed-in identity changes — no manual reload needed.
    }

    // MARK: - Session injection

    private func sessionScript() -> WKUserScript {
        // The @supabase/supabase-js v2 client stores its session under this key.
        // Key format: sb-{projectRef}-auth-token
        // projectRef is the first component of the Supabase hostname.
        let projectRef = "pvtsskfnbxeohbtwafah"
        let storageKey = "sb-\(projectRef)-auth-token"

        // expires_at is seconds since Unix epoch. We don't persist the exact
        // issue time, so we assume the token lives for one more hour.
        // The Supabase JS client will refresh it automatically before expiry.
        let expiresAt = Int(Date().timeIntervalSince1970) + 3600

        // Escape values safe for embedding inside a JS double-quoted string
        let tok     = accessToken .jsStringEscaped
        let refresh = refreshToken.jsStringEscaped
        let uid     = userId      .jsStringEscaped
        let email   = userEmail   .jsStringEscaped

        let source = """
        (function () {
          try {
            // Mark the page as running inside the native iOS app.
            // The web app reads this to hide its own bottom navigation.
            window.__shakthiNativeApp = true;

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
                "email_confirmed_at": "2026-01-01T00:00:00Z",
                "created_at":         "2026-01-01T00:00:00Z",
                "updated_at":         "2026-01-01T00:00:00Z",
                "app_metadata":       { "provider": "email", "providers": ["email"] },
                "user_metadata":      {}
              }
            };
            window.localStorage.setItem('\(storageKey)', JSON.stringify(session));
          } catch (e) {
            console.warn('[ShakthiJournal] Auth session injection failed:', e);
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

    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {

        let onMessage: (([String: Any]) -> Void)?

        init(onMessage: (([String: Any]) -> Void)?) {
            self.onMessage = onMessage
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor action: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard
                action.navigationType == .linkActivated,
                let url = action.request.url,
                let host = url.host,
                host != "shakthi-journal.pages.dev"
            else {
                decisionHandler(.allow)
                return
            }
            // Open external links (e.g. Supabase dashboard, docs) in Safari
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
        }

        // Receives messages posted by the web app via:
        //   window.webkit.messageHandlers.shakthiNative.postMessage({ type: '...' })
        func userContentController(
            _ userContentController: WKUserContentController,
            didReceive message: WKScriptMessage
        ) {
            guard message.name == "shakthiNative",
                  let body = message.body as? [String: Any] else { return }
            DispatchQueue.main.async { [weak self] in
                self?.onMessage?(body)
            }
        }
    }
}

// MARK: - String helper

private extension String {
    /// Escapes characters that would break embedding this value inside a
    /// JavaScript double-quoted string literal.
    var jsStringEscaped: String {
        self
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")
            .replacingOccurrences(of: "\n", with: "\\n")
            .replacingOccurrences(of: "\r", with: "\\r")
    }
}
