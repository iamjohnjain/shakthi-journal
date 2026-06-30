/**
 * Health Intelligence Engine — rule-based, no AI, no network calls.
 * Pure functions only. See docs/AI_COACH.md for coaching philosophy.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type InsightCategory = 'recovery' | 'nutrition' | 'hydration' | 'training' | 'weight' | 'activity' | 'setup'
export type InsightSeverity = 'positive' | 'action' | 'warning' | 'info'
export type InsightConfidence = 'high' | 'medium' | 'low'

export interface HealthInsight {
  id: string
  category: InsightCategory
  priority: number          // 1 = highest; lower wins in sorting
  severity: InsightSeverity
  confidence: InsightConfidence
  emoji: string
  title: string             // ≤ 80 chars, shown in the Daily Brief bullets
  observation: string       // what the data shows
  whyItMatters: string      // 1-2 sentences of context
  action: string            // specific next step
  dataSources: string[]
  missingData?: string[]
}

export interface WorkoutSummary {
  date: string
  type: string           // 'lifting' | 'cardio'
  bodyAreas?: string[]
  durationMin: number
  exercises: Array<{
    name: string
    sets: Array<{ weightLbs: number; reps: number }>
  }>
}

export interface WeightPoint {
  date: string   // YYYY-MM-DD
  weightKg: number
}

export interface EngineInput {
  dateStr: string
  hourOfDay: number

  // Biometrics (today)
  hrv: number | null
  sleepHours: number | null
  sleepScore: number | null
  restingHR: number | null

  // Activity
  steps: number | null

  // Nutrition (today, combined all sources)
  proteinG: number
  caloriesIn: number

  // Goals (from user settings, not hardcoded)
  proteinGoal: number
  caloriesGoal: number

  // Weight history (most recent first, up to 14 points)
  weightHistory: WeightPoint[]
  goalWeightKg: number | null
  goalTypes: string[]   // ['fat-loss', 'muscle-gain', …] from onboarding

  // Workout data
  todayWorkout: WorkoutSummary | null
  recentWorkouts: WorkoutSummary[]  // last 14 days, newest first

  // Weekly nutrition (index 0 = today, 6 = 7 days ago)
  weeklyProteinG: number[]
  weeklyCaloriesIn: number[]

  // HR baseline for elevated-HR detection
  hrBaseline: number | null   // avg resting HR from last 14 days

  // Baselines for story/narrative generation
  avgHrv: number | null       // 7-day avg HRV excluding today
  avgSleepHours: number | null  // 7-day avg sleep excluding today

  // Data availability flags
  hasAppleHealthData: boolean
  isMockMode: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function proteinFoodSuggestion(grams: number): string {
  if (grams >= 80) return 'a chicken breast (~50g) + Greek yogurt (~17g) + protein shake (~25g)'
  if (grams >= 50) return 'a chicken breast (~50g) or 200g Greek yogurt + shake (~42g)'
  if (grams >= 30) return 'a protein shake (~25–30g) or 2 eggs + cottage cheese (~28g)'
  if (grams >= 10) return 'a handful of nuts + string cheese, or 2 eggs (~16g)'
  return 'any protein-containing snack to close the gap'
}

export function lbsToKg(lbs: number): number { return +(lbs / 2.20462).toFixed(2) }
export function kgToLbs(kg: number): number   { return +(kg * 2.20462).toFixed(1) }

/**
 * Calculate 7-day rolling weight trend.
 * Returns rate in kg/week and direction, or null if < 4 data points.
 */
export function calcWeightTrend(
  history: WeightPoint[],
): { rateKgPerWeek: number; rateLbsPerWeek: number; direction: 'down' | 'up' | 'flat' } | null {
  if (history.length < 4) return null
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date))
  const n = sorted.length
  const half = Math.floor(n / 2)
  const older = sorted.slice(0, half)
  const newer = sorted.slice(n - half)
  const olderAvg = older.reduce((s, p) => s + p.weightKg, 0) / older.length
  const newerAvg = newer.reduce((s, p) => s + p.weightKg, 0) / newer.length
  // Assume oldest→newest span ≈ 7 days; normalise to per-week rate
  const days = Math.max(1, (new Date(sorted[n - 1].date).getTime() - new Date(sorted[0].date).getTime()) / 86_400_000)
  const rateKgPerWeek = ((newerAvg - olderAvg) / days) * 7
  const rateLbsPerWeek = kgToLbs(rateKgPerWeek)
  const direction =
    Math.abs(rateKgPerWeek) < 0.12 ? 'flat' :
    rateKgPerWeek < 0 ? 'down' : 'up'
  return { rateKgPerWeek, rateLbsPerWeek, direction }
}

