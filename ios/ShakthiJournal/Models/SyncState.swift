import Foundation

// MARK: - Per-sample diagnostic (one per type, most recent sample from last sync)

/// Raw HealthKit sample info captured after mapping, stored in UserDefaults for the
/// native diagnostic panel. One entry per type — always the most recent sample found.
struct SampleDiagnostic: Codable, Identifiable {
    let typeId: String
    let displayName: String
    let mappedValue: Double
    let unit: String
    let sourceName: String
    let sourceId: String
    let sampleDate: String

    var id: String { typeId }
}

// MARK: - Per-category sync result (stored alongside SyncState)

struct CategorySyncResult: Codable, Identifiable {
    var id: String { typeId }
    var typeId: String
    var displayName: String
    /// "synced" | "no_data" | "unavailable"
    var status: String
    var recordCount: Int
    /// ISO date ("yyyy-MM-dd") of the most recent record synced for this type
    var latestDate: String?
    /// Non-nil when status == "unavailable" — the underlying HealthKit error message
    var skipReason: String?
}

// MARK: - Sync state

/// Persisted sync history. Stored as JSON in UserDefaults under "shakthiSyncState".
/// Replaces the single `lastHealthKitSyncAt` UserDefaults key from Phase iOS 1.
struct SyncState: Codable {
    /// Last time a sync completed without error
    var lastSuccessfulSync: Date?
    /// Last time a sync was attempted (success or failure)
    var lastAttemptedSync: Date?
    /// Error message from the most recent failed sync; nil when last sync succeeded
    var lastError: String?
    /// Non-nil after a successful sync where some categories were skipped (yellow warning)
    var partialSyncWarning: String?
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
    /// Per-type results from the most recent sync, used for the permission dashboard
    var categoryResults: [CategorySyncResult] = []
    /// True when the last sync failure was due to an invalid/expired Supabase session.
    /// Drives "Sign In Again" CTA instead of "Try Again".
    var needsReauth: Bool = false
    /// Most recent HealthKit sample found per type during the last sync, for diagnostics.
    var lastSampleDiagnostics: [SampleDiagnostic] = []

    init(
        lastSuccessfulSync: Date? = nil,
        lastAttemptedSync: Date? = nil,
        lastError: String? = nil,
        partialSyncWarning: String? = nil,
        pendingUploads: Int = 0,
        lastUploadCount: Int = 0,
        totalRecordsUploaded: Int = 0,
        healthPermissionRequested: Bool = false,
        healthPermissionGranted: Bool = false,
        categoryResults: [CategorySyncResult] = [],
        needsReauth: Bool = false,
        lastSampleDiagnostics: [SampleDiagnostic] = []
    ) {
        self.lastSuccessfulSync       = lastSuccessfulSync
        self.lastAttemptedSync        = lastAttemptedSync
        self.lastError                = lastError
        self.partialSyncWarning       = partialSyncWarning
        self.pendingUploads           = pendingUploads
        self.lastUploadCount          = lastUploadCount
        self.totalRecordsUploaded     = totalRecordsUploaded
        self.healthPermissionRequested = healthPermissionRequested
        self.healthPermissionGranted  = healthPermissionGranted
        self.categoryResults          = categoryResults
        self.needsReauth              = needsReauth
        self.lastSampleDiagnostics    = lastSampleDiagnostics
    }

    // Custom decoder so that missing keys from older stored JSON use default values
    // instead of throwing — preserves existing sync history when adding new fields.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        lastSuccessfulSync      = try c.decodeIfPresent(Date.self,                  forKey: .lastSuccessfulSync)
        lastAttemptedSync       = try c.decodeIfPresent(Date.self,                  forKey: .lastAttemptedSync)
        lastError               = try c.decodeIfPresent(String.self,                forKey: .lastError)
        partialSyncWarning      = try c.decodeIfPresent(String.self,                forKey: .partialSyncWarning)
        pendingUploads          = try c.decodeIfPresent(Int.self,                   forKey: .pendingUploads)         ?? 0
        lastUploadCount         = try c.decodeIfPresent(Int.self,                   forKey: .lastUploadCount)        ?? 0
        totalRecordsUploaded    = try c.decodeIfPresent(Int.self,                   forKey: .totalRecordsUploaded)   ?? 0
        healthPermissionRequested = try c.decodeIfPresent(Bool.self,                forKey: .healthPermissionRequested) ?? false
        healthPermissionGranted = try c.decodeIfPresent(Bool.self,                  forKey: .healthPermissionGranted) ?? false
        categoryResults         = try c.decodeIfPresent([CategorySyncResult].self,  forKey: .categoryResults)        ?? []
        needsReauth             = try c.decodeIfPresent(Bool.self,                  forKey: .needsReauth)            ?? false
        lastSampleDiagnostics   = try c.decodeIfPresent([SampleDiagnostic].self,   forKey: .lastSampleDiagnostics)  ?? []
    }
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
