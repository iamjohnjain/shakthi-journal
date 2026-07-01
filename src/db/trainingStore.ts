import { getDB } from './index'
import type {
  TrainingProfile, WorkoutPlan, WorkoutPlanDay, PlanExercise,
  ExerciseLibraryEntry, WorkoutSession, CardioEntry,
} from './index'
import { getRecentWorkouts } from './workoutStore'
export type { TrainingProfile, WorkoutPlan, WorkoutPlanDay, ExerciseLibraryEntry, CardioEntry }

// ─── Calorie estimation ───────────────────────────────────────────────────────

const MET_BY_TYPE: Record<string, number> = {
  lifting:          4.0,
  basketball:       7.0,
  volleyball:       4.0,
  running:          8.5,
  walking:          3.5,
  cycling:          6.0,
  stairmaster:      9.0,
  mobility:         2.5,
  rest:             1.2,
  plyometrics:      7.5,
  hiit:             8.0,
  'active-recovery':2.8,
  cardio:           5.5,
}

function liftingMET(rpe: number): number {
  if (rpe <= 5) return 3.0
  if (rpe <= 7) return 3.8
  if (rpe <= 8) return 4.5
  if (rpe <= 9) return 5.5
  return 6.2
}

export interface CalorieEstimate {
  calories: number
  confidence: 'high' | 'medium' | 'low'
  method: 'met' | 'heart-rate' | 'distance' | 'imported' | 'manual'
  source: string
  label: string
}

export function estimateWorkoutCalories(
  type: string,
  durationMin: number,
  bodyWeightKg: number,
  opts: {
    rpe?: number
    avgHeartRate?: number
    distanceKm?: number
    importedCalories?: number
    manualCalories?: number
    ageYears?: number
  } = {}
): CalorieEstimate {
  if (opts.manualCalories) {
    return { calories: Math.round(opts.manualCalories), confidence: 'high', method: 'manual', source: 'Manual', label: 'MANUAL' }
  }
  if (opts.importedCalories) {
    return { calories: Math.round(opts.importedCalories), confidence: 'high', method: 'imported', source: 'Apple Health', label: 'IMPORTED' }
  }
  if (opts.avgHeartRate && opts.avgHeartRate > 50) {
    // Keytel formula for males — use provided age or 30 as a generic athletic adult default
    const age = opts.ageYears ?? 30
    const kcal = ((-55.0969 + 0.6309 * opts.avgHeartRate + 0.1988 * bodyWeightKg + 0.2017 * age) / 4.184) * durationMin
    return { calories: Math.round(Math.max(kcal, 0)), confidence: 'high', method: 'heart-rate', source: 'Apple Watch', label: 'IMPORTED' }
  }
  if (opts.distanceKm && (type === 'running' || type === 'cycling' || type === 'walking')) {
    const factor = type === 'running' ? 1.04 : type === 'cycling' ? 0.5 : 0.7
    const kcal = opts.distanceKm * bodyWeightKg * factor
    return { calories: Math.round(kcal), confidence: 'high', method: 'distance', source: 'GPS / Manual', label: 'ESTIMATED' }
  }
  // MET fallback
  const met = type === 'lifting' && opts.rpe ? liftingMET(opts.rpe) : (MET_BY_TYPE[type] ?? 4.0)
  const kcal = met * bodyWeightKg * (durationMin / 60)
  const confidence: 'medium' | 'low' = type === 'lifting' ? 'low' : 'medium'
  return { calories: Math.round(Math.max(kcal, 0)), confidence, method: 'met', source: 'MET Estimate', label: 'ESTIMATED' }
}

// ─── Progressive overload ─────────────────────────────────────────────────────

function estimateOneRM(w: number, r: number) { return r === 1 ? w : Math.round(w * (1 + r / 30)) }

export function suggestNextSet(lastSets: Array<{ reps: number; weightLbs: number; rpe?: number }>, equipment = 'barbell'): string {
  if (!lastSets.length) return 'Log this exercise to get suggestions.'
  const best = lastSets.reduce((b, s) => estimateOneRM(s.weightLbs, s.reps) > estimateOneRM(b.weightLbs, b.reps) ? s : b)
  const rpe = best.rpe ?? 7.5
  const inc = equipment === 'dumbbell' ? 5 : equipment === 'bodyweight' ? 0 : 10
  if (rpe <= 6) {
    return inc > 0
      ? `Try ${best.weightLbs + inc} × ${best.reps} lbs — RPE was low, ready to progress.`
      : `Add 1-2 more reps (RPE was easy).`
  }
  if (rpe <= 7.5) {
    return `Try ${best.weightLbs} × ${best.reps + 1} — same weight, push one more rep.`
  }
  if (rpe <= 9) {
    return `Hold ${best.weightLbs} × ${best.reps} — RPE was high, master this before adding weight.`
  }
  return `Consider dropping to ${Math.round(best.weightLbs * 0.9)} × ${best.reps} — recovery may be needed.`
}

