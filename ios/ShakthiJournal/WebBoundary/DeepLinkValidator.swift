import Foundation

/// Validates and resolves an internal web-app path before it's ever handed
/// to the privileged WKWebView. `WebAppView` previously did
/// `URL(string: path, relativeTo: Self.appURL)` directly on whatever
/// `pendingPath` held — `URL(string:relativeTo:)` resolves an ABSOLUTE or
/// scheme-relative ("//host/...") string to that external destination,
/// ignoring the base entirely, so a path that was ever anything other than
/// a hardcoded literal would be an open redirect into the privileged view.
/// Today `DeepLinkManager` only ever produces one hardcoded path, but this
/// exists so every future deep link goes through the same hard gate instead
/// of relying on "nothing upstream currently sends anything else."
enum DeepLinkValidator {

    /// The only paths a native deep link is allowed to resolve to. Prefer
    /// adding to this list over loosening the general path rules below —
    /// an explicit allowlist can't be tricked by a clever encoding the
    /// general-shape checks didn't anticipate.
    static let allowedPaths: Set<String> = [
        "/nutrition?quick=photo",
    ]

    /// Returns a URL to load, or nil if `path` isn't an allowed internal
    /// app path. Every one of these must hold:
    ///   - `path` is in `allowedPaths` exactly (no prefix/suffix matching).
    ///   - It begins with exactly one leading slash (rejects `//host/...`
    ///     scheme-relative forms outright, since those start with two).
    ///   - It contains no scheme, host, or userinfo component once parsed.
    ///   - The URL it resolves to, against the trusted origin, still
    ///     passes `TrustedWebOrigin.matches` — a redundant-looking check
    ///     given the above, but cheap insurance against a future bug in
    ///     the shape checks.
    static func resolve(_ path: String) -> URL? {
        guard allowedPaths.contains(path) else { return nil }
        guard path.hasPrefix("/"), !path.hasPrefix("//") else { return nil }
        guard let parsed = URLComponents(string: path) else { return nil }
        guard parsed.scheme == nil, parsed.host == nil, parsed.user == nil, parsed.password == nil else {
            return nil
        }
        guard let resolved = URL(string: path, relativeTo: TrustedWebOrigin.productionURL) else { return nil }
        let absolute = resolved.absoluteURL
        guard TrustedWebOrigin.matches(absolute) else { return nil }
        return absolute
    }
}
