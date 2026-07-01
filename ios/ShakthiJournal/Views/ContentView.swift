import SwiftUI

/// Root view — checks configuration first, then gates on auth state.
/// Never crashes: missing Supabase config shows ConfigurationView instead.
struct ContentView: View {
    @Environment(AuthManager.self) private var auth

    var body: some View {
        Group {
            if !AppConfig.isConfigured {
                // Supabase credentials missing or placeholder — show setup instructions
                ConfigurationView()

            } else {
                switch auth.authState {
                case .loading:
                    ZStack {
                        Color.black.ignoresSafeArea()
                        ProgressView()
                            .tint(Color(hex: "#1a6ef5"))
                            .scaleEffect(1.2)
                    }

                case .signedOut:
                    SignInView()
                        .transition(.opacity)

                case .signedIn:
                    MainTabView()
                        .transition(.opacity)
                }
            }
        }
        .animation(.easeInOut(duration: 0.25), value: auth.isSignedIn)
    }
}