// ─── Exercise library defaults ────────────────────────────────────────────────

export const DEFAULT_EXERCISES: Omit<ExerciseLibraryEntry, 'id' | 'isFavorite' | 'isCustom' | 'createdAt'>[] = [
  // ── Legs ──
  { name: 'Back Squat',            primaryMuscles: ['Quads','Glutes'], secondaryMuscles: ['Hamstrings','Core'], equipment: ['barbell','smith'], movementPattern: 'squat',     goalCategories: ['strength','hypertrophy','power'], defaultSets: 4, defaultReps: '5' },
  { name: 'Front Squat',           primaryMuscles: ['Quads'],          secondaryMuscles: ['Core','Glutes'],      equipment: ['barbell'],         movementPattern: 'squat',     goalCategories: ['strength','power'],               defaultSets: 4, defaultReps: '5' },
  { name: 'Deadlift',              primaryMuscles: ['Back','Glutes'],  secondaryMuscles: ['Hamstrings','Core'],  equipment: ['barbell'],         movementPattern: 'hinge',     goalCategories: ['strength','power'],               defaultSets: 4, defaultReps: '5' },
  { name: 'Romanian Deadlift',     primaryMuscles: ['Hamstrings','Glutes'], secondaryMuscles: ['Back'],          equipment: ['barbell','dumbbell'], movementPattern: 'hinge',  goalCategories: ['hypertrophy','strength'],         defaultSets: 3, defaultReps: '8-10' },
  { name: 'Bulgarian Split Squat', primaryMuscles: ['Quads','Glutes'], secondaryMuscles: ['Hamstrings'],         equipment: ['dumbbell','barbell'], movementPattern: 'squat', goalCategories: ['hypertrophy','strength','power'], defaultSets: 3, defaultReps: '10' },
  { name: 'Leg Press',             primaryMuscles: ['Quads','Glutes'], secondaryMuscles: ['Hamstrings'],         equipment: ['machine'],         movementPattern: 'squat',     goalCategories: ['hypertrophy'],                    defaultSets: 3, defaultReps: '12-15' },
  { name: 'Reverse Lunge',         primaryMuscles: ['Quads','Glutes'], secondaryMuscles: ['Hamstrings'],         equipment: ['dumbbell','barbell','bodyweight'], movementPattern: 'squat', goalCategories: ['hypertrophy','power'], defaultSets: 3, defaultReps: '10' },
  { name: 'Hip Thrust',            primaryMuscles: ['Glutes'],         secondaryMuscles: ['Hamstrings'],         equipment: ['barbell','machine'], movementPattern: 'hinge',   goalCategories: ['hypertrophy','strength'],         defaultSets: 4, defaultReps: '12' },
  { name: 'Hamstring Curl',        primaryMuscles: ['Hamstrings'],     secondaryMuscles: [],                     equipment: ['machine'],         movementPattern: 'hinge',     goalCategories: ['hypertrophy'],                    defaultSets: 3, defaultReps: '12' },
  { name: 'Leg Extension',         primaryMuscles: ['Quads'],          secondaryMuscles: [],                     equipment: ['machine'],         movementPattern: 'squat',     goalCategories: ['hypertrophy'],                    defaultSets: 3, defaultReps: '12-15' },
  { name: 'Calf Raise',            primaryMuscles: ['Calves'],         secondaryMuscles: [],                     equipment: ['machine','barbell','bodyweight'], movementPattern: 'carry', goalCategories: ['hypertrophy'], defaultSets: 4, defaultReps: '15-20' },
  // ── Push ──
  { name: 'Bench Press',           primaryMuscles: ['Chest'],          secondaryMuscles: ['Triceps','Shoulders'],equipment: ['barbell','smith'], movementPattern: 'push',      goalCategories: ['strength','hypertrophy','power'], defaultSets: 4, defaultReps: '5' },
  { name: 'Incline Bench Press',   primaryMuscles: ['Chest'],          secondaryMuscles: ['Shoulders','Triceps'],equipment: ['barbell','dumbbell','smith'], movementPattern: 'push', goalCategories: ['hypertrophy'],           defaultSets: 3, defaultReps: '10-12' },
  { name: 'Overhead Press',        primaryMuscles: ['Shoulders'],      secondaryMuscles: ['Triceps','Core'],     equipment: ['barbell','dumbbell'], movementPattern: 'push',   goalCategories: ['strength','hypertrophy'],         defaultSets: 4, defaultReps: '5-8' },
  { name: 'Dips',                  primaryMuscles: ['Triceps','Chest'],secondaryMuscles: ['Shoulders'],          equipment: ['bodyweight'],      movementPattern: 'push',      goalCategories: ['hypertrophy','strength'],         defaultSets: 3, defaultReps: 'AMRAP' },
  { name: 'Lateral Raise',         primaryMuscles: ['Shoulders'],      secondaryMuscles: [],                     equipment: ['dumbbell','cable','machine'], movementPattern: 'push', goalCategories: ['hypertrophy'],          defaultSets: 4, defaultReps: '15' },
  { name: 'Rear Delt Fly',         primaryMuscles: ['Rear Delts'],     secondaryMuscles: [],                     equipment: ['dumbbell','cable'], movementPattern: 'pull',     goalCategories: ['hypertrophy'],                    defaultSets: 3, defaultReps: '15' },
  { name: 'Tricep Pushdown',       primaryMuscles: ['Triceps'],        secondaryMuscles: [],                     equipment: ['cable','machine'], movementPattern: 'push',      goalCategories: ['hypertrophy'],                    defaultSets: 3, defaultReps: '12-15' },
  { name: 'Cable Fly',             primaryMuscles: ['Chest'],          secondaryMuscles: [],                     equipment: ['cable'],           movementPattern: 'push',      goalCategories: ['hypertrophy'],                    defaultSets: 3, defaultReps: '12-15' },
  // ── Pull ──
  { name: 'Pull-up',               primaryMuscles: ['Lats','Back'],    secondaryMuscles: ['Biceps'],             equipment: ['bodyweight'],      movementPattern: 'pull',      goalCategories: ['strength','hypertrophy','power'], defaultSets: 4, defaultReps: 'AMRAP' },
  { name: 'Chin-up',               primaryMuscles: ['Lats','Biceps'],  secondaryMuscles: ['Back'],               equipment: ['bodyweight'],      movementPattern: 'pull',      goalCategories: ['strength','hypertrophy'],         defaultSets: 3, defaultReps: 'AMRAP' },
  { name: 'Lat Pulldown',          primaryMuscles: ['Lats'],           secondaryMuscles: ['Biceps'],             equipment: ['cable','machine'], movementPattern: 'pull',      goalCategories: ['hypertrophy'],                    defaultSets: 3, defaultReps: '10-12' },
  { name: 'Barbell Row',           primaryMuscles: ['Back'],           secondaryMuscles: ['Biceps'],             equipment: ['barbell'],         movementPattern: 'pull',      goalCategories: ['strength','hypertrophy'],         defaultSets: 4, defaultReps: '6-8' },
  { name: 'Dumbbell Row',          primaryMuscles: ['Back'],           secondaryMuscles: ['Biceps'],             equipment: ['dumbbell'],        movementPattern: 'pull',      goalCategories: ['hypertrophy'],                    defaultSets: 3, defaultReps: '10-12' },
  { name: 'Cable Row',             primaryMuscles: ['Back'],           secondaryMuscles: ['Biceps'],             equipment: ['cable'],           movementPattern: 'pull',      goalCategories: ['hypertrophy'],                    defaultSets: 3, defaultReps: '12' },
  { name: 'Face Pulls',            primaryMuscles: ['Rear Delts'],     secondaryMuscles: ['Rotator Cuff'],       equipment: ['cable'],           movementPattern: 'pull',      goalCategories: ['hypertrophy'],                    defaultSets: 3, defaultReps: '15-20' },
  { name: 'Barbell Curl',          primaryMuscles: ['Biceps'],         secondaryMuscles: [],                     equipment: ['barbell'],         movementPattern: 'pull',      goalCategories: ['hypertrophy'],                    defaultSets: 3, defaultReps: '10-12' },
  { name: 'Hammer Curl',           primaryMuscles: ['Biceps'],         secondaryMuscles: ['Forearms'],           equipment: ['dumbbell'],        movementPattern: 'pull',      goalCategories: ['hypertrophy'],                    defaultSets: 3, defaultReps: '12' },
  // ── Core ──
  { name: 'Plank',                 primaryMuscles: ['Core'],           secondaryMuscles: [],                     equipment: ['bodyweight'],      movementPattern: 'core',      goalCategories: ['strength','endurance'],           defaultSets: 3, defaultReps: '45s' },
  { name: 'Ab Wheel',              primaryMuscles: ['Core'],           secondaryMuscles: ['Shoulders'],          equipment: ['bodyweight'],      movementPattern: 'core',      goalCategories: ['strength','hypertrophy'],         defaultSets: 3, defaultReps: '10-15' },
  { name: 'Hanging Leg Raise',     primaryMuscles: ['Core'],           secondaryMuscles: ['Hip Flexors'],        equipment: ['bodyweight'],      movementPattern: 'core',      goalCategories: ['hypertrophy'],                    defaultSets: 3, defaultReps: '12' },
  // ── Plyometric / Athletic ──
  { name: 'Box Jump',              primaryMuscles: ['Quads','Glutes'], secondaryMuscles: ['Calves'],             equipment: ['bodyweight'],      movementPattern: 'plyometric',goalCategories: ['power','endurance'],              defaultSets: 4, defaultReps: '5' },
  { name: 'Jump Squat',            primaryMuscles: ['Quads','Glutes'], secondaryMuscles: ['Core'],               equipment: ['bodyweight','barbell'], movementPattern: 'plyometric', goalCategories: ['power'],               defaultSets: 3, defaultReps: '8' },
  { name: 'Sprint',                primaryMuscles: ['Full Body'],      secondaryMuscles: [],                     equipment: ['bodyweight'],      movementPattern: 'cardio',    goalCategories: ['power','endurance','cardio'],     defaultSets: 6, defaultReps: '30s' },
]

