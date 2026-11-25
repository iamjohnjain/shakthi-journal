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
    @State private var webBoundaryState: WebBoundaryState = .loading
    /// Changing this forces SwiftUI to tear down and recreate `WebAppView`
    /// (and with it, a brand-new `WKWebView`) — used by Retry so a stuck
    /// load always restarts clean rather than reaching into a WebView that
    /// may itself be in a bad state.
    @State private var webViewGeneration = UUID()
    /// True while a prior sign-out's auth cleanup (clearing just the
    /// Supabase localStorage key, not IndexedDB — see `WebSessionBoundary`)
    /// might still be pending. Gates mounting a new signed-in `WebAppView`
    /// with a fresh session's tokens. Bounded, not indefinite: the session
    /// script always *overwrites* the auth key on mount regardless (so a
    /// second identity can never actually inherit the first one's stored
    /// session even if this gate is skipped) — this wait exists so a
    /// cleanup that's already in flight gets a real chance to finish
    /// first, not to block sign-in on it forever.
    @State private var authCleanupState: AuthCleanupState = .checking

    enum AuthCleanupState: Equatable {
        case checking
        case ready
        case failed
    }

    var body: some View {
        webContent
            .sheet(isPresented: $showHealthSync) {
                DashboardView()
            }
            // No forced color scheme here: the WebView reports the iPhone's
            // light/dark setting as `prefers-color-scheme`, so the web app's
            // Appearance → Auto follows the system. (The native-only sheets
            // like DashboardView still pin themselves to dark.)
            .task { await runPendingAuthCleanupCheck() }
            .onChange(of: authCleanupState) { _, newValue in
                if newValue == .ready { autoSync() }
            }
            .onChange(of: scenePhase) { _, newPhase in
                if newPhase == .active, authCleanupState == .ready { autoSync() }
            }
    }

    /// Actually AWAITS the current generation's cleanup to finish — never
    /// a fixed delay. `WebSessionBoundary.ensureCleanupComplete()` either
    /// returns immediately (`.notNeeded`), or performs the real JS-eval
    /// round trip (reusing the outgoing WebView if it's still registered,
    /// or a throwaway unprivileged one otherwise) and waits for it. Only
    /// `.ready` is allowed to mount a new privileged, authenticated
    /// `WebAppView` — `.failed` shows a retry affordance instead of
    /// silently mounting anyway.
    private func runPendingAuthCleanupCheck() async {
        authCleanupState = .checking
        switch await WebSessionBoundary.shared.ensureCleanupComplete() {
        case .notNeeded, .succeeded:
            authCleanupState = .ready
        case .failed:
            authCleanupState = .failed
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

        // SyncEngine itself owns the resulting Task now (Remediation Pass
        // 3, P1/P2-4) — it's cancelled via the `jeevanSessionWillTerminate`
        // notification AuthManager posts from `terminateSession()`, not by
        // this view tracking/cancelling its own.
        sync.startSync(userId: userId, accessToken: token, authManager: auth, healthKitManager: hk)
    }

    // MARK: - Web content

    @ViewBuilder private var webContent: some View {
        if authCleanupState == .checking {
            Color.black
                .ignoresSafeArea()
                .overlay(ProgressView().tint(.white))

        } else if authCleanupState == .failed {
            // Never silently mounts a privileged WebView when the prior
            // session's cleanup could not be confirmed complete — shows a
            // retry affordance instead. Retrying re-runs the SAME
            // (current) generation's cleanup; it does not skip it.
            Color.black
                .ignoresSafeArea()
                .overlay(
                    VStack(spacing: 16) {
                        Image(systemName: "exclamationmark.triangle")
                            .font(.system(size: 40))
                            .foregroundStyle(.white)
                        Text("Couldn't finish signing out the previous session")
                            .font(.headline)
                            .foregroundStyle(.white)
                            .multilineTextAlignment(.center)
                        Button {
                            Task { await runPendingAuthCleanupCheck() }
                        } label: {
                            Text("Retry")
                                .fontWeight(.semibold)
                                .padding(.horizontal, 24)
                                .padding(.vertical, 10)
                                .background(Color.white.opacity(0.15))
                                .foregroundStyle(.white)
                                .clipShape(Capsule())
                        }
                    }
                    .padding(32)
                )

        } else if let token   = auth.accessToken,
           let refresh = KeychainHelper.load(key: KeychainHelper.refreshTokenKey),
           let uid     = auth.userId,
           let email   = auth.userEmail {

            let epoch = auth.sessionEpoch

            ZStack(alignment: .top) {
                WebAppView(
                    accessToken:  token,
                    refreshToken: refresh,
                    userId:       uid,
                    userEmail:    email,
                    sessionEpoch: epoch,
                    onMessage:    handleWebMessage,
                    pendingPath:  Binding(
                        get: { deepLink.pendingPath },
                        set: { deepLink.pendingPath = $0 }
                    ),
                    onStateChange: { webBoundaryState = $0 },
                    isValidSession: { userId, epoch in auth.isCurrentSession(userId: userId, epoch: epoch) }
                )
                .id(webViewGeneration)
                .ignoresSafeArea(edges: .top)

                // A blocked navigation only ever shows its own small banner
                // — the real page underneath is untouched (the navigation
                // was cancelled before it replaced anything), so it must
                // never also get the full-screen WebBoundaryOverlay on top
                // of it. That overlay previously rendered an opaque
                // Color.black background unconditionally for EVERY non-
                // .ready state, including .blockedNavigation, even though
                // its own inner content was correctly an EmptyView for that
                // case — the background still painted over the whole page.
                if webBoundaryState.showsFullScreenOverlay {
                    WebBoundaryOverlay(state: webBoundaryState) {
                        webViewGeneration = UUID()
                        webBoundaryState = .loading
                    }
                    .ignoresSafeArea()
                }
                if webBoundaryState == .blockedNavigation {
                    BlockedNavigationBanner()
                }
            }

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
            if hk.hasRequestedAuth {
                // Already connected — show the native status/sync screen.
                showHealthSync = true
            } else {
                // Not connected yet — the Apple Health permission prompt IS
                // the whole point of tapping this, so go straight to it
                // instead of making the user tap through an app screen first.
                Task { await hk.requestAuthorization() }
            }

        case "silentHealthSync":
            // Unlike "openHealthSync", this never presents any native UI —
            // no dashboard sheet, no permission prompt. If HealthKit access
            // hasn't been granted yet there is nothing to silently sync
            // (prompting the system permission dialog here would not be
            // "silent" at all), so this is simply a no-op in that case.
            guard hk.hasRequestedAuth,
                  let userId = auth.userId,
                  let token  = auth.accessToken
            else { return }
            sync.startSync(userId: userId, accessToken: token, authManager: auth, healthKitManager: hk)

        case "sessionRefreshed":
            // The Supabase JS client in the WebView refreshed its token.
            // These are the bridge's CLAIMED, UNVERIFIED values —
            // `WebAppView.Coordinator` no longer does its own
            // verification/exchange (Remediation Pass 3, P1-2; see
            // `AuthManager.reconcileWebRefreshedSession`'s doc comment for
            // why that moved out of the disposable Coordinator). AuthManager
            // is the sole authority: it verifies the access token, THEN
            // exchanges the refresh token, re-validates against the live
            // session at each step, and is the only place allowed to write
            // Keychain for this path. MainTabView never writes credentials
            // directly.
            guard
                let at  = message["accessToken"]  as? String,
                let rt  = message["refreshToken"] as? String,
                let uid = message["userId"]       as? String
            else { return }
            auth.reconcileWebRefreshedSession(claimedAccessToken: at, claimedRefreshToken: rt, claimedUserId: uid)

        case "signOut":
            // Web-initiated sign-out, relayed over the bridge (posted from
            // AuthContext.tsx's signOut() even if the Supabase request
            // itself failed). Converges on the same idempotent coordinator
            // as the native Settings "Sign Out" button — a no-op if native
            // already ended this session itself, so there's no loop risk
            // either direction.
            auth.signOut()

        default:
            break
        }
    }
}
