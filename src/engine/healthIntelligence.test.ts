import { describe, it, expect } from 'vitest'
import {
  generateDailyInsights,
  calcWeightTrend,
  weeklyProteinAvg,
  proteinFoodSuggestion,
  topInsights,
  type EngineInput,
  type WeightPoint,
} from './healthIntelligence'

const baseInput: EngineInput = {
  dateStr: '2026-06-25',
  hourOfDay: 14,
  hrv: null,
  sleepHours: null,
  sleepScore: null,
  restingHR: null,
  hrBaseline: null,
  steps: null,
  proteinG: 0,
  caloriesIn: 0,
  proteinGoal: 180,
  caloriesGoal: 2500,
  weightHistory: [],
  goalWeightKg: null,
  goalTypes: [],
  todayWorkout: null,
  recentWorkouts: [],
  weeklyProteinG: [],
  weeklyCaloriesIn: [],
  hasAppleHealthData: false,
  isMockMode: false,
  avgHrv: null,
  avgSleepHours: null,
}

describe('generateDailyInsights', () => {
  it('returns empty array in mock mode', () => {
    const insights = generateDailyInsights({ ...baseInput, isMockMode: true })
    expect(insights).toHaveLength(0)
  })

  it('returns sorted by priority', () => {
    const input: EngineInput = {
      ...baseInput,
      proteinG: 50,
      hourOfDay: 16,
    }
    const insights = generateDailyInsights(input)
    for (let i = 1; i < insights.length; i++) {
      expect(insights[i].priority).toBeGreaterThanOrEqual(insights[i - 1].priority)
    }
  })

  it('generates protein-gap insight when protein is logged but below goal', () => {
    const input: EngineInput = { ...baseInput, proteinG: 80, caloriesIn: 1200 }
    const insights = generateDailyInsights(input)
    const gap = insights.find(i => i.id === 'protein-gap')
    expect(gap).toBeDefined()
    expect(gap?.title).toContain('100g protein remaining')
  })

  it('generates protein-hit insight when protein meets goal', () => {
    const input: EngineInput = { ...baseInput, proteinG: 182 }
    const insights = generateDailyInsights(input)
    const hit = insights.find(i => i.id === 'protein-hit')
    expect(hit).toBeDefined()
    expect(hit?.severity).toBe('positive')
  })

  it('generates low-recovery insight for low HRV', () => {
    const input: EngineInput = { ...baseInput, hrv: 30, hasAppleHealthData: true }
    const insights = generateDailyInsights(input)
    const rec = insights.find(i => i.id === 'recovery-low')
    expect(rec).toBeDefined()
    expect(rec?.severity).toBe('warning')
  })

  it('generates peak-recovery insight for high HRV + good sleep', () => {
    const input: EngineInput = {
      ...baseInput,
      hrv: 75,
      sleepHours: 8,
      hasAppleHealthData: true,
    }
    const insights = generateDailyInsights(input)
    const rec = insights.find(i => i.id === 'recovery-peak')
    expect(rec).toBeDefined()
    expect(rec?.confidence).toBe('high')
  })

  it('generates workout-done insight for logged workout', () => {
    const input: EngineInput = {
      ...baseInput,
      todayWorkout: {
        date: '2026-06-25',
        type: 'lifting',
        bodyAreas: ['Chest', 'Shoulders'],
        durationMin: 55,
        exercises: [],
      },
    }
    const insights = generateDailyInsights(input)
    const workout = insights.find(i => i.id === 'workout-done')
    expect(workout).toBeDefined()
    expect(workout?.title).toContain('Chest')
  })

  it('generates long-gap training insight when 8 days since last workout', () => {
    const input: EngineInput = {
      ...baseInput,
      recentWorkouts: [
        { date: '2026-06-17', type: 'lifting', durationMin: 45, exercises: [] },
      ],
    }
    const insights = generateDailyInsights(input)
    const gap = insights.find(i => i.id === 'long-gap')
    expect(gap).toBeDefined()
    expect(gap?.severity).toBe('action')
  })

  it('generates ready-to-train insight at 4 days since last workout', () => {
    const input: EngineInput = {
      ...baseInput,
      recentWorkouts: [
        { date: '2026-06-21', type: 'lifting', durationMin: 45, exercises: [] },
      ],
    }
    const insights = generateDailyInsights(input)
    const ready = insights.find(i => i.id === 'ready-to-train')
    expect(ready).toBeDefined()
  })

  it('generates weight-plateau insight with enough flat data', () => {
    const history: WeightPoint[] = [
      { date: '2026-06-18', weightKg: 82.5 },
      { date: '2026-06-19', weightKg: 82.4 },
      { date: '2026-06-20', weightKg: 82.6 },
      { date: '2026-06-21', weightKg: 82.5 },
      { date: '2026-06-22', weightKg: 82.5 },
      { date: '2026-06-23', weightKg: 82.4 },
      { date: '2026-06-24', weightKg: 82.5 },
      { date: '2026-06-25', weightKg: 82.5 },
    ]
    const input: EngineInput = { ...baseInput, weightHistory: history, goalTypes: ['fat-loss'] }
    const insights = generateDailyInsights(input)
    const plateau = insights.find(i => i.id === 'weight-plateau')
    expect(plateau).toBeDefined()
  })

  it('generates wrong-direction insight when gaining weight during fat-loss phase', () => {
    const history: WeightPoint[] = [
      { date: '2026-06-18', weightKg: 80.0 },
      { date: '2026-06-20', weightKg: 80.7 },
      { date: '2026-06-22', weightKg: 81.2 },
      { date: '2026-06-24', weightKg: 81.8 },
    ]
    const input: EngineInput = {
      ...baseInput,
      weightHistory: history,
      goalTypes: ['fat-loss'],
    }
    const insights = generateDailyInsights(input)
    const wrong = insights.find(i => i.id === 'weight-wrong-direction')
    expect(wrong).toBeDefined()
  })

  it('generates progressive-overload insight when previous exercise data exists', () => {
    const input: EngineInput = {
      ...baseInput,
      todayWorkout: {
        date: '2026-06-25',
        type: 'lifting',
        durationMin: 60,
        exercises: [{ name: 'Bench Press', sets: [{ weightLbs: 185, reps: 8 }] }],
      },
      recentWorkouts: [
        {
          date: '2026-06-22',
          type: 'lifting',
          durationMin: 55,
          exercises: [{ name: 'Bench Press', sets: [{ weightLbs: 180, reps: 8 }] }],
        },
      ],
    }
    const insights = generateDailyInsights(input)
    const po = insights.find(i => i.id === 'progressive-overload')
    expect(po).toBeDefined()
    expect(po?.title).toContain('180lbs')
  })

  it('generates steps-low insight when steps are below threshold', () => {
    const input: EngineInput = { ...baseInput, steps: 3200, hasAppleHealthData: true }
    const insights = generateDailyInsights(input)
    const stepsInsight = insights.find(i => i.id === 'steps-low')
    expect(stepsInsight).toBeDefined()
  })

  it('generates steps-hit insight when goal is met', () => {
    const input: EngineInput = { ...baseInput, steps: 11500, hasAppleHealthData: true }
    const insights = generateDailyInsights(input)
    const hit = insights.find(i => i.id === 'steps-hit')
    expect(hit).toBeDefined()
  })

  it('generates elevated resting HR warning', () => {
    const input: EngineInput = {
      ...baseInput,
      restingHR: 78,
      hrBaseline: 60,
      hasAppleHealthData: true,
    }
    const insights = generateDailyInsights(input)
    const rhrInsight = insights.find(i => i.id === 'rhr-elevated')
    expect(rhrInsight).toBeDefined()
  })

  it('does NOT generate elevated resting HR when within 10% of baseline', () => {
    const input: EngineInput = {
      ...baseInput,
      restingHR: 64,
      hrBaseline: 60,
      hasAppleHealthData: true,
    }
    const insights = generateDailyInsights(input)
    const rhrInsight = insights.find(i => i.id === 'rhr-elevated')
    expect(rhrInsight).toBeUndefined()
  })

  it('generates weekly protein consistency insight when avg is low', () => {
    const input: EngineInput = {
      ...baseInput,
      weeklyProteinG: [120, 110, 130, 115, 125, 100, 118],
    }
    const insights = generateDailyInsights(input)
    const weeklyLow = insights.find(i => i.id === 'protein-weekly-low')
    expect(weeklyLow).toBeDefined()
  })

  it('generates near-goal insight when close to goal weight', () => {
    const history: WeightPoint[] = [
      { date: '2026-06-25', weightKg: 82.0 },
      { date: '2026-06-20', weightKg: 82.5 },
    ]
    const input: EngineInput = {
      ...baseInput,
      weightHistory: history,
      goalWeightKg: 80.2,
    }
    const insights = generateDailyInsights(input)
    const near = insights.find(i => i.id === 'weight-near-goal')
    expect(near).toBeDefined()
  })
})

