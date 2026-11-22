// Shared nutrition-goal math — originally lived only in OnboardingPage.tsx,
// pulled out so GoalRing's weight-goal modal can reuse the exact same
// formula instead of hardcoding a second copy of the conversion factor.

export const ACTIVITY_MULTIPLIERS: Record<string, number> = {
  sedentary: 12, light: 13, moderate: 14, active: 15.5, 'very-active': 17,
}

// 3500 kcal ≈ 1 lb of fat, so a weekly deficit of (rate × 3500) kcal spread
// over 7 days is (rate × 500) kcal/day — the standard, uncontroversial
// conversion (no fancier metabolic-adaptation modeling here, same spirit as
// the rest of this app's "simple and honest over falsely precise" formulas).
// Floored at 1200 cal/day regardless of rate — a safety floor, not a
// suggestion, so an aggressive rate selection can't compute something unsafe.
export const MIN_SAFE_CALORIES = 1200
export const CALORIE_DEFICIT_PER_LB_PER_WEEK = 500

export function calcNutrition(goalWeightLbs: number, activityLevel: string, rateLbsPerWeek: number) {
  const multiplier = ACTIVITY_MULTIPLIERS[activityLevel] ?? 14
  const baseCalories = goalWeightLbs * multiplier
  const calories = Math.max(MIN_SAFE_CALORIES, Math.round(baseCalories - rateLbsPerWeek * CALORIE_DEFICIT_PER_LB_PER_WEEK))
  // 1g per lb of goal weight by default (not the old 0.82g/lb factor) — still
  // freely adjustable down from there on the same screen.
  const proteinG = Math.round(goalWeightLbs * 1.0)
  const proteinCal = proteinG * 4
  const fatG = Math.max(0, Math.round((calories - proteinCal) * 0.3 / 9))
  const carbsG = Math.max(0, Math.round((calories - proteinCal) * 0.7 / 4))
  return { calories, proteinG, fatG, carbsG, waterMl: 3785 }
}

/** The inverse of calcNutrition's calorie formula — given a calorie number
    someone arrived at by editing macros directly (not through the rate
    picker), works out what weekly weight-change pace that number actually
    implies, so a macro-first edit can still be explained in rate terms
    instead of leaving the calorie number as a bare, context-free total. */
export function impliedRateLbsPerWeek(calories: number, goalWeightLbs: number, activityLevel: string): number {
  const multiplier = ACTIVITY_MULTIPLIERS[activityLevel] ?? 14
  const baseCalories = goalWeightLbs * multiplier
  return (baseCalories - calories) / CALORIE_DEFICIT_PER_LB_PER_WEEK
}
