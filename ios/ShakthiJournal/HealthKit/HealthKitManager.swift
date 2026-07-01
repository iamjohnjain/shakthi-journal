import Foundation
import HealthKit
import Observation

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

    // Types we will READ (all 7 metrics synced to Supabase)
    private var typesToRead: Set<HKObjectType> {
        [
            HKQuantityType(.bodyMass),
            HKQuantityType(.bodyFatPercentage),
            HKQuantityType(.stepCount),
            HKQuantityType(.activeEnergyBurned),
            HKQuantityType(.restingHeartRate),
            HKQuantityType(.heartRateVariabilitySDNN),
            HKCategoryType(.sleepAnalysis),
        ]
    }

    // Types we request WRITE permission for now; actual writes are Phase iOS 2+.
    // Requesting early avoids a second permission dialog when writing is implemented.
    private var typesToShare: Set<HKSampleType> {
        [
            HKQuantityType(.bodyMass),
            HKQuantityType(.bodyFatPercentage),
            HKWorkoutType.workoutType(),
        ]
    }

    // MARK: - Permission request
    // Only called when the user explicitly taps "Connect Apple Health".
    // Never called on app launch.

    func requestAuthorization() async {
        guard isAvailable else {
            authError = "Apple Health is not available on this device. Use a real iPhone."
            return
        }
        isRequestingAuth = true
        authError = nil
        do {
            // Presents the iOS HealthKit permission sheet.
            // toShare: establishes write permission for future use (Phase iOS 2+).
            // read:    the 7 types we sync today.
            try await store.requestAuthorization(toShare: typesToShare, read: typesToRead)
            UserDefaults.standard.set(true, forKey: "healthKitAuthRequested")
            hasRequestedAuth = true
        } catch {
            authError = error.localizedDescription
        }
        isRequestingAuth = false
    }

    // MARK: - Data queries

    /// Queries all supported HealthKit types for samples since `startDate`.
    func fetchSamples(since startDate: Date) async throws -> [HKSampleType: [HKSample]] {
        let predicate = HKQuery.predicateForSamples(
            withStart: startDate,
            end: Date(),
            options: .strictStartDate
        )

        var results: [HKSampleType: [HKSample]] = [:]

        let quantityTypes: [HKQuantityTypeIdentifier] = [
            .bodyMass,
            .bodyFatPercentage,
            .stepCount,
            .activeEnergyBurned,
            .restingHeartRate,
            .heartRateVariabilitySDNN,
        ]
        for identifier in quantityTypes {
            let type = HKQuantityType(identifier)
            let samples = try await querySamples(type: type, predicate: predicate)
            if !samples.isEmpty { results[type] = samples }
        }

        let sleepType = HKCategoryType(.sleepAnalysis)
        let sleepSamples = try await querySamples(type: sleepType, predicate: predicate)
        if !sleepSamples.isEmpty { results[sleepType] = sleepSamples }

        return results
    }

    // MARK: - Private

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
}
