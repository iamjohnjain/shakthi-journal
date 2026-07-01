import Foundation

/// Reads Supabase credentials injected from Secrets.xcconfig via Info.plist build settings.
/// Never crashes — instead, `isConfigured` returns false, and ContentView shows ConfigurationView.
enum AppConfig {
    static var supabaseURL: String {
        (Bundle.main.object(forInfoDictionaryKey: "SUPABASE_URL") as? String) ?? ""
    }

    static var supabaseAnonKey: String {
        (Bundle.main.object(forInfoDictionaryKey: "SUPABASE_ANON_KEY") as? String) ?? ""
    }

    /// True only when both values are present and not placeholder strings.
    static var isConfigured: Bool {
        let url = supabaseURL
        let key = supabaseAnonKey
        return !url.isEmpty
            && !url.hasPrefix("https://your-project")
            && url.hasPrefix("https://")
            && !key.isEmpty
            && !key.hasPrefix("your-anon-key")
            && key.count > 20
    }
}
