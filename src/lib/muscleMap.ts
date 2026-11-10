// Rule-based exercise → muscle-group classification for the History tab's
// training heatmap. No AI/API calls — matches the app's existing "Coach
// Notes" philosophy of deterministic, offline logic (see CLAUDE.md).

export type MuscleGroup =
  | 'chest' | 'upperChest'
  | 'shoulders' | 'rearDelts'
  | 'lats' | 'traps' | 'lowerBack'
  | 'biceps' | 'triceps' | 'forearms'
  | 'core'
  | 'quads' | 'hamstrings' | 'glutes' | 'calves'
  | 'hipFlexors'

export type VisualRegion =
  | 'chest' | 'shoulders' | 'back' | 'biceps' | 'triceps' | 'core'
  | 'quads' | 'hamstrings' | 'glutes' | 'calves'

export const REGION_MUSCLES: Record<VisualRegion, MuscleGroup[]> = {
  chest:      ['chest', 'upperChest'],
  shoulders:  ['shoulders', 'rearDelts'],
  back:       ['lats', 'traps', 'lowerBack'],
  biceps:     ['biceps', 'forearms'],
  triceps:    ['triceps'],
  core:       ['core', 'hipFlexors'],
  quads:      ['quads'],
  hamstrings: ['hamstrings'],
  glutes:     ['glutes'],
  calves:     ['calves'],
}

export const REGION_LABEL: Record<VisualRegion, string> = {
  chest: 'Chest', shoulders: 'Shoulders', back: 'Back', biceps: 'Biceps',
  triceps: 'Triceps', core: 'Core', quads: 'Quads', hamstrings: 'Hamstrings',
  glutes: 'Glutes', calves: 'Calves',
}

export const MUSCLE_LABEL: Record<MuscleGroup, string> = {
  chest: 'Chest', upperChest: 'Upper Chest',
  shoulders: 'Shoulders', rearDelts: 'Rear Delts',
  lats: 'Lats', traps: 'Traps', lowerBack: 'Lower Back',
  biceps: 'Biceps', triceps: 'Triceps', forearms: 'Forearms',
  core: 'Core',
  quads: 'Quads', hamstrings: 'Hamstrings', glutes: 'Glutes', calves: 'Calves',
  hipFlexors: 'Hip Flexors',
}

/** Roughly how many working sets/week each muscle generally wants, per
    commonly-cited hypertrophy volume-landmark guidance. General guidance
    only — not personalized or medical. */
export const WEEKLY_SET_TARGET: Record<MuscleGroup, number> = {
  chest: 12, upperChest: 6,
  shoulders: 10, rearDelts: 8,
  lats: 10, traps: 6, lowerBack: 6,
  biceps: 8, triceps: 10, forearms: 4,
  core: 10,
  quads: 12, hamstrings: 8, glutes: 10, calves: 8,
  hipFlexors: 4,
}

export function regionTarget(region: VisualRegion): number {
  return REGION_MUSCLES[region].reduce((sum, m) => sum + WEEKLY_SET_TARGET[m], 0)
}

/** Hand-authored per exercise name — not parsed from EXERCISE_LIBRARY's
    display `muscles` string, which is too ambiguous (e.g. it tags Barbell
    Row, Cable Row, and Deadlift all partly "Back" even though their real
    targets differ). Keyed to the exact names in workoutStore.EXERCISE_LIBRARY. */
