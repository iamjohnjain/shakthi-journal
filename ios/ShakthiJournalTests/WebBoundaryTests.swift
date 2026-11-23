import XCTest
@testable import Jeevan

/// Covers the pure, WebKit-independent trust-boundary logic added in
/// Milestone 1B — TrustedWebOrigin, WebNavigationPolicy, DeepLinkValidator,
/// and BridgeMessageValidator. Deliberately does not touch WKWebView itself
/// (that needs a live app + simulator interaction, covered instead by the
/// manual adversarial matrix in docs/APP_STORE_READINESS.md).
final class WebBoundaryTests: XCTestCase {

    // MARK: - TrustedWebOrigin: allowed

    func test_allowed_exactProductionOrigin() {
        XCTAssertTrue(TrustedWebOrigin.matches(URL(string: "https://jeevan-health-fitness-app.pages.dev")!))
    }

    func test_allowed_withPathQueryAndFragment() {
        XCTAssertTrue(TrustedWebOrigin.matches(URL(string: "https://jeevan-health-fitness-app.pages.dev/nutrition?quick=photo#top")!))
    }

    func test_allowed_explicitPort443() {
        XCTAssertTrue(TrustedWebOrigin.matches(URL(string: "https://jeevan-health-fitness-app.pages.dev:443/")!))
    }

    // MARK: - TrustedWebOrigin: rejected

    func test_rejected_plainHTTP() {
        XCTAssertFalse(TrustedWebOrigin.matches(URL(string: "http://jeevan-health-fitness-app.pages.dev")!))
    }

    func test_rejected_wrongPort() {
        XCTAssertFalse(TrustedWebOrigin.matches(URL(string: "https://jeevan-health-fitness-app.pages.dev:444")!))
    }

    func test_rejected_lookalikeSuffixDomain() {
        XCTAssertFalse(TrustedWebOrigin.matches(URL(string: "https://jeevan-health-fitness-app.pages.dev.evil.example")!))
    }

    func test_rejected_lookalikePrefixDomain() {
        XCTAssertFalse(TrustedWebOrigin.matches(URL(string: "https://evil-jeevan-health-fitness-app.pages.dev")!))
    }

    func test_rejected_userinfoHost() {
        // URL(string:) parses "...@evil.example" as userinfo on host evil.example —
        // either way this must not be treated as the trusted origin.
        XCTAssertFalse(TrustedWebOrigin.matches(URL(string: "https://jeevan-health-fitness-app.pages.dev@evil.example")!))
    }

    func test_rejected_subdomain() {
        XCTAssertFalse(TrustedWebOrigin.matches(URL(string: "https://sub.jeevan-health-fitness-app.pages.dev")!))
    }

    func test_rejected_legacyShakthiOrigin() {
        XCTAssertFalse(TrustedWebOrigin.matches(URL(string: "https://shakthi-journal.pages.dev")!))
    }

    func test_rejected_localhost() {
        XCTAssertFalse(TrustedWebOrigin.matches(URL(string: "http://localhost:5173")!))
        XCTAssertFalse(TrustedWebOrigin.matches(URL(string: "https://localhost")!))
    }

    func test_rejected_fileScheme() {
        XCTAssertFalse(TrustedWebOrigin.matches(URL(string: "file:///etc/passwd")!))
    }

    func test_rejected_javascriptScheme() {
        XCTAssertFalse(TrustedWebOrigin.matches(URL(string: "javascript:alert(1)")!))
    }

    func test_rejected_dataScheme() {
        XCTAssertFalse(TrustedWebOrigin.matches(URL(string: "data:text/html,hi")!))
    }

    func test_rejected_malformedURL() {
        XCTAssertNil(URL(string: ""))
        // A URL with an empty host string is treated as untrusted, not a crash.
        if let noHost = URL(string: "https://") {
            XCTAssertFalse(TrustedWebOrigin.matches(noHost))
        }
    }

    // MARK: - WebNavigationPolicy

    private let trusted = URL(string: "https://jeevan-health-fitness-app.pages.dev/nutrition")!
    private let external = URL(string: "https://example.com")!
    private let httpTrustedHost = URL(string: "http://jeevan-health-fitness-app.pages.dev")!

    func test_navigation_trustedOrigin_allowed() {
        XCTAssertEqual(WebNavigationPolicy.decide(url: trusted, kind: .other), .allow)
        XCTAssertEqual(WebNavigationPolicy.decide(url: trusted, kind: .linkActivated), .allow)
    }

    func test_navigation_userClickedExternalLink_opensExternally() {
        XCTAssertEqual(WebNavigationPolicy.decide(url: external, kind: .linkActivated), .openExternally)
    }

