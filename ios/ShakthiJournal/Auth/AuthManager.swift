import Foundation
import Observation
import AuthenticationServices
import UIKit

@MainActor
@Observable
final class AuthManager {

    // MARK: - State

    enum AuthState {
        case loading
        case signedOut
        case signedIn(userId: String, email: String, accessToken: String)
    }

    var authState: AuthState = .loading

    /// Bumped every time a signed-in session ends (`signOut()`/forced
    /// logout). Captured by in-flight bridge-credential verification tasks
    /// (see `WebAppView.Coordinator`) so an `await` that resumes after the
    /// session has already ended can detect it belongs to a stale
    /// generation and refuse to write anything to Keychain.
    private(set) var sessionEpoch = 0

    /// True if `userId`/`sessionEpoch` still describe the live, current
    /// session — used by anything holding onto identity captured before an
    /// `await` to re-validate afterward rather than trusting stale state.
    func isCurrentSession(userId: String, epoch: Int) -> Bool {
        isSignedIn && self.userId == userId && sessionEpoch == epoch
    }

    // Sign-in
    var signInError: String?
    var isSigningIn = false

    // Sign-up
    var signUpError: String?
    var isSigningUp = false
    var emailConfirmationPending = false

    // Google sign-in
    var googleSignInError: String?
    var isSigningInWithGoogle = false
    private var webAuthSession: ASWebAuthenticationSession?
    private let googlePresentationContextProvider = GooglePresentationContextProvider()

    // Convenience accessors used by child views
    var isSignedIn: Bool {
        if case .signedIn = authState { return true }
        return false
    }

    var userId: String? {
        guard case .signedIn(let id, _, _) = authState else { return nil }
        return id
    }

    var userEmail: String? {
        guard case .signedIn(_, let email, _) = authState else { return nil }
        return email
    }

    var accessToken: String? {
        guard case .signedIn(_, _, let token) = authState else { return nil }
        return token
    }

    /// Tracked so a (hypothetical) second restore attempt cancels the
    /// first rather than letting two independent restore round-trips
    /// race each other.
    private var restoreTask: Task<Void, Never>?

    /// Coalesces concurrent `refreshAndGetToken()` callers onto one
    /// in-flight refresh rather than firing a second, independent
    /// network round-trip — also gives this operation a trackable/
    /// cancellable handle the way `restoreTask` does for restore.
    private var refreshTask: Task<String, Error>?

    // MARK: - Init

    init() {
        restoreTask = Task { await restoreSession() }
    }

    // MARK: - Actions

    func signIn(email: String, password: String) async {
        isSigningIn = true
        signInError = nil
        defer { isSigningIn = false }

        do {
            let session = try await SupabaseClient.signIn(email: email, password: password)
            persist(session)
            authState = .signedIn(
                userId: session.user.id,
                email: session.user.email,
                accessToken: session.accessToken
            )
        } catch {
            signInError = error.localizedDescription
        }
    }

    func signUp(email: String, password: String) async {
        isSigningUp = true
        signUpError = nil
        emailConfirmationPending = false
        defer { isSigningUp = false }

        do {
            let result = try await SupabaseClient.signUp(email: email, password: password)
            if let session = result.session {
                persist(session)
                authState = .signedIn(
                    userId: session.user.id,
                    email: session.user.email,
                    accessToken: session.accessToken
                )
            } else {
                emailConfirmationPending = true
            }
        } catch {
            signUpError = error.localizedDescription
        }
    }

    /// Launches Supabase's hosted Google OAuth flow in a system web sheet
    /// (`ASWebAuthenticationSession`) and signs in on success. No Google SDK
    /// required — Supabase handles the Google side; this just catches the
    /// redirect back and turns its tokens into a session.
    func signInWithGoogle() {
        guard !isSigningInWithGoogle else { return }
        isSigningInWithGoogle = true
        googleSignInError = nil

        let redirectScheme = "jeevan.health.fitness"
        let authURL = SupabaseClient.googleAuthorizeURL(redirectTo: "\(redirectScheme)://auth-callback")

        let session = ASWebAuthenticationSession(
            url: authURL,
            callbackURLScheme: redirectScheme
        ) { [weak self] callbackURL, error in
            Task { @MainActor [weak self] in
                guard let self else { return }
                self.isSigningInWithGoogle = false

                if let error {
                    let cancelled = (error as? ASWebAuthenticationSessionError)?.code == .canceledLogin
                    if !cancelled { self.googleSignInError = error.localizedDescription }
                    return
                }
                guard let callbackURL else { return }

                do {
                    let newSession = try await SupabaseClient.sessionFromOAuthCallback(callbackURL)
                    self.persist(newSession)
                    self.authState = .signedIn(
                        userId: newSession.user.id,
                        email: newSession.user.email,
                        accessToken: newSession.accessToken
                    )
                } catch {
                    self.googleSignInError = error.localizedDescription
                }
            }
        }
        session.presentationContextProvider = googlePresentationContextProvider
        session.prefersEphemeralWebBrowserSession = false
        webAuthSession = session
        session.start()
    }

