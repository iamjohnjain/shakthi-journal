import Foundation
import HealthKit

/// Converts HealthKit samples into Shakthi health_metrics records.
///
/// Type strings, unit strings, ID format, and sourceId normalization all mirror
/// the TypeScript web parser at src/parsers/appleHealthParser.ts exactly.
/// If you change either side, update both.
enum HealthKitMapper {

    static func map(samples: [HKSampleType: [HKSample]]) -> [HealthMetric] {
        let importedAt = ISO8601DateFormatter().string(from: Date())
        var metrics: [HealthMetric] = []

        for (type, typeSamples) in samples {
            switch type {

            case HKQuantityType(.bodyMass):
                metrics += latestPerDay(
                    typeSamples, type: "weight",
                    unit: .gramUnit(with: .kilo), shakthiUnit: "kg",
                    importedAt: importedAt
                ) { $0 }

            case HKQuantityType(.bodyFatPercentage):
                // HKUnit.percent() returns the percentage value (e.g. 17.2 for 17.2%),
                // not the decimal fraction (0.172). However some third-party devices
                // write decimal fractions — apply the same defensive normalization as
                // the web parser's toPercent(): if < 2.0, treat as fraction and multiply.
                // Threshold is safe because survivable body fat minimum is ~3%.
                metrics += latestPerDay(
                    typeSamples, type: "bodyFatPct",
                    unit: .percent(), shakthiUnit: "%",
                    importedAt: importedAt
                ) { $0 < 2.0 ? $0 * 100 : $0 }

            case HKQuantityType(.leanBodyMass):
                metrics += latestPerDay(
                    typeSamples, type: "leanBodyMass",
                    unit: .gramUnit(with: .kilo), shakthiUnit: "kg",
                    importedAt: importedAt
                ) { $0 }

            case HKQuantityType(.stepCount):
                metrics += sumPerDay(
                    typeSamples, type: "steps",
                    unit: .count(), shakthiUnit: "steps",
                    importedAt: importedAt
                )

            case HKQuantityType(.activeEnergyBurned):
                metrics += sumPerDay(
                    typeSamples, type: "activeCalories",
                    unit: .kilocalorie(), shakthiUnit: "kcal",
                    importedAt: importedAt
                )

            case HKQuantityType(.restingHeartRate):
                let bpm = HKUnit.count().unitDivided(by: .minute())
                metrics += latestPerDay(
                    typeSamples, type: "restingHeartRate",
                    unit: bpm, shakthiUnit: "bpm",
                    importedAt: importedAt
                ) { $0 }

            case HKQuantityType(.heartRateVariabilitySDNN):
                // HK stores HRV in seconds; we want ms — .secondUnit(with: .milli) gives ms
                metrics += latestPerDay(
                    typeSamples, type: "hrv",
                    unit: .secondUnit(with: .milli), shakthiUnit: "ms",
                    importedAt: importedAt
                ) { $0 }

            case HKCategoryType(.sleepAnalysis):
                metrics += sleepPerDay(typeSamples, importedAt: importedAt)

            default:
                break
            }
        }

        return metrics
    }

    // MARK: - Aggregation

    /// Latest sample per calendar day (local timezone).
    private static func latestPerDay(
        _ samples: [HKSample],
        type: String,
        unit: HKUnit,
        shakthiUnit: String,
        importedAt: String,
        transform: (Double) -> Double
    ) -> [HealthMetric] {
        var latestByDay: [String: HKQuantitySample] = [:]
        for sample in samples.compactMap({ $0 as? HKQuantitySample }) {
            let day = localDay(sample.startDate)
            if let existing = latestByDay[day], sample.startDate <= existing.startDate { continue }
            latestByDay[day] = sample
        }

        return latestByDay.map { day, sample in
            let raw = sample.quantity.doubleValue(for: unit)
            return HealthMetric(
                id:           "\(type)_\(day)",
                date:         day,
                type:         type,
                value:        roundTwo(transform(raw)),
                unit:         shakthiUnit,
                sourceId:     normalizeSourceId(sample.sourceRevision.source.name),
                sourceName:   sample.sourceRevision.source.name,
                dataMode:     "imported",
                importedAt:   importedAt
            )
        }
    }