// ─── Plan templates (goal cluster → session list) ─────────────────────────────

type GoalCluster = 'athletic' | 'strength' | 'endurance' | 'upper' | 'general'
type PlanSession = Omit<WorkoutPlanDay, 'dayOfWeek'>

const PLAN_SESSIONS: Record<GoalCluster, PlanSession[]> = {

  athletic: [
    { type: 'lifting', name: 'Upper Body Power', rationale: 'Upper body pressing + pulling power to build athletic base and shoulder width', durationMin: 60, intensity: 'high',
      exercises: [
        { name: 'Bench Press', sets: 4, reps: '4-5', equipment: 'barbell' },
        { name: 'Overhead Press', sets: 3, reps: '5', equipment: 'barbell' },
        { name: 'Barbell Row', sets: 4, reps: '5', equipment: 'barbell' },
        { name: 'Pull-up', sets: 3, reps: 'AMRAP' },
        { name: 'Plank', sets: 3, reps: '45s' },
      ] },
    { type: 'lifting', name: 'Lower Power + Plyometrics', rationale: 'Explosive lower body training directly improves vertical jump and sprint speed', durationMin: 65, intensity: 'high',
      exercises: [
        { name: 'Back Squat', sets: 4, reps: '4-5', equipment: 'barbell' },
        { name: 'Box Jump', sets: 4, reps: '5', notes: 'Max height, full reset between reps' },
        { name: 'Jump Squat', sets: 3, reps: '8', notes: 'Explosive drive on every rep' },
        { name: 'Romanian Deadlift', sets: 3, reps: '8', equipment: 'barbell' },
        { name: 'Calf Raise', sets: 4, reps: '20' },
      ] },
    { type: 'cardio', name: 'Conditioning + Core', rationale: 'Cardio base supports athleticism and accelerates visible abs progress', durationMin: 40, intensity: 'moderate',
      exercises: [
        { name: 'Sprint', sets: 6, reps: '30s', notes: '30s sprint, 90s walk/rest' },
        { name: 'Hanging Leg Raise', sets: 3, reps: '12' },
        { name: 'Plank', sets: 3, reps: '45s' },
        { name: 'Ab Wheel', sets: 3, reps: '10' },
      ] },
    { type: 'lifting', name: 'Upper Body Hypertrophy', rationale: 'Higher rep work adds muscle mass and complements the power sessions', durationMin: 60, intensity: 'moderate',
      exercises: [
        { name: 'Incline Bench Press', sets: 3, reps: '10-12', equipment: 'dumbbell' },
        { name: 'Cable Fly', sets: 3, reps: '12-15', equipment: 'cable' },
        { name: 'Lateral Raise', sets: 4, reps: '15', equipment: 'dumbbell' },
        { name: 'Lat Pulldown', sets: 3, reps: '10-12', equipment: 'cable' },
        { name: 'Tricep Pushdown', sets: 3, reps: '12-15', equipment: 'cable' },
        { name: 'Barbell Curl', sets: 3, reps: '10-12', equipment: 'barbell' },
      ] },
    { type: 'lifting', name: 'Lower Body Strength', rationale: 'Deadlift and split squats build the strength foundation for athletic goals', durationMin: 60, intensity: 'high',
      exercises: [
        { name: 'Deadlift', sets: 4, reps: '4-5', equipment: 'barbell' },
        { name: 'Bulgarian Split Squat', sets: 3, reps: '10', equipment: 'dumbbell' },
        { name: 'Leg Press', sets: 3, reps: '15', equipment: 'machine' },
        { name: 'Hamstring Curl', sets: 3, reps: '12', equipment: 'machine' },
        { name: 'Ab Wheel', sets: 3, reps: '12-15' },
      ] },
    { type: 'cardio', name: 'Sprint & Jump Session', rationale: 'Speed + reactive power for dunking — short explosive efforts with full recovery', durationMin: 40, intensity: 'high',
      exercises: [
        { name: 'Sprint', sets: 5, reps: '40m', notes: 'Full sprint, 2 min recovery' },
        { name: 'Box Jump', sets: 4, reps: '5', notes: 'Focus on explosiveness' },
        { name: 'Jump Squat', sets: 3, reps: '10' },
      ] },
  ],

  strength: [
    { type: 'lifting', name: 'Squat Day', rationale: 'Heavy back squat builds lower body max strength and hormonal response', durationMin: 70, intensity: 'high',
      exercises: [
        { name: 'Back Squat', sets: 5, reps: '5', equipment: 'barbell', notes: 'Main movement — add weight each week' },
        { name: 'Romanian Deadlift', sets: 3, reps: '8', equipment: 'barbell' },
        { name: 'Leg Press', sets: 3, reps: '12', equipment: 'machine' },
        { name: 'Leg Extension', sets: 3, reps: '15', equipment: 'machine' },
        { name: 'Calf Raise', sets: 4, reps: '15' },
      ] },
    { type: 'lifting', name: 'Bench + OHP Day', rationale: 'Upper pushing strength — bench and OHP are the cornerstones of pressing strength', durationMin: 70, intensity: 'high',
      exercises: [
        { name: 'Bench Press', sets: 5, reps: '5', equipment: 'barbell', notes: 'Add weight each session when possible' },
        { name: 'Overhead Press', sets: 4, reps: '5', equipment: 'barbell' },
        { name: 'Dips', sets: 3, reps: 'AMRAP' },
        { name: 'Tricep Pushdown', sets: 3, reps: '12', equipment: 'cable' },
        { name: 'Lateral Raise', sets: 3, reps: '15', equipment: 'dumbbell' },
      ] },
    { type: 'lifting', name: 'Deadlift Day', rationale: 'Conventional deadlift is the king of total-body strength development', durationMin: 65, intensity: 'high',
      exercises: [
        { name: 'Deadlift', sets: 5, reps: '5', equipment: 'barbell', notes: 'Heaviest movement of the week' },
        { name: 'Barbell Row', sets: 4, reps: '5', equipment: 'barbell' },
        { name: 'Pull-up', sets: 3, reps: 'AMRAP' },
        { name: 'Face Pulls', sets: 3, reps: '15', equipment: 'cable' },
        { name: 'Plank', sets: 3, reps: '45s' },
      ] },
    { type: 'lifting', name: 'Accessory Day', rationale: 'Hypertrophy accessories fill volume gaps and address weak points', durationMin: 60, intensity: 'moderate',
      exercises: [
        { name: 'Incline Bench Press', sets: 4, reps: '8', equipment: 'barbell' },
        { name: 'Dumbbell Row', sets: 4, reps: '10', equipment: 'dumbbell' },
        { name: 'Barbell Curl', sets: 3, reps: '10', equipment: 'barbell' },
        { name: 'Tricep Pushdown', sets: 3, reps: '12', equipment: 'cable' },
        { name: 'Lateral Raise', sets: 4, reps: '15', equipment: 'dumbbell' },
        { name: 'Ab Wheel', sets: 3, reps: '12' },
      ] },
  ],

  endurance: [
    { type: 'cardio', name: 'Easy Run', rationale: 'Aerobic base building — keep heart rate low (conversational pace) to build endurance', durationMin: 40, intensity: 'low',
      exercises: [
        { name: 'Sprint', sets: 1, reps: '30-40min easy', notes: 'Heart rate 130-150 BPM, conversational pace' },
      ] },
    { type: 'lifting', name: 'Strength Foundation', rationale: 'Runners need lower body strength to stay injury-free and improve economy', durationMin: 50, intensity: 'moderate',
      exercises: [
        { name: 'Back Squat', sets: 3, reps: '8', equipment: 'barbell' },
        { name: 'Romanian Deadlift', sets: 3, reps: '10', equipment: 'barbell' },
        { name: 'Calf Raise', sets: 4, reps: '20' },
        { name: 'Plank', sets: 3, reps: '45s' },
        { name: 'Hanging Leg Raise', sets: 3, reps: '12' },
      ] },
    { type: 'cardio', name: 'Interval Run', rationale: 'High intensity intervals improve VO2 max and running economy', durationMin: 45, intensity: 'high',
      exercises: [
        { name: 'Sprint', sets: 8, reps: '400m', notes: '80-90% effort, 90s rest between each' },
      ] },
    { type: 'cardio', name: 'Long Run', rationale: 'Weekly long run builds aerobic capacity and mental endurance', durationMin: 75, intensity: 'low',
      exercises: [
        { name: 'Sprint', sets: 1, reps: '60-90min easy', notes: 'Steady conversational pace, longest run of the week' },
      ] },
  ],

  upper: [
    { type: 'lifting', name: 'Pull-up Progression', rationale: 'Focused pull-up training for vertical pull strength — the key to pull-up goals', durationMin: 55, intensity: 'high',
      exercises: [
        { name: 'Pull-up', sets: 5, reps: 'AMRAP', notes: 'Rest 3 min between sets — quality over quantity' },
        { name: 'Lat Pulldown', sets: 3, reps: '8-10', equipment: 'cable', notes: 'Lat width and strength base' },
        { name: 'Cable Row', sets: 3, reps: '10', equipment: 'cable' },
        { name: 'Barbell Curl', sets: 3, reps: '10', equipment: 'barbell' },
        { name: 'Hammer Curl', sets: 3, reps: '12', equipment: 'dumbbell' },
      ] },
    { type: 'lifting', name: 'Push + Shoulders', rationale: 'Balanced shoulder/arm development with emphasis on lateral delts and presses', durationMin: 60, intensity: 'moderate',
      exercises: [
        { name: 'Overhead Press', sets: 4, reps: '8', equipment: 'barbell' },
        { name: 'Incline Bench Press', sets: 3, reps: '10-12', equipment: 'dumbbell' },
        { name: 'Lateral Raise', sets: 5, reps: '15', equipment: 'dumbbell', notes: 'Go heavy-ish — shoulder width key' },
        { name: 'Rear Delt Fly', sets: 4, reps: '15', equipment: 'dumbbell' },
        { name: 'Tricep Pushdown', sets: 3, reps: '12-15', equipment: 'cable' },
        { name: 'Dips', sets: 3, reps: 'AMRAP' },
      ] },
    { type: 'lifting', name: 'Back + Arms Volume', rationale: 'High volume arms and back work for aesthetics and pull-up strength', durationMin: 60, intensity: 'moderate',
      exercises: [
        { name: 'Chin-up', sets: 4, reps: 'AMRAP', notes: 'Supinated grip targets biceps more' },
        { name: 'Dumbbell Row', sets: 3, reps: '12', equipment: 'dumbbell' },
        { name: 'Face Pulls', sets: 3, reps: '15', equipment: 'cable' },
        { name: 'Barbell Curl', sets: 4, reps: '10', equipment: 'barbell' },
        { name: 'Hammer Curl', sets: 3, reps: '12', equipment: 'dumbbell' },
        { name: 'Tricep Pushdown', sets: 3, reps: '15', equipment: 'cable' },
      ] },
    { type: 'lifting', name: 'Full Body Accessory', rationale: 'Compound lifts build total strength as foundation for upper body goals', durationMin: 55, intensity: 'moderate',
      exercises: [
        { name: 'Bench Press', sets: 3, reps: '8', equipment: 'barbell' },
        { name: 'Barbell Row', sets: 3, reps: '8', equipment: 'barbell' },
        { name: 'Back Squat', sets: 3, reps: '8', equipment: 'barbell' },
        { name: 'Lateral Raise', sets: 4, reps: '15', equipment: 'dumbbell' },
        { name: 'Plank', sets: 3, reps: '45s' },
      ] },
  ],

  general: [
    { type: 'lifting', name: 'Full Body Strength A', rationale: 'Full-body training maximizes efficiency and builds balanced strength', durationMin: 55, intensity: 'moderate',
      exercises: [
        { name: 'Back Squat', sets: 3, reps: '8', equipment: 'barbell' },
        { name: 'Bench Press', sets: 3, reps: '8', equipment: 'barbell' },
        { name: 'Barbell Row', sets: 3, reps: '8', equipment: 'barbell' },
        { name: 'Plank', sets: 3, reps: '45s' },
      ] },
    { type: 'cardio', name: 'Cardio + Core', rationale: 'Aerobic health and core strength for general fitness', durationMin: 35, intensity: 'moderate',
      exercises: [
        { name: 'Sprint', sets: 1, reps: '25-30min', notes: 'Moderate pace — enjoy it' },
        { name: 'Plank', sets: 3, reps: '45s' },
        { name: 'Hanging Leg Raise', sets: 3, reps: '12' },
      ] },
    { type: 'lifting', name: 'Full Body Strength B', rationale: 'Variation on A — different exercises to hit all muscle groups', durationMin: 55, intensity: 'moderate',
      exercises: [
        { name: 'Deadlift', sets: 3, reps: '8', equipment: 'barbell' },
        { name: 'Overhead Press', sets: 3, reps: '8', equipment: 'barbell' },
        { name: 'Pull-up', sets: 3, reps: 'AMRAP' },
        { name: 'Ab Wheel', sets: 3, reps: '12' },
      ] },
  ],
}