    /// The single, idempotent sign-out coordinator — every path that ends a
    /// session (the native Settings button, a web-initiated sign-out
    /// relayed over the bridge, and the forced-logout paths below) all
    /// converge here. Safe to call more than once: a no-op once already
    /// signed out, so a web-bridge `signOut` message arriving after native
    /// already handled its own sign-out (or vice versa) can't double-clear
    /// state or re-trigger anything.
    func signOut() {
        guard case .signedIn = authState else { return }
        terminateSession()
    }

    private func terminateSession() {
        // Marked PENDING SYNCHRONOUSLY, before authState flips and before
        // the outgoing WebAppView unmounts — any `MainTabView` instance
        // created for whatever comes next (SignInView, or immediately a
        // new sign-in) observes `isPending`/the bumped generation from the
        // very first moment it exists. This is what makes it impossible
        // for a stale cleanup to run against a WebView that already has a
        // new session injected into it: the new WebAppView mounts only
        // after `ensureCleanupComplete()` resolves for THIS generation.
        WebSessionBoundary.shared.markPendingForNewCleanup()

        KeychainHelper.clearSession()
        emailConfirmationPending = false
        googleSignInError = nil
        authState = .signedOut
        sessionEpoch += 1

        // Opportunistically run the cleanup now, while the outgoing
        // WebView (if any) is still registered as live — reusing an
        // already-loaded page is strictly better than falling back to a
        // throwaway one. Callers that need to actually WAIT for cleanup
        // to finish (gating a new sign-in's WebView) call
        // `ensureCleanupComplete()` themselves rather than awaiting this.
        Task { await WebSessionBoundary.shared.ensureCleanupComplete() }
    }

    // MARK: - Private

    private func restoreSession() async {
        guard
            let accessToken  = KeychainHelper.load(key: KeychainHelper.accessTokenKey),
            let refreshToken = KeychainHelper.load(key: KeychainHelper.refreshTokenKey),
            let userId       = KeychainHelper.load(key: KeychainHelper.userIdKey),
            let email        = KeychainHelper.load(key: KeychainHelper.userEmailKey)
        else {
            authState = .signedOut
            return
        }

        // Trust the cached session immediately, before touching the network.
        // ContentView gates its entire UI on `authState != .loading`, so
        // waiting on a refresh round-trip here means a black loading screen
        // on every single cold launch even though a perfectly usable session
        // is already sitting in the Keychain. Flip to signedIn right away —
        // the WebView loads and the user is in the app — then refresh the
        // token in the background. The web app's own Supabase client also
        // refreshes independently once it's running (see WebAppView's
        // injected-session comment), so a slightly stale access token here
        // is never a dead end even before this background refresh lands.
        authState = .signedIn(userId: userId, email: email, accessToken: accessToken)

        // Captured AFTER the optimistic signedIn transition above (which
        // never bumps the epoch itself) — re-checked after the `await`
        // below so a sign-out, or a second identity signing in, while
        // this network round-trip was in flight is detected rather than
        // blindly trusted.
        let expectedUserId = userId
        let expectedEpoch = sessionEpoch

        do {
            let session = try await SupabaseClient.refreshSession(refreshToken: refreshToken)
            guard !Task.isCancelled else { return }
            guard isCurrentSession(userId: expectedUserId, epoch: expectedEpoch) else {
                // Either signed out, or a DIFFERENT account signed in while
                // this was in flight — account A's late success must never
                // overwrite account B's live session.
                return
            }
            guard session.user.id == expectedUserId else {
                // Supabase returned a session for a different user than
                // the one this refresh was started for — never persist it.
                return
            }
            persist(session)
            authState = .signedIn(
                userId: session.user.id,
                email: session.user.email,
                accessToken: session.accessToken
            )
        } catch SupabaseError.httpError(let code, _) where code == 400 || code == 401 {
            // The refresh token is genuinely revoked or invalid — force
            // re-sign-in. Only do so if THIS account is still the live
            // session: a late failure for account A must never sign out
            // whatever account B is now signed in as.
            guard isCurrentSession(userId: expectedUserId, epoch: expectedEpoch) else { return }
            print("[AuthManager] Refresh token rejected (\(code)) — clearing Keychain session")
            terminateSession()
        } catch {
            // Transient network/server error — already running on the cached
            // session set above, so there's nothing further to do.
        }
    }

