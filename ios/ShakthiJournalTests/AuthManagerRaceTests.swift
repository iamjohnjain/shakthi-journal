import XCTest
@testable import Jeevan

/// Deterministic tests for the session-epoch/identity guarding added in
/// Milestone 1B Remediation #2 and extended in Remediation #3 to
/// `AuthManager`. None of these hit the real Supabase network — the
/// `restoreSession()`/`refreshAndGetToken()` guard-predicate tests use a
/// `#if DEBUG`-only test hook (`setSignedInForTesting`) that sets
/// signed-in state directly, and the `reconcileWebRefreshedSession` tests
/// inject a `MockSupabaseSessionExchanger` (Remediation Pass 3) in place
/// of the real, network-backed `LiveSupabaseSessionExchanger` — this is
/// what makes `reconcileWebRefreshedSession` (which itself calls Supabase
/// to verify an access token AND exchange a refresh token) genuinely
/// testable without a live network at all.
@MainActor
final class AuthManagerRaceTests: XCTestCase {

    override func tearDown() {
        KeychainHelper.clearSession()
        super.tearDown()
    }

    // MARK: - Mock session exchanger

    /// Configurable, network-free stand-in for `SupabaseSessionExchanging`.
    /// Each call increments its own counter so tests can assert exactly
    /// how many times (if any) the refresh token was actually exchanged —
    /// central to proving ordering (P1-2: verify BEFORE exchange).
    final class MockSupabaseSessionExchanger: SupabaseSessionExchanging {
        enum Result<T> {
            case success(T)
            case failure(Error)
        }
        struct DummyError: Error {}

        var verifiedUserResult: Result<SupabaseUser> = .failure(DummyError())
        var refreshSessionResult: Result<SupabaseSession> = .failure(DummyError())
        private(set) var verifiedUserCallCount = 0
        private(set) var refreshSessionCallCount = 0

        /// Optional hook run synchronously the instant `refreshSession`
        /// is invoked, BEFORE it returns its configured result — lets a
        /// test simulate "the sign-out/account-switch happens exactly
        /// while the exchange is in flight."
        var onRefreshSessionCalled: (() -> Void)?

        func verifiedUser(accessToken: String) async throws -> SupabaseUser {
            verifiedUserCallCount += 1
            switch verifiedUserResult {
            case .success(let u): return u
            case .failure(let e): throw e
            }
        }

        func refreshSession(refreshToken: String) async throws -> SupabaseSession {
            refreshSessionCallCount += 1
            onRefreshSessionCalled?()
            switch refreshSessionResult {
            case .success(let s): return s
            case .failure(let e): throw e
            }
        }
    }

    private func pollUntil(timeoutSeconds: Double = 2, _ condition: () -> Bool) async {
        let deadline = Date().addingTimeInterval(timeoutSeconds)
        while !condition(), Date() < deadline {
            try? await Task.sleep(nanoseconds: 10_000_000)
        }
    }

    // MARK: - isCurrentSession guard predicate (used verbatim by
    // restoreSession() and refreshAndGetToken() after every await)

    func test_guard_restoreThenSignOut_lateSuccessCannotRestoreCredentials() {
        let auth = AuthManager()
        auth.setSignedInForTesting(userId: "user-A", email: "a@example.com", accessToken: "tok-a")
        let capturedEpoch = auth.sessionEpoch

        auth.signOut()

        // This is exactly the check `restoreSession()`/`refreshAndGetToken()`
        // perform after their `await` before persisting anything — a late
        // success arriving after sign-out must see this as false.
        XCTAssertFalse(auth.isCurrentSession(userId: "user-A", epoch: capturedEpoch))
    }

    func test_guard_accountBSignsIn_lateASuccessCannotOverwriteB() {
        let auth = AuthManager()
        auth.setSignedInForTesting(userId: "user-A", email: "a@example.com", accessToken: "tok-a")
        let capturedEpochA = auth.sessionEpoch

        // Account B signs in — note this does NOT bump sessionEpoch (only
        // sign-out/forced-logout does), so the userId mismatch alone is
        // what the guard must catch.
        auth.setSignedInForTesting(userId: "user-B", email: "b@example.com", accessToken: "tok-b")

        XCTAssertFalse(auth.isCurrentSession(userId: "user-A", epoch: capturedEpochA))
        XCTAssertTrue(auth.isCurrentSession(userId: "user-B", epoch: auth.sessionEpoch))
    }

    func test_guard_lateAFailure_cannotBeMistakenForLiveB() {
        let auth = AuthManager()
        auth.setSignedInForTesting(userId: "user-A", email: "a@example.com", accessToken: "tok-a")
        let capturedEpochA = auth.sessionEpoch

        auth.setSignedInForTesting(userId: "user-B", email: "b@example.com", accessToken: "tok-b")

        // `refreshAndGetToken()`'s 400/401 catch block guards its
        // `terminateSession()` call on exactly this predicate — false
        // here means that call is skipped, so a late failure that
        // belonged to account A's refresh can never sign account B out.
        XCTAssertFalse(auth.isCurrentSession(userId: "user-A", epoch: capturedEpochA))
        XCTAssertTrue(auth.isSignedIn)
        XCTAssertEqual(auth.userId, "user-B")
    }

    // MARK: - reconcileWebRefreshedSession: real production code, mocked network (P1-2)

