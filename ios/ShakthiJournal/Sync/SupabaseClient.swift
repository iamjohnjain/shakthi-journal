import Foundation

// MARK: - Session types

struct SupabaseSession {
    let accessToken: String
    let refreshToken: String
    let user: SupabaseUser
}

struct SupabaseUser {
    let id: String
    let email: String
}

// MARK: - Error type

enum SupabaseError: LocalizedError {
    case malformedResponse
    case httpError(statusCode: Int, body: String)

    var errorDescription: String? {
        switch self {
        case .malformedResponse:
            return "Unexpected response format from Supabase."
        case .httpError(let code, let body):
            // Auth-specific friendly messages (sign-in / sign-up flows only).
            // All other HTTP errors — including 401/403 from data endpoints — pass
            // through with the raw Supabase body so nothing is hidden from the user.
            if body.lowercased().contains("invalid login credentials") {
                return "Incorrect email or password."
            }
            if body.lowercased().contains("email not confirmed") {
                return "Please confirm your email address before signing in."
            }
            if body.lowercased().contains("user already registered") {
                return "An account with this email already exists. Try signing in instead."
            }
            if body.lowercased().contains("password should be at least") {
                return "Password must be at least 6 characters."
            }
            return "HTTP \(code): \(body)"
        }
    }
}

// MARK: - Client

/// Stateless URLSession wrapper for the Supabase REST and Auth APIs.
/// Uses the project's anon key + user JWT for authenticated requests.
/// All tables are protected by Row Level Security — the anon key alone
/// cannot read or write any user data.
enum SupabaseClient {
    private static let base    = AppConfig.supabaseURL
    private static let anonKey = AppConfig.supabaseAnonKey

    // MARK: Auth

    static func signIn(email: String, password: String) async throws -> SupabaseSession {
        let url = authURL("token?grant_type=password")
        var req = baseRequest(url, accessToken: nil)
        req.httpBody = try encode(["email": email, "password": password])
        return try await session(from: req)
    }

    /// Returns the new session if email confirmation is not required,
    /// or nil + needsConfirmation=true if the user must verify their email first.
    static func signUp(
        email: String,
        password: String
    ) async throws -> (session: SupabaseSession?, needsConfirmation: Bool) {
        let url = authURL("signup")
        var req = baseRequest(url, accessToken: nil)
        req.httpBody = try encode(["email": email, "password": password])

        let (data, response) = try await URLSession.shared.data(for: req)
        try assertSuccess(response, data: data)

        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw SupabaseError.malformedResponse
        }

        // Email confirmation not required: access_token is at the top level
        if let accessToken  = json["access_token"]  as? String,
           let refreshToken = json["refresh_token"] as? String,
           let userDict     = json["user"]          as? [String: Any],
           let userId       = userDict["id"]        as? String,
           let userEmail    = userDict["email"]     as? String {
            let sess = SupabaseSession(
                accessToken: accessToken,
                refreshToken: refreshToken,
                user: SupabaseUser(id: userId, email: userEmail)
            )
            return (session: sess, needsConfirmation: false)
        }

