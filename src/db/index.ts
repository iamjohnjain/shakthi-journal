import { openDB, type IDBPDatabase } from 'idb'
import type { DBSchema } from 'idb'

export type DataMode = 'mock' | 'imported' | 'live' | 'manual'

export type SyncHistoryStatus = 'success' | 'failed' | 'partial'

// ─── Domain types ─────────────────────────────────────────────────────────────

export interface DailyLog {
  date: string
  weightKg?: number
  /** Body measurements, stored in cm regardless of the user's display unit
      system — same convention as weightKg, converted only at the UI
      boundary so switching units never requires re-interpreting history. */
  waistCm?: number
  chestCm?: number
  hipsCm?: number
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
  /** Self-reported — no device required. Genuinely self-knowable, unlike HRV/SpO2. */
  sleepHours?: number
  restingHeartRate?: number
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
  goalDate?: string       // 'YYYY-MM-DD' — target date to reach goalWeightKg
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
  isWarmup?: boolean  // excluded from e1RM/PR, volume, and progressive-overload suggestions
}

export interface WorkoutExerciseEntry {
  name: string
  sets: ExerciseSet[]
  notes?: string
  equipment?: string  // default equipment for this exercise
  isBreak?: boolean  // a "took a break" marker, not a real exercise — rides along in the same array for drag reorder
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

// 'side' stays valid (not removed) purely for existing saved photos from
// before the left/right split below — there's no migration path for old
// data, so a legacy 'side' photo keeps working and just shows as "Side."
// New captures use 'side-left'/'side-right' instead.
export type ProgressPhotoPose = 'front' | 'back' | 'side' | 'side-left' | 'side-right' | 'flexed' | 'custom'

export interface ProgressPhoto {
  id: string
  date: string              // YYYY-MM-DD
  pose: ProgressPhotoPose
  customLabel?: string      // set when pose === 'custom', e.g. "vacuum pose"
  photoDataUrl: string      // compressed JPEG data URL
  /** Manually entered, independent of the live nearest-date health-snapshot
      lookup used elsewhere — this corrects what THIS photo's own weight was,
      for when the capture/upload date doesn't match when the photo was
      actually taken. Takes precedence over the derived lookup when set. */
  weightKg?: number
  createdAt: string
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
  seen?: boolean
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

// ─── Coach chat ───────────────────────────────────────────────────────────────

/** One entry per chat message. Shape stays close to the OpenAI/Groq wire
    format (camelCase instead of snake_case) so converting to/from the Edge
    Function's request body is a near-1:1 rename, not a real transform. */
export interface CoachChatToolCall {
  id: string
  name: string
  arguments: string   // JSON-encoded tool arguments, as Groq sends them
}

/** A workout the model proposed via the `propose_workout` tool — stashed on
    the assistant message that called it (not written to any store) so
    CoachChat can render Save/Log action buttons under that bubble. */
export interface CoachProposedWorkout {
  title: string
  exercises: WorkoutExerciseEntry[]
  notes?: string
}

export interface CoachChatMessage {
  id: string                          // uuid, local primary key
  createdAt: string                   // ISO — also the sort/index field
  role: 'user' | 'assistant' | 'tool'
  content: string | null              // null on an assistant message that's pure tool_calls
  toolCalls?: CoachChatToolCall[]      // present on an assistant message that calls tools
  toolCallId?: string                  // present on a 'tool' role message — links back to the call
  toolName?: string                    // present on a 'tool' role message — which tool ran
  imageDataUrl?: string                // present on a user message that attached a photo
  proposedWorkout?: CoachProposedWorkout // present on an assistant message that called propose_workout
  proposedWorkoutActedAs?: 'template' | 'logged' // set once the user taps Save/Log, so the buttons don't double-fire
  workoutReference?: { date: string; label?: string } // present on an assistant message that called reference_workout
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
  lastAttemptAt?: number  // unix ms — drives backoff so failed entries keep
                           // retrying on their own instead of getting stuck
                           // forever once `attempts` passes the warning threshold
}

// ─── Schema ───────────────────────────────────────────────────────────────────

export interface JeevanDB extends DBSchema {
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

