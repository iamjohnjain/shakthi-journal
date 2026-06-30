import { openDB, type IDBPDatabase } from 'idb'
import type { DBSchema } from 'idb'

export type DataMode = 'mock' | 'imported' | 'live' | 'manual'

export type SyncHistoryStatus = 'success' | 'failed' | 'partial'

// ─── Domain types ─────────────────────────────────────────────────────────────

export interface DailyLog {
  date: string
  weightKg?: number
  caloriesIn?: number
  proteinG?: number
  carbsG?: number
  fatG?: number
  waterMl?: number
  workoutCompleted?: boolean
  workoutNotes?: string
  mood?: 1 | 2 | 3 | 4 | 5
  energyLevel?: 1 | 2 | 3 | 4 | 5
  sleepQuality?: 1 | 2 | 3 | 4 | 5
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface ProfileData {
  id: 'main'
  name: string
  dob?: string           // 'YYYY-MM-DD'
  sex?: 'male' | 'female' | 'other'
  activityLevel?: 'sedentary' | 'light' | 'moderate' | 'active' | 'very-active'
  heightCm?: number
  startDate?: string
  startWeightKg?: number
  startBodyFatPct?: number
  goalWeightKg?: number
  goalBodyFatPct?: number
  goalNotes?: string
  bio?: string
  photoDataUrl?: string  // base64 data URL for custom photo upload
  avatarId?: string      // 'lion' | 'tiger' | 'bull' | 'wolf' | 'eagle' | 'bear'
  updatedAt: string
}

export interface ExerciseSet {
  reps: number
  weightLbs: number
  e1rm?: number       // Epley: weight * (1 + reps/30)
  isPR?: boolean
  rpe?: number        // per-set RPE
  equipment?: string  // 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'smith' | 'bodyweight'
}

export interface WorkoutExerciseEntry {
  name: string
  sets: ExerciseSet[]
  notes?: string
  equipment?: string  // default equipment for this exercise
}

export interface CardioEntry {
  type: string              // 'run' | 'walk' | 'cycle' | 'stairmaster' | 'hiit' | 'swim' | 'sport'
  durationMin: number
  distanceKm?: number
  paceMinPerKm?: number
  avgHeartRate?: number
  calories?: number
  caloriesSource?: 'heart-rate' | 'distance' | 'imported' | 'manual' | 'estimated'
  source: string            // 'Apple Health' | 'Strava' | 'Manual' | 'Mock'
}

export interface WorkoutSession {
  id: string
  date: string              // YYYY-MM-DD
  type: string              // 'lifting' | 'cardio'
  cardioSubtype?: string    // 'running' | 'walking' | 'cycling' | etc. (when type === 'cardio')
  title: string
  durationMin: number
  rpe?: number              // overall RPE 1-10
  bodyAreas?: string[]
  exercises: WorkoutExerciseEntry[]
  cardioEntries?: CardioEntry[]
  notes?: string
  mood?: 1 | 2 | 3 | 4 | 5
  // Calories
  estimatedCalories?: number
  overrideCalories?: number // manually entered
  caloriesCalcMethod?: 'met' | 'heart-rate' | 'distance' | 'imported' | 'manual'
  caloriesConfidence?: 'high' | 'medium' | 'low'
  caloriesSource?: string
  createdAt: string
  updatedAt: string
}

// ─── Training system types ────────────────────────────────────────────────────

export interface TrainingProfile {
  id: 'main'
  goals: string[]                  // ['visible-abs', 'vertical-jump', ...]
  daysPerWeek: number              // 2-6
  preferredDays: string[]          // ['monday', 'wednesday', 'friday']
  minutesPerWorkout: number        // 30-120
  equipment: string[]              // ['barbell', 'dumbbell', 'machine', ...]
  trainingPreference: 'lifting' | 'athletic' | 'cardio' | 'balanced'
  currentPhase: 'cutting' | 'maintenance' | 'gaining' | 'performance'
  restDayPreference: 'auto' | 'fixed' | 'minimal' | 'recovery'
  updatedAt: string
}

export interface PlanExercise {
  name: string
  sets: number
  reps: string     // '5' | '8-10' | 'AMRAP' | '30s'
  equipment?: string
  notes?: string
}

export interface WorkoutPlanDay {
  dayOfWeek: number               // 0 = Sunday, 1 = Monday … 6 = Saturday
  type: 'lifting' | 'cardio' | 'plyometrics' | 'rest' | 'active-recovery' | 'mobility'
  name: string
  rationale: string
  durationMin: number
  intensity: 'low' | 'moderate' | 'high'
  exercises: PlanExercise[]
}

export interface WorkoutPlan {
  id: string
  weekStartDate: string           // Monday of the week YYYY-MM-DD
  days: WorkoutPlanDay[]
  generatedFrom: string[]         // goal IDs used to generate
  status: 'active' | 'archived' | 'draft'
  createdAt: string
}

export interface ExerciseLibraryEntry {
  id: string
  name: string
  primaryMuscles: string[]
  secondaryMuscles: string[]
  equipment: string[]
  movementPattern: 'push' | 'pull' | 'hinge' | 'squat' | 'carry' | 'core' | 'plyometric' | 'cardio'
  goalCategories: string[]        // ['strength', 'hypertrophy', 'power', 'endurance', 'cardio']
  defaultSets: number
  defaultReps: string
  isFavorite: boolean
  isCustom: boolean
  createdAt: string
}

export interface NutritionEntry {
  id: string
  date: string        // YYYY-MM-DD
  mealType: string    // 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'meal-1' | 'meal-2' | custom
  food: string
  calories: number
  proteinG: number
  carbsG?: number
  fatG?: number
  quantity?: string
  notes?: string
  createdAt: string
  updatedAt?: string
}

export interface WorkoutTemplate {
  id: string
  name: string
  exercises: WorkoutExerciseEntry[]
  notes?: string
  targetMuscles?: string[]
  estimatedDurationMin?: number
  createdAt: string
  updatedAt: string
}

export interface NutritionGoals {
  calories: number
  proteinG: number
  carbsG: number
  fatG: number
  waterMl: number
  macroFirstMode: boolean
}

// ─── Reviews ─────────────────────────────────────────────────────────────────

export interface WeeklyReview {
  id: string              // `week_${weekStart}`
  weekStart: string       // YYYY-MM-DD (Monday)
  weekEnd: string         // YYYY-MM-DD (Sunday)
  generatedAt: string
  summary: string         // 2–4 sentence narrative
  stats: {
    workoutCount: number
    avgSleepHours: number | null
    avgHrvMs: number | null
    avgProteinG: number | null
    avgCaloriesIn: number | null
    weightStartKg: number | null
    weightEndKg: number | null
    weightChangeLbs: number | null
  }
  workoutConsistencyPct: number
  nutritionConsistencyPct: number
  recoveryConsistencyPct: number
  biggestWin: string | null
  biggestChallenge: string | null
  recommendations: string[]
  confidence: 'high' | 'medium' | 'low'
}

export interface MonthlyReview {
  id: string           // `month_${YYYY-MM}`
  month: string        // YYYY-MM
  generatedAt: string
  summary: string
  stats: {
    workoutCount: number
    avgSleepHours: number | null
    avgHrvMs: number | null
    avgProteinG: number | null
    avgCaloriesIn: number | null
    weightStartKg: number | null
    weightEndKg: number | null
    weightChangeLbs: number | null
    bestLiftPR: { exercise: string; weightLbs: number } | null
  }
  consistencyScore: number  // 0-100 composite
  milestones: string[]
  streaks: Array<{ name: string; days: number }>
  confidence: 'high' | 'medium' | 'low'
}

// ─── Achievement ──────────────────────────────────────────────────────────────

export interface Achievement {
  id: string
  type: string
  title: string
  description: string
  emoji: string
  unlockedAt: string    // ISO
  value?: number        // e.g. workout count, streak days, weight
}

// ─── Coach Memory ─────────────────────────────────────────────────────────────

export interface CoachMemory {
  id: 'main'
  updatedAt: string
  preferredWorkoutDays: number[]        // 0=Sun…6=Sat, top-3 from history
  avgSleepHours: number | null
  avgHrvMs: number | null
  avgProteinG: number | null
  totalWorkouts: number
  longestWorkoutStreak: number
  longestProteinStreak: number
  recurringStruggles: Array<{ type: string; lastSeen: string; count: number }>
  recurringWins: Array<{ type: string; lastSeen: string; count: number }>
}

// ─── Sync queue ───────────────────────────────────────────────────────────────

export interface SyncQueueEntry {
  id: string           // uuid
  store: string        // which IndexedDB store
  operation: 'upsert' | 'delete'
  recordId: string     // the record's local primary key
  data: unknown        // snapshot of the record
  userId: string       // Supabase auth user id
  createdAt: number    // unix ms
  attempts: number
  lastError?: string
}

// ─── Schema ───────────────────────────────────────────────────────────────────

export interface ShakthiDB extends DBSchema {
  health_metrics: {
    key: string
    value: {
      id: string
      date: string
      type: string
      value: number | string
      unit: string
      sourceId: string
      sourceName: string
      dataMode: DataMode
      importedAt: string
    }
    indexes: {
      'by-date': string
      'by-type': string
      'by-source': string
    }
  }

