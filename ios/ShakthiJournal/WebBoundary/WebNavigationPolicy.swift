import Foundation

/// Pure navigation-decision logic, deliberately independent of WebKit types
/// (`WKNavigationType` etc. are mapped into `Kind` by the caller) so this can
/// be unit-tested without booting a WKWebView. Every main-frame navigation —
/// initial load, redirect, form submission, script/window.location, history,
/// reload, deep link, popup — must be routed through `decide(_:)` instead of
/// a bespoke check. Previously only `.linkActivated` was inspected at all;
/// every other navigation type (redirects very much included) fell through
/// to an unconditional `.allow`.
enum WebNavigationPolicy {

    /// A WebKit-independent mirror of the navigation types this policy
    /// cares about distinguishing. `.other` covers everything WebKit itself
    /// doesn't attribute to a specific user gesture — redirects, window.open/
    /// window.location, and the very first load all arrive as `.other`.
    enum Kind {
        case linkActivated
        case formSubmitted
        case backForward
        case reload
        case other
    }

    enum Decision: Equatable {
        /// Load it — this request resolves to the one trusted origin.
        case allow
        /// A user tapped a link that leads somewhere else entirely — hand
        /// it to the system (Safari), never load it inside the privileged
        /// WebView.
        case openExternally
        /// Cancel silently and enter the "blocked navigation" native state —
        /// used for anything cross-origin that wasn't a deliberate user tap
        /// on a link (a redirect, a script-driven navigation, a form post
        /// to somewhere unexpected). Never auto-opens externally — that
        /// would make an attacker-triggered redirect just as effective at
        /// escaping the app as a real user tap.
        case block
        /// Reject outright with no further handling — wrong scheme
        /// (http, file, javascript, data, anything not https).
        case deny
    }

    static func decide(url: URL, kind: Kind) -> Decision {
        guard let scheme = url.scheme?.lowercased(), scheme == "https" else {
            return .deny
        }
        if TrustedWebOrigin.matches(url) {
            return .allow
        }
        switch kind {
        case .linkActivated:
            return .openExternally
        case .formSubmitted, .backForward, .reload, .other:
            return .block
        }
    }
}
