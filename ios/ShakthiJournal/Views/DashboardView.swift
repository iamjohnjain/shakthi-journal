import SwiftUI

struct DashboardView: View {
    @Environment(AuthManager.self)      private var auth
    @Environment(HealthKitManager.self) private var hk
    @Environment(SyncEngine.self)       private var sync

    @State private var showPermissions = false
    @State private var showCategoryDetail = false
    @State private var showSampleDetail = false

    var body: some View {
        NavigationStack {
            ZStack {
                Color.black.ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 16) {
                        accountCard
                        healthCard
                        syncStateCard
                    }
                    .padding(.horizontal, 18)
                    .padding(.top, 8)
                    .padding(.bottom, 40)
                }
            }
            .navigationTitle("Jeevan")
            .navigationBarTitleDisplayMode(.large)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .preferredColorScheme(.dark)
            .sheet(isPresented: $showPermissions) {
                PermissionsView()
            }
        }
    }

    // MARK: - Account card

    private var accountCard: some View {
        HStack {
            VStack(alignment: .leading, spacing: 3) {
                Text("Signed in as")
                    .font(.caption)
                    .foregroundStyle(Color(white: 0.45))
                Text(auth.userEmail ?? "—")
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .foregroundStyle(.white)
            }
            Spacer()
            Button("Sign Out") { auth.signOut() }
                .font(.subheadline)
                .foregroundStyle(Color(white: 0.4))
        }
        .padding(16)
        .background(Color(white: 0.1))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    // MARK: - Health connection card (connect / sync button)

    private var healthCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            Label("Apple Health", systemImage: "heart.fill")
                .font(.subheadline)
                .fontWeight(.semibold)
                .foregroundStyle(.white)

            Divider().background(Color(white: 0.18))

            if !hk.isAvailable {
                unavailableRow
            } else if !hk.hasRequestedAuth {
                connectRow
            } else {
                syncControlRow
            }
        }
        .padding(16)
        .background(Color(white: 0.1))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var unavailableRow: some View {
        HStack(spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.yellow)
            Text("Apple Health is not available on this device. Use a real iPhone.")
                .font(.footnote)
                .foregroundStyle(Color(white: 0.6))
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var connectRow: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Connect Apple Health to automatically sync your health data to your dashboard.")
                .font(.footnote)
                .foregroundStyle(Color(white: 0.55))
                .fixedSize(horizontal: false, vertical: true)

            Button { showPermissions = true } label: {
                Label("Connect Apple Health", systemImage: "heart.text.clipboard")
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .frame(maxWidth: .infinity)
                    .frame(height: 46)
            }
            .background(LinearGradient.brand)
            .foregroundStyle(.white)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
    }

    private var syncControlRow: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Activity detail line (only while running)
            if let detail = sync.activity.detail {
                HStack(spacing: 6) {
                    ProgressView().scaleEffect(0.7).tint(Color(white: 0.5))
                    Text(detail)
                        .font(.caption)
                        .foregroundStyle(Color(white: 0.5))
                }
                .transition(.opacity)
            }

            // Sync button
            Button {
                guard let userId = auth.userId, let token = auth.accessToken else { return }
                Task { await sync.sync(userId: userId, accessToken: token, authManager: auth, healthKitManager: hk) }
            } label: {
                HStack(spacing: 8) {
                    if sync.activity.isRunning {
                        ProgressView().tint(.white).scaleEffect(0.85)
                    } else {
                        Image(systemName: "arrow.triangle.2.circlepath")
                    }
                    Text(sync.activity.isRunning ? "Syncing…" : "Sync Now")
                        .fontWeight(.semibold)
                }
                .frame(maxWidth: .infinity)
                .frame(height: 46)
            }
            .background(sync.activity.isRunning ? AnyShapeStyle(Color(white: 0.18)) : AnyShapeStyle(LinearGradient.brand))
            .foregroundStyle(.white)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .disabled(sync.activity.isRunning)
            .animation(.easeInOut(duration: 0.2), value: sync.activity.isRunning)
        }
    }

    // MARK: - Sync state card (persistent history)

    private var syncStateCard: some View {
        let state = sync.syncState

        return VStack(alignment: .leading, spacing: 0) {
            // Header
            HStack {
                Text("SYNC STATUS")
                    .font(.caption)
                    .fontWeight(.semibold)
                    .foregroundStyle(Color(white: 0.4))
                    .tracking(1)
                Spacer()
                // Dot indicator
                Circle()
                    .fill(dotColor)
                    .frame(width: 7, height: 7)
                    .padding(.trailing, 2)
            }
            .padding(.bottom, 14)

            VStack(spacing: 1) {
                // Last successful sync
                StateRow(
                    label: "Last sync",
                    value: state.lastSuccessfulSync.map(dateString) ?? "Never",
                    valueColor: state.lastSuccessfulSync == nil ? Color(white: 0.4) : .white
                )

                // Last attempt (only shown if it differs from last success, i.e. there was a failure after)
                if let attempted = state.lastAttemptedSync,
                   state.lastSuccessfulSync.map({ attempted > $0 }) == true {
                    StateRow(
                        label: "Last attempt",
                        value: dateString(attempted),
                        valueColor: .red
                    )
                }

                // Pending uploads (non-zero = last sync failed mid-upload)
                if state.pendingUploads > 0 {
                    StateRow(
                        label: "Pending",
                        value: "\(state.pendingUploads) records",
                        valueColor: .yellow
                    )
                }

                // Last upload count
                if state.lastSuccessfulSync != nil {
                    StateRow(
                        label: "Last batch",
                        value: state.lastUploadCount == 0
                            ? "Already up to date"
                            : "\(state.lastUploadCount) record\(state.lastUploadCount == 1 ? "" : "s")",
                        valueColor: .white
                    )
                }

                // Cumulative total
                if state.totalRecordsUploaded > 0 {
                    StateRow(
                        label: "Total uploaded",
                        value: "\(state.totalRecordsUploaded) records",
                        valueColor: Color(white: 0.7)
                    )
                }

                // HealthKit permission
                StateRow(
                    label: "Apple Health",
                    value: state.healthPermissionGranted
                        ? "Authorized + data received"
                        : (state.healthPermissionRequested ? "Authorized" : "Not connected"),
                    valueColor: state.healthPermissionRequested ? .green : Color(white: 0.4)
                )

                // Category summary row (only after first sync)
                if !state.categoryResults.isEmpty {
                    let connectedCount = state.categoryResults.filter { $0.status != "unavailable" }.count
                    let hasUnavailable = state.categoryResults.contains { $0.status == "unavailable" }
                    StateRow(
                        label: "Categories",
                        value: "\(connectedCount) of \(state.categoryResults.count) connected",
                        valueColor: hasUnavailable ? .yellow : .green
                    )
                }
            }

            // Category detail toggle
            if !state.categoryResults.isEmpty {
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) { showCategoryDetail.toggle() }
                } label: {
                    HStack {
                        Text("Health categories")
                            .font(.caption)
                            .foregroundStyle(Color(white: 0.38))
                        Spacer()
                        Image(systemName: showCategoryDetail ? "chevron.up" : "chevron.down")
                            .font(.caption2)
                            .foregroundStyle(Color(white: 0.3))
                    }
                    .padding(.top, 10)
                }
            }

            // Expandable per-category list
            if showCategoryDetail && !state.categoryResults.isEmpty {
                VStack(spacing: 0) {
                    ForEach(state.categoryResults, id: \.typeId) { r in
                        HStack(spacing: 8) {
                            Image(systemName: r.status == "synced" ? "checkmark.circle.fill"
                                           : r.status == "unavailable" ? "exclamationmark.circle.fill"
                                           : "circle.dotted")
                                .font(.footnote)
                                .foregroundStyle(r.status == "synced" ? .green
                                               : r.status == "unavailable" ? .yellow
                                               : Color(white: 0.35))
                            Text(r.displayName)
                                .font(.footnote)
                                .foregroundStyle(Color(white: 0.65))
                            Spacer()
                            Group {
                                if let date = r.latestDate {
                                    Text(date)
                                        .font(.caption2)
                                        .foregroundStyle(Color(white: 0.4))
                                } else {
                                    Text(r.status == "unavailable" ? "No permission" : "No data")
                                        .font(.caption2)
                                        .foregroundStyle(Color(white: 0.3))
                                }
                            }
                        }
                        .padding(.vertical, 7)
                        .overlay(alignment: .bottom) {
                            Rectangle().fill(Color(white: 0.13)).frame(height: 0.5)
                        }
                    }
                }
                .padding(.top, 8)
                .transition(.opacity.combined(with: .move(edge: .top)))
            }

            // Raw HealthKit sample diagnostics (expandable — one row per type from last sync)
            if !state.lastSampleDiagnostics.isEmpty {
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) { showSampleDetail.toggle() }
                } label: {
                    HStack {
                        Text("Raw HealthKit samples")
                            .font(.caption)
                            .foregroundStyle(Color(white: 0.38))
                        Spacer()
                        Image(systemName: showSampleDetail ? "chevron.up" : "chevron.down")
                            .font(.caption2)
                            .foregroundStyle(Color(white: 0.3))
                    }
                    .padding(.top, 10)
                }

                if showSampleDetail {
                    VStack(spacing: 0) {
                        ForEach(state.lastSampleDiagnostics) { d in
                            HStack(alignment: .top, spacing: 8) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(d.displayName)
                                        .font(.footnote)
                                        .foregroundStyle(d.sourceId == "renpho"
                                            ? Color(hex: "#30d158")
                                            : Color(white: 0.65))
                                    Text("\(d.sourceName) · \(d.sampleDate)")
                                        .font(.caption2)
                                        .foregroundStyle(Color(white: 0.38))
                                }
                                Spacer()
                                Text(formatDiagnosticValue(d))
                                    .font(.footnote)
                                    .fontWeight(.medium)
                                    .foregroundStyle(.white)
                            }
                            .padding(.vertical, 7)
                            .overlay(alignment: .bottom) {
                                Rectangle().fill(Color(white: 0.13)).frame(height: 0.5)
                            }
                        }
                    }
                    .padding(.top, 8)
                    .transition(.opacity.combined(with: .move(edge: .top)))
                }
            }

            // Partial sync warning (yellow — sync succeeded but some types were skipped)
            if let warning = state.partialSyncWarning {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(alignment: .top, spacing: 8) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .foregroundStyle(.yellow).font(.footnote).padding(.top, 1)
                        Text(warning)
                            .font(.caption2)
                            .foregroundStyle(Color(white: 0.65))
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    Button {
                        Task { await hk.requestMissingAuthorizations() }
                    } label: {
                        Label("Grant Missing Permissions", systemImage: "lock.open")
                            .font(.caption).fontWeight(.semibold)
                            .foregroundStyle(.yellow)
                    }
                }
                .padding(.top, 12)
            }

            // Session expired — show sign-in prompt, not "Try Again"
            if state.needsReauth {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(alignment: .top, spacing: 8) {
                        Image(systemName: "person.crop.circle.badge.exclamationmark")
                            .foregroundStyle(.red).font(.footnote).padding(.top, 1)
                        Text("Session expired — please sign in again to sync Apple Health.")
                            .font(.caption2)
                            .foregroundStyle(Color(white: 0.7))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Button {
                        auth.signOut()
                    } label: {
                        Label("Sign In Again", systemImage: "arrow.right.circle")
                            .font(.caption).fontWeight(.semibold)
                            .foregroundStyle(Color.brandAccent)
                    }
                }
                .padding(.top, 12)

            // Error (if last attempt failed) — raw Supabase response, no transformation
            } else if let error = state.lastError {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(alignment: .top, spacing: 8) {
                        Image(systemName: "exclamationmark.circle.fill")
                            .foregroundStyle(.red).font(.footnote).padding(.top, 1)
                        Text(error)
                            .font(.system(.caption2, design: .monospaced))
                            .foregroundStyle(Color(white: 0.7))
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    // Try Again
                    if let userId = auth.userId, let token = auth.accessToken {
                        Button {
                            Task { await sync.sync(userId: userId, accessToken: token, authManager: auth, healthKitManager: hk) }
                        } label: {
                            Label("Try Again", systemImage: "arrow.clockwise")
                                .font(.caption).fontWeight(.semibold)
                                .foregroundStyle(Color.brandAccent)
                        }
                    }
                }
                .padding(.top, 12)
            }
        }
        .padding(16)
        .background(Color(white: 0.1))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    // MARK: - Helpers

    private var dotColor: Color {
        if sync.activity.isRunning                        { return .yellow }
        if sync.syncState.needsReauth                     { return .red    }
        if sync.syncState.lastError != nil                { return .red    }
        if sync.syncState.partialSyncWarning != nil       { return .yellow }
        if sync.syncState.lastSuccessfulSync != nil       { return .green  }
        return Color(white: 0.35)
    }

    private func dateString(_ date: Date) -> String {
        date.formatted(date: .abbreviated, time: .shortened)
    }

    private func formatDiagnosticValue(_ d: SampleDiagnostic) -> String {
        let v = d.mappedValue
        let str = v == v.rounded(.towardZero) && abs(v) < 1_000_000
            ? "\(Int(v))"
            : String(format: "%.1f", v)
        return "\(str) \(d.unit)"
    }
}

// MARK: - Sub-views

private struct StateRow: View {
    let label: String
    let value: String
    var valueColor: Color = .white

    var body: some View {
        HStack {
            Text(label)
                .font(.footnote)
                .foregroundStyle(Color(white: 0.5))
            Spacer()
            Text(value)
                .font(.footnote)
                .fontWeight(.medium)
                .foregroundStyle(valueColor)
                .lineLimit(1)
                .minimumScaleFactor(0.85)
        }
        .padding(.vertical, 9)
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(Color(white: 0.15))
                .frame(height: 0.5)
        }
    }
}
