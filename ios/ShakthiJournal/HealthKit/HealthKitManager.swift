import Foundation
import HealthKit
import Observation

// MARK: - TypeFetchResult

/// Metadata about one HealthKit type after a fetch attempt. Contains no HealthKit types
/// so it can be safely passed to SyncEngine without importing HealthKit there.
struct TypeFetchResult {
    let typeId: String
    let displayName: String
    let recordCount: Int
    let hasError: Bool
    let errorDescription: String?
    /// ISO date ("yyyy-MM-dd") of the most recent sample retrieved, or nil if none
    let latestDate: String?
}

// MARK: - HealthKitManager

@MainActor
@Observable
final class HealthKitManager {

    // MARK: - State

    /// True only on a real iPhone — always false on Simulator
    let isAvailable: Bool = HKHealthStore.isHealthDataAvailable()

    /// True after the user has tapped "Connect Apple Health" at least once.
    /// Stored in UserDefaults so it persists across launches.
    var hasRequestedAuth: Bool = UserDefaults.standard.bool(forKey: "healthKitAuthRequested")

    var isRequestingAuth = false
    var authError: String?

    // MARK: - Private

    private let store = HKHealthStore()

    /// Central descriptor list — single source of truth for which types we sync,
    /// their Shakthi typeId strings, and their display names.
    private static let typeDescriptors: [(hkType: HKSampleType, typeId: String, displayName: String)] = [
        (HKQuantityType(.bodyMass),                 "weight",            "Weight"),
        (HKQuantityType(.bodyFatPercentage),        "bodyFatPct",        "Body Fat %"),
        (HKQuantityType(.leanBodyMass),             "leanBodyMass",      "Lean Body Mass"),
        (HKQuantityType(.stepCount),                "steps",             "Steps"),
        (HKQuantityType(.activeEnergyBurned),       "activeCalories",    "Active Calories"),
        (HKQuantityType(.restingHeartRate),         "restingHeartRate",  "Resting Heart Rate"),
        (HKQuantityType(.heartRateVariabilitySDNN), "hrv",               "HRV"),
        (HKQuantityType(.oxygenSaturation),         "spO2",              "Blood Oxygen (SpO2)"),
        (HKQuantityType(.respiratoryRate),          "respiratoryRate",   "Respiratory Rate"),
        (HKCategoryType(.sleepAnalysis),            "sleepHours",        "Sleep"),
    ]

    // Types we will READ (derived from typeDescriptors — always in sync)
    private var typesToRead: Set<HKObjectType> {
        var result = Set<HKObjectType>()
        for desc in Self.typeDescriptors { result.insert(desc.hkType) }
        return result
    }

    // Types we request WRITE permission for now; actual writes are Phase iOS 2+.
    private var typesToShare: Set<HKSampleType> {
        [
            HKQuantityType(.bodyMass),
            HKQuantityType(.bodyFatPercentage),
            HKWorkoutType.workoutType(),
        ]
    }

