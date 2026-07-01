import Foundation
import Observation

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
            let uploaded = try await SupabaseClient.upsertHealthMetrics(
                metrics,
                userId: userId,
                accessToken: accessToken
            )

            markSuccess(uploadCount: uploaded)
        } catch {
            syncState.lastError      = error.localizedDescription
            syncState.pendingUploads = 0
            SyncStateStore.save(syncState)
            activity = .idle
        }
    }

    // MARK: - Private

    private func markSuccess(uploadCount: Int) {
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
    }
}
