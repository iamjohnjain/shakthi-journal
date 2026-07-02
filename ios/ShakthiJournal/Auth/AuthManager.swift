import Foundation
import Observation

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

    func signOut() {
        KeychainHelper.clearSession()
        emailConfirmationPending = false
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