// ─── Goal cluster mapping ─────────────────────────────────────────────────────

function getGoalCluster(goals: string[]): GoalCluster {
  if (goals.some(g => ['vertical-jump','core-abs'].includes(g))) return 'athletic'
  if (goals.some(g => ['strength','muscle-gain','prs'].includes(g))) return 'strength'
  if (goals.includes('endurance')) return 'endurance'
  return 'general'
}

function getWeekStart(): string {
  const d = new Date()
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Monday
  const mon = new Date(d.setDate(diff))
  return mon.toISOString().split('T')[0]
}

function genId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

const DAY_INDEX: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 }

// ─── Plan generator ───────────────────────────────────────────────────────────

export function generateWeeklyPlan(profile: TrainingProfile): WorkoutPlan {
  const cluster = getGoalCluster(profile.goals)
  const sessions = PLAN_SESSIONS[cluster]
  const daysNeeded = Math.min(profile.daysPerWeek, sessions.length)

  // Pick preferred days; fill remaining with rest
  let preferredIdxs = profile.preferredDays
    .map(d => DAY_INDEX[d.toLowerCase()] ?? -1)
    .filter(i => i >= 0)
    .sort((a, b) => a - b)

  // If user chose more days than available sessions, trim; fewer than preferred, take first N
  if (preferredIdxs.length < daysNeeded) {
    // Auto-fill remaining preferred days: 1,3,5,0 (Mon,Wed,Fri,Sun)
    const auto = [1,3,5,0,2,4,6].filter(d => !preferredIdxs.includes(d))
    preferredIdxs = [...preferredIdxs, ...auto].slice(0, daysNeeded)
  }
  preferredIdxs = preferredIdxs.slice(0, daysNeeded).sort((a, b) => a - b)

  // Assign training sessions to preferred days
  const planDays: WorkoutPlanDay[] = []
  let sessionIdx = 0
  for (let dow = 0; dow < 7; dow++) {
    if (preferredIdxs.includes(dow) && sessionIdx < daysNeeded) {
      const s = sessions[sessionIdx % sessions.length]
      // Filter exercises to available equipment
      const exercises = filterExercisesToEquipment(s.exercises, profile.equipment)
      planDays.push({ dayOfWeek: dow, ...s, exercises })
      sessionIdx++
    } else {
      // Rest or active recovery
      const prevWasHard = planDays.length > 0 && planDays[planDays.length - 1].intensity === 'high'
      planDays.push({
        dayOfWeek: dow,
        type: 'rest',
        name: prevWasHard ? 'Recovery Day' : 'Rest Day',
        rationale: prevWasHard
          ? 'Your muscles need 48h to repair after high-intensity training — growth happens during rest'
          : 'Scheduled rest keeps you fresh and prevents overtraining',
        durationMin: 0,
        intensity: 'low',
        exercises: [],
      })
    }
  }

  return {
    id: genId('plan'),
    weekStartDate: getWeekStart(),
    days: planDays,
    generatedFrom: profile.goals,
    status: 'active',
    createdAt: new Date().toISOString(),
  }
}