describe('calcWeightTrend', () => {
  it('returns null for fewer than 4 data points', () => {
    expect(calcWeightTrend([])).toBeNull()
    expect(calcWeightTrend([
      { date: '2026-06-22', weightKg: 80 },
      { date: '2026-06-24', weightKg: 80.2 },
    ])).toBeNull()
  })

  it('detects flat trend when weight is stable', () => {
    const history: WeightPoint[] = [
      { date: '2026-06-18', weightKg: 82.5 },
      { date: '2026-06-20', weightKg: 82.4 },
      { date: '2026-06-22', weightKg: 82.6 },
      { date: '2026-06-24', weightKg: 82.5 },
    ]
    const result = calcWeightTrend(history)
    expect(result?.direction).toBe('flat')
  })

  it('detects downward trend', () => {
    const history: WeightPoint[] = [
      { date: '2026-06-18', weightKg: 85.0 },
      { date: '2026-06-20', weightKg: 84.5 },
      { date: '2026-06-22', weightKg: 84.0 },
      { date: '2026-06-24', weightKg: 83.5 },
    ]
    const result = calcWeightTrend(history)
    expect(result?.direction).toBe('down')
    expect(result?.rateKgPerWeek).toBeLessThan(0)
  })

  it('detects upward trend', () => {
    const history: WeightPoint[] = [
      { date: '2026-06-18', weightKg: 80.0 },
      { date: '2026-06-20', weightKg: 80.4 },
      { date: '2026-06-22', weightKg: 80.8 },
      { date: '2026-06-24', weightKg: 81.2 },
    ]
    const result = calcWeightTrend(history)
    expect(result?.direction).toBe('up')
    expect(result?.rateKgPerWeek).toBeGreaterThan(0)
  })
})

