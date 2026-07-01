import SwiftUI

/// Shown instead of the sign-in screen when Supabase credentials are not configured.
/// This replaces fatalError() — the app never crashes because of a missing xcconfig.
struct ConfigurationView: View {
    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Spacer().frame(height: 60)

                    // Header
                    VStack(alignment: .leading, spacing: 12) {
                        Image(systemName: "wrench.and.screwdriver.fill")
                            .font(.system(size: 36))
                            .foregroundStyle(Color(hex: "#ff9f0a"))

                        Text("Configuration Required")
                            .font(.system(size: 24, weight: .bold))
                            .foregroundStyle(.white)

                        Text("Supabase credentials are missing. The app needs a URL and anon key to connect to your Shakthi Journal account.")
                            .font(.subheadline)
                            .foregroundStyle(Color(white: 0.55))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(.bottom, 32)

                    // Current values (diagnostic)
                    VStack(alignment: .leading, spacing: 0) {
                        configLabel("CURRENT VALUES")

                        ConfigRow(label: "SUPABASE_URL",      value: AppConfig.supabaseURL,      ok: !AppConfig.supabaseURL.isEmpty && AppConfig.supabaseURL.hasPrefix("https://") && !AppConfig.supabaseURL.hasPrefix("https://your-"))
                        ConfigRow(label: "SUPABASE_ANON_KEY", value: masked(AppConfig.supabaseAnonKey), ok: !AppConfig.supabaseAnonKey.isEmpty && !AppConfig.supabaseAnonKey.hasPrefix("your-anon"))
                    }
                    .padding(.bottom, 28)

                    // Steps
                    VStack(alignment: .leading, spacing: 0) {
                        configLabel("HOW TO FIX")

                        VStack(alignment: .leading, spacing: 16) {
                            Step(n: 1, text: "Get your values from Supabase Dashboard → Project Settings → API")
                            Step(n: 2, text: "In Terminal:\ncp ios/ShakthiJournal/Config/Secrets.xcconfig.template\\\n   ios/ShakthiJournal/Config/Secrets.xcconfig")
                            Step(n: 3, text: "Open Secrets.xcconfig and replace the placeholder values with your real URL and anon key")
                            Step(n: 4, text: "In Xcode: click the project → Info tab → Configurations → set Secrets.xcconfig for Debug and Release")
                            Step(n: 5, text: "Press ⌘R to rebuild — this screen will not appear again")
                        }
                    }
                    .padding(.bottom, 28)

                    // Docs link note
                    HStack(spacing: 6) {
                        Image(systemName: "doc.text")
                            .foregroundStyle(Color(white: 0.35))
                        Text("Full instructions in docs/IOS_COMPANION_SETUP.md")
                            .font(.caption)
                            .foregroundStyle(Color(white: 0.35))
                    }

                    Spacer().frame(height: 40)
                }
                .padding(.horizontal, 24)
            }
        }
        .preferredColorScheme(.dark)
    }

    private func masked(_ s: String) -> String {
        guard s.count > 8 else { return s.isEmpty ? "(empty)" : s }
        return String(s.prefix(6)) + "…" + String(s.suffix(4))
    }

    private func configLabel(_ text: String) -> some View {
        Text(text)
            .font(.caption)
            .fontWeight(.semibold)
            .foregroundStyle(Color(white: 0.4))
            .tracking(1)
            .padding(.bottom, 10)
    }
}

private struct ConfigRow: View {
    let label: String
    let value: String
    let ok: Bool

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: ok ? "checkmark.circle.fill" : "xmark.circle.fill")
                .foregroundStyle(ok ? .green : .red)
                .frame(width: 18)
                .padding(.top, 1)
            VStack(alignment: .leading, spacing: 2) {
                Text(label)
                    .font(.caption)
                    .foregroundStyle(Color(white: 0.45))
                Text(value.isEmpty ? "(empty)" : value)
                    .font(.system(.caption, design: .monospaced))
                    .foregroundStyle(Color(white: 0.75))
                    .lineLimit(2)
            }
        }
        .padding(.vertical, 10)
        .padding(.horizontal, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(white: 0.1))
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .padding(.bottom, 6)
    }
}

private struct Step: View {
    let n: Int
    let text: String

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Text("\(n)")
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(Color(hex: "#1a6ef5"))
                .frame(width: 22, height: 22)
                .background(Color(hex: "#1a6ef5").opacity(0.15))
                .clipShape(Circle())

            Text(text)
                .font(.subheadline)
                .foregroundStyle(Color(white: 0.7))
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}
