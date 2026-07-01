import Foundation

/// Mirrors the health_metrics JSONB record format in the web app.
///
/// Field names and allowed values must stay in sync with:
///   src/db/index.ts  →  ShakthiDB['health_metrics']['value']
///   src/parsers/appleHealthParser.ts  →  hkToMetricType(), metric()
///
/// Type strings:
///   "weight"           kg
///   "bodyFatPct"       %    (note: NOT "bodyFat")
///   "steps"            steps
///   "activeCalories"   kcal
///   "restingHeartRate" bpm
///   "hrv"              ms
///   "sleepHours"       h    (note: NOT "hours")
struct HealthMetric: Codable, Identifiable {
    /// Primary key: "\(type)_\(date)"  e.g. "weight_2026-06-30"
    let id: String
    /// "YYYY-MM-DD" in the user's local timezone
    let date: String
    /// Metric type string — must match the web app's type strings exactly
    let type: String
    /// Numeric value in the unit below
    let value: Double
    /// Unit string — must match web app conventions
    let unit: String
    /// Normalized source identifier: "apple_watch" | "apple_health" | "ringconn" | ...
    let sourceId: String
    /// Raw source name from HealthKit (e.g. "Apple Watch")
    let sourceName: String
    /// Always "imported" for HealthKit-sourced data
    let dataMode: String
    /// ISO 8601 timestamp of when this sync ran
    let importedAt: String
}
