// Shared nutrition-goal math — used by onboarding, the Edit Nutrition Goals
// sheet, the weight-goal editor, and GoalRing so every surface computes the
// exact same numbers from the exact same inputs.
//
// Calories: Mifflin-St Jeor BMR (sex, age, height, current weight) × an
// activity factor = maintenance (TDEE), then ±500 kcal/day per lb/week of
// pace, floored at a sex-based safety minimum.
// Macros: protein 1 g per lb of goal weight, fat ~25% of calories (never
// below 0.3 g/lb), carbs take whatever is left.

export const ACTIVITY_FACTORS: Record<string, number> = {
  sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, 'very-active': 1.9,
}

export const CALORIE_DEFICIT_PER_LB_PER_WEEK = 500
export const MIN_SAFE_CALORIES = 1200
const MIN_CALORIES_BY_SEX: Record<string, number> = { male: 1500, female: 1200, other: 1350 }

const FAT_SHARE = 0.25
const MIN_FAT_G_PER_LB = 0.3
const PROTEIN_G_PER_LB = 1.0

// Fallbacks when a profile field was skipped — middle-of-the-road values so
// a partial profile still gets a sensible (if less personal) number.
const DEFAULT_AGE = 30
const DEFAULT_HEIGHT_CM = 175

export interface NutritionInputs {
  sex?: string
  /** 'YYYY-MM-DD' */
  dob?: string
  heightCm?: number
  currentWeightLbs?: number
  goalWeightLbs: number
  activityLevel?: string
  /** Positive = lose, negative = gain, 0 = maintain. */
  rateLbsPerWeek: number
}

export interface MacroGoals {
  calories: number
  proteinG: number
  carbsG: number
  fatG: number
}

export function ageFromDob(dob: string | undefined, today = new Date()): number | undefined {
  if (!dob) return undefined
  const d = new Date(dob + 'T00:00:00')
  if (isNaN(d.getTime())) return undefined
  let age = today.getFullYear() - d.getFullYear()
  const m = today.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--
  return age > 0 && age < 120 ? age : undefined
}

/** Maintenance calories (TDEE) before any pace adjustment. */
export function maintenanceCalories(i: Omit<NutritionInputs, 'rateLbsPerWeek'>): number {
  const weightLbs = i.currentWeightLbs && i.currentWeightLbs > 0 ? i.currentWeightLbs : i.goalWeightLbs
  const kg = weightLbs / 2.20462
  const cm = i.heightCm && i.heightCm > 0 ? i.heightCm : DEFAULT_HEIGHT_CM
  const age = ageFromDob(i.dob) ?? DEFAULT_AGE
  const sexOffset = i.sex === 'male' ? 5 : i.sex === 'female' ? -161 : -78
  const bmr = 10 * kg + 6.25 * cm - 5 * age + sexOffset
  return bmr * (ACTIVITY_FACTORS[i.activityLevel ?? ''] ?? ACTIVITY_FACTORS.moderate)
}

export function minSafeCalories(sex?: string): number {
  return MIN_CALORIES_BY_SEX[sex ?? ''] ?? MIN_CALORIES_BY_SEX.other
}

export function calcNutrition(i: NutritionInputs): MacroGoals & { waterMl: number } {
  const tdee = maintenanceCalories(i)
  const calories = Math.max(
    minSafeCalories(i.sex),
    Math.round(tdee / 10) * 10 - Math.round(i.rateLbsPerWeek * CALORIE_DEFICIT_PER_LB_PER_WEEK),
  )
  const proteinG = Math.round(i.goalWeightLbs * PROTEIN_G_PER_LB)
  const fatG = Math.round(Math.max(calories * FAT_SHARE / 9, i.goalWeightLbs * MIN_FAT_G_PER_LB))
  const carbsG = Math.max(0, Math.round((calories - proteinG * 4 - fatG * 9) / 4))
  return { calories, proteinG, carbsG, fatG, waterMl: 3785 }
}

/** Inverse of calcNutrition's calorie step: the weekly pace a calorie number
    implies (positive = losing, negative = gaining). */
export function impliedRateLbsPerWeek(calories: number, i: Omit<NutritionInputs, 'rateLbsPerWeek'>): number {
  return (maintenanceCalories(i) - calories) / CALORIE_DEFICIT_PER_LB_PER_WEEK
}

/**
 * Linked macro editing: change one field and the others follow.
 * - calories → protein stays, carbs and fat rescale to fill the new budget
 * - protein  → calories stay, carbs and fat shrink/grow proportionally
 * - carbs    → calories and protein stay, fat absorbs the difference
 * - fat      → calories and protein stay, carbs absorb the difference
 */
export function rebalanceMacros(g: MacroGoals, field: keyof MacroGoals, value: number): MacroGoals {
  const v = Math.max(0, Math.round(value))
  const next = { ...g, [field]: v }
  const splitRest = (cal: number, protein: number, carbs: number, fat: number) => {
    const rest = Math.max(0, cal - protein * 4)
    const cc = carbs * 4, fc = fat * 9
    const carbShare = cc + fc > 0 ? cc / (cc + fc) : 1 - FAT_SHARE
    return {
      carbsG: Math.round(rest * carbShare / 4),
      fatG: Math.round(rest * (1 - carbShare) / 9),
    }
  }
  switch (field) {
    case 'calories':
      return { ...next, ...splitRest(v, g.proteinG, g.carbsG, g.fatG) }
    case 'proteinG':
      return { ...next, ...splitRest(g.calories, v, g.carbsG, g.fatG) }
    case 'carbsG':
      return { ...next, fatG: Math.max(0, Math.round((g.calories - g.proteinG * 4 - v * 4) / 9)) }
    case 'fatG':
      return { ...next, carbsG: Math.max(0, Math.round((g.calories - g.proteinG * 4 - v * 9) / 4)) }
  }
}
