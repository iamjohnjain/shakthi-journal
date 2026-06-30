import { getDB } from './index'
import type { WeeklyReview, MonthlyReview } from './index'

// ─── Weekly Reviews ────────────────────────────────────────────────────────────

export async function saveWeeklyReview(review: WeeklyReview): Promise<void> {
  const db = await getDB()
  await db.put('weekly_reviews', review)
}

export async function getWeeklyReview(weekStart: string): Promise<WeeklyReview | null> {
  const db = await getDB()
  return (await db.get('weekly_reviews', `week_${weekStart}`)) ?? null
}

export async function getAllWeeklyReviews(): Promise<WeeklyReview[]> {
  const db = await getDB()
  const all = await db.getAll('weekly_reviews')
  return all.sort((a, b) => b.weekStart.localeCompare(a.weekStart))
}

// ─── Monthly Reviews ───────────────────────────────────────────────────────────

export async function saveMonthlyReview(review: MonthlyReview): Promise<void> {
  const db = await getDB()
  await db.put('monthly_reviews', review)
}

export async function getMonthlyReview(month: string): Promise<MonthlyReview | null> {
  const db = await getDB()
  return (await db.get('monthly_reviews', `month_${month}`)) ?? null
}

export async function getAllMonthlyReviews(): Promise<MonthlyReview[]> {
  const db = await getDB()
  const all = await db.getAll('monthly_reviews')
  return all.sort((a, b) => b.month.localeCompare(a.month))
}