  sync_history: {
    key: string
    value: {
      id: string
      sourceId: string
      sourceName: string
      status: SyncHistoryStatus
      recordCount: number
      dataTypes: string[]
      dataMode: DataMode
      startedAt: string
      completedAt: string
      durationMs: number
      error?: string
    }
    indexes: {
      'by-source': string
      'by-date': string
    }
  }

  settings: {
    key: string
    value: {
      key: string
      value: unknown
      updatedAt: string
    }
  }

  daily_logs: {
    key: string        // YYYY-MM-DD
    value: DailyLog
  }

  profile: {
    key: string        // 'main'
    value: ProfileData
  }

  workouts: {
    key: string        // uuid
    value: WorkoutSession
    indexes: {
      'by-date': string
      'by-type': string
    }
  }

  nutrition_entries: {
    key: string        // uuid
    value: NutritionEntry
    indexes: {
      'by-date': string
      'by-meal': string
    }
  }

  training_profile: {
    key: string        // 'main'
    value: TrainingProfile
  }

  workout_plans: {
    key: string
    value: WorkoutPlan
    indexes: {
      'by-week': string
      'by-status': string
    }
  }

  exercise_library: {
    key: string
    value: ExerciseLibraryEntry
    indexes: {
      'by-name': string
      'by-muscle': string
    }
  }

