import Foundation

/// Persisted sync history. Stored as JSON in UserDefaults under "shakthiSyncState".
/// Replaces the single `lastHealthKitSyncAt` UserDefaults key from Phase iOS 1.
struct SyncState: Codable {
    /// Last time a sync completed without error
    var lastSuccessfulSync: Date?
    /// Last time a sync was attempted (success or failure)
    var lastAttemptedSync: Date?
    /// Error message from the most recent failed sync; nil when last sync succeeded
    var lastError: String?
    /// Records that are ready to upload but have not yet been confirmed by Supabase.
    /// Zero at rest; set to the metric count while uploading; reset to 0 on success.
    var pendingUploads: Int = 0
    /// Records uploaded in the most recent successful sync
    var lastUploadCount: Int = 0
    /// Cumulative records ever uploaded in this app install
    var totalRecordsUploaded: Int = 0
    /// True after the user has completed the HealthKit authorization flow at least once
    var healthPermissionRequested: Bool = false
    /// True after at least one successful sync returned records from HealthKit
    var healthPermissionGranted: Bool = false
}

// MARK: - Persistence

enum SyncStateStore {
    private static let currentKey = "shakthiSyncState"
    private static let legacyDateKey = "lastHealthKitSyncAt"
    private static let legacyAuthKey = "healthKitAuthRequested"

    static func load() -> SyncState {
        // Try current JSON format first
        if let data = UserDefaults.standard.data(forKey: currentKey),
           let state = try? JSONDecoder().decode(SyncState.self, from: data) {
            return state
        }
        // Migrate from Phase iOS 1 single-key storage
        var state = SyncState()
        if let date = UserDefaults.standard.object(forKey: legacyDateKey) as? Date {
            state.lastSuccessfulSync = date
            state.lastAttemptedSync  = date
        }
        state.healthPermissionRequested = UserDefaults.standard.bool(forKey: legacyAuthKey)
        return state
    }

    static func save(_ state: SyncState) {
        guard let data = try? JSONEncoder().encode(state) else { return }
        UserDefaults.standard.set(data, forKey: currentKey)
    }
}
