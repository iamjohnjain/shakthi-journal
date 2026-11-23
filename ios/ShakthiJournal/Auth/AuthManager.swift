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

    // MARK: - Init

    init() {
        Task { await restoreSession() }
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
        KeychainHelper.clearSession()
        emailConfirmationPending = false
        googleSignInError = nil
        authState = .signedOut
        sessionEpoch += 1
        // Clears ONLY the Supabase auth localStorage key from the WebView —
        // never IndexedDB/general storage. Awaited in a detached Task since
        // callers of signOut()/terminateSession() are synchronous; anything
        // that needs to wait for cleanup to actually finish (gating a new
        // sign-in's WebView from mounting) reads WebSessionBoundary's own
        // `isPending` flag instead of awaiting this call directly.
        Task { await WebSessionBoundary.shared.requestCleanup() }
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

        do {
            let session = try await SupabaseClient.refreshSession(refreshToken: refreshToken)
            persist(session)
            authState = .signedIn(
                userId: session.user.id,
                email: session.user.email,
                accessToken: session.accessToken
            )
        } catch SupabaseError.httpError(let code, _) where code == 400 || code == 401 {
            // The refresh token is genuinely revoked or invalid — force re-sign-in.
            // Falling back to the stale access token would also fail, since it's expired.
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
        guard let refreshToken = KeychainHelper.load(key: KeychainHelper.refreshTokenKey) else {
            terminateSession()
            throw SupabaseError.sessionExpired
        }
        do {
            let session = try await SupabaseClient.refreshSession(refreshToken: refreshToken)
            persist(session)
            authState = .signedIn(
                userId: session.user.id,
                email: session.user.email,
                accessToken: session.accessToken
            )
            return session.accessToken
        } catch SupabaseError.httpError(let code, _) where code == 400 || code == 401 {
            // Refresh token is revoked / expired — clear session and force re-sign-in.
            // SyncEngine catches .sessionExpired to show the right UI.
            terminateSession()
            throw SupabaseError.sessionExpired
        }
    }

    /// Updates the in-memory access token when the WebView refreshes it.
    /// Called by the native JS bridge when Supabase JS posts a TOKEN_REFRESHED event.
    func updateTokens(accessToken: String) {
        guard case .signedIn(let userId, let email, _) = authState else { return }
        authState = .signedIn(userId: userId, email: email, accessToken: accessToken)
    }
}

/// Anchors the Google sign-in web sheet to the app's key window.
private final class GooglePresentationContextProvider: NSObject, ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first { $0.isKeyWindow } ?? ASPresentationAnchor()
    }
}