  coach_chat: {
    key: string           // message id
    value: CoachChatMessage
    indexes: { 'by-date': string }
  }

  progress_photos: {
    key: string            // photo id
    value: ProgressPhoto
    indexes: { 'by-date': string; 'by-pose': string }
  }
}

// ─── Database singleton ───────────────────────────────────────────────────────

// Renamed from 'shakthi-journal' during the Jeevan rebrand — IndexedDB
// databases are keyed by name, so a plain rename here would make every
// existing user's data invisible (still on disk under the old name, but
// unreachable). `migrateFromLegacyDatabase` below carries it over once,
// the first time the new name is opened.
const OLD_DB_NAME = 'shakthi-journal'
const DB_NAME = 'jeevan'
const DB_VERSION = 9

function runUpgrade(db: IDBPDatabase<JeevanDB>, oldVersion: number) {
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

      // v7 → v8: Coach chat history
      if (oldVersion < 8) {
        const chat = db.createObjectStore('coach_chat', { keyPath: 'id' })
        chat.createIndex('by-date', 'createdAt')
      }

      // v8 → v9: progress check-in photos
      if (oldVersion < 9) {
        const photos = db.createObjectStore('progress_photos', { keyPath: 'id' })
        photos.createIndex('by-date', 'date')
        photos.createIndex('by-pose', 'pose')
      }
}

/** One-time copy of every record from the old-named database into the new
    one — runs at most once per browser profile (skipped once the new
    database exists at all, even if migration only partially completed; a
    partial copy is still far better than silently losing everything, and
    re-running on every load would just re-copy the same records forever).
    `indexedDB.databases()` is the only way to check existence without the
    side effect of creating the database just by trying to open it. */
async function migrateFromLegacyDatabase(): Promise<void> {
  if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') return
  try {
    const existing = await indexedDB.databases()
    const hasLegacy = existing.some(d => d.name === OLD_DB_NAME)
    const hasNew = existing.some(d => d.name === DB_NAME)
    if (!hasLegacy || hasNew) return

    const legacyDb = await openDB<JeevanDB>(OLD_DB_NAME, DB_VERSION)
    const freshDb = await openDB<JeevanDB>(DB_NAME, DB_VERSION, { upgrade: runUpgrade })
    for (const storeName of legacyDb.objectStoreNames) {
      const records = await legacyDb.getAll(storeName)
      const tx = freshDb.transaction(storeName, 'readwrite')
      await Promise.all([...records.map(r => tx.store.put(r)), tx.done])
    }
    legacyDb.close()
    freshDb.close()
  } catch {
    // Best-effort — any failure here just means the app starts with a fresh
    // (empty) database instead of blocking startup entirely.
  }
}

// ─── Per-account isolation ────────────────────────────────────────────────────
//
// Each signed-in account gets its own physically separate IndexedDB database
// (`jeevan_<sanitizedUserId>`) so one account's data is never reachable from
// another's open handle — no shared store to filter, nothing to accidentally
// leak across a sign-out/sign-in. Guest mode (no account) keeps using the
// original unscoped `jeevan` database unchanged.
//
// `setActiveDbIdentity()` is called by AuthContext whenever the signed-in
// identity changes (sign-in, sign-out, guest). Every existing consumer in
// this codebase already does `const db = await getDB()` fresh on every call
// (never caches the handle) — so every one of those call sites automatically
// picks up whichever database is currently active, with zero changes
// required to any of the 18 store modules that call it. `getDB()` itself
// never blocks waiting for a decision: it defaults to the guest database
// immediately (identical to this app's behavior before per-account
// isolation existed), and `setActiveDbIdentity` switches it afterward if a
// real session is found. This deliberately avoids an "identity resolution
// gate" — a gate would have to block `getDB()` until a decision is made,
// but `AuthContext` itself needs to read the CURRENT (pre-decision, often
// guest) database first to know whether there's local data to ask the user
// about, which would deadlock against its own gate.
const LEGACY_MIGRATION_FLAG = 'jeevan.perUserMigrationDone'

function sanitizeIdentity(identity: string): string {
  // Supabase user ids are UUIDs, but sanitize defensively since this becomes
  // part of a physical database name.
  return identity.replace(/[^a-zA-Z0-9_-]/g, '_')
}

function dbNameFor(identity: string | null): string {
  return identity ? `jeevan_${sanitizeIdentity(identity)}` : DB_NAME
}

function openNamed(name: string): Promise<IDBPDatabase<JeevanDB>> {
  return openDB<JeevanDB>(name, DB_VERSION, { upgrade: runUpgrade })
}

/** Copies every record from every store in `sourceDbName` into
    `targetDbName`, via a plain `put` per record (so an existing record in
    the target sharing the same key is overwritten by the source's version,
    same semantics as every other write in this app — never a destructive
    `clear()` first). Returns the number of records copied. A no-op,
    returning 0, if the source database doesn't exist at all. */
async function copyAllStores(sourceDbName: string, targetDbName: string): Promise<number> {
  if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') return 0
  const existing = await indexedDB.databases()
  if (!existing.some(d => d.name === sourceDbName)) return 0

  const sourceDb = await openDB<JeevanDB>(sourceDbName, DB_VERSION, { upgrade: runUpgrade })
  const targetDb = await openDB<JeevanDB>(targetDbName, DB_VERSION, { upgrade: runUpgrade })
  let copied = 0
  try {
    for (const storeName of sourceDb.objectStoreNames) {
      const records = await sourceDb.getAll(storeName)
      if (records.length === 0) continue
      const tx = targetDb.transaction(storeName, 'readwrite')
      await Promise.all([...records.map(r => tx.store.put(r)), tx.done])
      copied += records.length
    }
  } finally {
    sourceDb.close()
    targetDb.close()
  }
  return copied
}

/** One-time copy of the legacy unscoped `jeevan` database's data into the
    FIRST account that ever signs in after this change ships — it has no
    other owner to belong to, so handing it to the first real account is the
    only choice that doesn't just discard it. Every account after that first
    one starts with a clean, empty database (this is unrelated to, and runs
    before, the explicit per-sign-up guest-data transfer a user can choose
    via the merge prompt — see `importGuestDataIntoAccount` below). Tracked
    via localStorage (not a setting inside any one database) because the
    check needs to run before we know which per-user database, if any,
    we're even opening. */
async function migrateLegacyToFirstAccount(identity: string): Promise<void> {
  if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') return
  try {
    if (localStorage.getItem(LEGACY_MIGRATION_FLAG)) return
    await copyAllStores(DB_NAME, dbNameFor(identity))
    localStorage.setItem(LEGACY_MIGRATION_FLAG, '1')
  } catch {
    // Best-effort — if this fails, the new account just starts empty instead
    // of inheriting the old guest data; it does not block sign-in.
  }
}

/** Explicit, user-chosen copy of every record currently in the guest
    (unscoped `jeevan`) database into a signed-in account's own database.
    Unlike `migrateLegacyToFirstAccount` above (which runs automatically,
    once, for whichever account happens to be first), this runs on demand
    — called from the merge-choice flow whenever someone who built up data
    in guest mode then creates or signs into an account and chooses to keep
    that data. Safe to call more than once or for any account, not just the
    first: it never clears the guest database, so guest data survives for
    this call to run again if needed, and it never clears the target
    database either, so it can't destroy an account's own existing data. */
export async function importGuestDataIntoAccount(identity: string): Promise<number> {
  return copyAllStores(DB_NAME, dbNameFor(identity))
}

/** Clears every store in the guest (unscoped `jeevan`) database — used
    only when a user explicitly chose "replace local with cloud" on the
    merge prompt (`MergeDialog.tsx`), which tells them this data "will be
    permanently deleted." Must not be called as a side effect of anything
    else: this is the one path in this file that destroys data rather than
    only ever adding it. A no-op if the guest database doesn't exist. */
export async function clearGuestDatabase(): Promise<void> {
  if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') return
  const existing = await indexedDB.databases()
  if (!existing.some(d => d.name === DB_NAME)) return

  const guestDb = await openDB<JeevanDB>(DB_NAME, DB_VERSION, { upgrade: runUpgrade })
  try {
    await Promise.all(
      Array.from(guestDb.objectStoreNames).map(storeName => guestDb.clear(storeName))
    )
  } finally {
    guestDb.close()
  }
}

// Cache the in-flight promise, not just the resolved value — otherwise concurrent
// callers before the first openDB() resolves each start their own openDB() call,
// which on a brand-new database (first-ever upgrade, creating all stores) can
// collide badly enough to hang the page indefinitely.
let _dbPromise: Promise<IDBPDatabase<JeevanDB>> | null = null
let _activeDbName: string | null = null

/** Called by AuthContext whenever the signed-in identity changes: on initial
    session resolution, sign-in, sign-out, and guest-mode entry. Switches the
    active database to the correct one for that identity, closing the
    previous handle first so a slow consumer can't keep writing to the old
    account's database after the switch. Pass `null` for guest mode. Safe to
    call redundantly (e.g. from both `activateSession` and `resolveMerge`
    for the same account) — a no-op once already active. */
export async function setActiveDbIdentity(identity: string | null): Promise<void> {
  const name = dbNameFor(identity)
  if (_activeDbName === name && _dbPromise) return

  const previous = _dbPromise
  _activeDbName = name
  _dbPromise = (async () => {
    if (previous) {
      try { (await previous).close() } catch { /* already closed/unusable */ }
    }
    if (identity) {
      await migrateLegacyToFirstAccount(identity)
    } else {
      await migrateFromLegacyDatabase()
    }
    return openNamed(name)
  })()

  await _dbPromise
}

export async function getDB(): Promise<IDBPDatabase<JeevanDB>> {
  if (_dbPromise) return _dbPromise

  // No identity has ever been set yet (e.g. a store module running before
  // AuthContext has decided guest-vs-signed-in, or Supabase not configured
  // at all) — default to the guest database immediately, same behavior as
  // before per-account isolation existed. `setActiveDbIdentity` switches
  // away from this the moment a real session is found.
  _activeDbName = DB_NAME
  _dbPromise = migrateFromLegacyDatabase().then(() => openNamed(DB_NAME))
  return _dbPromise
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

// Settings that describe the account (not this device) — synced to the
// cloud so a new device signs straight into the same setup and goals.
const ACCOUNT_SETTINGS = new Set([
  'onboarding.completed', 'onboarding.goals', 'nutrition-goals', 'nutrition.targets',
])

export async function setSetting(key: string, value: unknown): Promise<void> {
  try {
    const db = await getDB()
    const row = { key, value, updatedAt: new Date().toISOString() }
    await db.put('settings', row)
    if (ACCOUNT_SETTINGS.has(key)) {
      // Dynamic import: syncEngine imports this module.
      void import('./syncEngine').then(m => m.syncEngine.queueWrite('settings', 'upsert', key, row)).catch(() => {})
    }
  } catch { /* non-critical */ }
}

// ─── Sync history helpers ─────────────────────────────────────────────────────

export async function addSyncHistoryEntry(entry: JeevanDB['sync_history']['value']): Promise<void> {
  const db = await getDB()
  await db.put('sync_history', entry)
}

export async function getSyncHistory(limit = 50): Promise<JeevanDB['sync_history']['value'][]> {
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
