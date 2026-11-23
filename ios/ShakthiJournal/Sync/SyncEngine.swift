import Foundation
import Observation

// MARK: - Notification

extension Notification.Name {
    /// Posted on the main thread after a successful HealthKit sync.
    /// `userInfo["metrics"]` is `[HealthMetric]` — the records that were
    /// uploaded. `userInfo["userId"]`/`userInfo["epoch"]` identify exactly
    /// which signed-in session this sync ran for — `WebAppView.Coordinator`
    /// requires both to match its OWN expected (userId, epoch) pair (via
    /// `isValidSession`), in addition to its usual liveness check, before
    /// injecting anything into IndexedDB. Without this, a sync started for
    /// account A that completes after account B has become the active
    /// session would otherwise inject A's data into B's WebView — this is
    /// what actually prevents that, not just a generic "is some WebView
    /// live" check.
    static let jeevanNativeSyncComplete = Notification.Name("Jeevan.NativeSyncComplete")
}

@MainActor
@Observable
final class SyncEngine {

    // MARK: - Transient activity (drives button state and loading UI)

    enum Activity: Equatable {
        case idle
        case running(detail: String)

        var isRunning: Bool {
            if case .running = self { return true }
            return false
        }

        var detail: String? {
            if case .running(let d) = self { return d }
            return nil
        }
    }

    // MARK: - Properties

    /// Transient: what is happening right now
    var activity: Activity = .idle

    /// Persistent: full sync history, loaded from UserDefaults on init
    private(set) var syncState: SyncState = SyncStateStore.load()

    // MARK: - Public API

    func sync(
        userId: String,
        accessToken: String,
        authManager: AuthManager,
        healthKitManager: HealthKitManager
    ) async {
        guard !activity.isRunning else { return }

        // Captured at the very start — every await below re-checks this
        // against AuthManager's LIVE state before touching persisted sync
        // state or posting the completion notification. A sign-out, or a
        // second identity signing in, partway through this sync must stop
        // it from ever uploading-as or injecting-into the wrong account.
        guard let expectedEpoch = currentEpoch(for: userId, authManager: authManager) else { return }
        func stillValid() -> Bool { authManager.isCurrentSession(userId: userId, epoch: expectedEpoch) }

        // nil means "no lower bound" — on the very first sync (no lastSuccessfulSync
        // yet), pull everything Apple Health has stored, however far back that goes.
        let since: Date? = syncState.lastSuccessfulSync

        // Record the attempt immediately so it's visible even if we fail fast
        syncState.lastAttemptedSync       = Date()
        syncState.healthPermissionRequested = healthKitManager.hasRequestedAuth
        SyncStateStore.save(syncState)

        do {
            activity = .running(detail: "Reading Apple Health…")
            let (metrics, typeResults) = await healthKitManager.fetchSamplesWithStatus(since: since)
            guard stillValid() else { activity = .idle; return }

            // Build and persist category results regardless of whether we have data to upload
            let categoryResults = buildCategoryResults(from: typeResults, metrics: metrics)
            syncState.categoryResults = categoryResults

            let unavailableCount = categoryResults.filter { $0.status == "unavailable" }.count
            let totalCount = categoryResults.count
            let partialWarning: String? = unavailableCount > 0
                ? "\(unavailableCount) of \(totalCount) \(unavailableCount == 1 ? "category needs" : "categories need") permission. Tap 'Grant Missing Permissions' to update."
                : nil

            guard !metrics.isEmpty else {
                markSuccess(uploadCount: 0, partialWarning: partialWarning, userId: userId, epoch: expectedEpoch)
                return
            }

            // Mark as pending before the network call so a crash mid-upload is visible
            syncState.pendingUploads = metrics.count
            SyncStateStore.save(syncState)

            activity = .running(detail: "Uploading \(metrics.count) records…")
            let uploaded = try await upload(metrics, userId: userId, accessToken: accessToken, authManager: authManager)
            guard stillValid() else { activity = .idle; return }

            markSuccess(uploadCount: uploaded, metrics: metrics, typeResults: typeResults, partialWarning: partialWarning, userId: userId, epoch: expectedEpoch)
        } catch SupabaseError.sessionExpired {
            guard stillValid() else { activity = .idle; return }
            syncState.lastError      = SupabaseError.sessionExpired.localizedDescription
            syncState.needsReauth    = true
            syncState.pendingUploads = 0
            SyncStateStore.save(syncState)
            activity = .idle
        } catch {
            guard stillValid() else { activity = .idle; return }
            syncState.lastError      = error.localizedDescription
            syncState.needsReauth    = false
            syncState.pendingUploads = 0
            SyncStateStore.save(syncState)
            activity = .idle
        }
    }

