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
    /// Tracked explicitly (not a fire-and-forget `Task {}`) so a sign-out
    /// — which tears down this entire `MainTabView` per `ContentView`'s
    /// `switch` over `auth.authState` — can actually cancel an in-flight
    /// sync rather than letting it keep running (and later upload/inject)
    /// after the account it was started for is no longer signed in.
    @State private var autoSyncTask: Task<Void, Never>?

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
            .preferredColorScheme(.dark)
            .task { await runPendingAuthCleanupCheck() }
            .onChange(of: authCleanupState) { _, newValue in
                if newValue == .ready { autoSync() }
            }
            .onChange(of: scenePhase) { _, newPhase in
                if newPhase == .active, authCleanupState == .ready { autoSync() }
            }
            .onDisappear { autoSyncTask?.cancel() }
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
        guard autoSyncTask == nil else { return }

        autoSyncTask = Task {
            await sync.sync(userId: userId, accessToken: token, authManager: auth, healthKitManager: hk)
            autoSyncTask = nil
        }
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

        case "sessionRefreshed":
            // The Supabase JS client in the WebView refreshed its token.
            // `WebAppView.Coordinator` has already exchanged the claimed
            // refresh token with Supabase directly and verified the
            // canonical identity it returned — this just forwards those
            // canonical fields to AuthManager, which is the ONE place
            // allowed to write Keychain for this path (and does its own
            // independent live-session re-check before doing so).
            // MainTabView itself must never write credentials directly.
            guard
                let at  = message["accessToken"]  as? String,
                let rt  = message["refreshToken"] as? String,
                let uid = message["userId"]       as? String,
                let em  = message["email"]        as? String
            else { return }
            auth.applyWebRefreshedSession(accessToken: at, refreshToken: rt, userId: uid, email: em)

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
