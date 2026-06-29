import { useState, useEffect } from 'react'
import { getSetting, setSetting } from '../db'

export interface CardConfig {
  id: string
  label: string
  group: string
  description: string
  defaultVisible: boolean
}

export const CARD_REGISTRY: CardConfig[] = [
  { id: 'goal-ring',     label: 'Main Goal Ring',       group: 'Overview',  description: 'Animated progress ring toward your primary goal',      defaultVisible: true  },
  { id: 'quick-actions', label: 'Quick Actions',        group: 'Overview',  description: 'Log Food, Log Workout, Import, Compare buttons',       defaultVisible: true  },
  { id: 'today-status',  label: 'Today Status Bar',     group: 'Overview',  description: 'Workout, nutrition, and steps at a glance',            defaultVisible: true  },
  { id: 'recovery',      label: 'Recovery & Readiness', group: 'Health',    description: 'Recovery score, sleep, energy, readiness ring',        defaultVisible: true  },
  { id: 'body',          label: 'Body Composition',     group: 'Health',    description: 'Weight, body fat %, muscle mass, bone mass cards',     defaultVisible: true  },
  { id: 'activity',      label: 'Activity & Steps',     group: 'Health',    description: 'Daily steps and active calorie progress',              defaultVisible: true  },
  { id: 'nutrition',     label: 'Nutrition',            group: 'Health',    description: 'Protein, calories, water and macro cards',             defaultVisible: true  },
  { id: 'vitals',        label: 'Vitals',               group: 'Health',    description: 'HRV and resting heart rate cards',                     defaultVisible: true  },
  { id: 'workouts',      label: 'Workout Card',         group: 'Training',  description: 'Today\'s logged workout summary',                      defaultVisible: true  },
  { id: 'coach-notes',   label: 'Coach Notes',          group: 'Insights',  description: 'Rule-based daily recommendations (no AI)',             defaultVisible: true  },
  { id: 'ai-insight',    label: 'Today\'s Insight',     group: 'Insights',  description: 'Motivational insight of the day',                      defaultVisible: true  },
  { id: 'import-status', label: 'Import Status Banner', group: 'Data',      description: 'Shows when data was last imported or if mock mode is on', defaultVisible: true },
]

const MINIMAL_SET = new Set(['goal-ring', 'quick-actions', 'today-status', 'coach-notes'])
const SETTINGS_KEY = 'dashboard-cards'

export function useDashboardCards() {
  const [visibility, setVisibility] = useState<Record<string, boolean>>({})
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    getSetting<Record<string, boolean>>(SETTINGS_KEY, {}).then(saved => {
      setVisibility(saved)
      setLoaded(true)
    })
  }, [])

  function isVisible(id: string): boolean {
    if (!loaded) return true
    const reg = CARD_REGISTRY.find(c => c.id === id)
    return visibility[id] ?? reg?.defaultVisible ?? true
  }

  async function toggle(id: string) {
    const next = { ...visibility, [id]: !isVisible(id) }
    setVisibility(next)
    await setSetting(SETTINGS_KEY, next)
  }

  async function setAll(visible: boolean) {
    const next: Record<string, boolean> = {}
    CARD_REGISTRY.forEach(c => { next[c.id] = visible })
    setVisibility(next)
    await setSetting(SETTINGS_KEY, next)
  }

  async function resetToDefaults() {
    setVisibility({})
    await setSetting(SETTINGS_KEY, {})
  }

  async function setMinimal() {
    const next: Record<string, boolean> = {}
    CARD_REGISTRY.forEach(c => { next[c.id] = MINIMAL_SET.has(c.id) })
    setVisibility(next)
    await setSetting(SETTINGS_KEY, next)
  }

  return { isVisible, toggle, setAll, resetToDefaults, setMinimal, cards: CARD_REGISTRY, loaded }
}