export const EXERCISE_MUSCLE_MAP: Record<string, MuscleGroup[]> = {
  'Back Squat':            ['quads', 'glutes', 'hamstrings', 'core'],
  'Front Squat':           ['quads', 'core'],
  'Romanian Deadlift':     ['hamstrings', 'glutes', 'lowerBack'],
  'Bulgarian Split Squat': ['quads', 'glutes'],
  'Leg Press':             ['quads', 'glutes'],
  'Hamstring Curl':        ['hamstrings'],
  'Leg Extension':         ['quads'],
  'Calf Raises':           ['calves'],
  'Hip Thrust':            ['glutes', 'hamstrings'],

  'Bench Press':           ['chest', 'triceps', 'shoulders'],
  'Incline DB Bench':      ['upperChest', 'shoulders', 'triceps'],
  'Shoulder Press':        ['shoulders', 'triceps'],
  'Lateral Raises':        ['shoulders'],
  'Dips':                  ['triceps', 'chest', 'shoulders'],
  'Tricep Pushdown':       ['triceps'],
  'Cable Fly':             ['chest'],

  'Pull-ups':              ['lats', 'biceps', 'traps'],
  'Lat Pulldown':          ['lats', 'biceps'],
  'Barbell Row':           ['lats', 'traps', 'rearDelts', 'biceps', 'lowerBack'],
  'Cable Row':             ['lats', 'traps', 'rearDelts', 'biceps'],
  'Deadlift':              ['lowerBack', 'traps', 'lats', 'glutes', 'hamstrings'],
  'Face Pulls':            ['rearDelts', 'traps'],
  'Barbell Curl':          ['biceps'],

  'Plank':                 ['core'],
  'Ab Wheel':              ['core', 'hipFlexors'],
  'Hanging Leg Raises':    ['core', 'hipFlexors'],
}

/** Ordered most-specific-first — the first match wins, so a name like
    "Leg Curl" must be checked before a generic "leg" pattern (there isn't
    one, intentionally — "leg" alone is too ambiguous to classify). */
const FALLBACK_PATTERNS: { pattern: RegExp; muscles: MuscleGroup[] }[] = [
  { pattern: /deadlift/i,                                   muscles: ['lowerBack', 'glutes', 'hamstrings', 'traps', 'lats'] },
  { pattern: /\brdl\b|romanian/i,                           muscles: ['hamstrings', 'glutes', 'lowerBack'] },
  { pattern: /squat/i,                                      muscles: ['quads', 'glutes', 'hamstrings', 'core'] },
  { pattern: /lunge|step[- ]?up/i,                          muscles: ['quads', 'glutes'] },
  { pattern: /leg curl|hamstring curl/i,                    muscles: ['hamstrings'] },
  { pattern: /leg extension/i,                              muscles: ['quads'] },
  { pattern: /leg press/i,                                  muscles: ['quads', 'glutes'] },
  { pattern: /calf/i,                                       muscles: ['calves'] },
  { pattern: /hip thrust|glute bridge/i,                    muscles: ['glutes', 'hamstrings'] },
  { pattern: /pulldown|pull[- ]?up|chin[- ]?up/i,           muscles: ['lats', 'biceps'] },
  { pattern: /face pull/i,                                  muscles: ['rearDelts', 'traps'] },
  { pattern: /\brow\b/i,                                    muscles: ['lats', 'traps', 'rearDelts', 'biceps'] },
  { pattern: /overhead press|shoulder press|military press/i, muscles: ['shoulders', 'triceps'] },
  { pattern: /lateral raise|side raise/i,                   muscles: ['shoulders'] },
  { pattern: /front raise/i,                                muscles: ['shoulders'] },
  { pattern: /incline/i,                                    muscles: ['upperChest', 'shoulders', 'triceps'] },
  { pattern: /bench|chest press|\bfly\b|flye|pec deck/i,    muscles: ['chest', 'triceps', 'shoulders'] },
  { pattern: /dip/i,                                        muscles: ['triceps', 'chest', 'shoulders'] },
  { pattern: /tricep|pushdown|skull ?crusher|close[- ]?grip/i, muscles: ['triceps'] },
  { pattern: /curl/i,                                       muscles: ['biceps'] },
  { pattern: /plank|crunch|sit[- ]?up|\bab\b|\babs\b|core|wood ?chop|russian twist/i, muscles: ['core'] },
  { pattern: /leg raise/i,                                  muscles: ['core', 'hipFlexors'] },
]

/** Exact library match first, then the first matching fallback pattern.
    No match → trains nothing we know of; never force a guess. */
export function classifyExercise(name: string): MuscleGroup[] {
  const exact = EXERCISE_MUSCLE_MAP[name]
  if (exact) return exact
  const hit = FALLBACK_PATTERNS.find(p => p.pattern.test(name))
  return hit?.muscles ?? []
}