export function weeklyProteinAvg(weeklyProteinG: number[]): number {
  const nonZero = weeklyProteinG.filter(v => v > 0)
  if (nonZero.length === 0) return 0
  return Math.round(nonZero.reduce((s, v) => s + v, 0) / nonZero.length)
}

function daysBetween(a: string, b: string): number {
  return Math.abs(
    (new Date(b).getTime() - new Date(a).getTime()) / 86_400_000
  )
}

// ─── Recovery ─────────────────────────────────────────────────────────────────

function recoverySuggestions(input: EngineInput): HealthInsight[] {
  const { hrv, sleepHours, restingHR, hrBaseline, todayWorkout } = input
  const results: HealthInsight[] = []
  const alreadyWorkedOut = todayWorkout !== null
  const sources: string[] = []
  if (hrv !== null) sources.push('Apple Health')
  if (sleepHours !== null) sources.push('Apple Health')

  // Elevated resting HR vs baseline — fires regardless of HRV/sleep availability
  if (restingHR !== null && hrBaseline !== null && restingHR > hrBaseline * 1.1) {
    results.push({
      id: 'rhr-elevated',
      category: 'recovery',
      priority: 25,
      severity: 'warning',
      confidence: 'medium',
      emoji: '❤️',
      title: `Resting HR elevated — ${restingHR}bpm vs your ${Math.round(hrBaseline)}bpm average`,
      observation: `Your resting heart rate today (${restingHR}bpm) is more than 10% above your 14-day average (${Math.round(hrBaseline)}bpm).`,
      whyItMatters: 'Elevated resting HR can indicate incomplete recovery, illness, or high stress. It often precedes or accompanies overtraining.',
      action: 'Keep training intensity moderate and prioritise sleep and hydration tonight.',
      dataSources: ['Apple Health'],
    })
  }

  if (hrv === null && sleepHours === null) {
    if (!input.hasAppleHealthData && !input.isMockMode) {
      results.push({
        id: 'recovery-no-data',
        category: 'setup',
        priority: 72,
        severity: 'info',
        confidence: 'high',
        emoji: '📊',
        title: 'No recovery data — connect Apple Health for daily readiness',
        observation: 'No HRV or sleep data is available for today.',
        whyItMatters: 'HRV and sleep are the most reliable daily readiness signals available without a lab.',
        action: 'Import an Apple Health export to unlock recovery-based training guidance.',
        dataSources: [],
        missingData: ['HRV', 'Sleep hours'],
      })
    }
    return results
  }

  // Low recovery
  const lowHrv = hrv !== null && hrv < 40
  const shortSleep = sleepHours !== null && sleepHours < 5.5
  if (lowHrv || shortSleep) {
    const parts: string[] = []
    if (hrv !== null) parts.push(`HRV ${hrv}ms`)
    if (sleepHours !== null) parts.push(`${sleepHours.toFixed(1)}h sleep`)
    results.push({
      id: 'recovery-low',
      category: 'recovery',
      priority: alreadyWorkedOut ? 40 : 18,
      severity: 'warning',
      confidence: hrv !== null && sleepHours !== null ? 'high' : 'medium',
      emoji: '😴',
      title: `Recovery is low — ${alreadyWorkedOut ? 'good call keeping it moderate' : 'light session or rest recommended'}`,
      observation: `${parts.join(' and ')} ${parts.length > 1 ? 'are' : 'is'} below typical recovery range.`,
      whyItMatters: 'Training hard on low recovery days increases cortisol and injury risk without proportional adaptation benefit.',
      action: alreadyWorkedOut
        ? 'Focus on sleep quality tonight and eat enough protein to support recovery.'
        : 'Choose mobility work, a walk, or a deload session. Save heavy lifting for when recovery improves.',
      dataSources: sources,
    })
    return results
  }

  // Moderate recovery
  const modHrv = hrv !== null && hrv >= 40 && hrv < 55
  const okSleep = sleepHours !== null && sleepHours >= 5.5 && sleepHours < 7
  if ((modHrv || okSleep) && !lowHrv && !shortSleep) {
    results.push({
      id: 'recovery-moderate',
      category: 'recovery',
      priority: 45,
      severity: 'info',
      confidence: 'medium',
      emoji: '🟡',
      title: 'Recovery is moderate — avoid max-effort sets today',
      observation: `${hrv !== null ? `HRV at ${hrv}ms` : ''}${hrv !== null && sleepHours !== null ? ' and ' : ''}${sleepHours !== null ? `${sleepHours.toFixed(1)}h sleep` : ''} indicate decent but not peak recovery.`,
      whyItMatters: 'Moderate recovery allows effective training at 70–85% intensity. Pushing to failure on these days adds disproportionate fatigue.',
      action: 'Train normally but leave 1–2 reps in reserve on compound lifts. Keep overall volume moderate.',
      dataSources: sources,
    })
    return results
  }

  // Peak recovery
  const peakHrv = hrv !== null && hrv > 65
  const goodSleep = sleepHours !== null && sleepHours >= 7
  if ((peakHrv || goodSleep) && !modHrv && !shortSleep) {
    const confidence: InsightConfidence = (peakHrv && goodSleep) ? 'high' : 'medium'
    results.push({
      id: 'recovery-peak',
      category: 'recovery',
      priority: alreadyWorkedOut ? 42 : 31,
      severity: 'positive',
      confidence,
      emoji: '🟢',
      title: `Recovery looks ${peakHrv && goodSleep ? 'strong' : 'good'} — ${alreadyWorkedOut ? 'great timing on the workout' : 'green light for training intensity'}`,
      observation: `${hrv !== null ? `HRV at ${hrv}ms` : ''}${hrv !== null && sleepHours !== null ? ' and ' : ''}${sleepHours !== null ? `${sleepHours.toFixed(1)}h sleep` : ''} indicate solid recovery.`,
      whyItMatters: 'High HRV combined with quality sleep correlates with peak neuromuscular readiness — the conditions where progressive overload is most likely to succeed.',
      action: alreadyWorkedOut
        ? 'Make sure to hit your protein goal to maximise adaptation from today\'s session.'
        : 'Good day for heavy compound lifts or high-intensity cardio. Push for a PR if the session calls for it.',
      dataSources: sources,
    })
  }

  return results
}

