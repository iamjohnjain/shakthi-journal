import { useState, useEffect } from 'react'
import { getTrainingProfile, getWorkoutSuggestion } from '../db/trainingStore'
import type { WorkoutSuggestion } from '../db/trainingStore'

export function useWorkoutSuggestion(hrv?: number, sleepHours?: number) {
  const [suggestion, setSuggestion] = useState<WorkoutSuggestion | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    getTrainingProfile().then(profile => {
      if (cancelled) return
      if (!profile) { setLoading(false); return }
      getWorkoutSuggestion(profile.goals, hrv, sleepHours).then(s => {
        if (cancelled) return
        setSuggestion(s)
        setLoading(false)
      })
    })
    return () => { cancelled = true }
  }, [hrv, sleepHours])

  return { suggestion, loading }
}
