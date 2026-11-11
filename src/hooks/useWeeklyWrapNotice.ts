import { useEffect, useState } from 'react'
import type { WeeklyReview } from '../db/index'
import { getWeeklyReview, saveWeeklyReview, markWeeklyReviewSeen } from '../db/reviewStore'
import { getMondayOfWeek, addDays, generateWeeklyReview } from '../engine/reviewEngine'

/** Surfaces the most recently COMPLETED week's wrap (last Mon–Sun), once,
    the first time it's unseen — anchored to the Monday rollover rather than
    polling, so it's checked once per app load rather than on a timer. */
export function useWeeklyWrapNotice() {
  const [pendingReview, setPendingReview] = useState<WeeklyReview | null>(null)

  useEffect(() => {
    const lastWeekStart = addDays(getMondayOfWeek(new Date()), -7)

    async function check() {
      let review = await getWeeklyReview(lastWeekStart).catch(() => null)
      if (!review) {
        try {
          review = await generateWeeklyReview(lastWeekStart)
          await saveWeeklyReview(review)
        } catch {
          return
        }
      }
      if (!review.seen) setPendingReview(review)
    }

    void check()
  }, [])

  function dismiss() {
    if (!pendingReview) return
    void markWeeklyReviewSeen(pendingReview.weekStart)
    setPendingReview(null)
  }

  return { pendingReview, dismiss }
}