// ─── Nutrition ────────────────────────────────────────────────────────────────

function nutritionInsights(input: EngineInput): HealthInsight[] {
  const { proteinG, caloriesIn, proteinGoal, caloriesGoal, hourOfDay, weeklyProteinG, isMockMode } = input
  const results: HealthInsight[] = []

  // Protein
  if (proteinG > 0) {
    const remaining = proteinGoal - proteinG
    if (remaining <= 5) {
      results.push({
        id: 'protein-hit',
        category: 'nutrition',
        priority: 32,
        severity: 'positive',
        confidence: 'high',
        emoji: '✅',
        title: `Protein goal reached — ${Math.round(proteinG)}g logged`,
        observation: `You've hit your ${proteinGoal}g protein target for the day.`,
        whyItMatters: 'Consistent daily protein intake is the strongest dietary lever for muscle retention and growth.',
        action: 'Stay consistent. Protein at or above goal daily compounds into measurable muscle retention over weeks.',
        dataSources: ['Nutrition Log'],
      })
    } else if (remaining > 5) {
      const isBig = remaining > 60
      results.push({
        id: 'protein-gap',
        category: 'nutrition',
        priority: isBig ? 12 : 22,
        severity: isBig ? 'action' : 'info',
        confidence: 'high',
        emoji: '🥩',
        title: `${Math.round(remaining)}g protein remaining today`,
        observation: `At ${Math.round(proteinG)}g of your ${proteinGoal}g daily target.`,
        whyItMatters: 'Even modest protein shortfalls (~40g/day) reduce muscle protein synthesis. Consistency across the week matters more than any single meal.',
        action: `${proteinFoodSuggestion(remaining)} would close the gap.`,
        dataSources: ['Nutrition Log'],
      })
    }
  } else if (!isMockMode) {
    results.push({
      id: 'nutrition-not-logged',
      category: 'setup',
      priority: 20,
      severity: 'action',
      confidence: 'high',
      emoji: '🍽️',
      title: 'No nutrition logged today',
      observation: 'No meals have been recorded for today.',
      whyItMatters: 'Without tracking, most people underestimate calorie intake and overestimate protein — especially on busy days.',
      action: 'Log your first meal in the Nutrition tab. Even rough estimates are better than nothing.',
      dataSources: [],
      missingData: ['Today\'s nutrition'],
    })
  }

  // Weekly protein consistency
  if (weeklyProteinG.length >= 5) {
    const avg = weeklyProteinAvg(weeklyProteinG)
    const daysLogged = weeklyProteinG.filter(v => v > 0).length
    if (avg > 0 && avg < proteinGoal * 0.78 && daysLogged >= 4) {
      results.push({
        id: 'protein-weekly-low',
        category: 'nutrition',
        priority: 28,
        severity: 'warning',
        confidence: 'medium',
        emoji: '📉',
        title: `Weekly protein avg is low — ${avg}g/day vs ${proteinGoal}g goal`,
        observation: `Your 7-day average protein intake is ${avg}g, ${Math.round(proteinGoal - avg)}g below your daily goal.`,
        whyItMatters: 'Chronic protein shortfalls slow muscle building and recovery, even if individual workouts are good. The cumulative weekly deficit matters most.',
        action: 'Identify one high-protein meal or snack you can make consistent each day. Even 150g of Greek yogurt (~17g protein) changes the weekly average meaningfully.',
        dataSources: ['Nutrition Log'],
      })
    } else if (avg >= proteinGoal * 0.9 && daysLogged >= 5) {
      results.push({
        id: 'protein-weekly-solid',
        category: 'nutrition',
        priority: 50,
        severity: 'positive',
        confidence: 'medium',
        emoji: '💪',
        title: `Strong weekly protein consistency — ${avg}g avg over ${daysLogged} days`,
        observation: `Your average protein over the past week is ${avg}g — above 90% of your ${proteinGoal}g goal.`,
        whyItMatters: 'Protein consistency over time, not perfection on any one day, drives muscle building and weight management.',
        action: 'Keep it up. This consistency is building real results.',
        dataSources: ['Nutrition Log'],
      })
    }
  }

  // Calories
  if (caloriesIn > 0) {
    const calRemaining = caloriesGoal - caloriesIn
    if (calRemaining > 500 && hourOfDay >= 15) {
      results.push({
        id: 'calories-behind',
        category: 'nutrition',
        priority: 58,
        severity: 'info',
        confidence: 'medium',
        emoji: '🍽️',
        title: `${Math.round(calRemaining)} kcal remaining — intentional or worth catching up`,
        observation: `At ${Math.round(caloriesIn)} kcal of your ${caloriesGoal} kcal goal after ${hourOfDay > 12 ? hourOfDay - 12 : hourOfDay}${hourOfDay >= 12 ? 'pm' : 'am'}.`,
        whyItMatters: 'If cutting, a calorie deficit is the goal. If maintaining or building, consistent under-eating signals the body to slow metabolism and can reduce training performance.',
        action: 'If this is intentional (cutting day), no action needed. If not, a protein-focused meal now protects muscle.',
        dataSources: ['Nutrition Log'],
      })
    }
  }

  return results
}