function filterExercisesToEquipment(exercises: PlanExercise[], equipment: string[]): PlanExercise[] {
  return exercises.map(ex => {
    if (!ex.equipment) return ex
    if (equipment.includes(ex.equipment)) return ex
    // Try to substitute equipment
    if (ex.equipment === 'barbell' && equipment.includes('dumbbell')) return { ...ex, equipment: 'dumbbell' }
    if (ex.equipment === 'barbell' && equipment.includes('smith')) return { ...ex, equipment: 'smith' }
    if (ex.equipment === 'cable' && equipment.includes('machine')) return { ...ex, equipment: 'machine' }
    if (ex.equipment === 'machine' && equipment.includes('dumbbell')) return { ...ex, equipment: 'dumbbell' }
    if (equipment.includes('bodyweight')) return { ...ex, equipment: 'bodyweight' }
    return ex // keep as-is and note equipment may not be available
  })
}

// ─── Workout suggestion engine ────────────────────────────────────────────────

export interface WorkoutSuggestion {
  type: string
  name: string
  rationale: string
  durationMin: number
  intensity: 'low' | 'moderate' | 'high'
  exercises: PlanExercise[]
  warning?: string
  avoidToday?: string
  source: 'plan' | 'rule'
}

export async function getWorkoutSuggestion(
  goals: string[],
  todayHRV?: number,
  todaySleepHours?: number,
): Promise<WorkoutSuggestion> {
  // Check for active plan
  const db = await getDB()
  const plans = await db.getAll('workout_plans')
  const activePlan = plans.find(p => p.status === 'active')

  const today = new Date()
  const dow = today.getDay()

  if (activePlan) {
    const planDay = activePlan.days.find(d => d.dayOfWeek === dow)
    if (planDay) {
      const warning = buildRecoveryWarning(todayHRV, todaySleepHours, planDay.intensity)
      return { ...planDay, type: planDay.type, warning, source: 'plan' }
    }
  }

  // Rule-based fallback
  const recent = await getRecentWorkouts(7)
  const cluster = getGoalCluster(goals)
  const sessions = PLAN_SESSIONS[cluster]

  // Find what was done recently to avoid back-to-back same sessions
  const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0]
  const yesterdayWorkout = recent.find(w => w.date === yesterdayStr)

  let sessionIdx = recent.length % sessions.length
  // If yesterday was high-intensity lifting, suggest cardio or rest
  if (yesterdayWorkout && yesterdayWorkout.type === 'lifting') {
    const next = sessions.find(s => s.type !== 'lifting') ?? sessions[sessionIdx]
    const warning = buildRecoveryWarning(todayHRV, todaySleepHours, next.intensity)
    return { ...next, type: next.type, warning, source: 'rule' }
  }

  // If no workout in 2+ days and cardio, push cardio
  const daysSinceCardio = getDaysSinceType(recent, 'cardio')
  if (daysSinceCardio >= 3 && cluster === 'athletic') {
    const cardioSession = sessions.find(s => s.type === 'cardio') ?? sessions[0]
    return { ...cardioSession, type: cardioSession.type,
      rationale: `${cardioSession.rationale} (no cardio in ${daysSinceCardio} days)`,
      source: 'rule' }
  }

  const suggestion = sessions[sessionIdx]
  const warning = buildRecoveryWarning(todayHRV, todaySleepHours, suggestion.intensity)
  return { ...suggestion, type: suggestion.type, warning, source: 'rule' }
}

