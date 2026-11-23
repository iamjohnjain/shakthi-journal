import XCTest
@testable import Jeevan

/// Deterministic tests for the session-epoch/identity guarding added in
/// Milestone 1B Remediation #2 to `AuthManager`. These do NOT hit the
/// real Supabase network (which the full `restoreSession()`/
/// `refreshAndGetToken()` round trips do) — instead they exercise the
/// exact guard PREDICATE (`isCurrentSession`) those methods check after
/// every `await`, via a `#if DEBUG`-only test hook
/// (`setSignedInForTesting`) that sets signed-in state directly. Testing
/// the predicate is testing the real guard condition those methods use
/// verbatim; it is not a substitute for a live network race, which this
/// suite does not attempt to reproduce (see docs/APP_STORE_READINESS.md
/// for the honest distinction).
///
/// `applyWebRefreshedSession` IS exercised end-to-end as real production
/// code below (it needs no network — it's the synchronous, already-
/// locally-verified half of the `sessionRefreshed` bridge path), so those
/// two tests are genuine functional regression tests, not predicate-only.
@MainActor
final class AuthManagerRaceTests: XCTestCase {

    override func tearDown() {
        KeychainHelper.clearSession()
        super.tearDown()
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

    // MARK: - applyWebRefreshedSession: real production code, no network needed

    func test_applyWebRefreshedSession_afterSignOut_cannotRepopulateKeychain() {
        let auth = AuthManager()
        auth.setSignedInForTesting(userId: "user-A", email: "a@example.com", accessToken: "tok-a")
        auth.signOut()

        // A sync-triggered (or any other) web token refresh for the now-
        // signed-out account arriving late must not write anything.
        auth.applyWebRefreshedSession(
            accessToken: "late-access-token",
            refreshToken: "late-refresh-token",
            userId: "user-A",
            email: "a@example.com"
        )

        XCTAssertFalse(auth.isSignedIn)
        XCTAssertNotEqual(KeychainHelper.load(key: KeychainHelper.accessTokenKey), "late-access-token")
    }

    func test_applyWebRefreshedSession_afterAccountBSignsIn_cannotOverwriteB() {
        let auth = AuthManager()
        auth.setSignedInForTesting(userId: "user-A", email: "a@example.com", accessToken: "tok-a")
        auth.setSignedInForTesting(userId: "user-B", email: "b@example.com", accessToken: "tok-b")

        // A late refresh for account A, arriving after B is already the
        // live session, must be rejected — not overwrite B's state.
        auth.applyWebRefreshedSession(
            accessToken: "late-a-access-token",
            refreshToken: "late-a-refresh-token",
            userId: "user-A",
            email: "a@example.com"
        )

        XCTAssertEqual(auth.userId, "user-B")
        XCTAssertEqual(auth.accessToken, "tok-b")
    }

    func test_applyWebRefreshedSession_matchingLiveUser_accepted() {
        let auth = AuthManager()
        auth.setSignedInForTesting(userId: "user-A", email: "a@example.com", accessToken: "tok-a")

        auth.applyWebRefreshedSession(
            accessToken: "new-access-token",
            refreshToken: "new-refresh-token",
            userId: "user-A",
            email: "a@example.com"
        )

        XCTAssertEqual(auth.accessToken, "new-access-token")
        XCTAssertEqual(KeychainHelper.load(key: KeychainHelper.accessTokenKey), "new-access-token")
    }
}