// ─── Activity ─────────────────────────────────────────────────────────────────

function activityInsights(input: EngineInput): HealthInsight[] {
  const { steps, isMockMode } = input
  const STEPS_GOAL = 10000
  const results: HealthInsight[] = []

  if (steps === null && !isMockMode) {
    return results // no steps data, no setup prompt (Apple Health covers this)
  }

  if (steps !== null && steps < 5000) {
    const remaining = STEPS_GOAL - steps
    results.push({
      id: 'steps-low',
      category: 'activity',
      priority: 62,
      severity: 'info',
      confidence: 'medium',
      emoji: '🚶',
      title: `Steps are low — ${steps.toLocaleString()} of ${STEPS_GOAL.toLocaleString()} goal`,
      observation: `${steps.toLocaleString()} steps logged, ${remaining.toLocaleString()} remaining.`,
      whyItMatters: 'NEAT (non-exercise movement) contributes significantly to total daily energy burn. A 3,000-step shortfall equals roughly 150 kcal of foregone burn.',
      action: 'A 25-minute walk after dinner adds ~2,500 steps and supports better blood sugar regulation and sleep quality.',
      dataSources: ['Apple Health'],
    })
  } else if (steps !== null && steps >= STEPS_GOAL) {
    results.push({
      id: 'steps-hit',
      category: 'activity',
      priority: 60,
      severity: 'positive',
      confidence: 'high',
      emoji: '🚶',
      title: `Step goal hit — ${steps.toLocaleString()} steps`,
      observation: `You\'ve hit your ${STEPS_GOAL.toLocaleString()} step target for the day.`,
      whyItMatters: 'Consistent NEAT activity is a significant contributor to total energy expenditure and metabolic health.',
      action: 'Great. Daily movement consistency matters more than any single high-step day.',
      dataSources: ['Apple Health'],
    })
  }

  return results
}

