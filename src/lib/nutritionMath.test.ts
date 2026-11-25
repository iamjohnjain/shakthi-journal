import { describe, it, expect } from 'vitest'
import { calcNutrition, rebalanceMacros, ageFromDob, impliedRateLbsPerWeek } from './nutritionMath'

const john = {
  sex: 'male', dob: '1996-01-01', heightCm: 188, currentWeightLbs: 199,
  goalWeightLbs: 185, activityLevel: 'active',
}

describe('calcNutrition', () => {
  it('uses height, sex, age and weight', () => {
    const base = calcNutrition({ ...john, rateLbsPerWeek: 0 })
    expect(calcNutrition({ ...john, heightCm: 160, rateLbsPerWeek: 0 }).calories).toBeLessThan(base.calories)
    expect(calcNutrition({ ...john, sex: 'female', rateLbsPerWeek: 0 }).calories).toBeLessThan(base.calories)
    expect(calcNutrition({ ...john, currentWeightLbs: 250, rateLbsPerWeek: 0 }).calories).toBeGreaterThan(base.calories)
    expect(calcNutrition({ ...john, activityLevel: 'sedentary', rateLbsPerWeek: 0 }).calories).toBeLessThan(base.calories)
  })

  it('subtracts 500/day per lb/week to lose and adds to gain', () => {
    const m = calcNutrition({ ...john, rateLbsPerWeek: 0 }).calories
    expect(calcNutrition({ ...john, rateLbsPerWeek: 1 }).calories).toBe(m - 500)
    expect(calcNutrition({ ...john, rateLbsPerWeek: -0.5 }).calories).toBe(m + 250)
  })

  it('never goes below the safety floor', () => {
    expect(calcNutrition({ ...john, sex: 'female', heightCm: 150, currentWeightLbs: 110, goalWeightLbs: 105, activityLevel: 'sedentary', rateLbsPerWeek: 2 }).calories).toBe(1200)
    expect(calcNutrition({ ...john, activityLevel: 'sedentary', rateLbsPerWeek: 2 }).calories).toBeGreaterThanOrEqual(1500)
  })

  it('sets protein to 1 g per lb of goal weight and macros add up', () => {
    const n = calcNutrition({ ...john, rateLbsPerWeek: 1 })
    expect(n.proteinG).toBe(185)
    expect(Math.abs(n.proteinG * 4 + n.carbsG * 4 + n.fatG * 9 - n.calories)).toBeLessThan(12)
  })

  it('implied rate inverts the calorie step', () => {
    const n = calcNutrition({ ...john, rateLbsPerWeek: 1 })
    expect(impliedRateLbsPerWeek(n.calories, john)).toBeCloseTo(1, 1)
  })
})

describe('rebalanceMacros', () => {
  const g = { calories: 2300, proteinG: 200, carbsG: 210, fatG: 64 }
  const total = (x: typeof g) => x.proteinG * 4 + x.carbsG * 4 + x.fatG * 9

  it('keeps calories when protein changes', () => {
    const r = rebalanceMacros(g, 'proteinG', 150)
    expect(r.calories).toBe(2300)
    expect(r.carbsG).toBeGreaterThan(g.carbsG)
    expect(r.fatG).toBeGreaterThan(g.fatG)
    expect(Math.abs(total(r) - 2300)).toBeLessThan(10)
  })

  it('carbs and fat trade off against each other', () => {
    const r = rebalanceMacros(g, 'carbsG', 250)
    expect(r.fatG).toBeLessThan(g.fatG)
    const f = rebalanceMacros(g, 'fatG', 50)
    expect(f.carbsG).toBeGreaterThan(g.carbsG)
  })

  it('rescales carbs and fat when calories change, protein fixed', () => {
    const r = rebalanceMacros(g, 'calories', 2600)
    expect(r.proteinG).toBe(200)
    expect(Math.abs(total(r) - 2600)).toBeLessThan(10)
  })
})

describe('ageFromDob', () => {
  it('handles birthdays', () => {
    expect(ageFromDob('2000-06-15', new Date('2026-06-14T12:00:00'))).toBe(25)
    expect(ageFromDob('2000-06-15', new Date('2026-06-15T12:00:00'))).toBe(26)
    expect(ageFromDob(undefined)).toBeUndefined()
  })
})