        // Email confirmation required: user object present but no access_token
        return (session: nil, needsConfirmation: true)
    }

    static func refreshSession(refreshToken: String) async throws -> SupabaseSession {
        let url = authURL("token?grant_type=refresh_token")
        var req = baseRequest(url, accessToken: nil)
        req.httpBody = try encode(["refresh_token": refreshToken])
        return try await session(from: req)
    }

    // MARK: Data

    /// Upserts health_metrics rows. Existing rows with the same (user_id, id)
    /// are updated. Returns the number of records sent.
    static func upsertHealthMetrics(
        _ metrics: [HealthMetric],
        userId: String,
        accessToken: String
    ) async throws -> Int {
        guard !metrics.isEmpty else { return 0 }

        let url = restURL("health_metrics")
        var req = baseRequest(url, accessToken: accessToken)
        req.setValue("resolution=merge-duplicates,return=minimal", forHTTPHeaderField: "Prefer")

        let rows = metrics.map { m in
            CloudHealthMetricRow(id: m.id, userId: userId, updatedAt: m.importedAt, data: m)
        }
        req.httpBody = try JSONEncoder().encode(rows)

        // ── REQUEST LOG ───────────────────────────────────────────────────────
        let authValue  = req.value(forHTTPHeaderField: "Authorization") ?? "MISSING"
        let apikeyValue = req.value(forHTTPHeaderField: "apikey") ?? "MISSING"

        // Show only the first 15 chars of each credential so the full token is never printed
        let authPreview   = authValue   == "MISSING" ? "⚠️  MISSING" : "\(authValue.prefix(15))…"
        let apikeyPreview = apikeyValue == "MISSING" ? "⚠️  MISSING" : "\(apikeyValue.prefix(15))…"

        // Decode the encoded body and pretty-print only the first record for inspection
        var firstRecordPretty = "<encode failed>"
        if let body = req.httpBody,
           let arr  = try? JSONSerialization.jsonObject(with: body) as? [[String: Any]],
           let first = arr.first,
           let pretty = try? JSONSerialization.data(withJSONObject: first, options: [.prettyPrinted, .sortedKeys]),
           let str = String(data: pretty, encoding: .utf8) {
            firstRecordPretty = str
        }

        print("""

        ┌─ [SupabaseClient] upsertHealthMetrics ─────────────────────────────
        │ REQUEST
        │   URL:           \(url.absoluteString)
        │   Method:        \(req.httpMethod ?? "?")
        │   Authorization: \(authPreview)
        │   apikey:        \(apikeyPreview)
        │   Content-Type:  \(req.value(forHTTPHeaderField: "Content-Type") ?? "MISSING")
        │   Prefer:        \(req.value(forHTTPHeaderField: "Prefer") ?? "MISSING")
        │   Total records: \(metrics.count)
        │   Body — record 1 of \(metrics.count):
        \(firstRecordPretty.split(separator: "\n").map { "│     \($0)" }.joined(separator: "\n"))
        │─────────────────────────────────────────────────────────────────────
        """)
        // ── END REQUEST LOG ───────────────────────────────────────────────────

        let (data, response) = try await URLSession.shared.data(for: req)

        // ── RESPONSE LOG ──────────────────────────────────────────────────────
        let status = (response as? HTTPURLResponse)?.statusCode ?? -1
        let responseBody = String(data: data, encoding: .utf8)
            .map { $0.isEmpty ? "<empty — expected for return=minimal on success>" : $0 }
            ?? "<non-UTF8 body>"
        print("""
        │ RESPONSE
        │   Status: \(status)
        │   Body:   \(responseBody)
        └─────────────────────────────────────────────────────────────────────

        """)
        // ── END RESPONSE LOG ──────────────────────────────────────────────────

        try assertSuccess(response, data: data)
        return metrics.count
    }

    // MARK: Private helpers

    private static func authURL(_ path: String) -> URL {
        URL(string: "\(base)/auth/v1/\(path)")!
    }

    private static func restURL(_ table: String) -> URL {
        URL(string: "\(base)/rest/v1/\(table)")!
    }

    private static func baseRequest(_ url: URL, accessToken: String?) -> URLRequest {
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue(anonKey, forHTTPHeaderField: "apikey")
        if let token = accessToken {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        return req
    }

    private static func encode(_ dict: [String: String]) throws -> Data {
        try JSONSerialization.data(withJSONObject: dict)
    }

    private static func session(from req: URLRequest) async throws -> SupabaseSession {
        let (data, response) = try await URLSession.shared.data(for: req)
        try assertSuccess(response, data: data)
        guard
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let accessToken  = json["access_token"]  as? String,
            let refreshToken = json["refresh_token"] as? String,
            let userDict     = json["user"]          as? [String: Any],
            let userId       = userDict["id"]        as? String,
            let email        = userDict["email"]     as? String
        else { throw SupabaseError.malformedResponse }

        return SupabaseSession(
            accessToken: accessToken,
            refreshToken: refreshToken,
            user: SupabaseUser(id: userId, email: email)
        )
    }

    private static func assertSuccess(_ response: URLResponse, data: Data? = nil) throws {
        guard let http = response as? HTTPURLResponse else { throw SupabaseError.malformedResponse }
        guard (200..<300).contains(http.statusCode) else {
            let body = data.flatMap { String(data: $0, encoding: .utf8) } ?? "HTTP \(http.statusCode)"
            throw SupabaseError.httpError(statusCode: http.statusCode, body: body)
        }
    }
}

// MARK: - Row shape

/// Matches the schema of the Supabase health_metrics table:
/// (id TEXT, user_id UUID, updated_at TIMESTAMPTZ, data JSONB)
private struct CloudHealthMetricRow: Encodable {
    let id: String
    let userId: String
    let updatedAt: String
    let data: HealthMetric

    enum CodingKeys: String, CodingKey {
        case id
        case userId    = "user_id"
        case updatedAt = "updated_at"
        case data
    }
}