    func test_reconcile_accessValidationFailure_neverExchangesRefreshToken() async {
        let mock = MockSupabaseSessionExchanger()
        mock.verifiedUserResult = .failure(MockSupabaseSessionExchanger.DummyError())
        let auth = AuthManager(sessionExchanger: mock)
        auth.setSignedInForTesting(userId: "user-A", email: "a@example.com", accessToken: "tok-a")

        auth.reconcileWebRefreshedSession(
            claimedAccessToken: "bad-access", claimedRefreshToken: "rt-a", claimedUserId: "user-A"
        )
        await pollUntil { mock.verifiedUserCallCount > 0 }
        // Give a second mock dispatch cycle a chance in case exchange
        // were (incorrectly) also fired.
        try? await Task.sleep(nanoseconds: 50_000_000)

        XCTAssertEqual(mock.verifiedUserCallCount, 1)
        XCTAssertEqual(mock.refreshSessionCallCount, 0, "A failed access-token verification must never reach the refresh-token exchange")
    }

    func test_reconcile_signOutDuringRefreshExchange_cannotRepopulateKeychain() async {
        let mock = MockSupabaseSessionExchanger()
        mock.verifiedUserResult = .success(SupabaseUser(id: "user-A", email: "a@example.com"))
        mock.refreshSessionResult = .success(SupabaseSession(
            accessToken: "canonical-at", refreshToken: "canonical-rt",
            user: SupabaseUser(id: "user-A", email: "a@example.com")
        ))
        let auth = AuthManager(sessionExchanger: mock)
        auth.setSignedInForTesting(userId: "user-A", email: "a@example.com", accessToken: "tok-a")

        // Sign out at the EXACT moment the refresh exchange reaches
        // "Supabase" (simulated) — this is the P1-2 scenario: the
        // exchange may have already rotated the token server-side by the
        // time this fires.
        mock.onRefreshSessionCalled = { [weak auth] in auth?.signOut() }

        auth.reconcileWebRefreshedSession(
            claimedAccessToken: "tok-a", claimedRefreshToken: "rt-a", claimedUserId: "user-A"
        )
        await pollUntil { mock.refreshSessionCallCount > 0 }
        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertFalse(auth.isSignedIn)
        XCTAssertNotEqual(KeychainHelper.load(key: KeychainHelper.accessTokenKey), "canonical-at")
    }

    func test_reconcile_accountBSignsInWhileAPending_cannotOverwriteB() async {
        let mock = MockSupabaseSessionExchanger()
        mock.verifiedUserResult = .success(SupabaseUser(id: "user-A", email: "a@example.com"))
        mock.refreshSessionResult = .success(SupabaseSession(
            accessToken: "canonical-at-a", refreshToken: "canonical-rt-a",
            user: SupabaseUser(id: "user-A", email: "a@example.com")
        ))
        let auth = AuthManager(sessionExchanger: mock)
        auth.setSignedInForTesting(userId: "user-A", email: "a@example.com", accessToken: "tok-a")

        mock.onRefreshSessionCalled = { [weak auth] in
            auth?.setSignedInForTesting(userId: "user-B", email: "b@example.com", accessToken: "tok-b")
        }

        auth.reconcileWebRefreshedSession(
            claimedAccessToken: "tok-a", claimedRefreshToken: "rt-a", claimedUserId: "user-A"
        )
        await pollUntil { mock.refreshSessionCallCount > 0 }
        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(auth.userId, "user-B")
        XCTAssertEqual(auth.accessToken, "tok-b")
    }

    func test_reconcile_matchingLiveSession_persistsCanonicalTokens() async {
        let mock = MockSupabaseSessionExchanger()
        mock.verifiedUserResult = .success(SupabaseUser(id: "user-A", email: "a@example.com"))
        mock.refreshSessionResult = .success(SupabaseSession(
            accessToken: "canonical-at", refreshToken: "canonical-rt",
            user: SupabaseUser(id: "user-A", email: "a@example.com")
        ))
        let auth = AuthManager(sessionExchanger: mock)
        auth.setSignedInForTesting(userId: "user-A", email: "a@example.com", accessToken: "tok-a")

        auth.reconcileWebRefreshedSession(
            claimedAccessToken: "tok-a", claimedRefreshToken: "rt-a", claimedUserId: "user-A"
        )
        await pollUntil { auth.accessToken == "canonical-at" }

        XCTAssertEqual(auth.accessToken, "canonical-at")
        XCTAssertEqual(KeychainHelper.load(key: KeychainHelper.accessTokenKey), "canonical-at")
        XCTAssertEqual(KeychainHelper.load(key: KeychainHelper.refreshTokenKey), "canonical-rt")
    }

    func test_reconcile_unrelatedRefreshTokenExchangesToOtherUser_rejected() async {
        // The access token verifies for user-A, but the refresh token
        // (garbage, or simply not user-A's) exchanges to a DIFFERENT
        // user entirely — this must be rejected outright, never persisted.
        let mock = MockSupabaseSessionExchanger()
        mock.verifiedUserResult = .success(SupabaseUser(id: "user-A", email: "a@example.com"))
        mock.refreshSessionResult = .success(SupabaseSession(
            accessToken: "canonical-at", refreshToken: "canonical-rt",
            user: SupabaseUser(id: "user-UNRELATED", email: "x@example.com")
        ))
        let auth = AuthManager(sessionExchanger: mock)
        auth.setSignedInForTesting(userId: "user-A", email: "a@example.com", accessToken: "tok-a")

        auth.reconcileWebRefreshedSession(
            claimedAccessToken: "tok-a", claimedRefreshToken: "unrelated-rt", claimedUserId: "user-A"
        )
        await pollUntil { mock.refreshSessionCallCount > 0 }
        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(auth.accessToken, "tok-a", "The original token must remain untouched")
        XCTAssertNotEqual(KeychainHelper.load(key: KeychainHelper.accessTokenKey), "canonical-at")
    }
}
