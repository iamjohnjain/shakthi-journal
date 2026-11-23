import WebKit

/// Clears the WKWebView's persistent data store — cookies, localStorage,
/// IndexedDB, and caches for the trusted origin — at the sign-out boundary.
/// Without this, `WKWebViewConfiguration()`'s default `websiteDataStore`
/// (`.default()`, shared and persistent across every WKWebView instance in
/// the app) keeps the signed-out user's web session on disk; a second
/// identity signing in afterward would otherwise load the SAME WebView
/// origin and inherit that session — a second account seeing the first
/// account's web-side auth and locally-cached data.
///
/// Scoped to sign-out/account-switch only — this milestone does not touch
/// the separate, broader question of per-user IndexedDB isolation during
/// normal operation (tracked for Milestone 3).
enum WebSessionBoundary {
    static func clearPrivilegedWebSession(completion: (() -> Void)? = nil) {
        let store = WKWebsiteDataStore.default()
        let types = WKWebsiteDataStore.allWebsiteDataTypes()
        store.removeData(ofTypes: types, modifiedSince: .distantPast) {
            completion?()
        }
    }
}
