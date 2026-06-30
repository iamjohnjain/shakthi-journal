/**
 * Story Engine — produces Today's Story: a 2–4 sentence narrative
 * synthesising all available health data into one coherent message.
 *
 * Rules:
 * - Every sentence must be grounded in real input values.
 * - Never fabricate claims.
 * - Never mention waterMl (removed from UI).
 * - Confidence reflects data completeness, not outcome certainty.
 */

import type { EngineInput } from './healthIntelligence'
import { weeklyProteinAvg } from './healthIntelligence'

export interface TodaysStory {
  text: string                          // Full narrative paragraph
  confidence: 'high' | 'medium' | 'low'
  dataUsed: string[]                    // source labels shown in UI
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtSleep(h: number): string {
  const hours = Math.floor(h)
  const mins  = Math.round((h - hours) * 60)
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
}

function joinNatural(parts: string[]): string {
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0]
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`
}

function daysBetween(a: string, b: string): number {
  return Math.abs((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000)
}

function countConsecutiveLowProtein(weekly: number[], goal: number): number {
  let streak = 0
  for (const v of weekly) {
    if (v > 0 && v < goal * 0.85) streak++
    else break
  }
  return streak
}

// ─── Recovery narrative ────────────────────────────────────────────────────────

type RecoveryLevel = 'peak' | 'good' | 'moderate' | 'low' | 'unknown'

function recoveryLevel(hrv: number | null, sleep: number | null, avgHrv: number | null): RecoveryLevel {
  if (hrv === null && sleep === null) return 'unknown'

  const hrvGood  = hrv !== null && (avgHrv !== null ? hrv >= avgHrv * 0.95 : hrv >= 55)
  const hrvLow   = hrv !== null && (avgHrv !== null ? hrv < avgHrv * 0.85 : hrv < 40)
  const sleepGood = sleep !== null && sleep >= 7.0
  const sleepLow  = sleep !== null && sleep < 5.5

  if (sleepLow || hrvLow) return 'low'

  const signals = [
    hrv !== null && sleepGood ? 1 : 0,
    hrv !== null && hrvGood   ? 1 : 0,
    sleep !== null && sleep >= 7.5 ? 1 : 0,
  ].reduce<number>((a, b) => a + b, 0)

  if (signals >= 2) return 'peak'
  if (signals === 1 || (hrv !== null && !hrvLow) || (sleep !== null && !sleepLow)) return 'good'
  return 'moderate'
}

// ─── Main generator ───────────────────────────────────────────────────────────

export function generateTodaysStory(input: EngineInput): TodaysStory {
  const {
    hrv, sleepHours, avgHrv, avgSleepHours, recentWorkouts, todayWorkout,
    proteinG, proteinGoal, weeklyProteinG, dateStr, hourOfDay, weightHistory,
  } = input

  const parts: string[]  = []
  const dataUsed: string[] = []
  let dataCount = 0

  // ── 1. Recovery opening ──────────────────────────────────────────────────────
  const level = recoveryLevel(hrv, sleepHours, avgHrv)

  if (level !== 'unknown') {
    const signals: string[] = []

    if (sleepHours !== null) {
      dataUsed.push('Sleep')
      dataCount++
      const avg = avgSleepHours
      const diff = avg !== null ? sleepHours - avg : null
      const label = fmtSleep(sleepHours)
      if (diff !== null && Math.abs(diff) >= 0.5) {
        signals.push(`${label} of sleep (${diff > 0 ? '+' : ''}${fmtSleep(Math.abs(diff))} vs your average)`)
      } else {
        signals.push(`${label} of sleep`)
      }
    }

    if (hrv !== null) {
      dataUsed.push('HRV')
      dataCount++
      if (avgHrv !== null && Math.abs(hrv - avgHrv) >= 4) {
        signals.push(`HRV ${hrv} ms (${hrv > avgHrv ? 'above' : 'below'} your ${avgHrv} ms average)`)
      } else {
        signals.push(`HRV ${hrv} ms`)
      }
    }

    const signalStr = signals.length > 0 ? ` — ${joinNatural(signals)}` : ''
    const alreadyTrained = todayWorkout !== null

    if (level === 'peak') {
      parts.push(`Recovery looks strong today${signalStr}.`)
      if (!alreadyTrained) parts.push('This is a good day to push intensity or attempt a personal record.')
      else parts.push('Great timing on today\'s session.')
    } else if (level === 'good') {
      parts.push(`Recovery looks good${signalStr}.`)
      if (!alreadyTrained) parts.push('Training at normal intensity should feel solid.')
    } else if (level === 'moderate') {
      parts.push(`Recovery is moderate${signalStr}.`)
      if (!alreadyTrained) parts.push('Leave 1–2 reps in reserve on compound lifts today.')
    } else {
      parts.push(`Recovery is lower than usual${signalStr}.`)
      if (!alreadyTrained) parts.push('Consider a lighter session or mobility work today.')
      else parts.push('Focus on protein and sleep tonight to bounce back.')
    }
  }

  // ── 2. Training context ───────────────────────────────────────────────────────
  const sorted = [...recentWorkouts].sort((a, b) => b.date.localeCompare(a.date))
  const lastWorkout = sorted[0] ?? null
  const daysSinceLast = lastWorkout ? Math.round(daysBetween(dateStr, lastWorkout.date)) : null

  if (todayWorkout === null && daysSinceLast !== null) {
    if (daysSinceLast >= 3 && parts.length <= 1) {
      dataUsed.push('Workout Log')
      parts.push(`It has been ${daysSinceLast} day${daysSinceLast > 1 ? 's' : ''} since your last session${daysSinceLast >= 5 ? ' — a good time to get back on track' : ''}.`)
    }
  }

  // ── 3. Nutrition context ──────────────────────────────────────────────────────
  if (weeklyProteinG.length >= 3) {
    const avg  = weeklyProteinAvg(weeklyProteinG)
    const low  = countConsecutiveLowProtein(weeklyProteinG, proteinGoal)
    const daysLogged = weeklyProteinG.filter(v => v > 0).length

    if (avg > 0 && daysLogged >= 3) {
      dataUsed.push('Nutrition Log')
      dataCount++
      if (low >= 3 && parts.length < 3) {
        const gap = proteinGoal - avg
        parts.push(`Protein has averaged ${avg}g over the last week, ${gap}g below your ${proteinGoal}g target for ${low} days in a row — worth prioritising at the next meal.`)
      } else if (avg >= proteinGoal * 0.9 && parts.length < 3) {
        parts.push(`Protein consistency has been solid at ${avg}g average — keep it going.`)
      }
    }
  }

  // ── 4. Today's protein ────────────────────────────────────────────────────────
  if (proteinG > 0 && parts.length < 2 && hourOfDay >= 19) {
    dataUsed.push('Nutrition Log')
    const remaining = proteinGoal - proteinG
    if (remaining <= 0) {
      parts.push(`You've already hit your ${proteinGoal}g protein goal for today.`)
    } else if (remaining <= 40 && remaining > 0) {
      parts.push(`Just ${Math.round(remaining)}g of protein left to hit your goal for today.`)
    }
  }

  // ── 5. Weight signal ─────────────────────────────────────────────────────────
  if (weightHistory.length >= 4 && parts.length < 3) {
    const latest = weightHistory[0]
    const oldest = weightHistory[weightHistory.length - 1]
    if (latest && oldest && latest.date !== oldest.date) {
      const days = daysBetween(oldest.date, latest.date)
      if (days >= 5) {
        const changeLbs = +((latest.weightKg - oldest.weightKg) * 2.20462).toFixed(1)
        if (Math.abs(changeLbs) >= 0.5 && parts.length < 2) {
          dataUsed.push('Weight Log')
          const dir = changeLbs < 0 ? 'down' : 'up'
          parts.push(`Weight is trending ${dir} ${Math.abs(changeLbs)} lbs over the last ${Math.round(days)} days.`)
        }
      }
    }
  }

  // ── 6. Fallback for no data ───────────────────────────────────────────────────
  if (parts.length === 0) {
    const greet = hourOfDay < 12 ? 'morning' : hourOfDay < 18 ? 'afternoon' : 'evening'
    return {
      text: `Good ${greet}. Connect Apple Health or start logging workouts to unlock personalised daily guidance.`,
      confidence: 'low',
      dataUsed: [],
    }
  }

  const confidence: 'high' | 'medium' | 'low' =
    dataCount >= 3 ? 'high' : dataCount >= 1 ? 'medium' : 'low'

  return {
    text: parts.join(' '),
    confidence,
    dataUsed: [...new Set(dataUsed)],
  }
}
