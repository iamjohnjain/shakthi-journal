// ─── Shared ──────────────────────────────────────────────────────────────────

export type DataSourceId =
  | 'apple_health'
  | 'renpho'
  | 'strava'
  | 'myfitnesspal'

export type ImportStatus = 'idle' | 'parsing' | 'success' | 'error'

export interface ImportRecord {
  id: string
  sourceId: DataSourceId
  sourceName: string
  importedAt: string       // ISO 8601
  recordCount: number
  fileName: string
  status: 'success' | 'error'
  errorMessage?: string
}

// ─── Apple Health ─────────────────────────────────────────────────────────────

export interface AppleHealthRecord {
  type: string             // e.g. "HKQuantityTypeIdentifierHeartRate"
  value: number
  unit: string
  startDate: string
  endDate: string
  sourceName: string
}

export interface AppleHealthWorkout {
  activityType: string     // e.g. "HKWorkoutActivityTypeRunning"
  duration: number         // seconds
  totalEnergyBurned: number
  totalDistance: number
  startDate: string
  endDate: string
}

export interface AppleHealthExport {
  records: AppleHealthRecord[]
  workouts: AppleHealthWorkout[]
  exportDate: string
  deviceName: string
}

// ─── Normalised daily snapshot (internal model) ───────────────────────────────

export interface DailySnapshot {
  date: string             // YYYY-MM-DD
  weight?: number          // kg
  bodyFatPct?: number
  muscleMassKg?: number
  restingHeartRate?: number
  hrv?: number
  steps?: number
  sleepHours?: number
  sleepScore?: number
  activeCalories?: number
  caloriesIn?: number
  proteinG?: number
  carbsG?: number
  fatG?: number
  fiberG?: number
  waterMl?: number
  recoveryScore?: number
}

// ─── Renpho ──────────────────────────────────────────────────────────────────

export interface RenphoRecord {
  date: string
  weight: number           // kg
  bmi: number
  bodyFatPct: number
  fatFreeMassKg: number
  subcutaneousFatPct: number
  visceralFat: number
  bodyWaterPct: number
  skeletalMusclePct: number
  muscleMassKg: number
  boneMassKg: number
  proteinPct: number
  bmr: number
  metabolicAge: number
}

// ─── Strava ───────────────────────────────────────────────────────────────────

export interface StravaActivity {
  id: number
  name: string
  type: string             // "Run", "Ride", "WeightTraining", etc.
  startDate: string
  distance: number         // meters
  movingTime: number       // seconds
  elapsedTime: number      // seconds
  totalElevationGain: number
  averageHeartRate?: number
  maxHeartRate?: number
  averageSpeed: number     // m/s
  maxSpeed: number
  calories?: number
  sufferScore?: number
}

// ─── MyFitnessPal ─────────────────────────────────────────────────────────────

export interface MFPDayLog {
  date: string
  calories: number
  proteinG: number
  carbsG: number
  fatG: number
  fiberG?: number
  sugarG?: number
  sodiumMg?: number
  waterMl?: number
}
