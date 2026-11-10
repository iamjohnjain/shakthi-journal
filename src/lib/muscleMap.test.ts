import { describe, it, expect } from 'vitest'
import { classifyExercise, regionTarget, REGION_MUSCLES, WEEKLY_SET_TARGET } from './muscleMap'

describe('classifyExercise', () => {
  it('classifies a known library exercise exactly', () => {
    expect(classifyExercise('Bench Press')).toEqual(['chest', 'triceps', 'shoulders'])
  })

  it('falls back to keyword matching for a free-text exercise name', () => {
    expect(classifyExercise('Smith Machine Squat')).toEqual(['quads', 'glutes', 'hamstrings', 'core'])
  })

  it('checks more specific patterns before generic ones (leg curl vs curl)', () => {
    expect(classifyExercise('Seated Leg Curl')).toEqual(['hamstrings'])
  })

  it('returns nothing for an unrecognized name rather than guessing', () => {
    expect(classifyExercise('Zorbatron 9000')).toEqual([])
  })
})

describe('regionTarget', () => {
  it('sums the weekly targets of a region\'s constituent muscles', () => {
    const expected = REGION_MUSCLES.back.reduce((sum, m) => sum + WEEKLY_SET_TARGET[m], 0)
    expect(regionTarget('back')).toBe(expected)
  })
})
