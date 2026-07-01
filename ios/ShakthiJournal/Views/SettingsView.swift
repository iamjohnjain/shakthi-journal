import SwiftUI

struct SettingsView: View {
    @Environment(AuthManager.self) private var auth
    @Environment(SyncEngine.self)  private var sync

    var body: some View {
        NavigationStack {
            ZStack {
                Color.black.ignoresSafeArea()

                List {
                    // Account
                    Section("Account") {
                        LabeledRow(
                            label: "Signed in as",
                            icon: "person.circle",
                            value: auth.userEmail ?? "—"
                        )

                        Button(role: .destructive) {
                            auth.signOut()
                        } label: {
                            Label("Sign Out", systemImage: "rectangle.portrait.and.arrow.right")
                        }
                    }

                    // Sync summary
                    Section("Last Sync") {
                        let state = sync.syncState
                        LabeledRow(
                            label: "Last successful sync",
                            icon: "checkmark.circle",
                            value: state.lastSuccessfulSync.map(dateString) ?? "Never"
                        )
                        LabeledRow(
                            label: "Total records uploaded",
                            icon: "arrow.up.circle",
                            value: state.totalRecordsUploaded > 0
                                ? "\(state.totalRecordsUploaded) records"
                                : "None yet"
                        )
                    }

                    // App info
                    Section("About") {
                        LabeledRow(label: "App",       icon: "app",         value: "Shakthi Journal")
                        LabeledRow(label: "Version",   icon: "number",       value: "iOS 2.0")
                        LabeledRow(label: "Platform",  icon: "globe",        value: "shakthi-journal.pages.dev")
                    }
                }
                .scrollContentBackground(.hidden)
                .listStyle(.insetGrouped)
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.large)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .preferredColorScheme(.dark)
        }
    }

    private func dateString(_ date: Date) -> String {
        date.formatted(date: .abbreviated, time: .shortened)
    }
}

// MARK: - Sub-view

private struct LabeledRow: View {
    let label: String
    let icon:  String
    let value: String

    var body: some View {
        HStack {
            Label(label, systemImage: icon)
                .foregroundStyle(Color(white: 0.6))
            Spacer()
            Text(value)
                .foregroundStyle(Color(white: 0.85))
                .font(.footnote)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
    }
}
