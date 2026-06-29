import { useState, useEffect, useCallback } from 'react'
import { getSetting, setSetting } from '../db'
import type { NutritionGoals } from '../db'

export type MealStyle = 'standard' | 'numbered'

const DEFAULT_STANDARD_LABELS = ['Breakfast', 'Lunch', 'Dinner', 'Snack']
const DEFAULT_NUMBERED_LABELS  = ['Meal 1', 'Meal 2', 'Meal 3', 'Meal 4', 'Snack']

export const DEFAULT_GOALS: NutritionGoals = {
  calories: 2300,
  proteinG: 200,
  carbsG: 200,
  fatG: 70,
  waterMl: 3785,
  macroFirstMode: false,
}

function calcCaloriesFromMacros(p: number, c: number, f: number) {
  return Math.round(p * 4 + c * 4 + f * 9)
}

export function useNutritionSettings() {
  const [mealStyle,   setMealStyleState]   = useState<MealStyle>('numbered')
  const [mealLabels,  setMealLabelsState]  = useState<string[]>(DEFAULT_NUMBERED_LABELS)
  const [activeMeals, setActiveMealsState] = useState(4)
  const [goals,       setGoalsState]       = useState<NutritionGoals>(DEFAULT_GOALS)
  const [loaded,      setLoaded]           = useState(false)

  useEffect(() => {
    Promise.all([
      getSetting<MealStyle>('meal-style', 'numbered'),
      getSetting<string[]>('meal-labels', DEFAULT_NUMBERED_LABELS),
      getSetting<number>('active-meals', 4),
      getSetting<NutritionGoals>('nutrition-goals', DEFAULT_GOALS),
    ]).then(([style, labels, active, g]) => {
      setMealStyleState(style)
      setMealLabelsState(labels)
      setActiveMealsState(active)
      setGoalsState({ ...DEFAULT_GOALS, ...g })
      setLoaded(true)
    })
  }, [])

  const setMealStyle = useCallback((style: MealStyle) => {
    const labels = style === 'standard' ? DEFAULT_STANDARD_LABELS : DEFAULT_NUMBERED_LABELS
    const active = style === 'standard' ? 4 : 4
    setMealStyleState(style)
    setMealLabelsState(labels)
    setActiveMealsState(active)
    setSetting('meal-style', style)
    setSetting('meal-labels', labels)
    setSetting('active-meals', active)
  }, [])

  const updateMealLabel = useCallback((idx: number, label: string) => {
    setMealLabelsState(prev => {
      const next = [...prev]
      next[idx] = label
      setSetting('meal-labels', next)
      return next
    })
  }, [])

  const setActiveMeals = useCallback((n: number) => {
    setActiveMealsState(n)
    setSetting('active-meals', n)
  }, [])

  const updateGoals = useCallback((updates: Partial<NutritionGoals>) => {
    setGoalsState(prev => {
      const next = { ...prev, ...updates }
      // In macro-first mode, recalculate calories from macros
      if (next.macroFirstMode && (updates.proteinG != null || updates.carbsG != null || updates.fatG != null)) {
        next.calories = calcCaloriesFromMacros(next.proteinG, next.carbsG, next.fatG)
      }
      setSetting('nutrition-goals', next)
      return next
    })
  }, [])

  // Active meal labels (trimmed to activeMeals count)
  const activeMealLabels = mealLabels.slice(0, activeMeals)

  // Meal IDs derived from style
  const mealIds = mealStyle === 'standard'
    ? ['breakfast', 'lunch', 'dinner', 'snack'].slice(0, activeMeals)
    : Array.from({ length: activeMeals }, (_, i) => `meal-${i + 1}`)

  return {
    mealStyle, mealLabels, activeMeals, activeMealLabels, mealIds, goals, loaded,
    setMealStyle, updateMealLabel, setActiveMeals, updateGoals,
  }
}