  workout_templates: {
    key: string
    value: WorkoutTemplate
    indexes: {
      'by-name': string
    }
  }

  sync_queue: {
    key: string           // entry id
    value: SyncQueueEntry
    indexes: {
      'by-user': string
      'by-store': string
    }
  }

  weekly_reviews: {
    key: string           // weekStart YYYY-MM-DD
    value: WeeklyReview
    indexes: { 'by-generated': string }
  }

  monthly_reviews: {
    key: string           // month YYYY-MM
    value: MonthlyReview
    indexes: { 'by-generated': string }
  }

  achievements: {
    key: string           // achievement id
    value: Achievement
    indexes: { 'by-type': string; 'by-date': string }
  }

  coach_memory: {
    key: string           // 'main'
    value: CoachMemory
  }
}

// ─── Database singleton ───────────────────────────────────────────────────────

const DB_NAME = 'shakthi-journal'
const DB_VERSION = 7

let _db: IDBPDatabase<ShakthiDB> | null = null

export async function getDB(): Promise<IDBPDatabase<ShakthiDB>> {
  if (_db) return _db

  _db = await openDB<ShakthiDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const metrics = db.createObjectStore('health_metrics', { keyPath: 'id' })
        metrics.createIndex('by-date', 'date')
        metrics.createIndex('by-type', 'type')
        metrics.createIndex('by-source', 'sourceId')

        const history = db.createObjectStore('sync_history', { keyPath: 'id' })
        history.createIndex('by-source', 'sourceId')
        history.createIndex('by-date', 'startedAt')

        db.createObjectStore('settings', { keyPath: 'key' })
      }

      if (oldVersion < 2) {
        db.createObjectStore('daily_logs', { keyPath: 'date' })
        db.createObjectStore('profile', { keyPath: 'id' })
      }

