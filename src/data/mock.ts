import type {
  AppleHealthExport,
  RenphoRecord,
  StravaActivity,
  MFPDayLog,
  DailySnapshot,
  ImportRecord,
} from '../types/health'

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

// ─── Apple Health mock export ─────────────────────────────────────────────────

export const mockAppleHealthExport: AppleHealthExport = {
  exportDate: new Date().toISOString(),
  deviceName: "John's Apple Watch Ultra",
  records: [
    { type: 'HKQuantityTypeIdentifierHeartRate', value: 58, unit: 'count/min', startDate: daysAgo(0), endDate: daysAgo(0), sourceName: 'Apple Watch' },
    { type: 'HKQuantityTypeIdentifierRestingHeartRate', value: 52, unit: 'count/min', startDate: daysAgo(0), endDate: daysAgo(0), sourceName: 'Apple Watch' },
    { type: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN', value: 68, unit: 'ms', startDate: daysAgo(0), endDate: daysAgo(0), sourceName: 'Apple Watch' },
    { type: 'HKQuantityTypeIdentifierStepCount', value: 9842, unit: 'count', startDate: daysAgo(0), endDate: daysAgo(0), sourceName: 'Apple Watch' },
    { type: 'HKQuantityTypeIdentifierActiveEnergyBurned', value: 612, unit: 'kcal', startDate: daysAgo(0), endDate: daysAgo(0), sourceName: 'Apple Watch' },
    { type: 'HKQuantityTypeIdentifierBodyMass', value: 90.3, unit: 'kg', startDate: daysAgo(0), endDate: daysAgo(0), sourceName: 'Renpho' },
    { type: 'HKQuantityTypeIdentifierVO2Max', value: 48.2, unit: 'mL/min·kg', startDate: daysAgo(3), endDate: daysAgo(3), sourceName: 'Apple Watch' },
    { type: 'HKCategoryTypeIdentifierSleepAnalysis', value: 7.4, unit: 'hr', startDate: daysAgo(0), endDate: daysAgo(0), sourceName: 'RingConn' },
  ],
  workouts: [
    { activityType: 'HKWorkoutActivityTypeRunning', duration: 2580, totalEnergyBurned: 410, totalDistance: 6200, startDate: daysAgo(1), endDate: daysAgo(1) },
    { activityType: 'HKWorkoutActivityTypeTraditionalStrengthTraining', duration: 3900, totalEnergyBurned: 340, totalDistance: 0, startDate: daysAgo(2), endDate: daysAgo(2) },
    { activityType: 'HKWorkoutActivityTypeRunning', duration: 1920, totalEnergyBurned: 290, totalDistance: 4800, startDate: daysAgo(4), endDate: daysAgo(4) },
  ],
}

// ─── Renpho mock records ──────────────────────────────────────────────────────

export const mockRenphoRecords: RenphoRecord[] = [
  { date: daysAgo(0), weight: 90.3, bmi: 25.7, bodyFatPct: 17.2, fatFreeMassKg: 74.8, subcutaneousFatPct: 14.1, visceralFat: 8, bodyWaterPct: 57.4, skeletalMusclePct: 46.2, muscleMassKg: 71.3, boneMassKg: 3.5, proteinPct: 19.1, bmr: 2018, metabolicAge: 28 },
  { date: daysAgo(2), weight: 90.8, bmi: 25.8, bodyFatPct: 17.5, fatFreeMassKg: 74.9, subcutaneousFatPct: 14.3, visceralFat: 8, bodyWaterPct: 57.1, skeletalMusclePct: 46.0, muscleMassKg: 71.1, boneMassKg: 3.5, proteinPct: 19.0, bmr: 2015, metabolicAge: 28 },
  { date: daysAgo(5), weight: 91.2, bmi: 25.9, bodyFatPct: 17.8, fatFreeMassKg: 74.9, subcutaneousFatPct: 14.5, visceralFat: 9, bodyWaterPct: 56.9, skeletalMusclePct: 45.8, muscleMassKg: 71.0, boneMassKg: 3.5, proteinPct: 18.9, bmr: 2012, metabolicAge: 29 },
  { date: daysAgo(7), weight: 91.6, bmi: 26.0, bodyFatPct: 18.1, fatFreeMassKg: 75.0, subcutaneousFatPct: 14.7, visceralFat: 9, bodyWaterPct: 56.7, skeletalMusclePct: 45.6, muscleMassKg: 70.8, boneMassKg: 3.5, proteinPct: 18.8, bmr: 2010, metabolicAge: 29 },
]

// ─── Strava mock activities ────────────────────────────────────────────────────

export const mockStravaActivities: StravaActivity[] = [
  { id: 1001, name: 'Morning Run', type: 'Run', startDate: daysAgo(1), distance: 6200, movingTime: 2580, elapsedTime: 2640, totalElevationGain: 48, averageHeartRate: 158, maxHeartRate: 174, averageSpeed: 2.4, maxSpeed: 3.1, calories: 410, sufferScore: 42 },
  { id: 1002, name: 'Easy Run', type: 'Run', startDate: daysAgo(4), distance: 4800, movingTime: 1920, elapsedTime: 1980, totalElevationGain: 22, averageHeartRate: 148, maxHeartRate: 162, averageSpeed: 2.5, maxSpeed: 3.0, calories: 290, sufferScore: 28 },
  { id: 1003, name: 'Long Run', type: 'Run', startDate: daysAgo(8), distance: 12400, movingTime: 4800, elapsedTime: 4920, totalElevationGain: 92, averageHeartRate: 155, maxHeartRate: 178, averageSpeed: 2.58, maxSpeed: 3.2, calories: 780, sufferScore: 88 },
  { id: 1004, name: 'Strength — Push', type: 'WeightTraining', startDate: daysAgo(2), distance: 0, movingTime: 3900, elapsedTime: 4200, totalElevationGain: 0, averageHeartRate: 132, maxHeartRate: 158, averageSpeed: 0, maxSpeed: 0, calories: 340 },
]

// ─── MyFitnessPal mock logs ───────────────────────────────────────────────────

export const mockMFPLogs: MFPDayLog[] = [
  { date: daysAgo(0), calories: 2180, proteinG: 198, carbsG: 212, fatG: 62, fiberG: 28, sugarG: 44, sodiumMg: 2100, waterMl: 2800 },
  { date: daysAgo(1), calories: 2310, proteinG: 206, carbsG: 228, fatG: 68, fiberG: 31, sugarG: 52, sodiumMg: 2400, waterMl: 3200 },
  { date: daysAgo(2), calories: 2090, proteinG: 192, carbsG: 198, fatG: 58, fiberG: 24, sugarG: 38, sodiumMg: 1980, waterMl: 2600 },
  { date: daysAgo(3), calories: 2240, proteinG: 210, carbsG: 220, fatG: 64, fiberG: 30, sugarG: 46, sodiumMg: 2200, waterMl: 3000 },
  { date: daysAgo(4), calories: 2150, proteinG: 195, carbsG: 208, fatG: 60, fiberG: 26, sugarG: 40, sodiumMg: 2050, waterMl: 2900 },
]

// ─── Normalised daily snapshots (pre-merged view) ─────────────────────────────

export const mockDailySnapshots: DailySnapshot[] = [
  { date: daysAgo(0), weight: 90.3, bodyFatPct: 17.2, muscleMassKg: 71.3, restingHeartRate: 52, hrv: 68, steps: 9842, sleepHours: 7.4, sleepScore: 82, activeCalories: 612, caloriesIn: 2180, proteinG: 198, carbsG: 212, fatG: 62, fiberG: 28, waterMl: 2800, recoveryScore: 84 },
  { date: daysAgo(1), weight: 90.5, bodyFatPct: 17.3, muscleMassKg: 71.2, restingHeartRate: 54, hrv: 62, steps: 12400, sleepHours: 6.8, sleepScore: 74, activeCalories: 820, caloriesIn: 2310, proteinG: 206, carbsG: 228, fatG: 68, fiberG: 31, waterMl: 3200, recoveryScore: 72 },
  { date: daysAgo(2), weight: 90.8, bodyFatPct: 17.5, muscleMassKg: 71.1, restingHeartRate: 55, hrv: 58, steps: 8200, sleepHours: 7.1, sleepScore: 78, activeCalories: 490, caloriesIn: 2090, proteinG: 192, carbsG: 198, fatG: 58, fiberG: 24, waterMl: 2600, recoveryScore: 68 },
  { date: daysAgo(3), weight: 91.0, bodyFatPct: 17.6, muscleMassKg: 71.0, restingHeartRate: 53, hrv: 71, steps: 10100, sleepHours: 8.0, sleepScore: 89, activeCalories: 544, caloriesIn: 2240, proteinG: 210, carbsG: 220, fatG: 64, fiberG: 30, waterMl: 3000, recoveryScore: 88 },
  { date: daysAgo(4), weight: 91.1, bodyFatPct: 17.7, muscleMassKg: 70.9, restingHeartRate: 56, hrv: 55, steps: 11200, sleepHours: 6.5, sleepScore: 71, activeCalories: 740, caloriesIn: 2150, proteinG: 195, carbsG: 208, fatG: 60, fiberG: 26, waterMl: 2900, recoveryScore: 65 },
  { date: daysAgo(5), weight: 91.2, bodyFatPct: 17.8, muscleMassKg: 70.8, restingHeartRate: 53, hrv: 66, steps: 7800, sleepHours: 7.6, sleepScore: 84, activeCalories: 420, caloriesIn: 2200, proteinG: 202, carbsG: 215, fatG: 61, fiberG: 27, waterMl: 2750, recoveryScore: 80 },
  { date: daysAgo(6), weight: 91.4, bodyFatPct: 17.9, muscleMassKg: 70.8, restingHeartRate: 54, hrv: 60, steps: 9500, sleepHours: 7.2, sleepScore: 79, activeCalories: 580, caloriesIn: 2260, proteinG: 204, carbsG: 222, fatG: 65, fiberG: 29, waterMl: 2850, recoveryScore: 75 },
]

// ─── Import history (pre-seeded) ──────────────────────────────────────────────

export const mockImportHistory: ImportRecord[] = [
  { id: '1', sourceId: 'apple_health', sourceName: 'Apple Health', importedAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), recordCount: 842, fileName: 'export.xml', status: 'success' },
  { id: '2', sourceId: 'renpho', sourceName: 'Renpho Scale', importedAt: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(), recordCount: 4, fileName: 'renpho_export.csv', status: 'success' },
]
