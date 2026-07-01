import SwiftUI

@main
struct ShakthiJournalApp: App {
    @State private var authManager     = AuthManager()
    @State private var healthKitManager = HealthKitManager()
    @State private var syncEngine      = SyncEngine()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(authManager)
                .environment(healthKitManager)
                .environment(syncEngine)
        }
    }
}
