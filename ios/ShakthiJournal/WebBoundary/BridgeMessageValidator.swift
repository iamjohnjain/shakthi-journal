import Foundation

/// Gates every JS → native `jeevanNative` message before it's allowed to
/// reach `MainTabView`. Previously `WebAppView.Coordinator` accepted any
/// message with the right handler name and a dictionary body — no frame
/// check, no origin check, no check that the message `type` was one this
/// app actually understands, no validation of the fields inside. A page
/// running in a subframe (or, if the trust boundary above this were ever
/// bypassed, an untrusted page) could post an identity-changing
/// `sessionRefreshed` message and have it accepted at face value.
///
/// Deliberately takes plain Foundation values (not `WKScriptMessage`/
/// `WKFrameInfo`/`WKSecurityOrigin` directly) so this can be unit-tested
/// without a live WKWebView — the caller is responsible for extracting
/// these fields from the real WebKit types first.
enum BridgeMessageValidator {

    struct FrameContext {
        let isMainFrame: Bool
        let originScheme: String
        let originHost: String
        let originPort: Int
    }

    enum ValidatedMessage: Equatable {
        case openHealthSync
        case sessionRefreshed(accessToken: String, refreshToken: String, userId: String, email: String)
    }

    /// Field-length ceiling applied to every string field below — generous
    /// enough for a real JWT/UUID/email, small enough that a malformed or
    /// hostile payload can't smuggle megabytes through the bridge.
    private static let maxFieldLength = 8192

    static func validate(
        handlerName: String,
        frame: FrameContext,
        body: Any
    ) -> ValidatedMessage? {
        guard handlerName == "jeevanNative" else { return nil }
        guard frame.isMainFrame else { return nil }
        guard let origin = TrustedWebOrigin.Origin(scheme: frame.originScheme, host: frame.originHost, port: frame.originPort),
              isTrusted(origin)
        else { return nil }
        guard let dict = body as? [String: Any] else { return nil }
        guard let type = dict["type"] as? String else { return nil }

        switch type {
        case "openHealthSync":
            // No payload fields — any extra keys are simply ignored, not
            // treated as an error, so this stays forward-compatible.
            return .openHealthSync

        case "sessionRefreshed":
            guard
                let accessToken  = string(dict["accessToken"]),
                let refreshToken = string(dict["refreshToken"]),
                let userId       = string(dict["userId"]),
                let email        = string(dict["email"])
            else { return nil }
            return .sessionRefreshed(accessToken: accessToken, refreshToken: refreshToken, userId: userId, email: email)

        default:
            // Unknown message type — never forwarded to MainTabView.
            return nil
        }
    }

    private static func isTrusted(_ origin: TrustedWebOrigin.Origin) -> Bool {
        if origin == TrustedWebOrigin.production { return true }
        #if DEBUG
        if let override = TrustedWebOrigin.debugOverride, origin == override { return true }
        #endif
        return false
    }

    private static func string(_ value: Any?) -> String? {
        guard let s = value as? String, !s.isEmpty, s.utf8.count <= maxFieldLength else { return nil }
        return s
    }
}