    /// Sum of all samples within each calendar day.
    private static func sumPerDay(
        _ samples: [HKSample],
        type: String,
        unit: HKUnit,
        shakthiUnit: String,
        importedAt: String
    ) -> [HealthMetric] {
        var sums: [String: Double] = [:]
        var primarySource: [String: (id: String, name: String)] = [:]

        for sample in samples.compactMap({ $0 as? HKQuantitySample }) {
            let day = localDay(sample.startDate)
            sums[day, default: 0] += sample.quantity.doubleValue(for: unit)
            if primarySource[day] == nil {
                let name = sample.sourceRevision.source.name
                primarySource[day] = (normalizeSourceId(name), name)
            }
        }

        return sums.map { day, total in
            let src = primarySource[day] ?? ("apple_health", "Apple Health")
            return HealthMetric(
                id:           "\(type)_\(day)",
                date:         day,
                type:         type,
                value:        round(total),
                unit:         shakthiUnit,
                sourceId:     src.id,
                sourceName:   src.name,
                dataMode:     "imported",
                importedAt:   importedAt
            )
        }
    }

    /// Sleep: sum the duration of asleep-stage samples and assign to the wake-up date.
    /// Matches the web parser's rule: wakeup date = endDate of each sleep segment.
    private static func sleepPerDay(_ samples: [HKSample], importedAt: String) -> [HealthMetric] {
        // Include all "asleep" stages; exclude "inBed" (lying down but awake) and "awake" events
        let asleepValues: Set<Int> = [
            HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue,
            HKCategoryValueSleepAnalysis.asleepCore.rawValue,       // light sleep
            HKCategoryValueSleepAnalysis.asleepDeep.rawValue,       // deep/SWS
            HKCategoryValueSleepAnalysis.asleepREM.rawValue,        // REM
        ]

        var hoursPerDay: [String: Double] = [:]
        var primarySource: [String: (id: String, name: String)] = [:]

        for sample in samples.compactMap({ $0 as? HKCategorySample }) {
            guard asleepValues.contains(sample.value) else { continue }
            let wakeDay = localDay(sample.endDate)
            let hours = sample.endDate.timeIntervalSince(sample.startDate) / 3600
            hoursPerDay[wakeDay, default: 0] += hours
            if primarySource[wakeDay] == nil {
                let name = sample.sourceRevision.source.name
                primarySource[wakeDay] = (normalizeSourceId(name), name)
            }
        }

        return hoursPerDay.map { day, hours in
            let src = primarySource[day] ?? ("apple_health", "Apple Health")
            return HealthMetric(
                id:           "sleepHours_\(day)",
                date:         day,
                type:         "sleepHours",
                value:        roundTwo(hours),
                unit:         "h",
                sourceId:     src.id,
                sourceName:   src.name,
                dataMode:     "imported",
                importedAt:   importedAt
            )
        }
    }

    // MARK: - Source normalization
    // Must mirror normalizeSourceId() in src/parsers/appleHealthParser.ts

    private static func normalizeSourceId(_ sourceName: String) -> String {
        let s = sourceName.lowercased()
        if s.contains("watch")                            { return "apple_watch"   }
        if s.contains("renpho")                           { return "renpho"        }
        if s.contains("ringconn") || s.contains("ring conn") { return "ringconn"  }
        if s.contains("whoop")                            { return "whoop"         }
        if s.contains("oura")                             { return "oura"          }
        if s.contains("garmin")                           { return "garmin"        }
        if s.contains("myfitnesspal")                     { return "myfitnesspal"  }
        if s.contains("strava")                           { return "strava"        }
        return "apple_health"
    }

    // MARK: - Helpers

    private static let dayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = .current   // user's local timezone
        return f
    }()

    private static func localDay(_ date: Date) -> String {
        dayFormatter.string(from: date)
    }

    private static func roundTwo(_ value: Double) -> Double {
        (value * 100).rounded() / 100
    }
}
