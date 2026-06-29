export const USER = {
  name: 'John',
  firstName: 'John',
  heightFt: "6'2\"",
  heightCm: 188,
  startDate: '2025-04-01',
  streakDays: 47,
  healthScore: 84,
  gender: 'Male',
  birthYear: 1998,
} as const

export const GOALS = {
  proteinG: 200,
  caloriesIn: 2300,
  steps: 10000,
  waterMl: 3785,    // 1 US gallon
  sleepH: 8,
  targetWeightLbs: 190,
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

export function recoveryColor(score: number): string {
  if (score >= 80) return 'var(--green)'
  if (score >= 60) return 'var(--yellow)'
  if (score >= 40) return 'var(--orange)'
  return 'var(--red)'
}
