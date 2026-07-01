import SwiftUI

/// Root view shown when the user is signed in.
///
/// The web app is the single navigation system (Today / Train / Eat / Goals / Me).
/// Health sync lives in the web app's Settings → Integrations → "Apple Health Sync",
/// which calls window.webkit.messageHandlers.shakthiNative.postMessage({ type: 'openHealthSync' })
/// and we open DashboardView as a sheet in response.
struct MainTabView: View {

    @Environment(AuthManager.self) private var auth

    @State private var showHealthSync = false

    var body: some View {
        webContent
            .sheet(isPresented: $showHealthSync) {
                DashboardView()
            }
            .preferredColorScheme(.dark)
    }

    // MARK: - Web content

    @ViewBuilder private var webContent: some View {
        if let token   = auth.accessToken,
           let refresh = KeychainHelper.load(key: KeychainHelper.refreshTokenKey),
           let uid     = auth.userId,
           let email   = auth.userEmail {

            WebAppView(
                accessToken:  token,
                refreshToken: refresh,
                userId:       uid,
                userEmail:    email,
                onMessage:    handleWebMessage
            )
            .ignoresSafeArea(edges: .top)

        } else {
            Color.black
                .ignoresSafeArea()
                .overlay(ProgressView().tint(.white))
        }
    }

    // MARK: - Native bridge handler

    private func handleWebMessage(_ message: [String: Any]) {
        guard let type = message["type"] as? String else { return }
        switch type {
        case "openHealthSync":
            showHealthSync = true
        default:
            break
        }
    }
}