    private func persist(_ session: SupabaseSession) {
        KeychainHelper.save(session.accessToken,  key: KeychainHelper.accessTokenKey)
        KeychainHelper.save(session.refreshToken, key: KeychainHelper.refreshTokenKey)
        KeychainHelper.save(session.user.id,      key: KeychainHelper.userIdKey)
        KeychainHelper.save(session.user.email,   key: KeychainHelper.userEmailKey)
    }

    /// Refreshes the Supabase session using the stored refresh token.
    /// Updates Keychain and authState with the new tokens.
    /// Returns the new access token so callers can retry immediately.
    /// Throws `SupabaseError.sessionExpired` if the refresh token is no longer valid.
    func refreshAndGetToken() async throws -> String {
        // Coalesce concurrent callers (e.g. two sync attempts racing a
        // 401) onto the same in-flight refresh rather than firing a
        // second independent network round-trip.
        if let existing = refreshTask {
            return try await existing.value
        }
        guard case .signedIn(let expectedUserId, _, _) = authState else {
            throw SupabaseError.sessionExpired
        }
        let expectedEpoch = sessionEpoch

        let task = Task<String, Error> { [weak self] in
            guard let self else { throw SupabaseError.sessionExpired }
            guard let refreshToken = KeychainHelper.load(key: KeychainHelper.refreshTokenKey) else {
                if self.isCurrentSession(userId: expectedUserId, epoch: expectedEpoch) {
                    self.terminateSession()
                }
                throw SupabaseError.sessionExpired
            }
            do {
                let session = try await SupabaseClient.refreshSession(refreshToken: refreshToken)
                guard !Task.isCancelled else { throw SupabaseError.sessionExpired }
                guard self.isCurrentSession(userId: expectedUserId, epoch: expectedEpoch) else {
                    // A sign-out, or a different account signing in, while
                    // this refresh was in flight — never persist a late
                    // success from account A over whatever is live now.
                    throw SupabaseError.sessionExpired
                }
                guard session.user.id == expectedUserId else {
                    throw SupabaseError.sessionExpired
                }
                self.persist(session)
                self.authState = .signedIn(
                    userId: session.user.id,
                    email: session.user.email,
                    accessToken: session.accessToken
                )
                return session.accessToken
            } catch SupabaseError.httpError(let code, _) where code == 400 || code == 401 {
                // Refresh token is revoked/expired — clear session and
                // force re-sign-in, but only if THIS account is still the
                // live one; a late failure for account A must never sign
                // out account B. SyncEngine catches .sessionExpired to
                // show the right UI either way.
                if self.isCurrentSession(userId: expectedUserId, epoch: expectedEpoch) {
                    self.terminateSession()
                }
                throw SupabaseError.sessionExpired
            }
        }
        refreshTask = task
        defer { refreshTask = nil }
        return try await task.value
    }

    /// The ONE place a web-originated `sessionRefreshed` bridge message is
    /// allowed to reach Keychain. `WebAppView.Coordinator` has already
    /// verified `accessToken` directly against Supabase and matched the
    /// returned identity to the user it was constructed for — this is a
    /// second, independent re-check against the LIVE current session
    /// right before writing anything, so `MainTabView` never needs (and
    /// must never attempt) to write credentials to Keychain itself.
    func applyWebRefreshedSession(accessToken: String, refreshToken: String, userId: String, email: String) {
        guard case .signedIn(let currentUserId, _, _) = authState, currentUserId == userId else { return }
        KeychainHelper.save(accessToken,  key: KeychainHelper.accessTokenKey)
        KeychainHelper.save(refreshToken, key: KeychainHelper.refreshTokenKey)
        KeychainHelper.save(userId,       key: KeychainHelper.userIdKey)
        KeychainHelper.save(email,        key: KeychainHelper.userEmailKey)
        authState = .signedIn(userId: userId, email: email, accessToken: accessToken)
    }
}

#if DEBUG
extension AuthManager {
    /// Test-only: sets signed-in state directly, without any network
    /// round trip — lets deterministic tests exercise the guard logic
    /// (`isCurrentSession`, `applyWebRefreshedSession`) that
    /// `restoreSession()`/`refreshAndGetToken()` depend on without
    /// needing to mock or hit the real Supabase network. Never compiled
    /// into Release.
    func setSignedInForTesting(userId: String, email: String, accessToken: String) {
        authState = .signedIn(userId: userId, email: email, accessToken: accessToken)
    }
}
#endif

/// Anchors the Google sign-in web sheet to the app's key window.
private final class GooglePresentationContextProvider: NSObject, ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first { $0.isKeyWindow } ?? ASPresentationAnchor()
    }
}
