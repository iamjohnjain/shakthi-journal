import SwiftUI

/// Root view shown when the user is signed in.
///
/// The web app is the single navigation system (Today / Train / Eat / Goals / Me).
/// Health sync lives in the web app's Settings → Integrations → "Apple Health Sync",
/// which calls window.webkit.messageHandlers.jeevanNative.postMessage({ type: 'openHealthSync' })
/// and we open DashboardView as a sheet in response.
struct MainTabView: View {

    @Environment(AuthManager.self) private var auth
    @Environment(DeepLinkManager.self) private var deepLink
    @Environment(HealthKitManager.self) private var hk
    @Environment(SyncEngine.self) private var sync
    @Environment(\.scenePhase) private var scenePhase

    @State private var showHealthSync = false

    var body: some View {
        webContent
            .sheet(isPresented: $showHealthSync) {
                DashboardView()
            }
            .preferredColorScheme(.dark)
            .task { autoSync() }
            .onChange(of: scenePhase) { _, newPhase in
                if newPhase == .active { autoSync() }
            }
    }

    // MARK: - Automatic background sync

    /// Runs HealthKit → Supabase sync the moment the app opens or comes back
    /// to the foreground — no "Sync Data" tap required. Only runs once the
    /// user has already granted HealthKit access (never auto-prompts the
    /// system permission sheet) and skips if a sync just ran, since
    /// `SyncEngine.sync()` itself is already a no-op while one is in flight.
    private func autoSync() {
        guard hk.hasRequestedAuth,
              let userId = auth.userId,
              let token  = auth.accessToken
        else { return }

        if let last = sync.syncState.lastAttemptedSync, Date().timeIntervalSince(last) < 60 {
            return
        }

        Task { await sync.sync(userId: userId, accessToken: token, authManager: auth, healthKitManager: hk) }
    }

    // MARK: - Web content

    @ViewBuilder private var webContent: some View {
        if let token   = auth.accessToken,
           let refresh = KeychainHelper.load(key: KeychainHelper.refreshTokenKey),
           let uid     = auth.userId,
           let email   = auth.userEmail {

            WebAppView(
                accessToken:  token,
                refreshToken: refresh,
                userId:       uid,
                userEmail:    email,
                onMessage:    handleWebMessage,
                pendingPath:  Binding(
                    get: { deepLink.pendingPath },
                    set: { deepLink.pendingPath = $0 }
                )
            )
            .ignoresSafeArea(edges: .top)

        } else {
            Color.black
                .ignoresSafeArea()
                .overlay(ProgressView().tint(.white))
        }
    }

    // MARK: - Native bridge handler

    private func handleWebMessage(_ message: [String: Any]) {
        guard let type = message["type"] as? String else { return }
        switch type {
        case "openHealthSync":
            showHealthSync = true

        case "sessionRefreshed":
            // The Supabase JS client in the WebView refreshed its token.
            // Sync the new tokens to native Keychain so HealthKit sync doesn't
            // try to use the old, now-revoked refresh token.
            guard
                let at  = message["accessToken"]  as? String,
                let rt  = message["refreshToken"] as? String,
                let uid = message["userId"]       as? String,
                let em  = message["email"]        as? String
            else { return }
            KeychainHelper.save(at,  key: KeychainHelper.accessTokenKey)
            KeychainHelper.save(rt,  key: KeychainHelper.refreshTokenKey)
            KeychainHelper.save(uid, key: KeychainHelper.userIdKey)
            KeychainHelper.save(em,  key: KeychainHelper.userEmailKey)
            auth.updateTokens(accessToken: at)
            print("[MainTabView] Keychain updated from WebView token refresh")

        default:
            break
        }
    }
}
