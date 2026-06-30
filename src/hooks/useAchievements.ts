import { useState, useEffect } from 'react'
import type { Achievement } from '../db/index'
import { getRecentAchievements, getAllAchievements } from '../db/achievementStore'

export function useRecentAchievements(days = 30) {
  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getRecentAchievements(days)
      .then(setAchievements)
      .catch(() => setAchievements([]))
      .finally(() => setLoading(false))

    function onAchievement() {
      getRecentAchievements(days).then(setAchievements).catch(() => {})
    }
    window.addEventListener('app-toast', onAchievement)
    return () => window.removeEventListener('app-toast', onAchievement)
  }, [days])

  return { achievements, loading }
}

export function useAllAchievements() {
  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getAllAchievements()
      .then(setAchievements)
      .catch(() => setAchievements([]))
      .finally(() => setLoading(false))
  }, [])

  return { achievements, loading }
}