function getDaysSinceType(recent: WorkoutSession[], type: string): number {
  const match = recent.find(w => w.type === type)
  if (!match) return 99
  const days = Math.floor((Date.now() - new Date(match.date).getTime()) / 86400000)
  return days
}

function buildRecoveryWarning(hrv?: number, sleep?: number, intensity?: string): string | undefined {
  if (hrv != null && hrv < 40 && intensity === 'high') return `HRV is low (${hrv}ms) — consider reducing intensity or switching to recovery.`
  if (sleep != null && sleep < 6 && intensity === 'high') return `Sleep was short (${sleep.toFixed(1)}h) — high-intensity training may impair recovery.`
  return undefined
}

// ─── Training profile CRUD ────────────────────────────────────────────────────

export async function getTrainingProfile(): Promise<TrainingProfile | null> {
  const db = await getDB()
  const p = await db.get('training_profile', 'main')
  return p ?? null
}

export async function saveTrainingProfile(profile: Omit<TrainingProfile, 'id' | 'updatedAt'>): Promise<TrainingProfile> {
  const db = await getDB()
  const full: TrainingProfile = { ...profile, id: 'main', updatedAt: new Date().toISOString() }
  await db.put('training_profile', full)
  return full
}

// ─── Workout plan CRUD ────────────────────────────────────────────────────────

