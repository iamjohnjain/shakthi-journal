import { useState, useEffect } from 'react'
import type { WeeklyReview, MonthlyReview } from '../db/index'
import { getWeeklyReview, saveWeeklyReview, getMonthlyReview, saveMonthlyReview } from '../db/reviewStore'
import { getMondayOfWeek, generateWeeklyReview, generateMonthlyReview } from '../engine/reviewEngine'

export function useCurrentWeekReview() {
  const [review, setReview]   = useState<WeeklyReview | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const weekStart = getMondayOfWeek(new Date())

    async function load() {
      // Check cache first
      let cached = await getWeeklyReview(weekStart).catch(() => null)

      // Regenerate if: no cache, or stale (older than 6h), or it's Monday (fresh week)
      const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
      const needsRegen = !cached || (cached.generatedAt < sixHoursAgo)

      if (needsRegen) {
        try {
          const fresh = await generateWeeklyReview(weekStart)
          await saveWeeklyReview(fresh)
          cached = fresh
        } catch { /* use cached if generation fails */ }
      }

      setReview(cached ?? null)
      setLoading(false)
    }

    void load()
  }, [])

  return { review, loading }
}

export function useCurrentMonthReview() {
  const [review, setReview]   = useState<MonthlyReview | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const now = new Date()
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    async function load() {
      let cached = await getMonthlyReview(month).catch(() => null)

      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const needsRegen = !cached || cached.generatedAt < oneDayAgo

      if (needsRegen) {
        try {
          const fresh = await generateMonthlyReview(month)
          await saveMonthlyReview(fresh)
          cached = fresh
        } catch { /* use cached */ }
      }

      setReview(cached ?? null)
      setLoading(false)
    }

    void load()
  }, [])

  return { review, loading }
}
