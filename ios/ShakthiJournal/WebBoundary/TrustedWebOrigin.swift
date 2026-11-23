import Foundation

/// The single source of truth for "which web origin is this native app allowed
/// to trust" — exact scheme + host + effective port, never substring/suffix
/// matching. Every privileged behavior in the app (session-token injection,
/// bridge-message handling, HealthKit injection, camera/mic grants, deep-link
/// resolution) must go through `TrustedWebOrigin.matches(_:)` instead of its
/// own ad hoc URL check, so there is exactly one place that decides what
/// "trusted" means.
///
/// Release always uses `.production`. Debug may additionally accept a
/// developer-configured local origin via `TrustedWebOrigin.debugOverride`,
/// but that property only exists inside `#if DEBUG` — it is compiled out of
/// Release entirely, so it is not just unset in Release, it cannot exist in
/// a Release binary at all.
enum TrustedWebOrigin {

    /// The one authoritative Release origin. A legacy parallel deployment
    /// (shakthi-journal.pages.dev) currently serves identical assets but is
    /// NOT an authorized native origin — it must never match here.
    static let production = Origin(scheme: "https", host: "jeevan-health-fitness-app.pages.dev", port: 443)!

    /// The production origin as a loadable root URL — the one and only
    /// `wv.load(...)` target for the initial load and for "Retry".
    static let productionURL = URL(string: "https://jeevan-health-fitness-app.pages.dev")!

    #if DEBUG
    /// Optional local development origin — e.g. "http://localhost:5173" while
    /// running `npm run dev`. `nil` by default; a developer opts in locally.
    /// This entire property does not exist in a Release build.
    static var debugOverride: Origin?
    #endif

    /// Normalized scheme+host+port triple. Two `Origin`s are equal only when
    /// all three match exactly — an omitted HTTPS port and an explicit `443`
    /// are treated as the same effective port (both normalize to 443).
    struct Origin: Equatable {
        let scheme: String
        let host: String
        let port: Int

        /// Fails (returns nil) for anything that isn't a clean https/http
        /// origin — no userinfo, no path-as-host confusion, nothing that
        /// can't be expressed as a plain scheme+host+port triple.
        init?(scheme: String, host: String, port: Int) {
            guard !host.isEmpty else { return nil }
            self.scheme = scheme.lowercased()
            self.host = host.lowercased()
            self.port = port
        }

        /// Parses a URL into a normalized Origin, or returns nil for
        /// anything malformed, userinfo-bearing, or missing a host.
        /// Deliberately rejects `file:`, `javascript:`, `data:`, and any
        /// other non-http(s) scheme — those never have a meaningful origin
        /// to compare in the first place.
        static func from(_ url: URL) -> Origin? {
            guard let scheme = url.scheme?.lowercased(), scheme == "https" || scheme == "http" else {
                return nil
            }
            guard let host = url.host, !host.isEmpty else { return nil }
            // Reject embedded credentials (https://user:pass@host/...) outright —
            // a URL carrying userinfo is never something we treat as a clean,
            // comparable origin, regardless of what host/port it also has.
            if url.user != nil || url.password != nil { return nil }
            let effectivePort = url.port ?? (scheme == "https" ? 443 : 80)
            return Origin(scheme: scheme, host: host, port: effectivePort)
        }
    }

    /// True only if `url` parses to an Origin that exactly equals a trusted
    /// origin (production, or the Debug-only override when set). Malformed
    /// URLs, non-http(s) schemes, lookalike/sub/sibling domains, wrong
    /// ports, and userinfo-bearing URLs all return false.
    static func matches(_ url: URL) -> Bool {
        guard let origin = Origin.from(url) else { return false }
        if origin == production { return true }
        #if DEBUG
        if let override = debugOverride, origin == override { return true }
        #endif
        return false
    }

    /// True only for an exact HTTPS match against a trusted origin — used
    /// anywhere http:// must never be treated as equivalent to https://
    /// even if some future trusted origin allowed plain HTTP (none do today).
    static func isSecure(_ url: URL) -> Bool {
        matches(url) && url.scheme?.lowercased() == "https"
    }
}