describe('weeklyProteinAvg', () => {
  it('returns 0 for empty array', () => {
    expect(weeklyProteinAvg([])).toBe(0)
  })

  it('ignores zero values in average', () => {
    // 3 days logged at 150g, 4 days at 0 (not logged)
    expect(weeklyProteinAvg([150, 0, 150, 0, 150, 0, 0])).toBe(150)
  })

  it('averages non-zero values correctly', () => {
    expect(weeklyProteinAvg([120, 130, 140, 150])).toBe(135)
  })
})

describe('proteinFoodSuggestion', () => {
  it('suggests a big multi-food option for large gaps', () => {
    const suggestion = proteinFoodSuggestion(80)
    expect(suggestion).toContain('chicken breast')
  })

  it('suggests simpler option for small gaps', () => {
    const suggestion = proteinFoodSuggestion(12)
    expect(suggestion).toContain('eggs')
  })
})

describe('topInsights', () => {
  it('returns at most n insights', () => {
    const insights = generateDailyInsights({
      ...baseInput,
      proteinG: 50,
      hourOfDay: 16,
      hrv: 30,
      hasAppleHealthData: true,
      recentWorkouts: [
        { date: '2026-06-17', type: 'lifting', durationMin: 45, exercises: [] },
      ],
    })
    const top = topInsights(insights, 3)
    expect(top.length).toBeLessThanOrEqual(3)
  })
})