      // v2 → v3: workout sessions and per-meal nutrition entries
      if (oldVersion < 3) {
        const workouts = db.createObjectStore('workouts', { keyPath: 'id' })
        workouts.createIndex('by-date', 'date')
        workouts.createIndex('by-type', 'type')

        const nutrition = db.createObjectStore('nutrition_entries', { keyPath: 'id' })
        nutrition.createIndex('by-date', 'date')
        nutrition.createIndex('by-meal', 'mealType')
      }

      // v3 → v4: training profile, workout plans, exercise library
      if (oldVersion < 4) {
        db.createObjectStore('training_profile', { keyPath: 'id' })

        const plans = db.createObjectStore('workout_plans', { keyPath: 'id' })
        plans.createIndex('by-week', 'weekStartDate')
        plans.createIndex('by-status', 'status')

        const lib = db.createObjectStore('exercise_library', { keyPath: 'id' })
        lib.createIndex('by-name', 'name')
        lib.createIndex('by-muscle', 'primaryMuscles', { multiEntry: true })
      }

      // v4 → v5: workout templates
      if (oldVersion < 5) {
        const tmpl = db.createObjectStore('workout_templates', { keyPath: 'id' })
        tmpl.createIndex('by-name', 'name')
      }

      // v5 → v6: cloud sync queue
      if (oldVersion < 6) {
        const q = db.createObjectStore('sync_queue', { keyPath: 'id' })
        q.createIndex('by-user', 'userId')
        q.createIndex('by-store', 'store')
      }

      // v6 → v7: weekly/monthly reviews, achievements, coach memory
      if (oldVersion < 7) {
        const wr = db.createObjectStore('weekly_reviews', { keyPath: 'id' })
        wr.createIndex('by-generated', 'generatedAt')

        const mr = db.createObjectStore('monthly_reviews', { keyPath: 'id' })
        mr.createIndex('by-generated', 'generatedAt')

        const ach = db.createObjectStore('achievements', { keyPath: 'id' })
        ach.createIndex('by-type', 'type')
        ach.createIndex('by-date', 'unlockedAt')

        db.createObjectStore('coach_memory', { keyPath: 'id' })
      }
    },
  })

  return _db
}

// ─── Settings helpers ─────────────────────────────────────────────────────────

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  try {
    const db = await getDB()
    const row = await db.get('settings', key)
    return row ? (row.value as T) : fallback
  } catch {
    return fallback
  }
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  try {
    const db = await getDB()
    await db.put('settings', { key, value, updatedAt: new Date().toISOString() })
  } catch { /* non-critical */ }
}

// ─── Sync history helpers ─────────────────────────────────────────────────────

export async function addSyncHistoryEntry(entry: ShakthiDB['sync_history']['value']): Promise<void> {
  const db = await getDB()
  await db.put('sync_history', entry)
}

export async function getSyncHistory(limit = 50): Promise<ShakthiDB['sync_history']['value'][]> {
  const db = await getDB()
  const all = await db.getAll('sync_history')
  return all.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()).slice(0, limit)
}

export async function clearSyncHistory(): Promise<void> {
  const db = await getDB()
  await db.clear('sync_history')
}

// ─── Metrics helpers ──────────────────────────────────────────────────────────

export async function getMetricCount(): Promise<number> {
  const db = await getDB()
  return db.count('health_metrics')
}

export async function clearAllMetrics(): Promise<void> {
  const db = await getDB()
  await db.clear('health_metrics')
}

// ─── DB diagnostics ───────────────────────────────────────────────────────────

export async function getDBStats(): Promise<{
  metricCount: number
  syncCount: number
  logCount: number
  workoutCount: number
  nutritionCount: number
  version: number
}> {
  const db = await getDB()
  const [metricCount, syncCount, logCount, workoutCount, nutritionCount] = await Promise.all([
    db.count('health_metrics'),
    db.count('sync_history'),
    db.count('daily_logs'),
    db.count('workouts'),
    db.count('nutrition_entries'),
  ])
  return { metricCount, syncCount, logCount, workoutCount, nutritionCount, version: db.version }
}
