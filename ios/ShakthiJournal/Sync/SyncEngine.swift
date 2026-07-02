import Foundation
import Observation

// MARK: - Notification

extension Notification.Name {
    /// Posted on the main thread after a successful HealthKit sync.
    /// `userInfo["metrics"]` is `[HealthMetric]` — the records that were uploaded.
    /// WebAppView.Coordinator listens for this and injects the records into IndexedDB.
    static let shakthiNativeSyncComplete = Notification.Name("ShakthiJournal.NativeSyncComplete")
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

    /// How many days back to look on the very first sync (before any lastSuccessfulSync)
    var initialWindowDays = 30

    // MARK: - Public API

    func sync(
        userId: String,
        accessToken: String,
        authManager: AuthManager,
        healthKitManager: HealthKitManager
    ) async {
        guard !activity.isRunning else { return }

        let since: Date = syncState.lastSuccessfulSync
            ?? Calendar.current.date(byAdding: .day, value: -initialWindowDays, to: Date())
            ?? Date()

        // Record the attempt immediately so it's visible even if we fail fast
        syncState.lastAttemptedSync       = Date()
        syncState.healthPermissionRequested = healthKitManager.hasRequestedAuth
        SyncStateStore.save(syncState)

        do {
            activity = .running(detail: "Reading Apple Health…")
            let (metrics, typeResults) = await healthKitManager.fetchSamplesWithStatus(since: since)

            // Build and persist category results regardless of whether we have data to upload
            let categoryResults = buildCategoryResults(from: typeResults, metrics: metrics)
            syncState.categoryResults = categoryResults

            let unavailableCount = categoryResults.filter { $0.status == "unavailable" }.count
            let totalCount = categoryResults.count
            let partialWarning: String? = unavailableCount > 0
                ? "\(unavailableCount) of \(totalCount) \(unavailableCount == 1 ? "category needs" : "categories need") permission. Tap 'Grant Missing Permissions' to update."
                : nil

            guard !metrics.isEmpty else {
                markSuccess(uploadCount: 0, partialWarning: partialWarning)
                return
            }

            // Mark as pending before the network call so a crash mid-upload is visible
            syncState.pendingUploads = metrics.count
            SyncStateStore.save(syncState)

            activity = .running(detail: "Uploading \(metrics.count) records…")
            let uploaded = try await upload(metrics, userId: userId, accessToken: accessToken, authManager: authManager)

            markSuccess(uploadCount: uploaded, metrics: metrics, typeResults: typeResults, partialWarning: partialWarning)
        } catch SupabaseError.sessionExpired {
            syncState.lastError      = SupabaseError.sessionExpired.localizedDescription
            syncState.needsReauth    = true
            syncState.pendingUploads = 0
            SyncStateStore.save(syncState)
            activity = .idle
        } catch {
            syncState.lastError      = error.localizedDescription
            syncState.needsReauth    = false
            syncState.pendingUploads = 0
            SyncStateStore.save(syncState)
            activity = .idle
        }
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
        partialWarning: String? = nil
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
        // Notify WebAppView.Coordinator to inject metrics into the WebView's IndexedDB.
        if !metrics.isEmpty {
            NotificationCenter.default.post(
                name: .shakthiNativeSyncComplete,
                object: nil,
                userInfo: ["metrics": metrics]
            )
        }
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