// ─── Training ─────────────────────────────────────────────────────────────────

function trainingInsights(input: EngineInput): HealthInsight[] {
  const { todayWorkout, recentWorkouts, dateStr, isMockMode } = input
  const results: HealthInsight[] = []

  const sortedWorkouts = [...recentWorkouts].sort((a, b) => b.date.localeCompare(a.date))
  const lastWorkout = sortedWorkouts[0] ?? null
  const daysSinceLast = lastWorkout ? Math.round(daysBetween(dateStr, lastWorkout.date)) : null

  // Today's workout done
  if (todayWorkout !== null) {
    const typeName = todayWorkout.type === 'lifting' ? 'Lifting' : 'Cardio'
    const areas = todayWorkout.bodyAreas?.join(', ') ?? ''
    results.push({
      id: 'workout-done',
      category: 'training',
      priority: 33,
      severity: 'positive',
      confidence: 'high',
      emoji: '🔥',
      title: `${typeName} session logged${areas ? ` — ${areas}` : ''}`,
      observation: `${todayWorkout.durationMin}-minute ${typeName.toLowerCase()} session recorded for today.`,
      whyItMatters: 'Training consistency is the primary driver of adaptation. Logging creates accountability and enables trend tracking.',
      action: 'Recovery window is now open. Hit your protein goal within the next 2–3 hours.',
      dataSources: ['Workout Log'],
    })

    // Progressive overload suggestion from previous session
    if (todayWorkout.type === 'lifting' && todayWorkout.exercises.length > 0) {
      const mainLift = todayWorkout.exercises[0]
      const prevSession = sortedWorkouts.find(
        w => w.date < dateStr && w.type === 'lifting' && w.exercises.some(e => e.name === mainLift.name)
      )
      if (prevSession) {
        const prevExercise = prevSession.exercises.find(e => e.name === mainLift.name)
        if (prevExercise && prevExercise.sets.length > 0) {
          const topSet = prevExercise.sets.reduce((best, s) => s.weightLbs >= best.weightLbs ? s : best, prevExercise.sets[0])
          const suggested = +(topSet.weightLbs + 5).toFixed(0)
          results.push({
            id: 'progressive-overload',
            category: 'training',
            priority: 48,
            severity: 'info',
            confidence: 'medium',
            emoji: '📈',
            title: `${mainLift.name}: last session was ${topSet.weightLbs}lbs × ${topSet.reps}`,
            observation: `Previous ${mainLift.name} top set: ${topSet.weightLbs}lbs for ${topSet.reps} reps.`,
            whyItMatters: 'Progressive overload — incrementally increasing weight or reps — is the primary mechanism for strength and muscle gain.',
            action: `Consider ${suggested}lbs × ${topSet.reps} as today\'s target, or match weight and aim for +1 rep.`,
            dataSources: ['Workout Log'],
          })
        }
      }
    }
    return results
  }

  // No workout today
  if (daysSinceLast === null && !isMockMode) {
    results.push({
      id: 'no-workouts-ever',
      category: 'setup',
      priority: 75,
      severity: 'info',
      confidence: 'high',
      emoji: '🏋️',
      title: 'Start logging your workouts to unlock training insights',
      observation: 'No workout history found.',
      whyItMatters: 'Tracking workouts enables progressive overload suggestions, muscle group recovery tracking, and volume trend analysis.',
      action: 'Log your first session in the Workouts tab — even a short one.',
      dataSources: [],
      missingData: ['Workout history'],
    })
    return results
  }

  // Rest day — is it appropriate?
  if (daysSinceLast !== null) {
    const lastAreas = lastWorkout?.bodyAreas ?? []

    if (daysSinceLast === 1 && lastAreas.length > 0) {
      // Suggest muscle group splits
      const lowerAreas = ['Legs', 'Glutes']
      const upperAreas = ['Chest', 'Back', 'Shoulders', 'Arms']
      const trainedLower = lastAreas.some(a => lowerAreas.includes(a))
      const trainedUpper = lastAreas.some(a => upperAreas.includes(a))
      let suggestion = ''
      if (trainedLower && !trainedUpper) suggestion = 'upper body, core, or cardio'
      else if (trainedUpper && !trainedLower) suggestion = 'legs, glutes, or cardio'
      else suggestion = 'a lighter session, mobility, or cardio'

      results.push({
        id: 'muscle-recovery',
        category: 'training',
        priority: 53,
        severity: 'info',
        confidence: 'medium',
        emoji: '🔄',
        title: `${lastAreas.join('/')} trained yesterday — ${suggestion} recommended today`,
        observation: `Yesterday\'s session targeted ${lastAreas.join(', ')}. Those muscles are in the 24–48h recovery window.`,
        whyItMatters: 'Muscle protein synthesis peaks at 24–48h post-session. Training the same muscle groups within that window increases fatigue without proportional adaptation.',
        action: `If training today: ${suggestion}. If resting: that\'s exactly right — recovery is training.`,
        dataSources: ['Workout Log'],
      })
    } else if (daysSinceLast >= 3 && daysSinceLast < 7) {
      results.push({
        id: 'ready-to-train',
        category: 'training',
        priority: 35,
        severity: 'action',
        confidence: 'high',
        emoji: '💪',
        title: `${daysSinceLast} days since last session — ready to go`,
        observation: `Last workout was ${daysSinceLast} days ago on ${lastWorkout!.date}.`,
        whyItMatters: 'Training frequency is one of the strongest predictors of long-term adaptation. Going more than 3 days without training starts to erode recent gains.',
        action: 'A session today keeps momentum going. Log it in the Workouts tab.',
        dataSources: ['Workout Log'],
      })
    } else if (daysSinceLast >= 7) {
      results.push({
        id: 'long-gap',
        category: 'training',
        priority: 14,
        severity: 'action',
        confidence: 'high',
        emoji: '⚡',
        title: `${daysSinceLast} days since your last workout — a fresh start is ready`,
        observation: `No training recorded in ${daysSinceLast} days.`,
        whyItMatters: 'After a week without training, initial gains from recent sessions begin to reverse. A single session reactivates the adaptation signal.',
        action: 'Any session counts — even a 30-minute lift or walk. Restart the habit.',
        dataSources: ['Workout Log'],
      })
    } else if (daysSinceLast === 1 || daysSinceLast === 2) {
      // Normal rest day, no insight needed
    }
  }

  return results
}