    func test_navigation_nonUserInitiatedCrossOrigin_blocked() {
        XCTAssertEqual(WebNavigationPolicy.decide(url: external, kind: .other), .block)
        XCTAssertEqual(WebNavigationPolicy.decide(url: external, kind: .formSubmitted), .block)
        XCTAssertEqual(WebNavigationPolicy.decide(url: external, kind: .backForward), .block)
        XCTAssertEqual(WebNavigationPolicy.decide(url: external, kind: .reload), .block)
    }

    func test_navigation_httpScheme_denied_evenOnTrustedHost() {
        XCTAssertEqual(WebNavigationPolicy.decide(url: httpTrustedHost, kind: .other), .deny)
    }

    func test_navigation_fileScheme_denied() {
        XCTAssertEqual(WebNavigationPolicy.decide(url: URL(string: "file:///etc/passwd")!, kind: .linkActivated), .deny)
    }

    // MARK: - DeepLinkValidator

    func test_deepLink_allowedSnapMealPath() {
        let resolved = DeepLinkValidator.resolve("/nutrition?quick=photo")
        XCTAssertNotNil(resolved)
        XCTAssertTrue(TrustedWebOrigin.matches(resolved!))
    }

    func test_deepLink_schemeRelative_rejected() {
        XCTAssertNil(DeepLinkValidator.resolve("//evil.example"))
    }

    func test_deepLink_absoluteExternalURL_rejected() {
        XCTAssertNil(DeepLinkValidator.resolve("https://evil.example/nutrition?quick=photo"))
    }

    func test_deepLink_javascriptURL_rejected() {
        XCTAssertNil(DeepLinkValidator.resolve("javascript:alert(1)"))
    }

    func test_deepLink_notOnAllowlist_rejected() {
        XCTAssertNil(DeepLinkValidator.resolve("/some/other/path"))
    }

    func test_deepLink_malformedEncodedPath_rejected() {
        XCTAssertNil(DeepLinkValidator.resolve("/nutrition?quick=photo%"))
    }

    // MARK: - BridgeMessageValidator

    private func frame(trusted: Bool, isMainFrame: Bool = true) -> BridgeMessageValidator.FrameContext {
        trusted
            ? .init(isMainFrame: isMainFrame, originScheme: "https", originHost: "jeevan-health-fitness-app.pages.dev", originPort: 443)
            : .init(isMainFrame: isMainFrame, originScheme: "https", originHost: "evil.example", originPort: 443)
    }

    func test_bridge_trustedMainFrame_openHealthSync_accepted() {
        let result = BridgeMessageValidator.validate(
            handlerName: "jeevanNative",
            frame: frame(trusted: true),
            body: ["type": "openHealthSync"]
        )
        XCTAssertEqual(result, .openHealthSync)
    }

    func test_bridge_trustedSubframe_rejected() {
        let result = BridgeMessageValidator.validate(
            handlerName: "jeevanNative",
            frame: frame(trusted: true, isMainFrame: false),
            body: ["type": "openHealthSync"]
        )
        XCTAssertNil(result)
    }

    func test_bridge_untrustedMainFrame_rejected() {
        let result = BridgeMessageValidator.validate(
            handlerName: "jeevanNative",
            frame: frame(trusted: false),
            body: ["type": "openHealthSync"]
        )
        XCTAssertNil(result)
    }

    func test_bridge_unknownMessageType_rejected() {
        let result = BridgeMessageValidator.validate(
            handlerName: "jeevanNative",
            frame: frame(trusted: true),
            body: ["type": "somethingElse"]
        )
        XCTAssertNil(result)
    }

    func test_bridge_invalidPayload_missingFields_rejected() {
        let result = BridgeMessageValidator.validate(
            handlerName: "jeevanNative",
            frame: frame(trusted: true),
            body: ["type": "sessionRefreshed", "accessToken": "abc"] // missing refreshToken/userId/email
        )
        XCTAssertNil(result)
    }

    func test_bridge_wrongHandlerName_rejected() {
        let result = BridgeMessageValidator.validate(
            handlerName: "somethingElse",
            frame: frame(trusted: true),
            body: ["type": "openHealthSync"]
        )
        XCTAssertNil(result)
    }

    func test_bridge_nonDictionaryBody_rejected() {
        let result = BridgeMessageValidator.validate(
            handlerName: "jeevanNative",
            frame: frame(trusted: true),
            body: "not a dictionary"
        )
        XCTAssertNil(result)
    }

    func test_bridge_validSessionRefreshed_accepted() {
        let result = BridgeMessageValidator.validate(
            handlerName: "jeevanNative",
            frame: frame(trusted: true),
            body: [
                "type": "sessionRefreshed",
                "accessToken": "at", "refreshToken": "rt",
                "userId": "u1", "email": "a@b.com",
            ]
        )
        XCTAssertEqual(result, .sessionRefreshed(accessToken: "at", refreshToken: "rt", userId: "u1", email: "a@b.com"))
    }
}
