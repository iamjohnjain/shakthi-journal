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
            let samples = try await healthKitManager.fetchSamples(since: since)

            let sampleCount = samples.values.reduce(0) { $0 + $1.count }
            activity = .running(detail: "Mapping \(sampleCount) samples…")
            let metrics = HealthKitMapper.map(samples: samples)

            guard !metrics.isEmpty else {
                markSuccess(uploadCount: 0)
                return
            }

            // Mark as pending before the network call so a crash mid-upload is visible
            syncState.pendingUploads = metrics.count
            SyncStateStore.save(syncState)

            activity = .running(detail: "Uploading \(metrics.count) records…")
            let uploaded = try await upload(metrics, userId: userId, accessToken: accessToken, authManager: authManager)

            markSuccess(uploadCount: uploaded, metrics: metrics)
        } catch {
            syncState.lastError      = error.localizedDescription
            syncState.pendingUploads = 0
            SyncStateStore.save(syncState)
            activity = .idle
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

    // MARK: - Private

    private func markSuccess(uploadCount: Int, metrics: [HealthMetric] = []) {
        let now = Date()
        syncState.lastSuccessfulSync      = now
        syncState.lastAttemptedSync       = now
        syncState.lastError               = nil
        syncState.pendingUploads          = 0
        syncState.lastUploadCount         = uploadCount
        syncState.totalRecordsUploaded   += uploadCount
        syncState.healthPermissionGranted = true
        SyncStateStore.save(syncState)
        activity = .idle
        // Notify WebAppView.Coordinator to inject metrics into the WebView's IndexedDB.
        // This is what makes the web dashboard update after a native HealthKit sync.
        if !metrics.isEmpty {
            NotificationCenter.default.post(
                name: .shakthiNativeSyncComplete,
                object: nil,
                userInfo: ["metrics": metrics]
            )
        }
    }
}
