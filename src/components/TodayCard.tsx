import { useNavigate } from 'react-router-dom'
import type { DailySnapshot } from '../types/health'
import type { TodayProgress } from '../hooks/useHealthInsights'
import type { NutritionGoals } from '../db'
import './TodayCard.css'

// ─── Types ────────────────────────────────────────────────────────────────────

type InsightStatus = 'excellent' | 'good' | 'warning' | 'action' | 'neutral'

interface Insight {
  emoji: string
  label: string
  value: string
  status: InsightStatus
  path?: string
}

// ─── Interpretation logic ─────────────────────────────────────────────────────

function interpretRecovery(today: DailySnapshot): Insight | null {
  const hrv   = today.hrv
  const sleep = today.sleepHours
  const score = today.recoveryScore

  if (hrv == null && sleep == null && score == null) return null

  if (score != null) {
    const status: InsightStatus = score >= 75 ? 'excellent' : score >= 55 ? 'good' : score >= 35 ? 'warning' : 'action'
    const label = score >= 75 ? 'Peak' : score >= 55 ? 'Good' : score >= 35 ? 'Fair' : 'Low'
    return { emoji: '⚡', label: 'Recovery', value: label, status, path: '/recovery' }
  }

  if (hrv != null) {
    const status: InsightStatus = hrv > 65 ? 'excellent' : hrv > 50 ? 'good' : hrv > 35 ? 'warning' : 'action'
    const label = hrv > 65 ? 'Excellent' : hrv > 50 ? 'Good' : hrv > 35 ? 'Fair' : 'Low'
    return { emoji: '⚡', label: 'Recovery', value: label, status, path: '/recovery' }
  }

  if (sleep != null) {
    const status: InsightStatus = sleep >= 7.5 ? 'good' : sleep >= 6 ? 'warning' : 'action'
    const h = Math.floor(sleep), m = Math.round((sleep - h) * 60)
    const val = m > 0 ? `${h}h ${m}m sleep` : `${h}h sleep`
    return { emoji: '🌙', label: 'Sleep', value: val, status, path: '/recovery' }
  }

  return null
}

function interpretProtein(todayProgress: TodayProgress, proteinGoal: number): Insight | null {
  if (todayProgress.proteinTotal === 0) return null

  const remaining = todayProgress.proteinRemaining
  const hit = remaining <= 0
  const status: InsightStatus = hit ? 'good' : remaining > proteinGoal * 0.5 ? 'action' : 'warning'
  const value = hit
    ? `${todayProgress.proteinTotal}g — goal hit`
    : `${todayProgress.proteinTotal}g of ${proteinGoal}g`

  return { emoji: '🥩', label: 'Protein', value, status, path: '/nutrition' }
}

function interpretWorkout(todayProgress: TodayProgress): Insight | null {
  if (!todayProgress.workoutLogged) return null
  const type = todayProgress.workoutType
  const label = type
    ? type.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    : 'Workout'
  const duration = todayProgress.workoutDuration
  const value = duration ? `${label} · ${duration}min` : label
  return { emoji: '💪', label: 'Training', value, status: 'good', path: '/workouts' }
}

function interpretSteps(today: DailySnapshot): Insight | null {
  if (today.steps == null) return null
  const pct = Math.round(today.steps / 10_000 * 100)
  const status: InsightStatus = pct >= 100 ? 'good' : pct >= 60 ? 'neutral' : 'warning'
  const value = pct >= 100
    ? `${today.steps.toLocaleString()} — goal hit`
    : `${today.steps.toLocaleString()} steps`
  return { emoji: '👟', label: 'Steps', value, status, path: '/' }
}

function interpretWeight(today: DailySnapshot): Insight | null {
  if (today.weight == null) return null
  const lbs = +(today.weight * 2.20462).toFixed(1)
  return { emoji: '⚖️', label: 'Weight', value: `${lbs} lbs`, status: 'neutral', path: '/log' }
}

function getHeadline(insights: Insight[], hasAnyData: boolean): string {
  if (!hasAnyData) return "Let's build your dashboard."

  const recovery = insights.find(i => i.label === 'Recovery' || i.label === 'Sleep')
  const workout  = insights.find(i => i.label === 'Training')
  const protein  = insights.find(i => i.label === 'Protein')

  if (recovery?.status === 'excellent') {
    return workout?.status === 'good' ? 'Strong day.' : 'Great day to push hard.'
  }
  if (recovery?.status === 'action') {
    return 'Prioritize rest today.'
  }
  if (recovery?.status === 'warning') {
    return 'Easy pace today.'
  }
  if (workout?.status === 'good') {
    return protein?.status === 'action' ? 'Workout done — hit your protein.' : 'Workout in the books.'
  }
  if (protein?.status === 'action') {
    return 'Protein needs attention.'
  }

  const goodCount = insights.filter(i => ['good', 'excellent'].includes(i.status)).length
  if (goodCount >= 2) return 'On track today.'
  if (insights.length > 0) return "Here's where things stand."
  return "Log data to see today's story."
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  today: DailySnapshot
  todayProgress: TodayProgress
  nutritionGoals: Pick<NutritionGoals, 'proteinG'>
  dataSource: string
}

export default function TodayCard({ today, todayProgress, nutritionGoals, dataSource }: Props) {
  const navigate  = useNavigate()
  const hasData   = dataSource !== 'mock'

  const insights: Insight[] = [
    interpretRecovery(today),
    interpretWorkout(todayProgress),
    interpretProtein(todayProgress, nutritionGoals.proteinG),
    interpretSteps(today),
    interpretWeight(today),
  ].filter((x): x is Insight => x !== null).slice(0, 4)

  const headline = getHeadline(insights, hasData)

  if (!hasData && insights.length === 0) return null

  return (
    <div className="today-card">
      <p className="today-card-eyebrow">Today</p>
      <h2 className="today-card-headline">{headline}</h2>

      {insights.length > 0 && (
        <div className="today-insights">
          {insights.map((ins, i) => (
            <button
              key={i}
              className={`today-insight today-insight--${ins.status}`}
              onClick={() => ins.path && navigate(ins.path)}
              aria-label={`${ins.label}: ${ins.value}`}
            >
              <span className="today-insight-emoji" aria-hidden="true">{ins.emoji}</span>
              <div className="today-insight-body">
                <span className="today-insight-label">{ins.label}</span>
                <span className="today-insight-value">{ins.value}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