export async function saveWorkoutPlan(plan: WorkoutPlan): Promise<void> {
  const db = await getDB()
  // Archive existing active plans first
  const existing = await db.getAll('workout_plans')
  for (const p of existing) {
    if (p.status === 'active') await db.put('workout_plans', { ...p, status: 'archived' })
  }
  await db.put('workout_plans', plan)
}

export async function getActivePlan(): Promise<WorkoutPlan | null> {
  const db = await getDB()
  const all = await db.getAll('workout_plans')
  return all.find(p => p.status === 'active') ?? null
}

export async function getAllPlans(): Promise<WorkoutPlan[]> {
  const db = await getDB()
  const all = await db.getAll('workout_plans')
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

// ─── Exercise library CRUD ────────────────────────────────────────────────────

export async function getExerciseLibrary(): Promise<ExerciseLibraryEntry[]> {
  const db = await getDB()
  const all = await db.getAll('exercise_library')
  return all.sort((a, b) => {
    if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

export async function saveExerciseLibraryEntry(entry: ExerciseLibraryEntry): Promise<void> {
  const db = await getDB()
  await db.put('exercise_library', entry)
}

export async function deleteExerciseLibraryEntry(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('exercise_library', id)
}

export async function toggleExerciseFavorite(id: string): Promise<void> {
  const db = await getDB()
  const existing = await db.get('exercise_library', id)
  if (!existing) return
  await db.put('exercise_library', { ...existing, isFavorite: !existing.isFavorite })
}

export async function seedExerciseLibraryIfEmpty(): Promise<void> {
  const db = await getDB()
  const count = await db.count('exercise_library')
  if (count > 0) return
  const now = new Date().toISOString()
  for (const ex of DEFAULT_EXERCISES) {
    const id = genId('ex')
    await db.put('exercise_library', { ...ex, id, isFavorite: false, isCustom: false, createdAt: now })
  }
}

// ─── Exercise history (for progress page) ────────────────────────────────────

export interface ExerciseHistory {
  name: string
  sessions: Array<{
    date: string
    sets: Array<{ reps: number; weightLbs: number; e1rm?: number; isPR?: boolean; equipment?: string }>
    bestE1RM: number
    volume: number
  }>
  allTimePR: number
  suggestion: string
}

export async function getExerciseHistory(exerciseName: string): Promise<ExerciseHistory> {
  const all = await getRecentWorkouts(200)
  const sessions: ExerciseHistory['sessions'] = []
  let allTimePR = 0

  for (const w of all) {
    const ex = w.exercises.find(e => e.name.toLowerCase() === exerciseName.toLowerCase())
    if (!ex) continue
    const bestE1RM = Math.max(0, ...ex.sets.map(s => s.e1rm ?? 0))
    const volume = ex.sets.reduce((n, s) => n + s.weightLbs * s.reps, 0)
    if (bestE1RM > allTimePR) allTimePR = bestE1RM
    sessions.push({ date: w.date, sets: ex.sets, bestE1RM, volume })
  }

  sessions.sort((a, b) => b.date.localeCompare(a.date))
  const lastSession = sessions[0]
  const suggestion = lastSession
    ? suggestNextSet(lastSession.sets, lastSession.sets[0]?.equipment as string ?? 'barbell')
    : 'Log this exercise to get progressive overload suggestions.'

  return { name: exerciseName, sessions, allTimePR, suggestion }
}
