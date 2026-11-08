import Foundation
import Observation

/// Handles URLs the app is opened with from outside its own UI — currently
/// just the home-screen widget's tap target. Not involved in the Google
/// sign-in redirect (`com.shakthijournal.app://auth-callback`), which
/// `ASWebAuthenticationSession` intercepts internally before it would ever
/// reach `.onOpenURL`.
@MainActor
@Observable
final class DeepLinkManager {

    /// Web app path to navigate to once WebAppView picks this up. Cleared
    /// by WebAppView immediately after it applies the navigation, so it
    /// never re-fires on a later re-render.
    var pendingPath: String?

    func handle(_ url: URL) {
        guard url.host == "snap-meal" else { return }
        pendingPath = "/nutrition?quick=photo"
    }
}
