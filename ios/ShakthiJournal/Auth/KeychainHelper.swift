import Foundation
import Security

/// Thin wrapper around the iOS Keychain for storing Supabase auth tokens.
/// Tokens are stored per-device and never sync to iCloud.
enum KeychainHelper {
    private static let service = "com.shakthijournal.app"

    static let accessTokenKey   = "supabase_access_token"
    static let refreshTokenKey  = "supabase_refresh_token"
    static let userIdKey        = "supabase_user_id"
    static let userEmailKey     = "supabase_user_email"

    @discardableResult
    static func save(_ value: String, key: String) -> Bool {
        guard let data = value.data(using: .utf8) else { return false }
        let query: [CFString: Any] = [
            kSecClass:          kSecClassGenericPassword,
            kSecAttrService:    service,
            kSecAttrAccount:    key,
            kSecValueData:      data,
            // Accessible after first unlock, device only (never syncs to iCloud)
            kSecAttrAccessible: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        SecItemDelete(query as CFDictionary)
        return SecItemAdd(query as CFDictionary, nil) == errSecSuccess
    }

    static func load(key: String) -> String? {
        let query: [CFString: Any] = [
            kSecClass:       kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: key,
            kSecReturnData:  true,
            kSecMatchLimit:  kSecMatchLimitOne,
        ]
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func delete(key: String) {
        let query: [CFString: Any] = [
            kSecClass:       kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: key,
        ]
        SecItemDelete(query as CFDictionary)
    }

    /// Clears all stored auth tokens. Called on sign-out.
    static func clearSession() {
        for key in [accessTokenKey, refreshTokenKey, userIdKey, userEmailKey] {
            delete(key: key)
        }
    }
}