    private func currentEpoch(for userId: String, authManager: AuthManager) -> Int? {
        let epoch = authManager.sessionEpoch
        return authManager.isCurrentSession(userId: userId, epoch: epoch) ? epoch : nil
    }

    // MARK: - Private

    private func buildCategoryResults(from typeResults: [TypeFetchResult], metrics: [HealthMetric]) -> [CategorySyncResult] {
        typeResults.map { r in
            let typeMetrics = metrics.filter { $0.type == r.typeId }
            return CategorySyncResult(
                typeId: r.typeId,
                displayName: r.displayName,
                status: r.hasError ? "unavailable" : typeMetrics.isEmpty ? "no_data" : "synced",
                recordCount: typeMetrics.count,
                latestDate: typeMetrics.max { $0.date < $1.date }?.date ?? r.latestDate,
                skipReason: r.errorDescription
            )
        }
    }

    /// Uploads metrics, refreshing the JWT and retrying once on HTTP 401.
    private func upload(
        _ metrics: [HealthMetric],
        userId: String,
        accessToken: String,
        authManager: AuthManager
    ) async throws -> Int {
        do {
            return try await SupabaseClient.upsertHealthMetrics(metrics, userId: userId, accessToken: accessToken)
        } catch SupabaseError.httpError(let code, _) where code == 401 {
            activity = .running(detail: "Refreshing auth token…")
            let newToken = try await authManager.refreshAndGetToken()
            return try await SupabaseClient.upsertHealthMetrics(metrics, userId: userId, accessToken: newToken)
        }
    }

    private func markSuccess(
        uploadCount: Int,
        metrics: [HealthMetric] = [],
        typeResults: [TypeFetchResult] = [],
        partialWarning: String? = nil,
        userId: String,
        epoch: Int
    ) {
        let now = Date()
        syncState.lastSuccessfulSync     = now
        syncState.lastAttemptedSync      = now
        syncState.lastError              = nil
        syncState.needsReauth            = false
        syncState.partialSyncWarning     = partialWarning
        syncState.pendingUploads         = 0
        syncState.lastUploadCount        = uploadCount
        syncState.totalRecordsUploaded  += uploadCount
        if !metrics.isEmpty {
            syncState.healthPermissionGranted = true
            syncState.lastSampleDiagnostics = buildSampleDiagnostics(from: metrics, typeResults: typeResults)
        }
        SyncStateStore.save(syncState)
        activity = .idle
        // Notify WebAppView.Coordinator — always, even with zero new metrics.
        // A sync that finds nothing new (the normal steady state once a user
        // is already caught up) is still a real, successful sync; the web
        // side's "last synced" chip needs to hear about it too, not just the
        // runs that happen to carry new records to inject into IndexedDB.
        NotificationCenter.default.post(
            name: .jeevanNativeSyncComplete,
            object: nil,
            userInfo: ["metrics": metrics, "userId": userId, "epoch": epoch]
        )
    }

    /// Builds one diagnostic entry per type using the most recent mapped metric for that type.
    private func buildSampleDiagnostics(from metrics: [HealthMetric], typeResults: [TypeFetchResult]) -> [SampleDiagnostic] {
        typeResults.compactMap { r in
            let typeMetrics = metrics.filter { $0.type == r.typeId }
            guard let latest = typeMetrics.max(by: { $0.date < $1.date }) else { return nil }
            return SampleDiagnostic(
                typeId: r.typeId,
                displayName: r.displayName,
                mappedValue: latest.value,
                unit: latest.unit,
                sourceName: latest.sourceName,
                sourceId: latest.sourceId,
                sampleDate: latest.date
            )
        }
    }
}