    private let dayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = .current
        return f
    }()

    // MARK: - Permission request
    // Called when the user explicitly taps "Connect Apple Health". Never called on app launch.

    func requestAuthorization() async {
        guard isAvailable else {
            authError = "Apple Health is not available on this device. Use a real iPhone."
            return
        }
        isRequestingAuth = true
        authError = nil
        do {
            try await store.requestAuthorization(toShare: typesToShare, read: typesToRead)
            UserDefaults.standard.set(true, forKey: "healthKitAuthRequested")
            hasRequestedAuth = true
        } catch {
            authError = error.localizedDescription
        }
        isRequestingAuth = false
    }

    /// Re-requests authorization for any types the user hasn't been asked about yet.
    /// HealthKit only shows the permission sheet for types still in `.notDetermined` state;
    /// already-decided types (approved or denied) are silently skipped.
    func requestMissingAuthorizations() async {
        guard isAvailable else { return }
        isRequestingAuth = true
        authError = nil
        do {
            try await store.requestAuthorization(toShare: typesToShare, read: typesToRead)
            UserDefaults.standard.set(true, forKey: "healthKitAuthRequested")
            hasRequestedAuth = true
        } catch {
            authError = error.localizedDescription
        }
        isRequestingAuth = false
    }

    // MARK: - Data queries

    /// Fetches all supported types since `startDate`, maps them to HealthMetric records,
    /// and returns per-type fetch metadata alongside the mapped metrics.
    ///
    /// Never throws — each type is wrapped in its own do-catch so one unauthorized type
    /// never blocks the others.
    func fetchSamplesWithStatus(since startDate: Date) async -> (metrics: [HealthMetric], typeResults: [TypeFetchResult]) {
        let end = Date()

        let sincePredicate = HKQuery.predicateForSamples(
            withStart: startDate,
            end: end,
            options: .strictStartDate
        )
        // Composition types always use a 90-day lookback so RENPHO measurements from
        // past days are always included in the sync batch regardless of lastSuccessfulSync.
        let compositionStart = Calendar.current.date(byAdding: .day, value: -90, to: end) ?? startDate
        let compositionPredicate = HKQuery.predicateForSamples(
            withStart: compositionStart,
            end: end,
            options: .strictStartDate
        )
        let compositionTypeIds: Set<String> = ["weight", "bodyFatPct", "leanBodyMass"]

        // Sleep uses a 7-day lookback to avoid missing sessions whose startDate falls
        // just before lastSuccessfulSync (e.g. sleep starting at 11 PM, synced at 10 PM).
        let sleepStart = Calendar.current.date(byAdding: .day, value: -7, to: end) ?? startDate
        let sleepPredicate = HKQuery.predicateForSamples(
            withStart: sleepStart,
            end: end,
            options: .strictStartDate
        )
        let sleepTypeIds: Set<String> = ["sleepHours"]

        var samplesDict: [HKSampleType: [HKSample]] = [:]
        var typeResults: [TypeFetchResult] = []

        for desc in Self.typeDescriptors {
            let predicate = compositionTypeIds.contains(desc.typeId) ? compositionPredicate
                          : sleepTypeIds.contains(desc.typeId)      ? sleepPredicate
                          : sincePredicate
            do {
                let samples = try await querySamples(type: desc.hkType, predicate: predicate)
                if !samples.isEmpty { samplesDict[desc.hkType] = samples }
                typeResults.append(TypeFetchResult(
                    typeId: desc.typeId,
                    displayName: desc.displayName,
                    recordCount: samples.count,
                    hasError: false,
                    errorDescription: nil,
                    latestDate: latestDateFrom(samples: samples)
                ))
            } catch {
                print("[HealthKitManager] skipping \(desc.typeId): \(error.localizedDescription)")
                typeResults.append(TypeFetchResult(
                    typeId: desc.typeId,
                    displayName: desc.displayName,
                    recordCount: 0,
                    hasError: true,
                    errorDescription: error.localizedDescription,
                    latestDate: nil
                ))
            }
        }

        let metrics = HealthKitMapper.map(samples: samplesDict)
        return (metrics, typeResults)
    }

    // MARK: - Private helpers

    private func querySamples(type: HKSampleType, predicate: NSPredicate) async throws -> [HKSample] {
        try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(
                sampleType: type,
                predicate: predicate,
                limit: HKObjectQueryNoLimit,
                sortDescriptors: [
                    NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true),
                ]
            ) { _, samples, error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume(returning: samples ?? [])
                }
            }
            store.execute(query)
        }
    }

    private func latestDateFrom(samples: [HKSample]) -> String? {
        let date = samples.compactMap { ($0 as? HKQuantitySample)?.startDate }
            .max()
            ?? samples.compactMap { ($0 as? HKCategorySample)?.endDate }.max()
        return date.map { dayFormatter.string(from: $0) }
    }
}
