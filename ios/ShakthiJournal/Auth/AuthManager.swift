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
    /// Scoped to `refreshTaskScope` (Remediation Pass 3, P1-2) so a
    /// request for a DIFFERENT (userId, epoch) never coalesces onto a
    /// stale in-flight task that belongs to a session that is no longer
    /// live.
    private var refreshTask: Task<String, Error>?
    private var refreshTaskScope: (userId: String, epoch: Int)?

    /// The single owner of the web-bridge `sessionRefreshed` reconciliation
    /// (Remediation Pass 3, P1-2) — moved here from `WebAppView.Coordinator`
    /// specifically because a `WKWebView`/Coordinator is disposable (torn
    /// down on sign-out, Retry, or a new `WebAppView` instance) and MUST
    /// NOT be the thing a correctness-critical, possibly-already-consumed
    /// refresh-token exchange depends on surviving. `AuthManager` outlives
    /// every WebView. Scoped to `(userId, epoch)` the same way
    /// `refreshTask` is.
    private var webRefreshTask: Task<Void, Never>?
    private var webRefreshTaskScope: (userId: String, epoch: Int)?

    /// Injected so tests can supply a mock that never contacts live
    /// Supabase (Remediation Pass 3) — defaults to the real network
    /// implementation for every non-test call site.
    private let sessionExchanger: SupabaseSessionExchanging

    // MARK: - Init

    init(sessionExchanger: SupabaseSessionExchanging = LiveSupabaseSessionExchanger()) {
        self.sessionExchanger = sessionExchanger
        #if DEBUG
        // Lets this session's own interactive QA (xcrun simctl launch with
        // this env var set) reach WebAppView/the WKWebView boundary without
        // real account credentials — the native app otherwise has no guest
        // mode at all (unlike the web app's own "Continue as Guest"), so
        // there was no way to drive the live adversarial-matrix scenarios
        // (forced process termination, offline launch, popups) without
        // either real credentials or this. Stripped entirely from Release
        // builds by the #if DEBUG compile-time check — cannot ship, and
        // does nothing unless this specific env var is explicitly set,
        // which normal Xcode Run/Debug sessions never do on their own.
        if ProcessInfo.processInfo.environment["JEEVAN_UITEST_BYPASS_AUTH"] == "1" {
            // MainTabView also requires a refresh token to be sitting in
            // Keychain before it will mount WebAppView at all — a real
            // sign-in writes one via persist(session); this path has no
            // real session to persist, so it writes a placeholder directly.
            _ = KeychainHelper.save("uitest-debug-refresh-token", key: KeychainHelper.refreshTokenKey)
            authState = .signedIn(userId: "uitest-debug-user", email: "uitest@debug.local", accessToken: "uitest-debug-token")
            restoreTask = nil
            return
        }
        #endif
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
        // Lets `SyncEngine` cancel whatever sync Task it currently owns
        // BEFORE this account's identity/epoch stop being the live
        // session — see Remediation Pass 3, P1/P2-4.
        NotificationCenter.default.post(name: .jeevanSessionWillTerminate, object: nil)

        refreshTask?.cancel()
        refreshTask = nil
        refreshTaskScope = nil
        webRefreshTask?.cancel()
        webRefreshTask = nil
        webRefreshTaskScope = nil

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
        // Guards against a real race exposed by Remediation Pass 3's own
        // test suite: `init()` fires this as an unawaited `Task` before
        // returning, so a caller that constructs an `AuthManager` and
        // then immediately sets state some OTHER way (tests use the
        // `#if DEBUG` `setSignedInForTesting` hook; `signIn()`/`signUp()`
        // are the real-world equivalent, though those are also async and
        // therefore don't race this the same way) can have this Task's
        // body run AFTER that, silently overwriting it back to
        // `.signedOut` the first time this function later yields on an
        // `await`. `restoreTask?.cancel()` is called by
        // `setSignedInForTesting` for exactly this reason.
        guard !Task.isCancelled else { return }
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
            let session = try await sessionExchanger.refreshSession(refreshToken: refreshToken)
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
            guard persist(session) else {
                // Partial Keychain write — never present a signed-in
                // state on top of possibly-mixed credential storage; fail
                // closed instead of guessing.
                guard isCurrentSession(userId: expectedUserId, epoch: expectedEpoch) else { return }
                terminateSession()
                return
            }
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

    /// Returns whether ALL FOUR Keychain writes succeeded. Each
    /// `KeychainHelper.save` call independently deletes-then-adds its own
    /// key, so a failure partway through can leave Keychain in a mixed
    /// state (some keys already updated, others not) — callers that care
    /// about presenting a coherent signed-in state (as opposed to
    /// `persist` call sites that only ever ran this with no real-world
    /// observed Keychain failures) check this result and fail closed
    /// rather than trust a partially-written session.
    @discardableResult
    private func persist(_ session: SupabaseSession) -> Bool {
        let a = KeychainHelper.save(session.accessToken,  key: KeychainHelper.accessTokenKey)
        let b = KeychainHelper.save(session.refreshToken, key: KeychainHelper.refreshTokenKey)
        let c = KeychainHelper.save(session.user.id,      key: KeychainHelper.userIdKey)
        let d = KeychainHelper.save(session.user.email,   key: KeychainHelper.userEmailKey)
        return a && b && c && d
    }

    /// Refreshes the Supabase session using the stored refresh token.
    /// Updates Keychain and authState with the new tokens.
    /// Returns the new access token so callers can retry immediately.
    /// Throws `SupabaseError.sessionExpired` if the refresh token is no longer valid.
    func refreshAndGetToken() async throws -> String {
        guard case .signedIn(let expectedUserId, _, _) = authState else {
            throw SupabaseError.sessionExpired
        }
        let expectedEpoch = sessionEpoch

        // Coalesce concurrent callers (e.g. two sync attempts racing a
        // 401) onto the same in-flight refresh — but ONLY if the existing
        // task is scoped to this EXACT (userId, epoch). A request for a
        // different session must never be handed a stale task's result.
        if let existing = refreshTask, let scope = refreshTaskScope,
           scope.userId == expectedUserId, scope.epoch == expectedEpoch {
            return try await existing.value
        }

        let task = Task<String, Error> { [weak self] in
            guard let self else { throw SupabaseError.sessionExpired }
            guard let refreshToken = KeychainHelper.load(key: KeychainHelper.refreshTokenKey) else {
                if self.isCurrentSession(userId: expectedUserId, epoch: expectedEpoch) {
                    self.terminateSession()
                }
                throw SupabaseError.sessionExpired
            }
            do {
                let session = try await sessionExchanger.refreshSession(refreshToken: refreshToken)
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
                guard self.persist(session) else {
                    // Partial Keychain write — fail closed rather than
                    // present a signed-in state atop mixed credentials.
                    if self.isCurrentSession(userId: expectedUserId, epoch: expectedEpoch) {
                        self.terminateSession()
                    }
                    throw SupabaseError.sessionExpired
                }
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
        refreshTaskScope = (expectedUserId, expectedEpoch)
        defer {
            if refreshTaskScope?.userId == expectedUserId, refreshTaskScope?.epoch == expectedEpoch {
                refreshTask = nil
                refreshTaskScope = nil
            }
        }
        return try await task.value
    }

    /// The ONE authoritative owner of the web-bridge `sessionRefreshed`
    /// reconciliation (Remediation Pass 3, P1-2 — moved here from
    /// `WebAppView.Coordinator`, which previously ran its OWN parallel
    /// access-token-verify + refresh-token-exchange and could be torn
    /// down mid-flight by a sign-out or a new `WebAppView` instance,
    /// discarding an exchange that may already have rotated/consumed the
    /// refresh token at Supabase). `MainTabView` never writes credentials
    /// itself — it only forwards the bridge's CLAIMED (unverified) values
    /// here.
    ///
    /// Ordering is deliberate: the access token is verified FIRST, and
    /// the refresh token is only exchanged (which can rotate/consume it
    /// at Supabase) if that verification succeeds and the claimed
    /// identity still matches the live session — never exchange a refresh
    /// token on the strength of an unverified access token alone.
    ///
    /// "Pairing" here means the access-token's verified user, the
    /// refresh-exchange's own returned user, and the bridge's claimed
    /// `userId` all agreeing — this is identity matching, not a stronger
    /// cryptographic guarantee that the two tokens were issued together
    /// as a single unit (Supabase's public API does not expose one).
    ///
    /// **Known residual gap, documented rather than silently accepted:**
    /// if the refresh exchange reaches Supabase (rotating the token) but
    /// by the time it returns a DIFFERENT account is now the live signed-
    /// in session, the rotated token is intentionally discarded rather
    /// than overwriting that other account's Keychain entries. The
    /// original account's session is not resurrected in that specific
    /// case — avoiding that entirely would need per-account Keychain
    /// storage (so a non-live account's rotated token has somewhere safe
    /// to land), which is out of scope for this pass.
    func reconcileWebRefreshedSession(claimedAccessToken: String, claimedRefreshToken: String, claimedUserId: String) {
        guard isCurrentSession(userId: claimedUserId, epoch: sessionEpoch) else { return }
        let expectedUserId = claimedUserId
        let expectedEpoch = sessionEpoch

        // Scoped exactly like `refreshTask` — a reconciliation for a
        // DIFFERENT (userId, epoch) never coalesces onto this one.
        if let scope = webRefreshTaskScope, scope.userId == expectedUserId, scope.epoch == expectedEpoch,
           webRefreshTask != nil {
            return // Already reconciling this exact session; let it finish.
        }
        webRefreshTask?.cancel()

        webRefreshTask = Task { [weak self] in
            guard let self else { return }
            do {
                // Step 1: verify the access token BEFORE touching the
                // refresh token at all.
                let verifiedAccessUser = try await self.sessionExchanger.verifiedUser(accessToken: claimedAccessToken)
                guard !Task.isCancelled else { return }
                guard self.isCurrentSession(userId: expectedUserId, epoch: expectedEpoch) else { return }
                guard verifiedAccessUser.id == expectedUserId else { return }

                // Step 2: ONLY NOW exchange the refresh token — this is
                // the point a single-use Supabase refresh token may be
                // rotated/consumed, so everything before this point must
                // already have been validated.
                let canonicalSession = try await self.sessionExchanger.refreshSession(refreshToken: claimedRefreshToken)
                guard !Task.isCancelled else { return }

                guard Self.isPairedIdentity(
                    accessUser: verifiedAccessUser.id,
                    refreshUser: canonicalSession.user.id,
                    claimedUserId: claimedUserId
                ) else { return }

                // Re-checked AGAIN after the exchange — the token may now
                // be consumed at Supabase regardless of what we do next,
                // which is exactly why this reconciliation lives in
                // AuthManager (outlives every WebView) rather than a
                // disposable Coordinator: this check happening here does
                // not depend on any WebView still being alive.
                guard self.isCurrentSession(userId: expectedUserId, epoch: expectedEpoch) else {
                    // See the documented residual gap above — the
                    // canonical (already-exchanged) session is
                    // intentionally not persisted over a different live
                    // account.
                    return
                }

                guard self.persist(canonicalSession) else {
                    // Partial Keychain write — fail closed.
                    if self.isCurrentSession(userId: expectedUserId, epoch: expectedEpoch) {
                        self.terminateSession()
                    }
                    return
                }

                self.authState = .signedIn(
                    userId: canonicalSession.user.id,
                    email: canonicalSession.user.email,
                    accessToken: canonicalSession.accessToken
                )

                // If the exchange rotated the refresh token (Supabase's
                // are single-use), the WebView's own copy is now stale —
                // silently resync it via whichever WebView is CURRENTLY
                // registered live (re-checked at write time by
                // `WebSessionBoundary`, not the WebView this message
                // originally arrived from, which may no longer exist).
                if canonicalSession.refreshToken != claimedRefreshToken {
                    WebSessionBoundary.shared.resyncCanonicalSessionIfLive(
                        accessToken: canonicalSession.accessToken,
                        refreshToken: canonicalSession.refreshToken,
                        userId: canonicalSession.user.id,
                        email: canonicalSession.user.email
                    )
                }
            } catch {
                // Verification or exchange failed — say nothing further,
                // never log the token or the error body. The refresh
                // token was never exchanged if verification itself
                // (Step 1) is what failed.
            }
        }
        webRefreshTaskScope = (expectedUserId, expectedEpoch)
    }

    /// Pure, network-free pairing predicate — exercised directly by unit
    /// tests without mocking Supabase. See `reconcileWebRefreshedSession`
    /// for what "pairing" means here.
    nonisolated static func isPairedIdentity(accessUser: String, refreshUser: String, claimedUserId: String) -> Bool {
        accessUser == refreshUser && accessUser == claimedUserId
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
        // Cancels the `init()`-fired `restoreSession()` Task — without
        // this, that Task (unawaited, still pending) can run AFTER this
        // call and silently overwrite it back to `.signedOut` the moment
        // a test's own code later yields on any `await`.
        restoreTask?.cancel()
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