// ─── Weight ───────────────────────────────────────────────────────────────────

function weightInsights(input: EngineInput): HealthInsight[] {
  const { weightHistory, goalWeightKg, goalTypes } = input
  const results: HealthInsight[] = []

  if (weightHistory.length === 0) {
    return results // no data — setup handled by training/nutrition setup prompts
  }

  const trend = calcWeightTrend(weightHistory)
  const latestWeight = weightHistory[0]?.weightKg ?? null

  // Progress toward goal
  if (latestWeight !== null && goalWeightKg !== null) {
    const startWeight = weightHistory[weightHistory.length - 1]?.weightKg ?? latestWeight
    const totalToLose = Math.abs(startWeight - goalWeightKg)
    const progressMade = Math.abs(startWeight - latestWeight)
    const progressPct = totalToLose > 0 ? Math.round((progressMade / totalToLose) * 100) : 0
    const lbsFromGoal = Math.abs(kgToLbs(latestWeight - goalWeightKg))

    if (lbsFromGoal < 5) {
      results.push({
        id: 'weight-near-goal',
        category: 'weight',
        priority: 29,
        severity: 'positive',
        confidence: 'high',
        emoji: '🎯',
        title: `${lbsFromGoal.toFixed(1)} lbs from your goal — almost there`,
        observation: `Current weight is ${kgToLbs(latestWeight)}lbs, ${lbsFromGoal.toFixed(1)}lbs from your ${kgToLbs(goalWeightKg)}lbs goal.`,
        whyItMatters: 'You\'re in the final stretch. Consistency now prevents the last-mile plateau that trips most people up.',
        action: 'Stay disciplined on protein and calorie targets this week. The finish line is close.',
        dataSources: ['Manual Log', 'Apple Health'],
      })
    } else if (progressPct >= 50 && progressMade > 1) {
      results.push({
        id: 'weight-halfway',
        category: 'weight',
        priority: 46,
        severity: 'positive',
        confidence: 'medium',
        emoji: '📍',
        title: `${progressPct}% of the way to your goal — solid progress`,
        observation: `You\'ve moved ${kgToLbs(progressMade).toFixed(1)}lbs toward your target since starting.`,
        whyItMatters: 'Making measurable progress reinforces the habits that created it.',
        action: 'Keep doing what\'s working. Avoid abrupt changes when progress is happening.',
        dataSources: ['Manual Log', 'Apple Health'],
      })
    }
  }

  // Trend-based insight
  if (trend !== null) {
    const isFatLoss = goalTypes.includes('fat-loss')
    const isMuscleGain = goalTypes.includes('muscle-gain')
    const rateLbsAbs = Math.abs(trend.rateLbsPerWeek)

    // Rapid change warning (>3 lbs/week)
    if (rateLbsAbs > 3) {
      results.push({
        id: 'weight-rapid-change',
        category: 'weight',
        priority: 23,
        severity: 'info',
        confidence: 'medium',
        emoji: '💧',
        title: `Large weight swing (${trend.direction === 'down' ? '-' : '+'}${rateLbsAbs.toFixed(1)} lbs/week) — likely water`,
        observation: `The 7-day weight trend shows a ${trend.direction === 'down' ? 'decrease' : 'increase'} of ~${rateLbsAbs.toFixed(1)} lbs/week, which is above the physiologically possible fat rate.`,
        whyItMatters: 'Fat loss can only occur at ~1–2 lbs/week maximum. Larger swings are nearly always water, glycogen, or digestive content — not fat.',
        action: 'Don\'t overreact. Continue your current routine and weigh at the same time each morning for a more stable trend.',
        dataSources: ['Manual Log', 'Apple Health'],
      })
      return results
    }

    // Plateau
    if (trend.direction === 'flat' && weightHistory.length >= 7) {
      const goalAdvice = isFatLoss
        ? 'If cutting: reduce intake by 100–150 kcal/day or add 20 minutes of cardio twice a week.'
        : isMuscleGain
          ? 'If bulking: slightly increase daily calories (100–200 kcal). Progress at goal weight should feel slow.'
          : 'If maintaining: this is exactly right. If you had a different goal, revisit your calorie targets.'
      results.push({
        id: 'weight-plateau',
        category: 'weight',
        priority: 30,
        severity: 'warning',
        confidence: 'medium',
        emoji: '📊',
        title: 'Weight has been stable this week — plateau or maintenance?',
        observation: `Less than 0.3 kg change in weight over the past ${weightHistory.length} data points.`,
        whyItMatters: 'A weight plateau during a cut means the calorie deficit has closed, often due to metabolic adaptation or creeping intake.',
        action: goalAdvice,
        dataSources: ['Manual Log', 'Apple Health'],
      })
    }

    // On-trend toward fat loss goal
    if (trend.direction === 'down' && isFatLoss && rateLbsAbs <= 2.5) {
      results.push({
        id: 'weight-trend-fat-loss',
        category: 'weight',
        priority: 38,
        severity: 'positive',
        confidence: 'medium',
        emoji: '📉',
        title: `7-day weight trend: −${rateLbsAbs.toFixed(1)} lbs/week toward goal`,
        observation: `Your rolling 7-day weight trend shows consistent loss at ~${rateLbsAbs.toFixed(1)} lbs/week.`,
        whyItMatters: 'A sustainable fat loss rate is 0.5–1.5 lbs/week. You\'re in the right range for fat loss without significant muscle sacrifice.',
        action: 'Maintain current intake and training. Don\'t change a working system.',
        dataSources: ['Manual Log', 'Apple Health'],
      })
    }

    // On-trend toward muscle gain goal
    if (trend.direction === 'up' && isMuscleGain && !isFatLoss && rateLbsAbs <= 1.5) {
      results.push({
        id: 'weight-trend-muscle-gain',
        category: 'weight',
        priority: 38,
        severity: 'positive',
        confidence: 'medium',
        emoji: '📈',
        title: `7-day weight trend: +${rateLbsAbs.toFixed(1)} lbs/week — lean bulk on track`,
        observation: `Weight is increasing at ~${rateLbsAbs.toFixed(1)} lbs/week.`,
        whyItMatters: 'A clean bulk at 0.25–0.75 lbs/week maximises muscle gain while minimising fat accumulation.',
        action: 'Keep training progressive. This rate of gain is ideal if it came with performance improvements.',
        dataSources: ['Manual Log', 'Apple Health'],
      })
    }

    // Going wrong direction
    if (trend.direction === 'up' && isFatLoss && rateLbsAbs > 0.5) {
      results.push({
        id: 'weight-wrong-direction',
        category: 'weight',
        priority: 22,
        severity: 'warning',
        confidence: 'medium',
        emoji: '⚠️',
        title: `Weight trending up while in fat-loss mode (+${rateLbsAbs.toFixed(1)} lbs/week)`,
        observation: `Weight has increased ~${rateLbsAbs.toFixed(1)} lbs/week over the last ${weightHistory.length} data points.`,
        whyItMatters: 'An upward trend during a fat-loss phase suggests calorie intake exceeds expenditure. Often due to underestimating intake or reducing NEAT.',
        action: 'Review the last 3 days of food logs for portions, cooking oils, sauces, and drinks. Small consistent underestimates compound quickly.',
        dataSources: ['Manual Log', 'Apple Health'],
      })
    }
  } else if (weightHistory.length > 0 && weightHistory.length < 4) {
    results.push({
      id: 'weight-trend-needs-more',
      category: 'setup',
      priority: 78,
      severity: 'info',
      confidence: 'high',
      emoji: '⚖️',
      title: `${4 - weightHistory.length} more weigh-ins needed for 7-day trend analysis`,
      observation: `${weightHistory.length} weight data point${weightHistory.length > 1 ? 's' : ''} available. Need at least 4 for a reliable trend.`,
      whyItMatters: 'Daily weight fluctuates 1–5 lbs due to water, food, and hormones. A rolling average over 7+ days shows the real trend.',
      action: 'Log your weight each morning under the same conditions (before eating, after bathroom).',
      dataSources: ['Manual Log', 'Apple Health'],
    })
  }

  return results
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Generate prioritised daily insights from all available data.
 * Pure function — no async, no side effects.
 */
export function generateDailyInsights(input: EngineInput): HealthInsight[] {
  if (input.isMockMode) return []   // never mix mock data with real insights

  const all = [
    ...recoverySuggestions(input),
    ...nutritionInsights(input),
    ...trainingInsights(input),
    ...weightInsights(input),
    ...activityInsights(input),
  ]

  return all.sort((a, b) => a.priority - b.priority)
}

/** Top N insights for the Daily Brief bullets */
export function topInsights(insights: HealthInsight[], n = 4): HealthInsight[] {
  return insights.slice(0, n)
}
