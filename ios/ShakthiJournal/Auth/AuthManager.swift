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

        let redirectScheme = "com.jeevan.app"
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

    func signOut() {
        KeychainHelper.clearSession()
        emailConfirmationPending = false
        googleSignInError = nil
        authState = .signedOut
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
            KeychainHelper.clearSession()
            authState = .signedOut
        } catch {
            // Transient network/server error — preserve the stale session so the user
            // isn't forced offline by a momentary connectivity blip.
            authState = .signedIn(userId: userId, email: email, accessToken: accessToken)
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
            KeychainHelper.clearSession()
            authState = .signedOut
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
            KeychainHelper.clearSession()
            authState = .signedOut
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
