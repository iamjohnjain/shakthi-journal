export const GOALS = {
  proteinG: 200,
  caloriesIn: 2300,
  steps: 10000,
  waterMl: 3785,
  sleepH: 8,
  targetBodyFatPct: 12,
} as const

export const UNIT = {
  weight: 'lbs' as const,
}

export function kgToLbs(kg: number) {
  return +(kg * 2.20462).toFixed(1)
}

export function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export function formatDate(d = new Date()): string {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

/** Local calendar-day string (YYYY-MM-DD). Never use `Date.toISOString()` for
    "today" — it's UTC, so in any timezone behind UTC (most of the Americas)
    it silently reports tomorrow's date during the evening, every single day
    (e.g. 7pm–midnight US Eastern). Every "today"/date-key computation in the
    app should route through this instead of `new Date().toISOString().split('T')[0]`. */
export function localDateStr(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Add (or subtract) whole days to a YYYY-MM-DD string, staying in local time. */
export function addLocalDays(dateStr: string, deltaDays: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + deltaDays)
  return localDateStr(d)
}

export function recoveryColor(score: number): string {
  if (score >= 80) return 'var(--green)'
  if (score >= 60) return 'var(--yellow)'
  if (score >= 40) return 'var(--orange)'
  return 'var(--red)'
}
