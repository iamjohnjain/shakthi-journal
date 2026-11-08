import SwiftUI

@main
struct ShakthiJournalApp: App {
    @State private var authManager     = AuthManager()
    @State private var healthKitManager = HealthKitManager()
    @State private var syncEngine      = SyncEngine()
    @State private var deepLinkManager = DeepLinkManager()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(authManager)
                .environment(healthKitManager)
                .environment(syncEngine)
                .environment(deepLinkManager)
                .onOpenURL { url in
                    deepLinkManager.handle(url)
                }
        }
    }
}
